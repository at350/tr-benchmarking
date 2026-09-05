"""Smoke test for the frontend clustering bridge.

Runs lsh/cluster_legal_workflow.py as a subprocess with LSH_MOCK_EMBEDDINGS=1 (random
vectors, no model download) and checks the contract the frontend relies on: stdout is a
single JSON document, every input id is assigned to exactly one cluster, and each
cluster's representative is one of its members.

Skipped when the clustering stack (umap-learn / scikit-learn) is not installed.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("umap")
pytest.importorskip("sklearn")

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "lsh" / "cluster_legal_workflow.py"


def run_bridge(payload: dict, tmp_path: Path) -> subprocess.CompletedProcess:
    input_path = tmp_path / "input.json"
    input_path.write_text(json.dumps(payload), encoding="utf-8")
    env = {**os.environ, "LSH_MOCK_EMBEDDINGS": "1"}
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--input", str(input_path)],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=600,
    )


def assert_partition(result: dict, ids: list[str]) -> None:
    assigned = [m for cluster in result["clusters"] for m in cluster["memberResponseIds"]]
    assert sorted(assigned) == sorted(ids), "every id appears in exactly one cluster"
    for cluster in result["clusters"]:
        assert cluster["representativeResponseId"] in cluster["memberResponseIds"]


def test_density_path_emits_json_only(tmp_path):
    ids = [f"r{i}" for i in range(12)]
    payload = {"responses": [{"id": i, "response": f"The promise is {'un' if n % 2 else ''}enforceable. " * (3 + n % 4)}
                             for n, i in enumerate(ids)]}
    proc = run_bridge(payload, tmp_path)
    assert proc.returncode == 0, proc.stderr
    result = json.loads(proc.stdout)  # would raise if progress text leaked onto stdout
    assert result["method"] in {"density_umap_hdbscan", "embedding_graph_fallback"}
    assert_partition(result, ids)


def test_small_sample_path(tmp_path):
    ids = ["a", "b", "c"]
    payload = {"responses": [{"id": i, "response": f"Answer {i} about the statute of frauds."} for i in ids]}
    proc = run_bridge(payload, tmp_path)
    assert proc.returncode == 0, proc.stderr
    result = json.loads(proc.stdout)
    assert result["method"] == "embedding_graph_small_sample"
    assert_partition(result, ids)


def test_empty_and_single_inputs(tmp_path):
    assert json.loads(run_bridge({"responses": []}, tmp_path).stdout) == {"clusters": []}
    single = json.loads(run_bridge({"responses": [{"id": "only", "response": "text"}]}, tmp_path).stdout)
    assert single["clusters"][0]["memberResponseIds"] == ["only"]
