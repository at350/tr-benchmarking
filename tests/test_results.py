"""The run-file builder shared by every clustering command."""
import numpy as np

from trbench.results import FREE_FORM_NOISE, IRAC_NOISE, build_results_document, free_form_fields, irac_fields


class FakePipeline:
    def __init__(self, embeddings):
        self.embeddings = embeddings
        self.duplicate_ids = ["dup"]

    def centroid_members(self, cluster_id, member_ids, count=3):
        return [] if cluster_id == "noise" else list(member_ids)[:count]

    def edge_members(self, cluster_id, member_ids, count=3, seed=42):
        return [] if cluster_id == "noise" else list(member_ids)[-1:]


RECORDS = [
    {"id": "a", "model": "m1", "response": "Yes."},
    {"id": "b", "model": "m1", "response": "Yes, enforceable."},
    {"id": "c", "model": "m2", "response": "No."},
    {"id": "n", "model": "m2", "response": "???"},
]
RESULTS = {
    "num_clusters": 2,
    "clusters": {0: ["a", "b"], 1: ["c"], "noise": ["n"]},
    "representatives": {0: "a", 1: "c"},
    "partition": {"a": 0, "b": 0, "c": 1, "n": -1},
    "params": {"method": "density_umap_hdbscan", "umap_dims": 10, "min_cluster_size": 5},
}


def test_free_form_document_shape():
    pipeline = FakePipeline({r["id"]: np.zeros(3) for r in RECORDS})
    doc = build_results_document(pipeline, RESULTS, RECORDS, metadata={"timestamp": "t", "question": "Q"},
                                 member_fields=free_form_fields, noise_fields=FREE_FORM_NOISE)
    meta = doc["metadata"]
    assert meta["method"] == "density_umap_hdbscan" and meta["umap_dims"] == 10 and meta["question"] == "Q"
    assert meta["total_items"] == 4 and meta["duplicate_ids_dropped"] == 1 and meta["num_clusters"] == 2
    assert list(doc["clusters"]) == ["0", "1", "-1"]  # largest first, noise as "-1"
    assert doc["clusters"]["0"]["representative"] == {"id": "a", "model": "m1", "text": "Yes."}
    assert [m["id"] for m in doc["clusters"]["0"]["members"]] == ["a", "b"]
    assert doc["clusters"]["0"]["centroid_members"][0]["id"] == "a"
    assert doc["clusters"]["0"]["edge_members"][0]["id"] == "b"
    assert doc["clusters"]["-1"]["representative"]["model"] == "NOISE"
    assert "topic_signals" not in doc["clusters"]["0"]


def test_irac_document_carries_topic_signals_and_fields():
    records = [dict(r, response={"issue": "I", "rule": "R", "application": "A", "conclusion": r["response"]}) for r in RECORDS]
    results = dict(RESULTS, topic_signals={"0": {"Statute of Frauds": 80.0}, "1": {}, "-1": {}})
    doc = build_results_document(FakePipeline({r["id"]: np.zeros(3) for r in records}), results, records,
                                 metadata={"schema": "IRAC"}, member_fields=irac_fields, noise_fields=IRAC_NOISE)
    assert doc["clusters"]["0"]["topic_signals"] == {"Statute of Frauds": 80.0}
    assert doc["clusters"]["0"]["members"][0] == {"id": "a", "model": "m1", "issue": "I", "rule": "R", "application": "A", "conclusion": "Yes."}
    assert doc["clusters"]["-1"]["representative"]["conclusion"] == "Outliers"


def test_package_versions_are_recorded():
    from trbench.results import package_versions

    versions = package_versions()
    assert "python" in versions and "numpy" in versions
