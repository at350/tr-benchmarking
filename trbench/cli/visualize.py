"""``trbench visualize``: the before/after embedding maps and the cluster-size chart.

Re-embeds the saved answers twice (a generic sentence encoder, then the instruction-tuned
encoder) and projects each to 2-D with UMAP, colouring points by the keyword verdict
heuristic; then charts cluster sizes for the latest run. Needs the ``viz`` extra
(matplotlib, pandas, seaborn) and downloads the embedding models; no API calls.
"""
import glob
import os

from trbench.results import read_json
from trbench.verdict import verdict_hint

DEFAULT_DATA = os.path.join("runs", "free-form", "responses", "responses.json")
DEFAULT_RESULTS_DIR = os.path.join("runs", "free-form", "results")
DEFAULT_OUTPUT_DIR = os.path.join("docs", "figures")
COLORS = {"YES": "green", "NO": "red", "AMBIGUOUS": "gray", "NOISE": "gray"}


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--data", default=DEFAULT_DATA, help="responses JSON (default: %(default)s)")
    parser.add_argument("--results-dir", default=DEFAULT_RESULTS_DIR, help="run files to chart the latest of (default: %(default)s)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="where to write PNGs (default: %(default)s)")
    parser.set_defaults(run=run)


def scatter(data, model_name, title, path, instruction=None):
    import matplotlib.pyplot as plt
    import umap
    from trbench.text import encode_responses

    print(f"Generating {os.path.basename(path)}...")
    texts = [d["response"] for d in data]
    verdicts = [verdict_hint(t) for t in texts]
    embeddings = encode_responses(texts, model_name=model_name, instruction=instruction)
    points = umap.UMAP(n_neighbors=15, min_dist=0.1, n_components=2, random_state=42).fit_transform(embeddings)

    plt.figure(figsize=(10, 8))
    for verdict in ("YES", "NO", "AMBIGUOUS"):
        idx = [i for i, v in enumerate(verdicts) if v == verdict]
        if idx:
            plt.scatter(points[idx, 0], points[idx, 1], c=COLORS[verdict], label=verdict, alpha=0.6, s=50)
    plt.title(title, fontsize=16)
    plt.legend(title="Automated verdict (keyword heuristic)")
    plt.tight_layout()
    plt.savefig(path)
    plt.close()


def cluster_sizes(results_dir, path):
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    import pandas as pd

    files = sorted(glob.glob(os.path.join(results_dir, "run_*.json")))
    if not files:
        print(f"No run files in {results_dir}; skipping the cluster-size chart.")
        return
    run = read_json(files[-1])  # names carry the timestamp, so the last one sorted is the latest
    rows = []
    for key, cluster in run["clusters"].items():
        noise = key in ("noise", "-1")
        text = cluster["representative"].get("text") or cluster["representative"].get("conclusion", "")
        verdict = "NOISE" if noise else verdict_hint(text)
        rows.append({"Cluster": key, "Size": len(cluster["members"]), "Verdict": verdict, "Color": COLORS[verdict]})
    frame = pd.DataFrame(rows)
    frame["Order"] = frame["Verdict"].map({"YES": 0, "NO": 1, "AMBIGUOUS": 2, "NOISE": 3})
    frame = frame.sort_values(["Order", "Size"], ascending=[True, False])

    plt.figure(figsize=(12, 6))
    plt.bar(frame["Cluster"], frame["Size"], color=frame["Color"])
    plt.xlabel("Cluster")
    plt.ylabel("Answers")
    plt.title(f"Cluster sizes by verdict ({os.path.basename(files[-1])})", fontsize=16)
    plt.legend([Line2D([0], [0], color=c, lw=4) for c in ("green", "red", "gray")],
               ["YES (enforceable)", "NO (unenforceable)", "Ambiguous / noise"])
    plt.tight_layout()
    plt.savefig(path)
    plt.close()
    print(f"Saved {os.path.basename(path)}")


def run(args) -> int:
    import logging
    logging.getLogger("matplotlib.font_manager").setLevel(logging.WARNING)
    import seaborn as sns
    sns.set(style="whitegrid", context="talk")

    os.makedirs(args.output_dir, exist_ok=True)
    data = read_json(args.data)
    scatter(data, "all-MiniLM-L6-v2", "Before: generic sentence embeddings\n(answers group by topic)",
            os.path.join(args.output_dir, "viz_before_topical.png"))
    scatter(data, "hkunlp/instructor-large", "After: instruction-tuned embeddings\n(answers group by conclusion)",
            os.path.join(args.output_dir, "viz_after_instruction.png"),
            instruction="Represent the legal conclusion and reasoning of this text:")
    cluster_sizes(args.results_dir, os.path.join(args.output_dir, "viz_cluster_distribution.png"))
    print("All figures written.")
    return 0
