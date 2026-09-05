"""``trbench grid-search``: sweep UMAP/HDBSCAN parameters and score each by verdict purity.

Purity is the share of each cluster's members that agree with the cluster's majority verdict
(keyword heuristic), weighted by cluster size. Uses a small generic encoder by default so
the sweep is quick; pass ``--model hkunlp/instructor-large`` to sweep the production encoder.
"""
import os

from trbench.results import read_json
from trbench.verdict import verdict_hint

DEFAULT_DATA = os.path.join("runs", "free-form", "responses", "responses.json")


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--data", default=DEFAULT_DATA, help="responses JSON (default: %(default)s)")
    parser.add_argument("--model", default="all-mpnet-base-v2", help="sentence-transformers model (default: %(default)s)")
    parser.add_argument("--min-clusters", type=int, default=3, help="ignore settings that yield fewer clusters (default: %(default)s)")
    parser.set_defaults(run=run)


def purity(partition, verdicts):
    clusters = {}
    for doc_id, cluster_id in partition.items():
        if cluster_id != -1:
            clusters.setdefault(cluster_id, []).append(verdicts[doc_id])
    score = total = 0
    for members in clusters.values():
        yes, no = members.count("YES"), members.count("NO")
        if yes + no:
            score += max(yes, no) / (yes + no) * len(members)
        total += len(members)
    return score / total if total else 0.0


def run(args) -> int:
    import umap
    from sklearn.cluster import HDBSCAN
    from trbench.text import encode_responses

    data = read_json(args.data)
    ids = [d["id"] for d in data]
    verdicts = {d["id"]: verdict_hint(d["response"]) for d in data}
    print(f"Encoding {len(ids)} answers with {args.model}...")
    embeddings = encode_responses([d["response"] for d in data], model_name=args.model)

    neighbors, min_dists, min_sizes = (5, 10, 15, 30), (0.0, 0.05, 0.1, 0.2), (5, 10)
    best_score, best = -1.0, None
    print(f"Sweeping {len(neighbors) * len(min_dists) * len(min_sizes)} settings...")
    for n_neighbors in neighbors:
        for min_dist in min_dists:
            reduced = umap.UMAP(n_neighbors=n_neighbors, min_dist=min_dist, n_components=10,
                                metric="cosine", random_state=42).fit_transform(embeddings)
            for min_cluster_size in min_sizes:
                labels = HDBSCAN(min_cluster_size=min_cluster_size, min_samples=1, cluster_selection_method="eom").fit_predict(reduced)
                partition = dict(zip(ids, labels))
                score = purity(partition, verdicts)
                n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
                print(f"n_neighbors={n_neighbors:<3} min_dist={min_dist:<5} min_cluster_size={min_cluster_size:<3} -> clusters={n_clusters:<3} purity={score:.4f}")
                if score > best_score and n_clusters >= args.min_clusters:
                    best_score, best = score, {"n_neighbors": n_neighbors, "min_dist": min_dist, "min_cluster_size": min_cluster_size}
    print(f"\n=== BEST PARAMS ===\n{best}\npurity: {best_score:.4f}")
    return 0
