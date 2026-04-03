#!/usr/bin/env python3

import argparse
import json
import sys
from collections import defaultdict
from contextlib import redirect_stdout
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lsh.clustering import build_similarity_graph, cluster_graph, get_cluster_representatives
from lsh.density_clustering import run_density_clustering
from lsh.utils import clean_text, encode_responses


def build_embedding_graph_partition(embeddings_by_id: dict[str, object], ids: list[str]) -> dict[str, int]:
    candidate_pairs = set(combinations(ids, 2))
    graph = build_similarity_graph(candidate_pairs, embeddings_by_id, threshold=0.72)

    if graph.number_of_edges() == 0:
        return {doc_id: index for index, doc_id in enumerate(ids)}

    return cluster_graph(graph, resolution=1.0)


def build_clusters(payload: dict) -> dict:
    responses = payload.get("responses", [])
    items = []
    for entry in responses:
        if not isinstance(entry, dict):
            continue
        doc_id = str(entry.get("id", "")).strip()
        text = str(entry.get("response", "")).strip()
        if not doc_id or not text:
            continue
        items.append({"id": doc_id, "response": text})

    if not items:
        return {"clusters": []}

    if len(items) == 1:
        only = items[0]
        return {
            "clusters": [{
                "id": "cluster_1",
                "representativeResponseId": only["id"],
                "memberResponseIds": [only["id"]],
            }],
        }

    texts = [clean_text(item["response"]) for item in items]
    ids = [item["id"] for item in items]

    with redirect_stdout(sys.stderr):
        embeddings = encode_responses(
            texts,
            model_name="hkunlp/instructor-large",
            instruction="Represent the legal conclusion and reasoning of this text:",
        )

    embeddings_by_id = {doc_id: embedding for doc_id, embedding in zip(ids, embeddings)}

    sample_count = len(items)
    clustering_method = "density_umap_hdbscan"
    clustering_notes = "Clustered with instructor embeddings, UMAP reduction, and HDBSCAN."

    if sample_count < 4:
        partition = build_embedding_graph_partition(embeddings_by_id, ids)
        clustering_method = "embedding_graph_small_sample"
        clustering_notes = "Used embedding-similarity graph clustering because UMAP/HDBSCAN is unstable below 4 responses."
    else:
        n_neighbors = max(2, min(5, sample_count - 1))
        min_cluster_size = max(2, min(5, sample_count))
        min_samples = 1 if sample_count < 5 else 2
        n_components = max(2, min(10, sample_count - 2))

        try:
            with redirect_stdout(sys.stderr):
                partition = run_density_clustering(
                    embeddings_by_id,
                    n_neighbors=n_neighbors,
                    min_dist=0.1,
                    min_cluster_size=min_cluster_size,
                    min_samples=min_samples,
                    n_components=n_components,
                    random_state=42,
                )
        except Exception as exc:
            partition = build_embedding_graph_partition(embeddings_by_id, ids)
            clustering_method = "embedding_graph_fallback"
            clustering_notes = f"Fell back to embedding-similarity graph clustering after density clustering failed: {exc}"

    valid_partition = {doc_id: cluster_id for doc_id, cluster_id in partition.items() if cluster_id != -1}
    representatives = get_cluster_representatives(valid_partition, embeddings_by_id)

    grouped = defaultdict(list)
    for doc_id, cluster_id in partition.items():
        grouped[cluster_id].append(doc_id)

    ordered_clusters = sorted(grouped.items(), key=lambda item: (-len(item[1]), str(item[0])))
    clusters = []
    for index, (cluster_id, member_ids) in enumerate(ordered_clusters, start=1):
        representative_id = representatives.get(cluster_id) if cluster_id != -1 else None
        if representative_id not in member_ids:
            representative_id = member_ids[0]
        clusters.append({
            "id": f"cluster_{index}",
            "sourceClusterId": "noise" if cluster_id == -1 else str(cluster_id),
            "representativeResponseId": representative_id,
            "memberResponseIds": member_ids,
        })

    return {
        "clusters": clusters,
        "method": clustering_method,
        "notes": clustering_notes,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    result = build_clusters(payload)
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
