#!/usr/bin/env python3
"""
run_kmeans_ablation.py
──────────────────────
Runs K-Means (k=15 to match HDBSCAN output count) on the same INSTRUCTOR
embeddings used for the primary clustering, then reports Silhouette and
Davies-Bouldin Index for comparison with HDBSCAN.

Also runs K-Means with k=3 (broad legal verdict categories) as a secondary test.

Output: results/kmeans_ablation_<timestamp>.json

Usage:
  python lsh-IRAC/run_kmeans_ablation.py
  python lsh-IRAC/run_kmeans_ablation.py --data lsh-IRAC/data/responses_20260310_153754.json
"""

import os
import sys
import json
import time
import argparse
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
sys.path.insert(0, PROJECT_DIR)

DEFAULT_DATA = os.path.join(BASE_DIR, "data", "responses_20260310_153754.json")
DEFAULT_RESULTS = os.path.join(BASE_DIR, "results")

# Same hyperparameters as the primary clustering
INSTRUCTED_MODEL = "hkunlp/instructor-large"
INSTRUCTED_INSTRUCTION = (
    "Represent the legal reasoning components "
    "(Issue, Rule, Application, Conclusion) of this text:"
)
UMAP_N_NEIGHBORS = 5
UMAP_MIN_DIST = 0.1
UMAP_N_COMPONENTS = 10
HDBSCAN_MIN_CLUSTER_SIZE = 5
HDBSCAN_MIN_SAMPLES = 2
RANDOM_STATE = 42

K_MATCH = 15   # Match HDBSCAN discovered cluster count
K_BROAD = 3    # Broad: correct / incorrect / ambiguous


def load_responses(data_path: str) -> list:
    with open(data_path) as f:
        data = json.load(f)
    valid = [item for item in data if "error" not in item and "response" in item]
    print(f"Loaded {len(valid)} valid IRAC responses from {os.path.basename(data_path)}")
    return valid


def format_irac_for_embedding(irac_dict: dict) -> str:
    if not isinstance(irac_dict, dict):
        return str(irac_dict)
    parts = []
    for field in ["issue", "rule", "application", "conclusion"]:
        val = irac_dict.get(field, "")
        if val:
            parts.append(f"{field.upper()}: {val}")
    return "\n".join(parts)


def embed_instructed(texts: list) -> np.ndarray:
    from irac_utils import format_irac_for_embedding as _fmt  # noqa: F401
    from lsh.utils import get_embedding_model
    print(f"  Loading embedding model: {INSTRUCTED_MODEL}")
    model = get_embedding_model(INSTRUCTED_MODEL)
    if model is None:
        raise RuntimeError(f"Could not load model: {INSTRUCTED_MODEL}")
    inputs = [[INSTRUCTED_INSTRUCTION, text] for text in texts]
    print(f"  Encoding {len(texts)} texts...")
    t0 = time.time()
    embs = model.encode(inputs, show_progress_bar=True)
    print(f"  Done in {time.time()-t0:.1f}s")
    return np.array(embs)


def reduce_umap(embeddings: np.ndarray) -> np.ndarray:
    from umap import UMAP
    print(f"  Running UMAP ({UMAP_N_COMPONENTS}D)...")
    reducer = UMAP(
        n_neighbors=UMAP_N_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        n_components=UMAP_N_COMPONENTS,
        random_state=RANDOM_STATE,
    )
    return reducer.fit_transform(embeddings)


def run_hdbscan(umap_embs: np.ndarray, embeddings_orig: np.ndarray):
    """Run HDBSCAN and compute metrics on original embedding space."""
    import hdbscan as hdbscan_lib
    from sklearn.metrics import silhouette_score, davies_bouldin_score

    print("  Running HDBSCAN...")
    clusterer = hdbscan_lib.HDBSCAN(
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
    )
    labels = clusterer.fit_predict(umap_embs)

    n_noise = int(np.sum(labels == -1))
    n_clusters = len(set(labels[labels != -1]))
    noise_pct = round(100.0 * n_noise / len(labels), 1)

    mask = labels != -1
    X_valid = embeddings_orig[mask]
    labels_valid = labels[mask]

    silhouette = db_index = None
    if len(set(labels_valid)) >= 2 and len(X_valid) > len(set(labels_valid)):
        silhouette = float(silhouette_score(X_valid, labels_valid, metric="cosine"))
        db_index = float(davies_bouldin_score(X_valid, labels_valid))

    return {
        "method": "HDBSCAN",
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "noise_pct": noise_pct,
        "silhouette": round(silhouette, 4) if silhouette is not None else None,
        "davies_bouldin": round(db_index, 4) if db_index is not None else None,
    }


def run_kmeans(umap_embs: np.ndarray, embeddings_orig: np.ndarray, k: int, label: str):
    """Run K-Means and compute metrics on original embedding space."""
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score, davies_bouldin_score

    print(f"  Running K-Means (k={k})...")
    km = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=20)
    labels = km.fit_predict(umap_embs)

    silhouette = float(silhouette_score(embeddings_orig, labels, metric="cosine"))
    db_index = float(davies_bouldin_score(embeddings_orig, labels))
    inertia = float(km.inertia_)

    return {
        "method": f"K-Means (k={k}; {label})",
        "k": k,
        "n_clusters": k,
        "n_noise": 0,
        "noise_pct": 0.0,
        "silhouette": round(silhouette, 4),
        "davies_bouldin": round(db_index, 4),
        "inertia": round(inertia, 2),
    }


def print_comparison(results: list):
    print("\n" + "═" * 70)
    print("  CLUSTERING ABLATION: HDBSCAN vs K-Means")
    print("═" * 70)
    print(f"  {'Method':<32} {'Silhouette↑':>12} {'DBI↓':>10} {'Clusters':>9} {'Noise':>6}")
    print("  " + "─" * 66)
    for r in results:
        sil = f"{r['silhouette']:.4f}" if r['silhouette'] is not None else "N/A"
        dbi = f"{r['davies_bouldin']:.4f}" if r['davies_bouldin'] is not None else "N/A"
        noise = f"{r['n_noise']} ({r['noise_pct']:.1f}%)" if r['n_noise'] > 0 else "0"
        print(f"  {r['method']:<32} {sil:>12} {dbi:>10} {r['n_clusters']:>9} {noise:>6}")
    print("═" * 70)


def main():
    parser = argparse.ArgumentParser(description="K-Means ablation vs HDBSCAN.")
    parser.add_argument("--data", default=DEFAULT_DATA,
                        help="Path to responses JSON file.")
    parser.add_argument("--output", default=DEFAULT_RESULTS,
                        help="Output directory for ablation JSON.")
    args = parser.parse_args()

    responses = load_responses(args.data)
    if not responses:
        print("No valid responses found.")
        sys.exit(1)

    texts = [format_irac_for_embedding(r["response"]) for r in responses]

    print("\n[1/4] Embedding responses with INSTRUCTOR...")
    embeddings = embed_instructed(texts)

    print("\n[2/4] Reducing with UMAP...")
    umap_embs = reduce_umap(embeddings)

    print("\n[3/4] Running HDBSCAN (primary method)...")
    hdbscan_result = run_hdbscan(umap_embs, embeddings)
    print(f"  HDBSCAN: {hdbscan_result}")

    print("\n[4/4] Running K-Means ablations...")
    kmeans_k15 = run_kmeans(umap_embs, embeddings, K_MATCH, "matched k")
    print(f"  K-Means k={K_MATCH}: {kmeans_k15}")

    kmeans_k3 = run_kmeans(umap_embs, embeddings, K_BROAD, "broad verdicts")
    print(f"  K-Means k={K_BROAD}: {kmeans_k3}")

    results = [hdbscan_result, kmeans_k15, kmeans_k3]
    print_comparison(results)

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    os.makedirs(args.output, exist_ok=True)
    out_path = os.path.join(args.output, f"kmeans_ablation_{timestamp}.json")
    out = {
        "timestamp": timestamp,
        "n_responses": len(responses),
        "umap_params": {
            "n_neighbors": UMAP_N_NEIGHBORS,
            "min_dist": UMAP_MIN_DIST,
            "n_components": UMAP_N_COMPONENTS,
        },
        "embedding_model": INSTRUCTED_MODEL,
        "results": results,
    }
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nResults saved to: {out_path}")


if __name__ == "__main__":
    main()
