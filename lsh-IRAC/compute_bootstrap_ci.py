#!/usr/bin/env python3
"""
compute_bootstrap_ci.py
───────────────────────
Computes 95% bootstrap confidence intervals for the key cluster quality
and legal alignment metrics reported in the paper:

  • Silhouette Score (INSTRUCTOR embeddings)
  • Davies-Bouldin Index (INSTRUCTOR embeddings)
  • NMI (clusters vs expert verdicts)
  • ARI (clusters vs expert verdicts)

Strategy: resample N responses with replacement, re-embed, re-cluster,
re-compute metrics. Because re-embedding 193 responses per bootstrap
iteration is expensive, we use a faster approximation:
  - Pre-compute all embeddings once.
  - Bootstrap over the embedding matrix (resample rows) and re-run
    UMAP + HDBSCAN + metric computation on each resample.

n_bootstrap defaults to 500. For final paper use 1000+.

Usage:
  python lsh-IRAC/compute_bootstrap_ci.py
  python lsh-IRAC/compute_bootstrap_ci.py --n_bootstrap 1000 \
      --data lsh-IRAC/data/responses_20260310_153754.json \
      --ann  lsh-IRAC/results/annotations_sofmarriage.json
"""

import os
import sys
import json
import time
import argparse
import warnings
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
sys.path.insert(0, PROJECT_DIR)

DEFAULT_DATA = os.path.join(BASE_DIR, "data", "responses_20260310_153754.json")
DEFAULT_ANN  = os.path.join(BASE_DIR, "results", "annotations_sofmarriage.json")
DEFAULT_RESULTS = os.path.join(BASE_DIR, "results")

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


# ─────────────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────────────

def load_responses(path: str) -> list:
    with open(path) as f:
        data = json.load(f)
    return [item for item in data if "error" not in item and "response" in item]


def load_verdicts(ann_path: str, run_path: str) -> dict:
    """
    Returns {response_id: verdict_label} by mapping cluster verdicts
    back to individual member IDs using the run file.
    """
    with open(ann_path) as f:
        ann = json.load(f)
    verdict_map = {str(a["clusterId"]): a["verdict"] for a in ann["annotations"]}

    with open(run_path) as f:
        run = json.load(f)

    id_verdict = {}
    for cluster_id, cluster_data in run["clusters"].items():
        verdict = verdict_map.get(str(cluster_id), "unknown")
        for member in cluster_data.get("members", []):
            id_verdict[member["id"]] = verdict
    return id_verdict


def format_irac_for_embedding(irac_dict: dict) -> str:
    if not isinstance(irac_dict, dict):
        return str(irac_dict)
    parts = []
    for field in ["issue", "rule", "application", "conclusion"]:
        val = irac_dict.get(field, "")
        if val:
            parts.append(f"{field.upper()}: {val}")
    return "\n".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# Embedding
# ─────────────────────────────────────────────────────────────────────────────

def embed_all(responses: list) -> np.ndarray:
    from lsh.utils import get_embedding_model
    model = get_embedding_model(INSTRUCTED_MODEL)
    if model is None:
        raise RuntimeError(f"Could not load: {INSTRUCTED_MODEL}")
    texts = [format_irac_for_embedding(r["response"]) for r in responses]
    inputs = [[INSTRUCTED_INSTRUCTION, t] for t in texts]
    print(f"  Encoding {len(inputs)} responses (this may take a few minutes)...")
    t0 = time.time()
    embs = model.encode(inputs, show_progress_bar=True)
    print(f"  Done in {time.time()-t0:.1f}s")
    return np.array(embs)


# ─────────────────────────────────────────────────────────────────────────────
# Single-iteration metric computation
# ─────────────────────────────────────────────────────────────────────────────

def compute_metrics_on_sample(emb_sample: np.ndarray, verdict_sample: list) -> dict:
    """Given a (n, d) embedding matrix and list of verdict labels, run the
    full pipeline and return metric dict. Returns None if pipeline fails.
    """
    from umap import UMAP
    from sklearn.cluster import HDBSCAN as SklearnHDBSCAN
    from sklearn.metrics import (
        silhouette_score, davies_bouldin_score,
        normalized_mutual_info_score, adjusted_rand_score,
    )

    n = emb_sample.shape[0]
    if n < 10:
        return None

    # UMAP
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        reducer = UMAP(
            n_neighbors=min(UMAP_N_NEIGHBORS, n - 1),
            min_dist=UMAP_MIN_DIST,
            n_components=min(UMAP_N_COMPONENTS, n - 2),
            random_state=RANDOM_STATE,
        )
        umap_embs = reducer.fit_transform(emb_sample)

    # HDBSCAN (sklearn)
    clusterer = SklearnHDBSCAN(
        min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
        min_samples=HDBSCAN_MIN_SAMPLES,
    )
    labels = clusterer.fit_predict(umap_embs)

    n_clusters = len(set(labels[labels != -1]))
    n_noise = int(np.sum(labels == -1))

    # Cluster quality metrics (on non-noise points only)
    mask = labels != -1
    silhouette = db_index = None
    X_valid = emb_sample[mask]
    labels_valid = labels[mask]
    if len(set(labels_valid)) >= 2 and len(X_valid) > len(set(labels_valid)):
        try:
            silhouette = float(silhouette_score(X_valid, labels_valid, metric="cosine"))
            db_index = float(davies_bouldin_score(X_valid, labels_valid))
        except Exception:
            pass

    # Legal alignment metrics (NMI, ARI): map symbolic verdicts to int
    verdict_to_int = {"correct": 0, "incorrect": 1, "ambiguous": 2, "unknown": 3}
    verdict_ints = np.array([verdict_to_int.get(v, 3) for v in verdict_sample])

    nmi = ari = None
    if n_clusters >= 2:
        try:
            nmi = float(normalized_mutual_info_score(labels, verdict_ints))
            ari = float(adjusted_rand_score(labels, verdict_ints))
        except Exception:
            pass

    return {
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "silhouette": silhouette,
        "davies_bouldin": db_index,
        "nmi": nmi,
        "ari": ari,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap
# ─────────────────────────────────────────────────────────────────────────────

def bootstrap(embeddings: np.ndarray, verdicts: list, n_bootstrap: int, rng: np.random.Generator) -> dict:
    n = embeddings.shape[0]
    silhouettes, dbis, nmis, aris = [], [], [], []

    print(f"\n  Running {n_bootstrap} bootstrap iterations...")
    t0 = time.time()
    for i in range(n_bootstrap):
        if (i + 1) % 50 == 0:
            elapsed = time.time() - t0
            est_total = elapsed / (i + 1) * n_bootstrap
            print(f"  Iteration {i+1}/{n_bootstrap} ({elapsed:.0f}s elapsed, ~{est_total-elapsed:.0f}s remaining)")

        idx = rng.integers(0, n, size=n)
        emb_sample = embeddings[idx]
        verdict_sample = [verdicts[j] for j in idx]

        result = compute_metrics_on_sample(emb_sample, verdict_sample)
        if result is None:
            continue

        if result["silhouette"] is not None:
            silhouettes.append(result["silhouette"])
        if result["davies_bouldin"] is not None:
            dbis.append(result["davies_bouldin"])
        if result["nmi"] is not None:
            nmis.append(result["nmi"])
        if result["ari"] is not None:
            aris.append(result["ari"])

    def ci(values):
        if not values:
            return {"mean": None, "ci_lo": None, "ci_hi": None, "std": None, "n": 0}
        arr = np.array(values)
        return {
            "mean": float(np.mean(arr)),
            "std": float(np.std(arr)),
            "ci_lo": float(np.percentile(arr, 2.5)),
            "ci_hi": float(np.percentile(arr, 97.5)),
            "n": len(arr),
        }

    return {
        "silhouette": ci(silhouettes),
        "davies_bouldin": ci(dbis),
        "nmi": ci(nmis),
        "ari": ci(aris),
    }


def print_cis(cis: dict, point_estimates: dict):
    print("\n" + "═" * 65)
    print("  95% BOOTSTRAP CONFIDENCE INTERVALS")
    print("═" * 65)
    print(f"  {'Metric':<22} {'Point Est':>10} {'95% CI':>22} {'n_valid':>8}")
    print("  " + "─" * 61)
    for metric, ci_data in cis.items():
        pt = point_estimates.get(metric)
        pt_str = f"{pt:.4f}" if pt is not None else "N/A"
        if ci_data["mean"] is not None:
            ci_str = f"[{ci_data['ci_lo']:.4f}, {ci_data['ci_hi']:.4f}]"
        else:
            ci_str = "N/A"
        print(f"  {metric:<22} {pt_str:>10} {ci_str:>22} {ci_data['n']:>8}")
    print("═" * 65)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Bootstrap CI for clustering metrics.")
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--ann", default=DEFAULT_ANN)
    parser.add_argument("--run", default=os.path.join(BASE_DIR, "results", "run_20260310_153754.json"))
    parser.add_argument("--n_bootstrap", type=int, default=500,
                        help="Number of bootstrap iterations (default: 500; use 1000 for final).")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", default=DEFAULT_RESULTS)
    args = parser.parse_args()

    print(f"Loading responses from: {args.data}")
    responses = load_responses(args.data)
    print(f"  Loaded {len(responses)} valid responses")

    print(f"Loading verdicts from: {args.ann}")
    id_verdict = load_verdicts(args.ann, args.run)

    print("\nEmbedding all responses...")
    embeddings = embed_all(responses)

    # Map each response to its pre-computed cluster verdict
    verdicts = [id_verdict.get(r["id"], "unknown") for r in responses]
    verdict_counts = {}
    for v in verdicts:
        verdict_counts[v] = verdict_counts.get(v, 0) + 1
    print(f"  Verdict distribution: {verdict_counts}")

    # Point estimates (from paper / run file)
    point_estimates = {
        "silhouette": 0.2794,
        "davies_bouldin": 1.6786,
        "nmi": 0.5094,
        "ari": 0.1709,
    }

    rng = np.random.default_rng(args.seed)
    cis = bootstrap(embeddings, verdicts, args.n_bootstrap, rng)

    print_cis(cis, point_estimates)

    # Save
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    os.makedirs(args.output, exist_ok=True)
    out_path = os.path.join(args.output, f"bootstrap_ci_{timestamp}.json")
    out = {
        "timestamp": timestamp,
        "n_bootstrap": args.n_bootstrap,
        "seed": args.seed,
        "n_responses": len(responses),
        "point_estimates": point_estimates,
        "bootstrap_cis": cis,
    }
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nSaved to: {out_path}")


if __name__ == "__main__":
    main()
