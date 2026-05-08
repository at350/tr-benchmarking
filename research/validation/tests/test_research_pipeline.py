import json
import shutil
import unittest
from pathlib import Path

from research.validation.config import load_config
from research.validation.dasha import cluster_responses
from research.validation.frank import build_frank_packet
from research.validation.judge import judge_clusters
from research.validation.karthic import build_karthic_rubric
from research.validation.openai_client import _read_env_file
from research.validation.pipeline import run_pipeline
from research.validation.quality import (
    find_mixed_reasoning_clusters,
    validate_frank_packet,
    validate_rubric_pack,
)
from research.validation.metrics import bootstrap_ci, macro_f1, mean_absolute_error, weighted_kappa


ROOT = Path(__file__).resolve().parents[3]


class ResearchPipelineTests(unittest.TestCase):
    def setUp(self):
        self.config_path = ROOT / "research/fixtures/tiny_config.json"
        self.output_dir = ROOT / "research/runs/tiny_offline"
        if self.output_dir.exists():
            shutil.rmtree(self.output_dir)

    def tearDown(self):
        if self.output_dir.exists():
            shutil.rmtree(self.output_dir)

    def test_offline_pipeline_exports_complete_run_bundle(self):
        config = load_config(self.config_path, repo_root=ROOT)

        result = run_pipeline(config, repo_root=ROOT)

        self.assertEqual(result.run_id, "tiny_offline")
        self.assertTrue((self.output_dir / "manifest.json").exists())
        self.assertTrue((self.output_dir / "frank_packet.json").exists())
        self.assertTrue((self.output_dir / "karthic_rubric.json").exists())
        self.assertTrue((self.output_dir / "dasha_clusters.json").exists())
        self.assertTrue((self.output_dir / "judge_scores.json").exists())
        self.assertTrue((self.output_dir / "zak_packets.json").exists())
        self.assertTrue((self.output_dir / "report.md").exists())

        manifest = json.loads((self.output_dir / "manifest.json").read_text())
        self.assertEqual(manifest["run_id"], "tiny_offline")
        self.assertEqual(manifest["pipeline_status"], "ready_for_jd_review")
        self.assertIn("prompt_hashes", manifest)

    def test_generated_frank_and_karthic_artifacts_pass_quality_gates(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)

        frank = json.loads((self.output_dir / "frank_packet.json").read_text())
        rubric = json.loads((self.output_dir / "karthic_rubric.json").read_text())

        frank_errors = validate_frank_packet(frank)
        rubric_errors = validate_rubric_pack(rubric, config.quality_gates)

        self.assertEqual(frank_errors, [])
        self.assertEqual(rubric_errors, [])
        self.assertNotIn("Bounded uncertainty:", json.dumps(frank))

    def test_dasha_clusters_separate_obvious_legal_reasoning_paths(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)

        clusters = json.loads((self.output_dir / "dasha_clusters.json").read_text())
        mixed = find_mixed_reasoning_clusters(clusters, threshold=config.clustering.mixed_cluster_threshold)

        self.assertEqual(mixed, [])
        cluster_signatures = {cluster["legal_signal"]["conclusion"] for cluster in clusters["clusters"]}
        self.assertEqual(cluster_signatures, {"wife_wins", "later_beneficiaries_win"})

    def test_metrics_are_available_for_paper_validation(self):
        self.assertAlmostEqual(mean_absolute_error([4, 3, 2], [3, 3, 4]), 1.0)
        self.assertAlmostEqual(macro_f1(["a", "a", "b"], ["a", "b", "b"]), 2 / 3)
        self.assertGreater(weighted_kappa([0, 1, 2, 2], [0, 1, 1, 2]), 0)

        low, high = bootstrap_ci([1, 1, 0, 1], iterations=200, seed=7)
        self.assertLessEqual(low, 0.75)
        self.assertGreaterEqual(high, 0.75)

    def test_env_file_parser_handles_basic_openai_key(self):
        env_path = ROOT / "research/runs/tmp_env_parse.env"
        env_path.parent.mkdir(parents=True, exist_ok=True)
        env_path.write_text("OPENAI_API_KEY='sk-test-local'\nIGNORED=value\n", encoding="utf-8")

        try:
            values = _read_env_file(env_path)
        finally:
            env_path.unlink(missing_ok=True)

        self.assertEqual(values["OPENAI_API_KEY"], "sk-test-local")

    def test_live_config_exposes_llm_judge_mode_without_running_api_calls(self):
        config = load_config(ROOT / "research/fixtures/live_openai_config.example.json", repo_root=ROOT)

        self.assertEqual(config.mode, "live_openai")
        self.assertEqual(config.judge.mode, "llm")
        self.assertTrue(config.judge.model)

    def test_frank_generates_sof_one_year_boundary_variations_from_new_case(self):
        case_path = ROOT / "research/runs/tmp_one_year_case.txt"
        case_path.parent.mkdir(parents=True, exist_ok=True)
        case_path.write_text(
            "In Illinois, a company orally promised to employ a manager for eighteen months, "
            "with performance to begin two months after the agreement. No signed writing was "
            "made. The manager quit another job and worked for three months before termination.",
            encoding="utf-8",
        )

        try:
            packet = build_frank_packet(case_path, "one_year_dynamic")
        finally:
            case_path.unlink(missing_ok=True)

        gates = {gate["id"] for gate in packet["statute_of_frauds"]["gates"]}
        variation_ids = {variation["id"] for variation in packet["variations"]}

        self.assertIn("one_year", gates)
        self.assertIn("one_year_boundary_less_than_year", variation_ids)
        self.assertIn("one_year_boundary_more_than_year", variation_ids)
        self.assertNotIn("benefit certificate", packet["neutral_question"].lower())
        self.assertIn("eighteen months", packet["neutral_question"].lower())

    def test_frank_does_not_treat_incidental_year_timing_as_one_year_gate(self):
        packet = build_frank_packet(ROOT / "research/fixtures/tiny_source_case.txt", "marriage_regression")

        self.assertEqual(packet["statute_of_frauds"]["primary_gate_id"], "marriage")
        self.assertIn("marriage", packet["neutral_question"].lower())

    def test_karthic_dynamic_rubric_targets_detected_sof_gate_and_variations(self):
        case_path = ROOT / "research/runs/tmp_surety_case.txt"
        case_path.parent.mkdir(parents=True, exist_ok=True)
        case_path.write_text(
            "A founder orally promised a vendor that he would pay the corporation's debt if "
            "the corporation defaulted. The vendor alleges the founder made the promise to "
            "protect his own ownership interest. No signed writing exists.",
            encoding="utf-8",
        )

        try:
            packet = build_frank_packet(case_path, "surety_dynamic")
            rubric = build_karthic_rubric(packet)
        finally:
            case_path.unlink(missing_ok=True)

        rubric_text = json.dumps(rubric).lower()
        categories = {row["category"] for row in rubric["rows"]}

        self.assertIn("suretyship", rubric_text)
        self.assertIn("main-purpose", rubric_text)
        self.assertIn("gate", categories)
        self.assertIn("variation", categories)
        self.assertGreaterEqual(len(rubric["rows"]), 8)

    def test_dasha_clusters_sof_responses_by_gate_outcome_and_exception(self):
        responses = [
            {
                "id": "m1_a",
                "model": "m1",
                "text": "The oral eighteen-month employment promise falls within the one-year Statute of Frauds, no signed writing exists, and promissory estoppel is only a disputed fallback, so enforcement is unlikely.",
            },
            {
                "id": "m2_a",
                "model": "m2",
                "text": "Because the contract cannot be fully performed within one year and there is no writing, the Statute of Frauds bars the manager's contract claim absent a narrow estoppel theory.",
            },
            {
                "id": "m3_a",
                "model": "m3",
                "text": "If the job was only nine months and began immediately, the one-year provision is not triggered because full performance within a year is possible, so the oral agreement may be enforceable.",
            },
            {
                "id": "m4_a",
                "model": "m4",
                "text": "The decisive issue is partial performance: the manager worked for three months, which may support reliance but does not itself satisfy the one-year writing requirement.",
            },
        ]

        clusters = cluster_responses(responses)
        signatures = {
            (
                cluster["legal_signal"]["gate"],
                cluster["legal_signal"]["outcome"],
                cluster["legal_signal"]["exception"],
            )
            for cluster in clusters["clusters"]
        }

        self.assertIn(("one_year", "barred", "estoppel"), signatures)
        self.assertIn(("one_year", "enforceable", "none"), signatures)
        self.assertTrue(all("centroid_quality" in cluster for cluster in clusters["clusters"]))

    def test_dasha_uses_frank_primary_gate_context_for_sparse_responses(self):
        clusters = cluster_responses([
            {
                "id": "sparse_marriage",
                "model": "m1",
                "text": "The wife likely has the better claim because the initial promise, the issued certificate, and her possession establish her rights despite the later replacement.",
            }
        ], primary_gate_id="marriage")

        signal = clusters["clusters"][0]["legal_signal"]
        self.assertEqual(signal["gate"], "marriage")
        self.assertEqual(signal["exception"], "writing_or_substitute")

    def test_dasha_does_not_flip_later_beneficiary_answer_because_wife_is_mentioned(self):
        clusters = cluster_responses([
            {
                "id": "later_controls",
                "model": "m1",
                "text": "This is primarily a beneficiary-designation dispute. Because the member replaced the certificate and named his children and sister, they likely have the better claim. The wife's argument depends on enforcing the premarital promise, but the association paperwork points the other way.",
            }
        ], primary_gate_id="marriage")

        signal = clusters["clusters"][0]["legal_signal"]
        self.assertEqual(signal["conclusion"], "later_beneficiaries_win")
        self.assertEqual(signal["reasoning"], "association_replacement_controls")

    def test_dasha_does_not_flip_wife_answer_because_counterargument_mentions_children(self):
        clusters = cluster_responses([
            {
                "id": "wife_with_counter",
                "model": "m1",
                "text": "The best answer favors the wife. The promise was tied to marriage, so the marriage provision controls rather than ordinary gift analysis. The later certificate is evidence of performance. The children and sister can argue the final certificate governs, but the earlier rights created for the wife are not obviously defeated.",
            }
        ], primary_gate_id="marriage")

        signal = clusters["clusters"][0]["legal_signal"]
        self.assertEqual(signal["conclusion"], "wife_wins")
        self.assertEqual(signal["reasoning"], "marriage_promise_certificate_rights")

    def test_judge_projects_centroid_scores_to_members_and_ranks_models(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)
        rubric = json.loads((self.output_dir / "karthic_rubric.json").read_text())
        clusters = json.loads((self.output_dir / "dasha_clusters.json").read_text())

        scores = judge_clusters(clusters, rubric, agreement_threshold=config.judge.agreement_threshold)

        self.assertIn("model_rankings", scores)
        self.assertIn("member_scores", scores)
        self.assertGreater(len(scores["member_scores"]), 0)
        self.assertGreaterEqual(scores["model_rankings"][0]["mean_projected_score"], scores["model_rankings"][-1]["mean_projected_score"])


if __name__ == "__main__":
    unittest.main()
