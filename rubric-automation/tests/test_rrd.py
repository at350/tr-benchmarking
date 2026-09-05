"""Basic tests for the legal RRD pipeline."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from rrd_legal_pkg.llm import MockLLMClient
from rrd_legal_pkg.models import LegalTaskExample, PipelineConfig
from rrd_legal_pkg.pipeline import RRDPipeline
from rrd_legal_pkg.utils import jaccard_similarity, normalize_weights


FIXTURE_PATH = Path(__file__).resolve().parent.parent / "examples" / "toy_legal_task.json"


class TestRRDLegalPipeline(unittest.TestCase):
    """Exercise core deterministic behavior."""

    def setUp(self) -> None:
        payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.task = LegalTaskExample.from_dict(payload)
        self.client = MockLLMClient()

    def test_structure_extraction_has_required_keys(self) -> None:
        structure = self.client.extract_legal_structure(
            legal_question=self.task.legal_question,
            golden_answer=self.task.golden_answer,
            jurisdiction=self.task.jurisdiction,
            legal_domain=self.task.legal_domain,
        )
        self.assertIn("issues", structure)
        self.assertIn("rules", structure)
        self.assertIn("elements", structure)
        self.assertIn("applications", structure)
        self.assertTrue(structure["issues"])
        self.assertTrue(structure["rules"])

    def test_end_to_end_pipeline_exports_outputs(self) -> None:
        config = PipelineConfig(max_iterations=3, decomposition_match_threshold=2, weighting_mode="doctrinal")
        pipeline = RRDPipeline(llm_client=self.client, config=config)
        with tempfile.TemporaryDirectory() as tmpdir:
            result = pipeline.run(self.task, output_dir=tmpdir)
            self.assertGreaterEqual(len(result.rubric_set.active_rubrics()), 4)
            self.assertAlmostEqual(sum(result.rubric_set.weights.values()), 1.0, places=6)
            self.assertTrue((Path(tmpdir) / "final_rubrics.json").exists())
            self.assertTrue((Path(tmpdir) / "rubric_matrix.csv").exists())
            self.assertTrue((Path(tmpdir) / "coverage_audit.json").exists())
            self.assertTrue((Path(tmpdir) / "pipeline_log.json").exists())

    def test_every_weighting_mode_runs(self) -> None:
        """Each strategy must complete and produce normalised weights (the llm mode once crashed)."""
        for mode in ("uniform", "llm", "whitened", "doctrinal"):
            with self.subTest(weighting=mode):
                config = PipelineConfig(max_iterations=2, decomposition_match_threshold=2, weighting_mode=mode)
                pipeline = RRDPipeline(llm_client=MockLLMClient(), config=config)
                with tempfile.TemporaryDirectory() as tmpdir:
                    result = pipeline.run(self.task, output_dir=tmpdir)
                active_ids = {rubric.id for rubric in result.rubric_set.active_rubrics()}
                self.assertEqual(set(result.rubric_set.weights), active_ids)
                self.assertAlmostEqual(sum(result.rubric_set.weights.values()), 1.0, places=6)
                self.assertTrue(all(weight > 0 for weight in result.rubric_set.weights.values()))

    def test_cli_demo_runs_offline(self) -> None:
        package_root = Path(__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = subprocess.run(
                [sys.executable, "rrd_legal.py", "--demo", "--weighting", "uniform", "--output-dir", tmpdir],
                cwd=package_root, capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("Final active rubrics:", proc.stdout)
            self.assertTrue((Path(tmpdir) / "toy_legal_task" / "final_rubrics.json").exists())

    def test_normalize_weights_fallback(self) -> None:
        weights = normalize_weights({"a": 0.0, "b": 0.0})
        self.assertEqual(weights, {"a": 0.5, "b": 0.5})

    def test_similarity_detects_near_duplicates(self) -> None:
        similarity = jaccard_similarity(
            "The response states the negligence rule accurately.",
            "The response accurately states the negligence standard.",
        )
        self.assertGreater(similarity, 0.5)


if __name__ == "__main__":
    unittest.main()
