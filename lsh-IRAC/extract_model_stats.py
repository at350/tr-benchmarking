#!/usr/bin/env python3
"""
extract_model_stats.py
──────────────────────
Reads run_20260310_153754.json + annotations_sofmarriage.json and produces:

  1. Per-model accuracy table  (model, N, schema_valid%, correct%, dominant_cluster)
  2. Cluster × model breakdown (rows=clusters, cols=model families, cells=count)
  3. Schema compliance detail  (model, attempted, failed, valid%)

Usage:
  python lsh-IRAC/extract_model_stats.py
  python lsh-IRAC/extract_model_stats.py --run lsh-IRAC/results/run_20260310_153754.json \
                                          --ann lsh-IRAC/results/annotations_sofmarriage.json
"""

import os
import sys
import json
import argparse
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)

DEFAULT_RUN = os.path.join(BASE_DIR, "results", "run_20260310_153754.json")
DEFAULT_ANN = os.path.join(BASE_DIR, "results", "annotations_sofmarriage.json")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def load_run(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def load_annotations(path: str) -> dict:
    """Returns {cluster_id_str: verdict}."""
    with open(path) as f:
        data = json.load(f)
    return {str(a["clusterId"]): a["verdict"] for a in data["annotations"]}


def iter_members(run: dict):
    """Yield (cluster_id_str, member_dict) for all non-noise cluster members."""
    for cluster_id, cluster_data in run["clusters"].items():
        for member in cluster_data.get("members", []):
            yield cluster_id, member
        # Also include the representative (it IS in members, so skip duplicates)


def normalize_model(model_name: str) -> str:
    """Normalize model name to a displayable short form."""
    aliases = {
        "gpt-4o": "gpt-4o",
        "gpt-4-turbo": "gpt-4-turbo",
        "gpt-5-nano": "gpt-5-nano",
        "llama-4-maverick-instruct": "llama-4-maverick",
        "deepseek-v3.1": "deepseek-v3.1",
        "deepseek-ai/deepseek-v3.1": "deepseek-v3.1",
    }
    return aliases.get(model_name, model_name)


def model_family(model_name: str) -> str:
    """Map model to a broad family group."""
    m = normalize_model(model_name)
    if "gpt" in m:
        return "OpenAI"
    if "llama" in m:
        return "Meta (Llama)"
    if "deepseek" in m:
        return "DeepSeek"
    if "claude" in m:
        return "Anthropic"
    if "gemini" in m or "google" in m:
        return "Google"
    if "grok" in m or "xai" in m:
        return "xAI"
    return m


# ─────────────────────────────────────────────────────────────────────────────
# Table builders
# ─────────────────────────────────────────────────────────────────────────────

def build_per_model_table(run: dict, verdicts: dict) -> list:
    """
    Returns list of dicts:
      model, n_valid, correct, incorrect, ambiguous, pct_correct, dominant_cluster
    """
    # model -> {cluster_id: count, "correct": N, "incorrect": N, "ambiguous": N}
    model_stats = defaultdict(lambda: {"counts": defaultdict(int), "correct": 0,
                                        "incorrect": 0, "ambiguous": 0, "total": 0})

    for cluster_id, member in iter_members(run):
        # Deduplicate: representative is already in members list
        model = normalize_model(member["model"])
        verdict = verdicts.get(cluster_id, "unknown")
        model_stats[model]["counts"][cluster_id] += 1
        model_stats[model][verdict] = model_stats[model].get(verdict, 0) + 1
        model_stats[model]["total"] += 1

    rows = []
    for model, stats in sorted(model_stats.items()):
        total = stats["total"]
        correct = stats.get("correct", 0)
        incorrect = stats.get("incorrect", 0)
        ambiguous = stats.get("ambiguous", 0)
        pct_correct = round(100.0 * correct / total, 1) if total > 0 else 0.0
        # Dominant cluster = the cluster with most of this model's responses
        dominant_cluster = max(stats["counts"], key=stats["counts"].get) if stats["counts"] else "—"
        dominant_n = stats["counts"][dominant_cluster] if stats["counts"] else 0
        rows.append({
            "model": model,
            "n_valid": total,
            "correct": correct,
            "incorrect": incorrect,
            "ambiguous": ambiguous,
            "pct_correct": pct_correct,
            "dominant_cluster": dominant_cluster,
            "dominant_cluster_n": dominant_n,
        })

    # Sort by pct_correct descending
    rows.sort(key=lambda r: -r["pct_correct"])
    return rows


def build_cluster_model_table(run: dict, verdicts: dict) -> dict:
    """
    Returns dict:
      cluster_id -> {model -> count}
    Also returns sorted list of all model names encountered.
    """
    cluster_model_counts = defaultdict(lambda: defaultdict(int))
    all_models = set()

    for cluster_id, member in iter_members(run):
        model = normalize_model(member["model"])
        cluster_model_counts[cluster_id][model] += 1
        all_models.add(model)

    return dict(cluster_model_counts), sorted(all_models)


def build_schema_compliance_table(run: dict) -> list:
    """
    Returns per-model schema compliance stats.
    Computes attempted = valid + failed.
    """
    failures = run.get("metadata", {}).get("failures", {})

    # Sum all valid members per model
    valid_counts = defaultdict(int)
    for cluster_id, member in iter_members(run):
        model = normalize_model(member["model"])
        valid_counts[model] += 1

    # Normalize failure model names
    fail_counts = defaultdict(int)
    for raw_model, count in failures.items():
        fail_counts[normalize_model(raw_model)] += count

    all_models = set(valid_counts.keys()) | set(fail_counts.keys())

    rows = []
    for model in sorted(all_models):
        valid = valid_counts.get(model, 0)
        failed = fail_counts.get(model, 0)
        attempted = valid + failed
        pct_valid = round(100.0 * valid / attempted, 1) if attempted > 0 else 100.0
        rows.append({
            "model": model,
            "attempted": attempted,
            "failed": failed,
            "valid": valid,
            "pct_valid": pct_valid,
        })

    rows.sort(key=lambda r: r["model"])
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Pretty-printing
# ─────────────────────────────────────────────────────────────────────────────

def print_per_model_table(rows: list):
    print("\n" + "═" * 80)
    print("  PER-MODEL ACCURACY TABLE")
    print("═" * 80)
    header = f"  {'Model':<28} {'N':>5}  {'Correct':>8}  {'Incorrect':>10}  {'Ambig':>6}  {'%Correct':>9}  {'Dom.Cluster':>12}"
    print(header)
    print("  " + "─" * 76)
    for r in rows:
        print(f"  {r['model']:<28} {r['n_valid']:>5}  {r['correct']:>8}  {r['incorrect']:>10}  "
              f"{r['ambiguous']:>6}  {r['pct_correct']:>8.1f}%  {r['dominant_cluster']:>12} ({r['dominant_cluster_n']})")
    print()
    total_n = sum(r["n_valid"] for r in rows)
    total_c = sum(r["correct"] for r in rows)
    print(f"  Total N={total_n}, Total correct={total_c} ({100*total_c/total_n:.1f}%)")
    print("═" * 80)


def print_cluster_model_table(cluster_model: dict, verdicts: dict, all_models: list):
    print("\n" + "═" * 80)
    print("  CLUSTER × MODEL BREAKDOWN")
    print("═" * 80)

    col_width = 8
    model_abbrevs = [m.split("-")[0] if "-" in m else m[:8] for m in all_models]
    header = f"  {'Cluster':>8} {'N':>4} {'Verdict':>12}  " + "  ".join(f"{a:>{col_width}}" for a in model_abbrevs)
    print(header)
    print("  " + "─" * (34 + len(all_models) * (col_width + 2)))

    # Sort clusters numerically
    try:
        sorted_clusters = sorted(cluster_model.keys(), key=lambda x: int(x))
    except ValueError:
        sorted_clusters = sorted(cluster_model.keys())

    for cluster_id in sorted_clusters:
        model_counts = cluster_model[cluster_id]
        total = sum(model_counts.values())
        verdict = verdicts.get(cluster_id, "unknown")
        row = f"  {cluster_id:>8} {total:>4} {verdict:>12}  "
        for model in all_models:
            count = model_counts.get(model, 0)
            row += f"  {count:>{col_width}}"
        print(row)
    print("═" * 80)


def print_schema_compliance_table(rows: list):
    print("\n" + "═" * 65)
    print("  SCHEMA COMPLIANCE TABLE")
    print("═" * 65)
    print(f"  {'Model':<28} {'Attempted':>10}  {'Failed':>7}  {'Valid':>7}  {'Valid%':>7}")
    print("  " + "─" * 61)
    for r in rows:
        print(f"  {r['model']:<28} {r['attempted']:>10}  {r['failed']:>7}  {r['valid']:>7}  {r['pct_valid']:>6.1f}%")
    print("═" * 65)


# ─────────────────────────────────────────────────────────────────────────────
# JSON export for LaTeX integration
# ─────────────────────────────────────────────────────────────────────────────

def export_json(per_model: list, cluster_model: dict, all_models: list,
                schema: list, verdicts: dict, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)

    out = {
        "per_model_accuracy": per_model,
        "cluster_model_breakdown": {
            cid: {model: count for model, count in model_counts.items()}
            for cid, model_counts in cluster_model.items()
        },
        "all_models": all_models,
        "schema_compliance": schema,
        "cluster_verdicts": verdicts,
    }
    path = os.path.join(out_dir, "model_stats.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nJSON saved to: {path}")
    return path


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract per-model and cluster×model stats.")
    parser.add_argument("--run", default=DEFAULT_RUN, help="Path to run JSON file.")
    parser.add_argument("--ann", default=DEFAULT_ANN, help="Path to annotations JSON file.")
    parser.add_argument("--output", default=os.path.join(BASE_DIR, "results"),
                        help="Directory to write model_stats.json.")
    args = parser.parse_args()

    print(f"Loading run file:         {args.run}")
    print(f"Loading annotations file: {args.ann}")

    run = load_run(args.run)
    verdicts = load_annotations(args.ann)

    print(f"\nRun metadata: {run['metadata']['total_items']} responses, "
          f"{run['metadata']['num_clusters']} clusters")
    print(f"Verdicts loaded: {len(verdicts)} cluster annotations")

    per_model_rows = build_per_model_table(run, verdicts)
    cluster_model, all_models = build_cluster_model_table(run, verdicts)
    schema_rows = build_schema_compliance_table(run)

    print_per_model_table(per_model_rows)
    print_cluster_model_table(cluster_model, verdicts, all_models)
    print_schema_compliance_table(schema_rows)

    export_json(per_model_rows, cluster_model, all_models, schema_rows, verdicts, args.output)


if __name__ == "__main__":
    main()
