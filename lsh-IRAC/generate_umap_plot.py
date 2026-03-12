#!/usr/bin/env python3
"""
generate_umap_plot.py
─────────────────────
Generates publication-quality UMAP 2D scatter plots for the paper.

Produces a figure with two side-by-side panels:
  Panel A: Points colored by HDBSCAN cluster ID (15 colors)
  Panel B: Points colored by expert verdict (correct / incorrect / ambiguous)

Output: results/figures/umap_scatter.pdf  (and .png for preview)

Usage:
  python lsh-IRAC/generate_umap_plot.py
  python lsh-IRAC/generate_umap_plot.py --data lsh-IRAC/data/responses_20260310_153754.json \
      --run lsh-IRAC/results/run_20260310_153754.json \
      --ann lsh-IRAC/results/annotations_sofmarriage.json
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
DEFAULT_RUN  = os.path.join(BASE_DIR, "results", "run_20260310_153754.json")
DEFAULT_ANN  = os.path.join(BASE_DIR, "results", "annotations_sofmarriage.json")
DEFAULT_OUT  = os.path.join(BASE_DIR, "results", "figures")

INSTRUCTED_MODEL = "hkunlp/instructor-large"
INSTRUCTED_INSTRUCTION = (
    "Represent the legal reasoning components "
    "(Issue, Rule, Application, Conclusion) of this text:"
)
UMAP_N_NEIGHBORS = 5
UMAP_MIN_DIST = 0.1
RANDOM_STATE = 42


# ─────────────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────────────

def load_responses(path: str) -> list:
    with open(path) as f:
        data = json.load(f)
    return [item for item in data if "error" not in item and "response" in item]


def load_cluster_assignments(run_path: str) -> dict:
    """Returns {response_id: cluster_id_int}. Noise = -1."""
    with open(run_path) as f:
        run = json.load(f)
    id_cluster = {}
    for cluster_id_str, cluster_data in run["clusters"].items():
        cid = int(cluster_id_str)
        for member in cluster_data.get("members", []):
            id_cluster[member["id"]] = cid
    return id_cluster


def load_verdicts(ann_path: str, run_path: str) -> dict:
    """Returns {response_id: verdict_str}."""
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
# Embedding + UMAP 2D
# ─────────────────────────────────────────────────────────────────────────────

def embed_instructed(responses: list) -> np.ndarray:
    from lsh.utils import get_embedding_model
    model = get_embedding_model(INSTRUCTED_MODEL)
    if model is None:
        raise RuntimeError(f"Could not load model: {INSTRUCTED_MODEL}")
    texts = [format_irac_for_embedding(r["response"]) for r in responses]
    inputs = [[INSTRUCTED_INSTRUCTION, t] for t in texts]
    print(f"  Encoding {len(inputs)} responses...")
    t0 = time.time()
    embs = model.encode(inputs, show_progress_bar=True)
    print(f"  Done in {time.time()-t0:.1f}s")
    return np.array(embs)


def reduce_umap_2d(embeddings: np.ndarray) -> np.ndarray:
    from umap import UMAP
    print(f"  Reducing to 2D with UMAP (n_neighbors={UMAP_N_NEIGHBORS})...")
    reducer = UMAP(
        n_neighbors=UMAP_N_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        n_components=2,
        random_state=RANDOM_STATE,
    )
    return reducer.fit_transform(embeddings)


# ─────────────────────────────────────────────────────────────────────────────
# Plotting
# ─────────────────────────────────────────────────────────────────────────────

CLUSTER_COLORS = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
    "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
    "#dcbeff", "#9a6324", "#fffac8", "#800000", "#aaffc3",
    "#808000", "#ffd8b1", "#000075", "#a9a9a9", "#000000",
]

VERDICT_COLORS = {
    "correct": "#2ecc71",    # green
    "incorrect": "#e74c3c",  # red
    "ambiguous": "#f39c12",  # orange
    "unknown": "#95a5a6",    # grey
}

VERDICT_MARKERS = {
    "correct": "o",
    "incorrect": "X",
    "ambiguous": "^",
    "unknown": "s",
}

DOCTRINE_LABELS = {
    0:  "Main-purpose / leading-object",
    1:  "Main-purpose (tax-motive)",
    2:  "SOF marriage provision (explicit)",
    3:  "SOF marriage provision",
    4:  "Promissory estoppel",
    5:  "Past consideration",
    6:  "Original-promise doctrine",
    7:  "Consideration-only (SOF omitted)",
    8:  "Valid oral contract / sub. perf.",
    9:  "SOF suretyship (wrong provision)",
    10: "SOF marriage + PE analysis",
    11: "SOF part-performance exception",
    12: "SOF debt-assumption framing",
    13: "Promissory estoppel only",
    14: "Promissory estoppel (reliance)",
}


def make_figure(coords: np.ndarray, cluster_labels: list, verdict_labels: list,
                out_dir: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.lines import Line2D

    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    fig.patch.set_facecolor("#1a1a2e")
    fig.subplots_adjust(wspace=0.35)

    x, y = coords[:, 0], coords[:, 1]

    # ── Panel A: cluster coloring ──────────────────────────────────────────
    ax = axes[0]
    ax.set_facecolor("#16213e")

    unique_clusters = sorted(set(cluster_labels))
    for cid in unique_clusters:
        mask = np.array(cluster_labels) == cid
        color = CLUSTER_COLORS[cid % len(CLUSTER_COLORS)] if cid >= 0 else "#555555"
        ax.scatter(x[mask], y[mask], c=color, s=28, alpha=0.85,
                   edgecolors="none", zorder=3, label=f"C{cid}")

    # Add cluster-ID annotations at cluster centroid
    for cid in unique_clusters:
        if cid < 0:
            continue
        mask = np.array(cluster_labels) == cid
        cx, cy = x[mask].mean(), y[mask].mean()
        ax.text(cx, cy, str(cid), fontsize=7, color="white", fontweight="bold",
                ha="center", va="center", zorder=5,
                bbox=dict(boxstyle="round,pad=0.15", fc="#1a1a2e", alpha=0.5, ec="none"))

    ax.set_title("(a) Clusters discovered by HDBSCAN", color="white", fontsize=12, pad=10)
    ax.tick_params(colors="#aaaaaa", labelsize=8)
    ax.set_xlabel("UMAP dim 1", color="#aaaaaa", fontsize=9)
    ax.set_ylabel("UMAP dim 2", color="#aaaaaa", fontsize=9)
    for spine in ax.spines.values():
        spine.set_edgecolor("#333366")

    # Compact legend (cluster IDs)
    patches = []
    for cid in unique_clusters:
        color = CLUSTER_COLORS[cid % len(CLUSTER_COLORS)] if cid >= 0 else "#555555"
        label = DOCTRINE_LABELS.get(cid, f"Cluster {cid}")
        patches.append(mpatches.Patch(color=color, label=f"C{cid}: {label}"))
    ax.legend(handles=patches, loc="upper left", fontsize=5.5,
              facecolor="#1a1a2e", edgecolor="#333366", labelcolor="white",
              ncol=1, framealpha=0.9, handlelength=1.2)

    # ── Panel B: verdict coloring ──────────────────────────────────────────
    ax = axes[1]
    ax.set_facecolor("#16213e")

    for verdict in ["correct", "incorrect", "ambiguous", "unknown"]:
        mask = np.array(verdict_labels) == verdict
        if not np.any(mask):
            continue
        ax.scatter(x[mask], y[mask],
                   c=VERDICT_COLORS[verdict],
                   marker=VERDICT_MARKERS[verdict],
                   s=30, alpha=0.85, edgecolors="none", zorder=3)

    ax.set_title("(b) Expert verdict alignment", color="white", fontsize=12, pad=10)
    ax.tick_params(colors="#aaaaaa", labelsize=8)
    ax.set_xlabel("UMAP dim 1", color="#aaaaaa", fontsize=9)
    ax.set_ylabel("UMAP dim 2", color="#aaaaaa", fontsize=9)
    for spine in ax.spines.values():
        spine.set_edgecolor("#333366")

    legend_elements = [
        Line2D([0], [0], marker="o", color="w", label="Correct",
               markerfacecolor=VERDICT_COLORS["correct"], markersize=9),
        Line2D([0], [0], marker="X", color="w", label="Incorrect",
               markerfacecolor=VERDICT_COLORS["incorrect"], markersize=9),
        Line2D([0], [0], marker="^", color="w", label="Ambiguous",
               markerfacecolor=VERDICT_COLORS["ambiguous"], markersize=9),
    ]
    ax.legend(handles=legend_elements, loc="upper left", fontsize=9,
              facecolor="#1a1a2e", edgecolor="#333366", labelcolor="white",
              framealpha=0.9)

    # ── Shared title and footer ────────────────────────────────────────────
    fig.suptitle(
        "UMAP 2D Projection of IRAC Response Embeddings (N=193, INSTRUCTOR-large)\n"
        "TR-Benchmarking · SOF Marriage Question",
        color="white", fontsize=11, y=1.01,
    )
    fig.text(0.5, -0.02,
             f"UMAP: n_neighbors={UMAP_N_NEIGHBORS}, min_dist={UMAP_MIN_DIST}, "
             f"random_state={RANDOM_STATE}",
             ha="center", color="#888888", fontsize=7)

    os.makedirs(out_dir, exist_ok=True)
    pdf_path = os.path.join(out_dir, "umap_scatter.pdf")
    png_path = os.path.join(out_dir, "umap_scatter.png")

    plt.savefig(pdf_path, format="pdf", bbox_inches="tight", dpi=150,
                facecolor=fig.get_facecolor())
    plt.savefig(png_path, format="png", bbox_inches="tight", dpi=150,
                facecolor=fig.get_facecolor())
    plt.close()

    print(f"\n  Saved PDF: {pdf_path}")
    print(f"  Saved PNG: {png_path}")
    return pdf_path, png_path


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate UMAP 2D scatter plot for paper.")
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--run",  default=DEFAULT_RUN)
    parser.add_argument("--ann",  default=DEFAULT_ANN)
    parser.add_argument("--output", default=DEFAULT_OUT)
    args = parser.parse_args()

    print(f"Loading responses: {args.data}")
    responses = load_responses(args.data)
    print(f"  {len(responses)} valid responses")

    print(f"Loading cluster assignments: {args.run}")
    id_cluster = load_cluster_assignments(args.run)

    print(f"Loading expert verdicts: {args.ann}")
    id_verdict = load_verdicts(args.ann, args.run)

    print("\n[1/2] Embedding with INSTRUCTOR...")
    embeddings = embed_instructed(responses)

    print("\n[2/2] Running UMAP 2D projection...")
    coords = reduce_umap_2d(embeddings)

    # Align labels to responses (in order)
    cluster_labels = [id_cluster.get(r["id"], -1) for r in responses]
    verdict_labels  = [id_verdict.get(r["id"], "unknown") for r in responses]

    print("\nGenerating figure...")
    pdf_path, png_path = make_figure(coords, cluster_labels, verdict_labels, args.output)

    print("\nDone!")
    print(f"  Include in LaTeX with: \\includegraphics[width=\\linewidth]{{{pdf_path}}}")


if __name__ == "__main__":
    main()
