import argparse
import asyncio
import itertools
import json
import math
import os
import sys
import statistics
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import numpy as np
from dotenv import load_dotenv
from openai import AsyncOpenAI
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score
from tqdm.asyncio import tqdm_asyncio
from tqdm import tqdm

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from lsh.density_clustering import run_density_clustering
from lsh.utils import clean_text, encode_responses

try:
    import matplotlib.pyplot as plt
except Exception:
    plt = None


SYSTEM_PROMPT = "You are a helpful legal assistant."
DEFAULT_QUESTION = (
    "A father promised his son that if the son married the daughter of a politician within "
    "18 months, the father would assume responsibility for the son's student loans. "
    "The father was primarily motivated to make this promise by a tax deduction that he "
    "thought would be available to him if he paid the son's student loans, although he was "
    "also glad to help his son and hoped the son would marry the politician's daughter. "
    "The son agreed because he already planned to propose to the politician's daughter, "
    "but the father and son never signed a written contract. Fourteen months later, the son "
    "married the politician's daughter. The father refused to make any payments on the son's "
    "loans, however, because the father had learned that he would not in fact qualify for any "
    "tax deductions. Is the father's oral promise to pay off the son's student loans enforceable?"
)


@dataclass
class DensityConfig:
    n_neighbors: int = 5
    min_dist: float = 0.1
    min_cluster_size: int = 5
    min_samples: int = 2
    n_components: int = 10


@dataclass
class TempSeedResult:
    temperature: float
    seed: int
    doc_ids: list[str]
    labels: list[int]
    partition: dict[str, int]
    num_clusters: int
    noise_ratio: float
    centroids: dict[int, np.ndarray]
    cluster_sizes: dict[int, int]


def parse_float_list(raw: str) -> list[float]:
    values = [float(x.strip()) for x in raw.split(",") if x.strip()]
    if not values:
        raise ValueError("Expected at least one float value.")
    return values


def parse_int_list(raw: str) -> list[int]:
    values = [int(x.strip()) for x in raw.split(",") if x.strip()]
    if not values:
        raise ValueError("Expected at least one integer value.")
    return values


def load_questions(question_files: list[str] | None, inline_question: str | None) -> list[str]:
    questions: list[str] = []
    if question_files:
        for path in question_files:
            with open(path, "r") as f:
                content = f.read().strip()
                if content:
                    questions.append(content)

    if inline_question:
        questions.append(inline_question.strip())

    if not questions:
        questions.append(DEFAULT_QUESTION)

    if len(questions) > 2:
        raise ValueError("Use at most 2 questions for this sweep.")

    return questions


async def fetch_openai_response(
    client: AsyncOpenAI,
    model: str,
    question: str,
    temperature: float,
    req_id: str,
    semaphore: asyncio.Semaphore,
) -> dict[str, Any]:
    async with semaphore:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": question},
                ],
                temperature=temperature,
            )
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Empty model response")

            return {
                "id": req_id,
                "model": model,
                "temperature": temperature,
                "question": question,
                "response": content,
            }
        except Exception as e:
            return {
                "id": req_id,
                "model": model,
                "temperature": temperature,
                "question": question,
                "error": str(e),
            }


async def generate_temperature_bucket(
    client: AsyncOpenAI,
    model: str,
    temperature: float,
    questions: list[str],
    responses_per_temp: int,
    concurrency: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    semaphore = asyncio.Semaphore(concurrency)
    tasks: list[asyncio.Task] = []

    per_question = math.ceil(responses_per_temp / len(questions))
    generated = 0
    q_idx = 0

    while generated < responses_per_temp:
        question = questions[q_idx % len(questions)]
        idx_for_q = generated // len(questions)
        req_id = f"{model}|t{temperature:.2f}|q{q_idx % len(questions)}|r{idx_for_q}"

        tasks.append(
            asyncio.create_task(
                fetch_openai_response(
                    client=client,
                    model=model,
                    question=question,
                    temperature=temperature,
                    req_id=req_id,
                    semaphore=semaphore,
                )
            )
        )
        generated += 1
        q_idx += 1

    results = []
    for coro in tqdm_asyncio.as_completed(tasks, desc=f"T={temperature:.2f} initial", total=len(tasks)):
        results.append(await coro)
    successes = [x for x in results if "error" not in x]
    failures = [x for x in results if "error" in x]

    # If failures happened, attempt fill-in retries until we have desired count or retry budget exhausted.
    retry_budget = max(10, responses_per_temp // 5)
    retry_count = 0

    while len(successes) < responses_per_temp and retry_count < retry_budget:
        missing = responses_per_temp - len(successes)
        retry_tasks: list[asyncio.Task] = []

        for i in range(missing):
            question = questions[i % len(questions)]
            req_id = f"{model}|t{temperature:.2f}|retry{retry_count}|r{i}"
            retry_tasks.append(
                asyncio.create_task(
                    fetch_openai_response(
                        client=client,
                        model=model,
                        question=question,
                        temperature=temperature,
                        req_id=req_id,
                        semaphore=semaphore,
                    )
                )
            )

        retry_results = []
        for coro in tqdm_asyncio.as_completed(retry_tasks, desc=f"T={temperature:.2f} retry {retry_count}", total=len(retry_tasks)):
            retry_results.append(await coro)
        successes.extend([x for x in retry_results if "error" not in x])
        failures.extend([x for x in retry_results if "error" in x])
        retry_count += 1

    return successes[:responses_per_temp], failures


def compute_centroids(
    embeddings: dict[str, np.ndarray], partition: dict[str, int]
) -> tuple[dict[int, np.ndarray], dict[int, int]]:
    buckets: dict[int, list[np.ndarray]] = defaultdict(list)
    sizes: dict[int, int] = defaultdict(int)

    for doc_id, cluster_id in partition.items():
        if cluster_id == -1:
            continue
        buckets[cluster_id].append(embeddings[doc_id])
        sizes[cluster_id] += 1

    centroids: dict[int, np.ndarray] = {}
    for cluster_id, vecs in buckets.items():
        centroid = np.mean(np.stack(vecs), axis=0)
        norm = np.linalg.norm(centroid)
        if norm == 0:
            centroids[cluster_id] = centroid
        else:
            centroids[cluster_id] = centroid / norm

    return centroids, dict(sizes)


def extract_labels(partition: dict[str, int], doc_ids: list[str]) -> list[int]:
    return [int(partition[doc_id]) for doc_id in doc_ids]


def run_temp_seed_clustering(
    items: list[dict[str, Any]],
    seeds: list[int],
    density: DensityConfig,
) -> list[TempSeedResult]:
    doc_ids = [x["id"] for x in items]
    texts = [clean_text(x["response"]) for x in items]

    embeddings_array = encode_responses(
        texts,
        model_name="hkunlp/instructor-large",
        instruction="Represent the legal conclusion and reasoning of this text:",
    )
    embeddings = {doc_id: emb for doc_id, emb in zip(doc_ids, embeddings_array)}

    t = float(items[0]["temperature"])
    results: list[TempSeedResult] = []

    for seed in seeds:
        partition = run_density_clustering(
            embeddings,
            n_neighbors=density.n_neighbors,
            min_dist=density.min_dist,
            min_cluster_size=density.min_cluster_size,
            min_samples=density.min_samples,
            n_components=density.n_components,
            random_state=seed,
        )
        labels = extract_labels(partition, doc_ids)
        noise_count = sum(1 for v in labels if v == -1)
        num_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        centroids, cluster_sizes = compute_centroids(embeddings, partition)

        results.append(
            TempSeedResult(
                temperature=t,
                seed=seed,
                doc_ids=doc_ids,
                labels=labels,
                partition=partition,
                num_clusters=num_clusters,
                noise_ratio=noise_count / len(labels),
                centroids=centroids,
                cluster_sizes=cluster_sizes,
            )
        )

    return results


def pairwise_stability(seed_runs: list[TempSeedResult]) -> tuple[list[float], list[float]]:
    aris: list[float] = []
    nmis: list[float] = []

    for a, b in itertools.combinations(seed_runs, 2):
        aris.append(adjusted_rand_score(a.labels, b.labels))
        nmis.append(normalized_mutual_info_score(a.labels, b.labels))

    return aris, nmis


def greedy_centroid_match(
    base_centroids: dict[int, np.ndarray],
    target_centroids: dict[int, np.ndarray],
) -> tuple[float | None, list[tuple[int, int, float]], set[int], set[int]]:
    if not base_centroids or not target_centroids:
        return None, [], set(base_centroids.keys()), set(target_centroids.keys())

    pairs: list[tuple[float, int, int]] = []
    for b_id, b_vec in base_centroids.items():
        for t_id, t_vec in target_centroids.items():
            sim = float(np.dot(b_vec, t_vec))
            pairs.append((sim, b_id, t_id))

    pairs.sort(reverse=True, key=lambda x: x[0])

    matched_base: set[int] = set()
    matched_target: set[int] = set()
    matches: list[tuple[int, int, float]] = []

    for sim, b_id, t_id in pairs:
        if b_id in matched_base or t_id in matched_target:
            continue
        matched_base.add(b_id)
        matched_target.add(t_id)
        matches.append((b_id, t_id, sim))

    avg_similarity = statistics.mean([x[2] for x in matches]) if matches else None

    unmatched_base = set(base_centroids.keys()) - matched_base
    unmatched_target = set(target_centroids.keys()) - matched_target

    return avg_similarity, matches, unmatched_base, unmatched_target


def safe_mean(values: list[float]) -> float | None:
    return statistics.mean(values) if values else None


def safe_std(values: list[float]) -> float | None:
    if len(values) < 2:
        return 0.0 if values else None
    return statistics.pstdev(values)


def write_json(path: str, payload: Any) -> None:
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)


def maybe_make_plots(output_dir: str, summary_rows: list[dict[str, Any]], drift_rows: list[dict[str, Any]]) -> None:
    if plt is None:
        print("matplotlib is not available; skipping plots.")
        return

    temps = [row["temperature"] for row in summary_rows]
    cluster_means = [row["cluster_count_mean"] for row in summary_rows]
    noise_means = [row["noise_ratio_mean"] for row in summary_rows]
    ari_means = [row["ari_mean"] for row in summary_rows]
    nmi_means = [row["nmi_mean"] for row in summary_rows]

    fig, ax1 = plt.subplots(figsize=(8, 5))
    ax1.plot(temps, cluster_means, marker="o", label="Cluster Count")
    ax1.set_xlabel("Temperature")
    ax1.set_ylabel("Cluster Count")
    ax1.grid(alpha=0.25)

    ax2 = ax1.twinx()
    ax2.plot(temps, noise_means, marker="s", color="tab:red", label="Noise Ratio")
    ax2.set_ylabel("Noise Ratio")

    lines_1, labels_1 = ax1.get_legend_handles_labels()
    lines_2, labels_2 = ax2.get_legend_handles_labels()
    ax1.legend(lines_1 + lines_2, labels_1 + labels_2, loc="best")
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "plot_cluster_noise.png"), dpi=180)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(temps, ari_means, marker="o", label="ARI")
    ax.plot(temps, nmi_means, marker="s", label="NMI")

    drift_map = {row["temperature"]: row["avg_centroid_similarity"] for row in drift_rows}
    drift_temps = sorted(drift_map.keys())
    drift_vals = [drift_map[t] for t in drift_temps]
    if drift_temps:
        ax.plot(drift_temps, drift_vals, marker="^", label="Centroid Similarity vs T0")

    ax.set_xlabel("Temperature")
    ax.set_ylabel("Score")
    ax.set_ylim(0.0, 1.01)
    ax.grid(alpha=0.25)
    ax.legend(loc="best")
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "plot_stability_drift.png"), dpi=180)
    plt.close(fig)


def build_report_markdown(
    config: dict[str, Any],
    summary_rows: list[dict[str, Any]],
    drift_rows: list[dict[str, Any]],
    temp_only_rows: list[dict[str, Any]],
) -> str:
    lines: list[str] = []
    lines.append("# Temperature Sweep Report")
    lines.append("")
    lines.append(f"- Model: `{config['model']}`")
    lines.append(f"- Questions: {config['num_questions']}")
    lines.append(f"- Responses per temperature: {config['responses_per_temp']}")
    lines.append(f"- Temperatures: {config['temperatures']}")
    lines.append(f"- Seeds: {config['seeds']}")
    lines.append("")

    lines.append("## Summary")
    lines.append("")
    lines.append("| Temperature | Cluster Count (mean±std) | Noise Ratio (mean±std) | ARI mean | NMI mean |")
    lines.append("|---|---:|---:|---:|---:|")
    for row in summary_rows:
        lines.append(
            "| {temperature:.2f} | {cluster_count_mean:.2f} ± {cluster_count_std:.2f} | "
            "{noise_ratio_mean:.3f} ± {noise_ratio_std:.3f} | {ari_mean:.3f} | {nmi_mean:.3f} |".format(**row)
        )

    lines.append("")
    lines.append("## Centroid Drift (vs lowest T)")
    lines.append("")
    lines.append("| Temperature | Avg centroid cosine | Matched clusters | Unmatched baseline | Unmatched target |")
    lines.append("|---|---:|---:|---:|---:|")
    for row in drift_rows:
        lines.append(
            "| {temperature:.2f} | {avg_centroid_similarity:.3f} | {matched_clusters} | "
            "{unmatched_baseline} | {unmatched_target} |".format(**row)
        )

    lines.append("")
    lines.append("## Temperature-only Clusters")
    lines.append("")
    if not temp_only_rows:
        lines.append("No temperature-only clusters found with current threshold.")
    else:
        lines.append("| Temperature | Cluster ID | Size | Max similarity to baseline |")
        lines.append("|---|---:|---:|---:|")
        for row in temp_only_rows:
            lines.append(
                "| {temperature:.2f} | {cluster_id} | {size} | {max_similarity_to_baseline:.3f} |".format(**row)
            )

    return "\n".join(lines) + "\n"


async def run(args: argparse.Namespace) -> None:
    temperatures = sorted(parse_float_list(args.temperatures))
    seeds = parse_int_list(args.seeds)
    questions = load_questions(args.question_file, args.question)

    if len(temperatures) < 2:
        raise ValueError("Provide at least 2 temperatures.")

    if len(seeds) < 2:
        raise ValueError("Provide at least 2 seeds for stability metrics.")

    load_dotenv(dotenv_path=os.path.join(PROJECT_ROOT, "frontend", ".env"))
    load_dotenv(dotenv_path=os.path.join(PROJECT_ROOT, "lsh", ".env"))
    load_dotenv()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not found in environment.")

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    output_base = args.output_dir
    if not os.path.isabs(output_base):
        output_base = os.path.join(PROJECT_ROOT, output_base)

    out_dir = os.path.join(output_base, f"temperature_sweep_{timestamp}")
    os.makedirs(out_dir, exist_ok=True)

    client = AsyncOpenAI(api_key=api_key)

    generated_by_temp: dict[float, list[dict[str, Any]]] = {}
    failures_by_temp: dict[float, list[dict[str, Any]]] = {}

    print(f"Running generation for temperatures: {temperatures}")
    for t in temperatures:
        print(f"Generating responses @ T={t:.2f} ...")
        successes, failures = await generate_temperature_bucket(
            client=client,
            model=args.model,
            temperature=t,
            questions=questions,
            responses_per_temp=args.responses_per_temp,
            concurrency=args.concurrency,
        )
        generated_by_temp[t] = successes
        failures_by_temp[t] = failures
        print(
            f"T={t:.2f}: {len(successes)} successes, {len(failures)} failures "
            f"(target={args.responses_per_temp})"
        )
        if len(successes) == 0:
            raise RuntimeError(
                f"No successful generations for temperature {t:.2f}. "
                "Check OPENAI_API_KEY/model access and network connectivity."
            )

    write_json(os.path.join(out_dir, "responses_by_temperature.json"), generated_by_temp)
    write_json(os.path.join(out_dir, "failures_by_temperature.json"), failures_by_temp)

    density = DensityConfig(
        n_neighbors=args.umap_n_neighbors,
        min_dist=args.umap_min_dist,
        min_cluster_size=args.hdbscan_min_cluster_size,
        min_samples=args.hdbscan_min_samples,
        n_components=args.umap_n_components,
    )

    results_by_temp: dict[float, list[TempSeedResult]] = {}
    for t in temperatures:
        print(f"Clustering @ T={t:.2f} across seeds {seeds} ...")
        results_by_temp[t] = run_temp_seed_clustering(
            items=generated_by_temp[t],
            seeds=seeds,
            density=density,
        )

    summary_rows: list[dict[str, Any]] = []
    stability_rows: list[dict[str, Any]] = []

    for t in temperatures:
        runs = results_by_temp[t]
        cluster_counts = [r.num_clusters for r in runs]
        noise_ratios = [r.noise_ratio for r in runs]
        aris, nmis = pairwise_stability(runs)

        summary_rows.append(
            {
                "temperature": t,
                "cluster_count_mean": safe_mean([float(x) for x in cluster_counts]) or 0.0,
                "cluster_count_std": safe_std([float(x) for x in cluster_counts]) or 0.0,
                "noise_ratio_mean": safe_mean(noise_ratios) or 0.0,
                "noise_ratio_std": safe_std(noise_ratios) or 0.0,
                "ari_mean": safe_mean(aris) or 0.0,
                "ari_std": safe_std(aris) or 0.0,
                "nmi_mean": safe_mean(nmis) or 0.0,
                "nmi_std": safe_std(nmis) or 0.0,
            }
        )

        stability_rows.append(
            {
                "temperature": t,
                "pairwise_ari": aris,
                "pairwise_nmi": nmis,
            }
        )

    baseline_t = temperatures[0]
    analysis_seed = seeds[0]

    baseline_run = next(r for r in results_by_temp[baseline_t] if r.seed == analysis_seed)

    drift_rows: list[dict[str, Any]] = []
    temp_only_rows: list[dict[str, Any]] = []

    for t in temperatures[1:]:
        target_run = next(r for r in results_by_temp[t] if r.seed == analysis_seed)
        avg_sim, matches, unmatched_base, unmatched_target = greedy_centroid_match(
            baseline_run.centroids,
            target_run.centroids,
        )

        drift_rows.append(
            {
                "temperature": t,
                "avg_centroid_similarity": float(avg_sim) if avg_sim is not None else 0.0,
                "matched_clusters": len(matches),
                "unmatched_baseline": len(unmatched_base),
                "unmatched_target": len(unmatched_target),
            }
        )

        baseline_centroids = list(baseline_run.centroids.values())
        for c_id, c_vec in target_run.centroids.items():
            if not baseline_centroids:
                max_sim = 0.0
            else:
                max_sim = float(max(np.dot(c_vec, b) for b in baseline_centroids))

            if max_sim < args.temp_only_similarity_threshold:
                temp_only_rows.append(
                    {
                        "temperature": t,
                        "cluster_id": int(c_id),
                        "size": int(target_run.cluster_sizes.get(c_id, 0)),
                        "max_similarity_to_baseline": max_sim,
                    }
                )

    config_blob = {
        "timestamp": timestamp,
        "model": args.model,
        "num_questions": len(questions),
        "responses_per_temp": args.responses_per_temp,
        "temperatures": temperatures,
        "seeds": seeds,
        "analysis_seed": analysis_seed,
        "temp_only_similarity_threshold": args.temp_only_similarity_threshold,
        "umap_n_neighbors": density.n_neighbors,
        "umap_min_dist": density.min_dist,
        "umap_n_components": density.n_components,
        "hdbscan_min_cluster_size": density.min_cluster_size,
        "hdbscan_min_samples": density.min_samples,
    }

    serializable_runs: dict[str, Any] = {}
    for t, runs in results_by_temp.items():
        serializable_runs[str(t)] = []
        for run_item in runs:
            serializable_runs[str(t)].append(
                {
                    "seed": run_item.seed,
                    "num_clusters": run_item.num_clusters,
                    "noise_ratio": run_item.noise_ratio,
                    "partition": run_item.partition,
                    "cluster_sizes": run_item.cluster_sizes,
                }
            )

    write_json(os.path.join(out_dir, "config.json"), config_blob)
    write_json(os.path.join(out_dir, "summary_table.json"), summary_rows)
    write_json(os.path.join(out_dir, "stability_pairs.json"), stability_rows)
    write_json(os.path.join(out_dir, "centroid_drift.json"), drift_rows)
    write_json(os.path.join(out_dir, "temperature_only_clusters.json"), temp_only_rows)
    write_json(os.path.join(out_dir, "clustering_runs.json"), serializable_runs)

    report_md = build_report_markdown(config_blob, summary_rows, drift_rows, temp_only_rows)
    with open(os.path.join(out_dir, "report.md"), "w") as f:
        f.write(report_md)

    maybe_make_plots(out_dir, summary_rows, drift_rows)

    print(f"Sweep complete. Artifacts written to: {out_dir}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run temperature sweep for response clustering.")
    parser.add_argument("--model", type=str, default="gpt-4o", help="Model name for OpenAI chat completions.")
    parser.add_argument(
        "--question-file",
        action="append",
        default=None,
        help="Path to a question text file. Can be supplied up to 2 times.",
    )
    parser.add_argument("--question", type=str, default=None, help="Inline question text (optional).")
    parser.add_argument(
        "--temperatures",
        type=str,
        default="0.1,0.2,0.3,0.7",
        help="Comma-separated temperature values.",
    )
    parser.add_argument(
        "--responses-per-temp",
        type=int,
        default=120,
        help="Number of responses to generate per temperature.",
    )
    parser.add_argument(
        "--seeds",
        type=str,
        default="42,43,44",
        help="Comma-separated random seeds for UMAP/HDBSCAN stability.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="lsh/results",
        help="Base output directory.",
    )
    parser.add_argument("--concurrency", type=int, default=20, help="Concurrent API requests.")

    parser.add_argument("--umap-n-neighbors", type=int, default=5)
    parser.add_argument("--umap-min-dist", type=float, default=0.1)
    parser.add_argument("--umap-n-components", type=int, default=10)
    parser.add_argument("--hdbscan-min-cluster-size", type=int, default=5)
    parser.add_argument("--hdbscan-min-samples", type=int, default=2)

    parser.add_argument(
        "--temp-only-similarity-threshold",
        type=float,
        default=0.85,
        help="Clusters below this max cosine similarity to baseline are marked temperature-only.",
    )

    return parser


if __name__ == "__main__":
    cli_args = build_arg_parser().parse_args()
    asyncio.run(run(cli_args))
