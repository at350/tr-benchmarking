#!/usr/bin/env python3
"""
compare_embeddings.py
─────────────────────
Compares clustering quality between:
  - Baseline:          sentence-transformers/all-MiniLM-L6-v2 (no instruction)
  - Instruction-tuned: hkunlp/instructor-large (with legal reasoning instruction)

Metrics reported per embedding strategy:
  • Silhouette Score  (higher is better, range [-1, 1])
  • Davies-Bouldin Index (lower is better, range [0, ∞))
  • # clusters, # noise points, noise %

Usage:
  python lsh-IRAC/compare_embeddings.py
  python lsh-IRAC/compare_embeddings.py --data lsh-IRAC/data/responses_20260305.json
  python lsh-IRAC/compare_embeddings.py --data lsh-IRAC/data/responses_20260305.json --output lsh-IRAC/results/
"""

import os
import sys
import json
import glob
import time
import argparse
import numpy as np

# Allow importing from the project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from irac_utils import format_irac_for_embedding
from lsh.density_clustering import run_density_clustering
from lsh.utils import get_embedding_model

# ──────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────

UMAP_N_NEIGHBORS   = 5
UMAP_MIN_DIST      = 0.1
UMAP_N_COMPONENTS  = 10
HDBSCAN_MIN_CLUSTER_SIZE = 5
HDBSCAN_MIN_SAMPLES      = 2
RANDOM_STATE = 42

BASELINE_MODEL   = "sentence-transformers/all-MiniLM-L6-v2"
INSTRUCTED_MODEL = "hkunlp/instructor-large"
INSTRUCTED_INSTRUCTION = (
    "Represent the legal reasoning components "
    "(Issue, Rule, Application, Conclusion) of this text:"
)

# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

def load_latest_data_file(search_dir: str) -> str:
    """Find the most recently modified responses JSON file."""
    pattern = os.path.join(search_dir, "responses*.json")
    files = glob.glob(pattern)
    if not files:
        raise FileNotFoundError(f"No responses JSON found in {search_dir}")
    return max(files, key=os.path.getmtime)


def load_responses(data_path: str):
    """Load valid IRAC responses from a JSON file."""
    with open(data_path, "r") as f:
        data = json.load(f)
    valid = [item for item in data if "error" not in item and "response" in item]
    print(f"Loaded {len(valid)} valid IRAC responses from {os.path.basename(data_path)}")
    return valid


def embed_baseline(texts, model_name=BASELINE_MODEL):
    """Encode texts using standard SentenceTransformer (no instruction)."""
    model = get_embedding_model(model_name)
    if model is None:
        raise RuntimeError(f"Could not load model: {model_name}")
    return model.encode(texts, show_progress_bar=True)


def embed_instructed(texts, model_name=INSTRUCTED_MODEL, instruction=INSTRUCTED_INSTRUCTION):
    """Encode texts using Instructor model (with instruction prefix)."""
    model = get_embedding_model(model_name)
    if model is None:
        raise RuntimeError(f"Could not load model: {model_name}")
    inputs = [[instruction, text] for text in texts]
    return model.encode(inputs, show_progress_bar=True)


def run_pipeline(embeddings_matrix: np.ndarray, doc_ids: list) -> dict:
    """Run UMAP+HDBSCAN and compute cluster quality metrics. Returns a results dict."""
    from sklearn.metrics import silhouette_score, davies_bouldin_score

    emb_dict = {doc_id: embeddings_matrix[i] for i, doc_id in enumerate(doc_ids)}

    partition = run_density_clustering(
        emb_dict,
        n_neighbors=UMAP_N_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
        n_components=UMAP_N_COMPONENTS,
        random_state=RANDOM_STATE,
    )

    labels = np.array([partition[doc_id] for doc_id in doc_ids])
    n_noise = int(np.sum(labels == -1))
    n_clusters = len(set(labels[labels != -1]))
    noise_pct = (n_noise / len(labels) * 100) if len(labels) > 0 else 0

    silhouette = None
    db_index = None

    mask = labels != -1
    X_valid = embeddings_matrix[mask]
    labels_valid = labels[mask]
    n_valid_clusters = len(set(labels_valid))

    if n_valid_clusters >= 2 and len(X_valid) > n_valid_clusters:
        try:
            silhouette = float(silhouette_score(X_valid, labels_valid, metric="cosine"))
        except Exception as e:
            print(f"  Warning: silhouette_score failed: {e}")
        try:
            db_index = float(davies_bouldin_score(X_valid, labels_valid))
        except Exception as e:
            print(f"  Warning: davies_bouldin_score failed: {e}")
    else:
        print(f"  Skipping metrics: only {n_valid_clusters} clusters with {len(X_valid)} valid points.")

    return {
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "noise_pct": round(noise_pct, 1),
        "silhouette": round(silhouette, 4) if silhouette is not None else None,
        "davies_bouldin": round(db_index, 4) if db_index is not None else None,
    }


def print_comparison(baseline_result: dict, instructed_result: dict):
    """Print a side-by-side comparison table."""
    def fmt(val, higher_better=True):
        if val is None:
            return "N/A"
        return f"{val:.4f}"

    def winner(a, b, higher_better=True):
        if a is None or b is None:
            return " ", " "
        if higher_better:
            return ("★", " ") if a > b else (" ", "★")
        else:
            return ("★", " ") if a < b else (" ", "★")

    print("\n" + "═" * 65)
    print("   EMBEDDING COMPARISON REPORT")
    print("═" * 65)
    print(f"  {'Metric':<30} {'Baseline':>12} {'Instructed':>12}")
    print(f"  {'':─<30} {'':─>12} {'':─>12}")

    # Silhouette
    w_base, w_ins = winner(baseline_result["silhouette"], instructed_result["silhouette"], higher_better=True)
    print(f"  {'Silhouette Score (↑ better)':<30} "
          f"{w_base + fmt(baseline_result['silhouette']):>12} "
          f"{w_ins + fmt(instructed_result['silhouette']):>12}")

    # Davies-Bouldin
    w_base, w_ins = winner(baseline_result["davies_bouldin"], instructed_result["davies_bouldin"], higher_better=False)
    print(f"  {'Davies-Bouldin Index (↓ better)':<30} "
          f"{w_base + fmt(baseline_result['davies_bouldin']):>12} "
          f"{w_ins + fmt(instructed_result['davies_bouldin']):>12}")

    # Clusters and noise
    print(f"  {'# Clusters':<30} {baseline_result['n_clusters']:>12} {instructed_result['n_clusters']:>12}")
    print(f"  {'# Noise Points':<30} {baseline_result['n_noise']:>12} {instructed_result['n_noise']:>12}")
    print(f"  {'Noise %':<30} {baseline_result['noise_pct']:>11}% {instructed_result['noise_pct']:>11}%")
    print("═" * 65)

    # Verdict
    sil_b = baseline_result["silhouette"]
    sil_i = instructed_result["silhouette"]
    if sil_b is not None and sil_i is not None:
        delta = sil_i - sil_b
        direction = "better" if delta > 0 else "worse"
        print(f"\n  Instruction-tuned Silhouette is {abs(delta):.4f} {direction} than baseline.")
    print()


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))

    parser = argparse.ArgumentParser(description="Compare baseline vs. instruction-tuned embeddings.")
    parser.add_argument(
        "--data",
        default=None,
        help="Path to a responses JSON file. Defaults to the latest in lsh-IRAC/data/.",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(base_dir, "results"),
        help="Directory to write the comparison report JSON.",
    )
    args = parser.parse_args()

    data_path = args.data
    if data_path is None:
        data_dir = os.path.join(base_dir, "data")
        data_path = load_latest_data_file(data_dir)
        print(f"Auto-selected data file: {data_path}")

    responses = load_responses(data_path)
    if not responses:
        print("No valid responses to embed. Exiting.")
        sys.exit(1)

    texts   = [format_irac_for_embedding(r["response"]) for r in responses]
    doc_ids = [r["id"] for r in responses]

    timestamp = time.strftime("%Y%m%d_%H%M%S")

    # ── BASELINE ──────────────────────────────────────────────────────
    print(f"\n[1/2] Encoding with BASELINE model: {BASELINE_MODEL}")
    t0 = time.time()
    baseline_embs = embed_baseline(texts)
    t1 = time.time()
    print(f"  Encoded {len(texts)} responses in {t1 - t0:.1f}s.")

    print("  Clustering baseline embeddings...")
    baseline_result = run_pipeline(baseline_embs, doc_ids)
    print(f"  Result: {baseline_result}")

    # ── INSTRUCTION-TUNED ─────────────────────────────────────────────
    print(f"\n[2/2] Encoding with INSTRUCTION-TUNED model: {INSTRUCTED_MODEL}")
    t0 = time.time()
    instructed_embs = embed_instructed(texts)
    t1 = time.time()
    print(f"  Encoded {len(texts)} responses in {t1 - t0:.1f}s.")

    print("  Clustering instruction-tuned embeddings...")
    instructed_result = run_pipeline(instructed_embs, doc_ids)
    print(f"  Result: {instructed_result}")

    # ── REPORT ────────────────────────────────────────────────────────
    print_comparison(baseline_result, instructed_result)

    report = {
        "timestamp": timestamp,
        "data_file": os.path.basename(data_path),
        "n_responses": len(responses),
        "umap_params": {
            "n_neighbors": UMAP_N_NEIGHBORS,
            "min_dist": UMAP_MIN_DIST,
            "n_components": UMAP_N_COMPONENTS,
        },
        "hdbscan_params": {
            "min_cluster_size": HDBSCAN_MIN_CLUSTER_SIZE,
            "min_samples": HDBSCAN_MIN_SAMPLES,
        },
        "baseline": {
            "model": BASELINE_MODEL,
            "instruction": None,
            **baseline_result,
        },
        "instructed": {
            "model": INSTRUCTED_MODEL,
            "instruction": INSTRUCTED_INSTRUCTION,
            **instructed_result,
        },
    }

    os.makedirs(args.output, exist_ok=True)
    out_path = os.path.join(args.output, f"comparison_report_{timestamp}.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Comparison report saved to: {out_path}\n")


if __name__ == "__main__":
    main()
