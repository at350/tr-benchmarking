"""``trbench bridge``: cluster responses handed over as JSON and print JSON only.

The frontend writes ``{"responses": [{"id": ..., "response": ...}, ...]}`` to a temp file and
spawns ``python -m trbench.cli bridge --input <file>``. Everything except the final JSON goes
to stderr, so the contract is: stdout is one JSON document.
"""
import json
import sys
from collections import defaultdict
from contextlib import redirect_stdout
from itertools import combinations

EMBEDDING_INSTRUCTION = "Represent the legal conclusion and reasoning of this text:"


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--input", required=True, help='JSON file: {"responses": [{"id", "response"}, ...]}')
    parser.set_defaults(run=run)


def build_embedding_graph_partition(embeddings_by_id, ids):
    from trbench.graph_clustering import build_similarity_graph, cluster_graph, get_cluster_representatives

    graph = build_similarity_graph(set(combinations(ids, 2)), embeddings_by_id, threshold=0.72)
    if graph.number_of_edges() == 0:
        partition = {doc_id: index for index, doc_id in enumerate(ids)}
    else:
        partition = cluster_graph(graph, resolution=1.0)
    valid_partition = {doc_id: cluster_id for doc_id, cluster_id in partition.items() if cluster_id != -1}
    return partition, get_cluster_representatives(valid_partition, embeddings_by_id)


def build_clusters(payload: dict) -> dict:
    from trbench.pipeline import LSHEvaluationPipeline
    from trbench.text import clean_text, encode_responses

    items = []
    for entry in payload.get("responses", []):
        if not isinstance(entry, dict):
            continue
        doc_id = str(entry.get("id", "")).strip()
        text = str(entry.get("response", "")).strip()
        if doc_id and text:
            items.append({"id": doc_id, "response": text})

    if not items:
        return {"clusters": []}
    if len(items) == 1:
        only = items[0]
        return {"clusters": [{"id": "cluster_1", "representativeResponseId": only["id"], "memberResponseIds": [only["id"]]}]}

    def graph_fallback(note_method, note_text):
        texts = [clean_text(item["response"]) for item in items]
        ids = [item["id"] for item in items]
        with redirect_stdout(sys.stderr):
            embeddings = encode_responses(texts, instruction=EMBEDDING_INSTRUCTION)
        embeddings_by_id = {doc_id: embedding for doc_id, embedding in zip(ids, embeddings)}
        partition, representatives = build_embedding_graph_partition(embeddings_by_id, ids)
        return partition, representatives, note_method, note_text

    if len(items) < 4:
        partition, representatives, method, notes = graph_fallback(
            "embedding_graph_small_sample",
            "Used embedding-similarity graph clustering because the density settings are unstable below 4 responses.")
    else:
        try:
            with redirect_stdout(sys.stderr):
                pipeline = LSHEvaluationPipeline()
                pipeline.ingest_data(items)
                results = pipeline.run_clustering(method="density")
            partition, representatives = results["partition"], results["representatives"]
            method = "density_umap_hdbscan"
            notes = "Clustered with the same density pipeline used for saved runs: instructor embeddings, UMAP reduction, and HDBSCAN."
        except Exception as exc:  # fall back rather than fail the frontend request
            partition, representatives, method, notes = graph_fallback(
                "embedding_graph_fallback",
                f"Fell back to embedding-similarity graph clustering after density clustering failed: {exc}")

    grouped = defaultdict(list)
    for doc_id, cluster_id in partition.items():
        grouped[cluster_id].append(doc_id)
    clusters = []
    for index, (cluster_id, member_ids) in enumerate(sorted(grouped.items(), key=lambda item: (-len(item[1]), str(item[0]))), start=1):
        representative_id = representatives.get(cluster_id) if cluster_id != -1 else None
        if representative_id not in member_ids:
            representative_id = member_ids[0]
        clusters.append({
            "id": f"cluster_{index}",
            "sourceClusterId": "noise" if cluster_id == -1 else str(cluster_id),
            "representativeResponseId": representative_id,
            "memberResponseIds": member_ids,
        })
    return {"clusters": clusters, "method": method, "notes": notes}


def run(args) -> int:
    with open(args.input, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    json.dump(build_clusters(payload), sys.stdout)
    return 0
