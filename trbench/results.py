"""Build the ``run_<timestamp>.json`` document that the portal and ``trbench inspect`` read.

Every clustering command (cluster, irac-benchmark, poison, robust-benchmark) used to carry
its own copy of this logic; they now share one builder so the format stays identical.
"""
import json
import os
import time
from typing import Any, Callable, Dict, Iterable, List, Mapping

NOISE_KEY = "-1"


def timestamp() -> str:
    return time.strftime("%Y%m%d_%H%M%S")


def build_results_document(
    pipeline,
    results: Mapping[str, Any],
    records: Iterable[Mapping[str, Any]],
    *,
    metadata: Mapping[str, Any],
    member_fields: Callable[[Mapping[str, Any]], Dict[str, Any]],
    noise_fields: Dict[str, Any],
) -> Dict[str, Any]:
    """Assemble clusters, representatives, and the central/peripheral members into one document.

    Args:
        pipeline: the fitted LSHEvaluationPipeline (for embeddings and member selection).
        results: what ``pipeline.run_clustering`` returned.
        records: the input records (each with ``id`` and ``model``).
        metadata: caller-specific metadata (question, schema, failures, ...); the clustering
            parameters and counts are added here.
        member_fields: maps a record to the fields shown for a member, e.g. ``{"text": ...}``
            for free-form answers or the four IRAC fields.
        noise_fields: the same fields for the placeholder representative of the noise cluster.
    """
    by_id = {record["id"]: record for record in records}

    def member(member_id: str) -> Dict[str, Any]:
        record = by_id.get(member_id, {})
        return {"id": member_id, "model": record.get("model", "unknown"), **member_fields(record)}

    topic_signals = results.get("topic_signals") or {}
    document: Dict[str, Any] = {
        "metadata": {
            **metadata,
            "method": results["params"]["method"],
            "params": dict(results["params"]),
            "umap_dims": results["params"].get("umap_dims"),
            "min_cluster_size": results["params"].get("min_cluster_size"),
            "total_items": len(pipeline.embeddings),
            "duplicate_ids_dropped": len(pipeline.duplicate_ids),
            "num_clusters": results["num_clusters"],
        },
        "clusters": {},
    }

    ordered = sorted(results["clusters"].items(), key=lambda item: -len(item[1]))
    for cluster_id, member_ids in ordered:
        is_noise = cluster_id == "noise"
        key = NOISE_KEY if is_noise else str(cluster_id)
        if is_noise:
            representative = {"id": "N/A", "model": "NOISE", **noise_fields}
        else:
            representative = member(results["representatives"][cluster_id])
        entry: Dict[str, Any] = {
            "representative": representative,
            "members": [member(mid) for mid in member_ids],
            "centroid_members": [member(mid) for mid in pipeline.centroid_members(cluster_id, member_ids)],
            "edge_members": [member(mid) for mid in pipeline.edge_members(cluster_id, member_ids)],
        }
        if topic_signals:
            entry["topic_signals"] = topic_signals.get(key, {})
        document["clusters"][key] = entry
    return document


def write_json(path: str, document: Any) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)
    return path


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def free_form_fields(record: Mapping[str, Any]) -> Dict[str, Any]:
    return {"text": record.get("response", "")}


IRAC_FIELDS = ("issue", "rule", "application", "conclusion")


def irac_fields(record: Mapping[str, Any]) -> Dict[str, Any]:
    response = record.get("response") or {}
    return {field: response.get(field, "") for field in IRAC_FIELDS}


FREE_FORM_NOISE = {"text": "Outliers: answers HDBSCAN could not place in any dense cluster"}
IRAC_NOISE = {"issue": "N/A", "rule": "N/A", "application": "N/A", "conclusion": "Outliers"}


def failure_report(failures: List[Mapping[str, Any]], per_model: int) -> Dict[str, int]:
    """Print a per-model failure summary and return the counts."""
    counts: Dict[str, int] = {}
    for failure in failures:
        counts[failure["model"]] = counts.get(failure["model"], 0) + 1
    if counts:
        print("\n--- Generation failure report ---")
        for model, count in counts.items():
            example = next((f["error"] for f in failures if f["model"] == model), "Unknown")
            example = example if len(example) <= 150 else example[:150] + "..."
            print(f"Model: {model} | Failures: {count}/{per_model}")
            print(f"  Example error: {example}")
        print("---------------------------------\n")
    return counts
