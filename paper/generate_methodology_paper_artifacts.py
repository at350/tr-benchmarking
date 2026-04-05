#!/usr/bin/env python3
"""
Generate appendix-ready summaries and figures for the FKD methodology paper.

Outputs:
- paper/results/fkd_methodology_summary.json
- paper/results/fkd_methodology_appendices.md
- paper/figures/fkd_pipeline_schematic.svg
- paper/figures/fkd_instruction_cluster_projection.png
- paper/figures/fkd_cluster_domain_heatmap.png
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba-cache")

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import run_statistical_validation as rsv  # noqa: E402


FRANK_JSON = PROJECT_ROOT / "legal-workflow-data" / "frank-packets" / "frank_1775367155212_48b90d17.json"
KARTHIC_JSON = PROJECT_ROOT / "legal-workflow-data" / "karthic-rubric-packs" / "karthic_1775367155213_270af0ba.json"
DASHA_JSON = PROJECT_ROOT / "legal-workflow-data" / "dasha-runs" / "dasha_1775367155213_70677f12.json"
ENSEMBLE_JSON = PROJECT_ROOT / "paper" / "results" / "ensemble_judge_retry_missing_20260405064608.json"
STAT_VALIDATION_JSON = PROJECT_ROOT / "paper" / "results" / "statistical_validation_20260405_002105.json"

FIGURE_DIR = PROJECT_ROOT / "paper" / "figures"
RESULT_DIR = PROJECT_ROOT / "paper" / "results"
SUMMARY_JSON = RESULT_DIR / "fkd_methodology_summary.json"
APPENDIX_MD = RESULT_DIR / "fkd_methodology_appendices.md"
FIG1 = FIGURE_DIR / "fkd_pipeline_schematic.svg"
FIG2 = FIGURE_DIR / "fkd_instruction_cluster_projection.png"
FIG3 = FIGURE_DIR / "fkd_cluster_domain_heatmap.png"

MODEL_DISPLAY_NAMES = {
    "anthropic/claude-3.5-haiku": "claude-3.5-haiku",
    "anthropic/claude-4-sonnet": "claude-4-sonnet",
    "deepseek-ai/deepseek-v3": "deepseek-v3",
    "google/gemini-3-flash": "gemini-3-flash",
    "google/gemini-3-pro": "gemini-3-pro",
    "meta/llama-4-maverick-instruct": "llama-4-maverick-instruct",
    "meta/llama-4-scout-instruct": "llama-4-scout-instruct",
    "moonshotai/kimi-k2-thinking": "kimi-k2-thinking",
}

SHORT_DOMAIN_NAMES = {
    "Issue and Bottom-Line Enforceability": "Issue / Bottom Line",
    "Formation and Consideration": "Formation / Consideration",
    "Marriage-Consideration Statute of Frauds": "Marriage SoF",
    "Suretyship and Main-Purpose Doctrine": "Suretyship / Main Purpose",
    "Promissory Estoppel and Reliance": "Promissory Estoppel",
    "Mistake, One-Year Rule, and Counterarguments": "Mistake / One-Year",
}

FAMILY_MARKERS = {
    "GPT": "o",
    "Claude": "s",
    "Gemini": "^",
    "DeepSeek": "D",
    "Kimi": "P",
    "LLAMA": "X",
}

NEGATIVE_PATTERNS = [
    r"\bunenforceable\b",
    r"\bnot enforceable\b",
    r"\bcannot be enforced\b",
    r"\bcannot be considered enforceable\b",
    r"\bnot legally enforceable\b",
    r"\bis not enforceable\b",
]
POSITIVE_PATTERNS = [
    r"\benforceable\b",
    r"\bis enforceable\b",
    r"\bwould be enforceable\b",
    r"\blegally enforceable\b",
]
AMBIGUOUS_PATTERNS = [
    r"\bnot sure\b",
    r"\bunclear\b",
    r"\bdepends\b",
    r"\bcould go either way\b",
    r"\bmay or may not\b",
    r"\barguable\b",
]


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def cluster_sort_key(cluster_id: str) -> Tuple[int, str]:
    match = re.search(r"(\d+)$", cluster_id)
    return (int(match.group(1)) if match else 10**9, cluster_id)


def domain_sort_key(domain_name: str, order: List[str]) -> int:
    try:
        return order.index(domain_name)
    except ValueError:
        return len(order)


def extract_conclusion(text: str) -> str:
    match = re.search(r"Conclusion\s*:\s*(.*)", text, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[-2:]) if parts else text[-300:]


def classify_bottom_line(text: str) -> str:
    conclusion = extract_conclusion(text).lower()
    ambiguous = any(re.search(pattern, conclusion) for pattern in AMBIGUOUS_PATTERNS)
    negative = any(re.search(pattern, conclusion) for pattern in NEGATIVE_PATTERNS)
    positive = (
        any(re.search(pattern, conclusion) for pattern in POSITIVE_PATTERNS)
        and not negative
        and not re.search(r"\bunenforceable\b", conclusion)
    )
    if ambiguous or (negative and positive):
        return "ambiguous/dual"
    if negative:
        return "unenforceable"
    if positive:
        return "enforceable"
    return "ambiguous/dual"


def display_model_name(model_name: str) -> str:
    return MODEL_DISPLAY_NAMES.get(model_name, model_name)


def clean_excerpt(text: str, limit: int = 420) -> str:
    collapsed = re.sub(r"\s+", " ", text).strip()
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 3].rstrip() + "..."


def load_records() -> Tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    frank = load_json(FRANK_JSON)
    karthic = load_json(KARTHIC_JSON)
    dasha = load_json(DASHA_JSON)
    ensemble = load_json(ENSEMBLE_JSON)
    validation = load_json(STAT_VALIDATION_JSON)
    _, _, records = rsv.load_artifacts(FRANK_JSON, KARTHIC_JSON, DASHA_JSON)
    return frank, karthic, records, dasha, ensemble | {"validation": validation}


def build_cluster_metrics(
    karthic: Dict[str, Any],
    dasha: Dict[str, Any],
    ensemble: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, List[str]]]:
    domain_weights = {domain["id"]: domain["weight"] for domain in karthic["domains"]}
    domain_order = [domain["name"] for domain in karthic["domains"]]
    cluster_metrics: Dict[str, Any] = {}
    domain_winners: Dict[str, List[str]] = defaultdict(list)

    for cluster in dasha["clusters"]:
        cluster_metrics[cluster["id"]] = {
            "weighted_score": None,
            "agreement_mean": None,
            "scores_by_domain": {},
            "agreements_by_domain": {},
            "rationales_by_domain": {},
            "differences_by_domain": {},
        }

    for domain_result in ensemble["domainResults"]:
        domain_name = domain_result["domainName"]
        weight = domain_weights[domain_result["domainId"]]
        winning_cluster = domain_result["winningCentroidId"]
        if winning_cluster:
            domain_winners[domain_name].append(winning_cluster)

        for centroid in domain_result["centroidEvaluations"]:
            cluster_id = centroid["clusterId"]
            cluster_metrics[cluster_id]["scores_by_domain"][domain_name] = centroid["score"]
            cluster_metrics[cluster_id]["agreements_by_domain"][domain_name] = centroid["judgeEnsemble"]["agreementRatio"]
            cluster_metrics[cluster_id]["rationales_by_domain"][domain_name] = centroid["rationale"]
            cluster_metrics[cluster_id]["differences_by_domain"][domain_name] = centroid["difference"]
            cluster_metrics[cluster_id].setdefault("_weighted_total", 0.0)
            cluster_metrics[cluster_id].setdefault("_weighted_denominator", 0)
            if centroid["applicabilityStatus"] == "applicable" and isinstance(centroid["score"], (int, float)):
                cluster_metrics[cluster_id]["_weighted_total"] += weight * centroid["score"]
                cluster_metrics[cluster_id]["_weighted_denominator"] += weight

    for cluster_id, values in cluster_metrics.items():
        denominator = values.pop("_weighted_denominator", 0)
        numerator = values.pop("_weighted_total", 0.0)
        values["weighted_score"] = round(numerator / denominator, 2) if denominator else None
        agreements = list(values["agreements_by_domain"].values())
        values["agreement_mean"] = round(sum(agreements) / len(agreements), 2) if agreements else None
        values["domain_order"] = domain_order

    return cluster_metrics, domain_winners


def build_model_and_family_stats(
    records: List[Dict[str, Any]],
    cluster_metrics: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]]:
    family_counts: Dict[str, Counter[str]] = defaultdict(Counter)
    model_counts: Dict[str, Counter[str]] = defaultdict(Counter)
    family_scores: Dict[str, List[float]] = defaultdict(list)
    model_scores: Dict[str, List[float]] = defaultdict(list)

    for record in records:
        outcome = classify_bottom_line(record["full_text"])
        family_counts[record["family"]][outcome] += 1
        model_counts[record["model"]][outcome] += 1
        weighted_score = cluster_metrics[record["clusterId"]]["weighted_score"]
        if weighted_score is not None:
            family_scores[record["family"]].append(weighted_score)
            model_scores[record["model"]].append(weighted_score)

    family_rows: List[Dict[str, Any]] = []
    for family in sorted(family_counts):
        counts = family_counts[family]
        total = sum(counts.values())
        family_rows.append(
            {
                "family": family,
                "unenforceable": counts["unenforceable"],
                "enforceable": counts["enforceable"],
                "ambiguous_dual": counts["ambiguous/dual"],
                "correct_rate": round(counts["unenforceable"] / total, 4) if total else 0.0,
                "mean_fkd_score": round(sum(family_scores[family]) / len(family_scores[family]), 2) if family_scores[family] else None,
            }
        )

    model_rows: List[Dict[str, Any]] = []
    for model in sorted(model_counts):
        counts = model_counts[model]
        total = sum(counts.values())
        model_rows.append(
            {
                "model": model,
                "display_model": display_model_name(model),
                "family": rsv.infer_family(model),
                "unenforceable": counts["unenforceable"],
                "enforceable": counts["enforceable"],
                "ambiguous_dual": counts["ambiguous/dual"],
                "mean_fkd_score": round(sum(model_scores[model]) / len(model_scores[model]), 2) if model_scores[model] else None,
            }
        )

    family_rows.sort(key=lambda row: (-row["correct_rate"], -(row["mean_fkd_score"] or 0), row["family"]))
    model_rows.sort(key=lambda row: (-(row["mean_fkd_score"] or 0), -row["unenforceable"], row["display_model"]))
    overall = Counter(classify_bottom_line(record["full_text"]) for record in records)
    return dict(overall), family_counts, family_rows, model_rows


def build_cluster_profiles(
    dasha: Dict[str, Any],
    records: List[Dict[str, Any]],
    cluster_metrics: Dict[str, Any],
) -> List[Dict[str, Any]]:
    response_by_id = {response["id"]: response for response in dasha["responses"]}
    record_by_id = {record["id"]: record for record in records}
    profiles: List[Dict[str, Any]] = []

    for cluster in sorted(dasha["clusters"], key=lambda item: cluster_sort_key(item["id"])):
        member_records = [record_by_id[member_id] for member_id in cluster["memberResponseIds"] if member_id in record_by_id]
        outcome_counts = Counter(classify_bottom_line(record["full_text"]) for record in member_records)
        dominant_outcome = max(
            outcome_counts.items(),
            key=lambda item: (item[1], item[0]),
        )[0]
        representative = response_by_id[cluster["representativeResponseId"]]
        metrics = cluster_metrics[cluster["id"]]
        profiles.append(
            {
                "cluster_id": cluster["id"],
                "size": cluster["size"],
                "model_breakdown": [
                    {
                        "model": display_model_name(entry["model"]),
                        "provider": entry["provider"],
                        "count": entry["count"],
                    }
                    for entry in cluster["modelBreakdown"]
                ],
                "outcome_breakdown": dict(outcome_counts),
                "dominant_outcome": dominant_outcome,
                "representative_model": display_model_name(representative["model"]),
                "representative_excerpt": clean_excerpt(representative["responseText"], 500),
                "representative_full_text": representative["responseText"],
                "weighted_score": metrics["weighted_score"],
                "agreement_mean": metrics["agreement_mean"],
                "scores_by_domain": metrics["scores_by_domain"],
                "agreements_by_domain": metrics["agreements_by_domain"],
                "rationales_by_domain": metrics["rationales_by_domain"],
                "differences_by_domain": metrics["differences_by_domain"],
            }
        )

    return profiles


def create_pipeline_figure(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 3.8))
    ax.set_axis_off()

    boxes = [
        (0.03, 0.25, 0.2, 0.5, "#dcecff", "Frank\nBenchmark packet\nGolden answer"),
        (0.29, 0.25, 0.2, 0.5, "#e7f7e1", "Karthic\nDomains\nCriteria\nGolden targets"),
        (0.55, 0.25, 0.2, 0.5, "#fff1d9", "Dasha\n240 responses\nEmbeddings\nClustering\nEnsemble judging"),
        (0.81, 0.2, 0.16, 0.6, "#f3e5ff", "Outputs\nQuality metrics\nRobustness tests\nBenchmark insights"),
    ]

    for x, y, w, h, color, label in boxes:
        rect = patches.FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0.02,rounding_size=0.02",
            facecolor=color,
            edgecolor="#222222",
            linewidth=1.5,
        )
        ax.add_patch(rect)
        ax.text(x + w / 2, y + h / 2, label, ha="center", va="center", fontsize=12, fontweight="bold")

    arrows = [(0.23, 0.5, 0.29, 0.5), (0.49, 0.5, 0.55, 0.5), (0.75, 0.5, 0.81, 0.5)]
    for x1, y1, x2, y2 in arrows:
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="->", lw=2))

    ax.text(
        0.5,
        0.04,
        "Figure 1. FKD pipeline overview: Frank defines the benchmark, Karthic formalizes the rubric, and Dasha measures reasoning diversity through clustering and rubric-aligned ensemble evaluation.",
        ha="center",
        va="bottom",
        fontsize=10,
    )
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


def create_cluster_projection_figure(records: List[Dict[str, Any]], dasha: Dict[str, Any], path: Path) -> None:
    texts = [record["response_text"] for record in records]
    embeddings = rsv.encode_texts(
        texts,
        rsv.DEFAULT_INSTRUCTION_MODEL,
        instruction=rsv.INSTRUCTION_PREFIX,
        local_files_only=True,
        allow_random_fallback=False,
    )
    reducer = rsv.umap.UMAP(
        n_components=2,
        n_neighbors=5,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
        transform_seed=42,
    )
    projection = reducer.fit_transform(embeddings)

    response_cluster = {response["id"]: response["clusterId"] for response in dasha["responses"]}
    cluster_ids = sorted({response["clusterId"] for response in dasha["responses"]}, key=cluster_sort_key)
    colors = list(plt.cm.tab20(np.linspace(0, 1, 20))) + list(plt.cm.Set3(np.linspace(0, 1, 12)))
    cluster_colors = {cluster_id: colors[index % len(colors)] for index, cluster_id in enumerate(cluster_ids)}

    fig, ax = plt.subplots(figsize=(11.5, 8.5))
    ax.set_title("Figure 2. Instruction-tuned embedding projection of the Dasha cluster partition", fontsize=14, pad=14)
    ax.set_xlabel("UMAP-1")
    ax.set_ylabel("UMAP-2")

    plotted_families = set()
    for idx, record in enumerate(records):
        cluster_id = response_cluster.get(record["id"], "-1")
        family = record["family"]
        marker = FAMILY_MARKERS.get(family, "o")
        label = family if family not in plotted_families else None
        plotted_families.add(family)
        ax.scatter(
            projection[idx, 0],
            projection[idx, 1],
            color=cluster_colors[cluster_id],
            marker=marker,
            s=44,
            edgecolors="black",
            linewidths=0.3,
            alpha=0.9,
            label=label,
        )

    for cluster_id in cluster_ids:
        indices = [i for i, record in enumerate(records) if response_cluster.get(record["id"]) == cluster_id]
        points = projection[indices]
        centroid = points.mean(axis=0)
        ax.text(
            centroid[0],
            centroid[1],
            cluster_id.replace("cluster_", "C"),
            fontsize=8,
            ha="center",
            va="center",
            bbox=dict(facecolor="white", edgecolor="none", alpha=0.75, boxstyle="round,pad=0.15"),
        )

    ax.legend(title="Model family", loc="upper left", bbox_to_anchor=(1.02, 1.0))
    ax.grid(alpha=0.15, linewidth=0.5)
    fig.tight_layout()
    fig.savefig(path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def create_heatmap_figure(cluster_profiles: List[Dict[str, Any]], domain_order: List[str], winning_domains: Dict[str, List[str]], path: Path) -> None:
    row_order = [profile["cluster_id"] for profile in cluster_profiles]
    data = np.array(
        [
            [profile["scores_by_domain"].get(domain, np.nan) for domain in domain_order]
            for profile in cluster_profiles
        ],
        dtype=float,
    )
    agreement = [
        [profile["agreements_by_domain"].get(domain, np.nan) for domain in domain_order]
        for profile in cluster_profiles
    ]

    fig, ax = plt.subplots(figsize=(11.5, 10.5))
    image = ax.imshow(data, cmap="YlOrRd", vmin=0, vmax=100, aspect="auto")
    ax.set_title("Figure 3. Cluster-by-domain ensemble median scores", fontsize=14, pad=12)
    ax.set_xticks(range(len(domain_order)), [SHORT_DOMAIN_NAMES.get(domain, domain) for domain in domain_order], rotation=30, ha="right")
    ax.set_yticks(range(len(row_order)), [cluster_id.replace("cluster_", "C") for cluster_id in row_order])

    for row_index, cluster_id in enumerate(row_order):
        for col_index, domain in enumerate(domain_order):
            score = data[row_index, col_index]
            agree = agreement[row_index][col_index]
            if np.isnan(score):
                text = "NA"
            else:
                text = f"{int(round(score))}\n{agree:.2f}"
            ax.text(col_index, row_index, text, ha="center", va="center", fontsize=7, color="black")
            if cluster_id in winning_domains.get(domain, []):
                ax.add_patch(
                    patches.Rectangle(
                        (col_index - 0.5, row_index - 0.5),
                        1,
                        1,
                        fill=False,
                        edgecolor="black",
                        linewidth=2.0,
                    )
                )

    cbar = fig.colorbar(image, ax=ax, shrink=0.86)
    cbar.set_label("Median ensemble score")
    ax.text(
        1.03,
        -0.16,
        "Cell annotation: median score / agreement ratio\nBlack border marks the winning cluster for that domain.",
        transform=ax.transAxes,
        ha="left",
        va="top",
        fontsize=9,
    )
    fig.tight_layout()
    fig.savefig(path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def join_items(items: Iterable[str]) -> str:
    cleaned = [re.sub(r"\s+", " ", item).strip() for item in items if str(item).strip()]
    return "<br>".join(cleaned) if cleaned else "None"


def render_appendices(
    karthic: Dict[str, Any],
    ensemble: Dict[str, Any],
    cluster_profiles: List[Dict[str, Any]],
    summary: Dict[str, Any],
) -> str:
    lines: List[str] = []
    lines.append("## Appendix A. Full Karthic Rubric")
    lines.append("")
    lines.append("### Table A1. Domain Definitions")
    lines.append("")
    lines.append("| Domain ID | Domain | Description | Weight | NA Guidance |")
    lines.append("|---|---|---|---:|---|")
    for domain in karthic["domains"]:
        lines.append(
            f"| `{domain['id']}` | {domain['name']} | {domain['description']} | {domain['weight']} | {domain['naGuidance']} |"
        )
    lines.append("")
    lines.append("### Table A2. Active Criteria")
    lines.append("")
    lines.append("| Criterion ID | Domain | Text |")
    lines.append("|---|---|---|")
    domain_names = {domain["id"]: domain["name"] for domain in karthic["domains"]}
    for criterion in karthic["criteria"]:
        if criterion["status"] != "active":
            continue
        lines.append(
            f"| `{criterion['id']}` | {domain_names.get(criterion['domainId'], criterion['domainId'])} | {criterion['text']} |"
        )
    lines.append("")
    lines.append("### Table A3. Golden Targets")
    lines.append("")
    lines.append("| Domain | Summary | Golden Contains | Allowed Omissions | Contradiction Flags | Comparison Guidance |")
    lines.append("|---|---|---|---|---|---|")
    for target in karthic["goldenTargets"]:
        lines.append(
            "| "
            + " | ".join(
                [
                    target["domainName"],
                    join_items([target["summary"]]),
                    join_items(target["goldenContains"]),
                    join_items(target["allowedOmissions"]),
                    join_items(target["contradictionFlags"]),
                    join_items([target["comparisonGuidance"]]),
                ]
            )
            + " |"
        )
    lines.append("")
    lines.append("## Appendix B. Full Cluster Appendix")
    lines.append("")
    lines.append("Each profile reports cluster composition, bottom-line outcome mix under the revised coding protocol, representative-response excerpt, and per-domain ensemble results.")
    lines.append("")
    for profile in cluster_profiles:
        lines.append(f"### {profile['cluster_id'].replace('cluster_', 'Cluster ')}")
        lines.append("")
        model_breakdown = "<br>".join(
            f"{entry['model']} ({entry['count']})" for entry in profile["model_breakdown"]
        )
        outcome_breakdown = ", ".join(
            f"{label}={count}" for label, count in sorted(profile["outcome_breakdown"].items())
        )
        lines.append("| Field | Value |")
        lines.append("|---|---|")
        lines.append(f"| Size | {profile['size']} |")
        lines.append(f"| Model composition | {model_breakdown} |")
        lines.append(f"| Dominant bottom-line outcome | {profile['dominant_outcome']} |")
        lines.append(f"| Outcome breakdown | {outcome_breakdown} |")
        lines.append(f"| Representative model | {profile['representative_model']} |")
        lines.append(f"| Cluster-mediated weighted score | {profile['weighted_score']} |")
        lines.append(f"| Mean agreement ratio across domains | {profile['agreement_mean']} |")
        lines.append("")
        lines.append("Representative response excerpt:")
        lines.append("")
        lines.append(f"> {profile['representative_excerpt']}")
        lines.append("")
        lines.append("| Domain | Ensemble median score | Agreement ratio |")
        lines.append("|---|---:|---:|")
        for domain in profile["scores_by_domain"]:
            lines.append(
                f"| {domain} | {profile['scores_by_domain'][domain]} | {profile['agreements_by_domain'][domain]} |"
            )
        lines.append("")
    lines.append("## Appendix C. Reproducibility Manifest")
    lines.append("")
    lines.append("| Item | Value |")
    lines.append("|---|---|")
    lines.append(f"| Frank packet | `{summary['artifact_ids']['frank']}` |")
    lines.append(f"| Karthic rubric pack | `{summary['artifact_ids']['karthic']}` |")
    lines.append(f"| Dasha run | `{summary['artifact_ids']['dasha']}` |")
    lines.append(f"| Ensemble report | `{summary['artifact_ids']['ensemble']}` |")
    lines.append(f"| Statistical validation report | `{summary['artifact_ids']['validation']}` |")
    lines.append(f"| Corpus design target | `{summary['design_target']['total_responses']} = {summary['design_target']['per_model']} x {summary['design_target']['model_count']}` |")
    lines.append(f"| Model roster | {', '.join(summary['design_target']['model_roster'])} |")
    lines.append(f"| Instruction embedding model | `{summary['reproducibility']['instruction_model']}` |")
    lines.append(f"| Baseline embedding model | `{summary['reproducibility']['baseline_model']}` |")
    lines.append(f"| UMAP settings | `n_components=5`, `n_neighbors=5`, `min_dist=0.1`, seeds `42` and `123` |")
    lines.append(f"| HDBSCAN settings | `min_cluster_size=5`, `min_samples=2`, `cluster_selection_method=eom` |")
    lines.append(f"| Permutation-test settings | `B = 1000` |")
    lines.append(f"| Judge panel | OpenAI `gpt-4.1-mini`, Claude `claude-4-sonnet`, DeepSeek `deepseek-v3` |")
    lines.append(f"| Judge aggregation | majority vote for applicability; median score across applicable judges |")
    lines.append(f"| Python / platform | `{summary['reproducibility']['python_version']}` on `{summary['reproducibility']['platform']}` |")
    lines.append(f"| Library versions | NumPy `{summary['reproducibility']['numpy_version']}`, pandas `{summary['reproducibility']['pandas_version']}`, scikit-learn `{summary['reproducibility']['sklearn_version']}`, umap-learn `{summary['reproducibility']['umap_version']}`, sentence-transformers `{summary['reproducibility']['sentence_transformers_version']}`, PyTorch `{summary['reproducibility']['torch_version']}` |")
    return "\n".join(lines) + "\n"


def build_summary(
    frank: Dict[str, Any],
    karthic: Dict[str, Any],
    dasha: Dict[str, Any],
    ensemble: Dict[str, Any],
    validation: Dict[str, Any],
    overall_outcomes: Dict[str, int],
    family_rows: List[Dict[str, Any]],
    model_rows: List[Dict[str, Any]],
    cluster_profiles: List[Dict[str, Any]],
) -> Dict[str, Any]:
    exemplar_ids = ["cluster_17", "cluster_2", "cluster_21", "cluster_14"]
    exemplars = [profile for profile in cluster_profiles if profile["cluster_id"] in exemplar_ids]
    return {
        "artifact_ids": {
            "frank": "frank_1775367155212_48b90d17",
            "karthic": "karthic_1775367155213_270af0ba",
            "dasha": "dasha_1775367155213_70677f12",
            "ensemble": "ensemble_judge_retry_missing_20260405064608",
            "validation": "statistical_validation_20260405_002105",
        },
        "question_text": frank.get("benchmarkQuestion", frank.get("legal_question", "")).strip(),
        "overall_bottom_line_counts": overall_outcomes,
        "family_rows": family_rows,
        "model_rows": model_rows,
        "exemplars": exemplars,
        "cluster_profiles": cluster_profiles,
        "agreement_overall": ensemble["overall"],
        "design_target": {
            "total_responses": 240,
            "per_model": 20,
            "model_count": 12,
            "model_roster": [display_model_name(model) for model in rsv.DEFAULT_MODEL_ROSTER],
        },
        "validation_metrics": {
            "instruction_tuned": validation["instruction_tuned"]["cluster_quality"] | validation["instruction_tuned"]["stability_test"] | validation["instruction_tuned"]["correspondence_test"],
            "baseline": validation["baseline"]["cluster_quality"] | validation["baseline"]["stability_test"] | validation["baseline"]["correspondence_test"],
        },
        "reproducibility": {
            "instruction_model": rsv.DEFAULT_INSTRUCTION_MODEL,
            "baseline_model": rsv.DEFAULT_BASELINE_MODEL,
            "python_version": "3.14.0",
            "platform": "macOS 15.7.3 arm64",
            "numpy_version": "2.3.5",
            "pandas_version": "3.0.0",
            "sklearn_version": "1.8.0",
            "umap_version": "0.5.11",
            "sentence_transformers_version": "5.2.3",
            "torch_version": "2.10.0",
        },
    }


def main() -> int:
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_DIR.mkdir(parents=True, exist_ok=True)

    frank, karthic, records, dasha, bundle = load_records()
    ensemble = {key: value for key, value in bundle.items() if key != "validation"}
    validation = bundle["validation"]

    cluster_metrics, domain_winners = build_cluster_metrics(karthic, dasha, ensemble)
    overall_outcomes, family_counts, family_rows, model_rows = build_model_and_family_stats(records, cluster_metrics)
    cluster_profiles = build_cluster_profiles(dasha, records, cluster_metrics)

    create_pipeline_figure(FIG1)
    create_cluster_projection_figure(records, dasha, FIG2)
    create_heatmap_figure(cluster_profiles, [domain["name"] for domain in karthic["domains"]], domain_winners, FIG3)

    summary = build_summary(
        frank,
        karthic,
        dasha,
        ensemble,
        validation,
        overall_outcomes,
        family_rows,
        model_rows,
        cluster_profiles,
    )
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    APPENDIX_MD.write_text(render_appendices(karthic, ensemble, cluster_profiles, summary), encoding="utf-8")

    print(f"Wrote summary JSON: {SUMMARY_JSON}")
    print(f"Wrote appendix markdown: {APPENDIX_MD}")
    print(f"Wrote figure: {FIG1}")
    print(f"Wrote figure: {FIG2}")
    print(f"Wrote figure: {FIG3}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
