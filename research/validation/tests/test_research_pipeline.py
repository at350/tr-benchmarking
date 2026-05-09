import json
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from research.validation import provider_client
from research.validation.config import load_config
from research.validation.dasha import cluster_responses
from research.validation.frank import build_frank_packet
from research.validation.instruction_context import load_agent_instruction_context
from research.validation.internal_stress import build_stress_responses, run_internal_stress, write_stress_table
from research.validation.internal_validation import (
    build_internal_validation_summary,
    build_natural_response_audit,
    write_natural_response_audit_table,
    write_artifact_examples_section,
    write_internal_validation_table,
)
from research.validation.judge import judge_clusters
from research.validation.karthic import build_karthic_rubric
from research.validation.llm_agents import (
    _extract_rubric_rows,
    _missing_required_categories,
    _normalize_rubric_row,
    build_frank_packet_with_llm,
    sanitize_reasoning_signature,
    structured_answer_instruction,
)
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
        self.assertEqual(manifest["pipeline_status"], "internal_validation_ready")
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

    def test_multi_provider_config_defines_llm_agents_and_model_roster(self):
        config = load_config(ROOT / "research/fixtures/live_multi_provider_config.example.json", repo_root=ROOT)

        self.assertEqual(config.mode, "live_multi_provider")
        self.assertEqual(config.agents["frank"].mode, "llm")
        self.assertEqual(config.agents["karthic"].mode, "llm")
        self.assertEqual(config.clustering.method, "llm_reasoning_signature")
        self.assertEqual({spec.provider for spec in config.response_models}, {"openai", "anthropic", "gemini", "replicate"})
        self.assertGreaterEqual(sum(spec.samples for spec in config.response_models), 10)

    def test_openai_anthropic_smoke_config_uses_llm_driven_pipeline(self):
        config = load_config(ROOT / "research/fixtures/live_openai_anthropic_config.example.json", repo_root=ROOT)

        self.assertEqual(config.mode, "live_multi_provider")
        self.assertEqual([spec.provider for spec in config.response_models], ["openai", "anthropic"])
        self.assertTrue(all(agent.mode == "llm" for agent in config.agents.values()))
        self.assertEqual(config.judge.provider, "openai")

    def test_three_provider_smoke_config_includes_replicate(self):
        config = load_config(ROOT / "research/fixtures/live_three_provider_config.example.json", repo_root=ROOT)

        self.assertEqual([spec.provider for spec in config.response_models], ["openai", "anthropic", "replicate"])
        self.assertEqual(sum(spec.samples for spec in config.response_models), 3)

    def test_natural_response_batch_config_uses_multiple_model_families_without_labels(self):
        config = load_config(ROOT / "research/fixtures/live_natural_response_batch_config.example.json", repo_root=ROOT)

        self.assertEqual(config.mode, "live_multi_provider")
        self.assertGreaterEqual(len(config.response_models), 3)
        self.assertGreaterEqual(sum(spec.samples for spec in config.response_models), 9)
        self.assertEqual(config.clustering.method, "llm_reasoning_signature")

    def test_structured_answer_instruction_forces_gold_headings_on_model_responses(self):
        config = load_config(ROOT / "research/fixtures/live_multi_provider_config.example.json", repo_root=ROOT)
        instruction = structured_answer_instruction(config.answer_headings)

        for heading in config.answer_headings:
            self.assertIn(heading, instruction)

    def test_live_frank_prompt_loads_general_instruction_context(self):
        config = load_config(ROOT / "research/fixtures/live_three_provider_config.example.json", repo_root=ROOT)
        captured = {}

        def fake_generator(messages, agent):
            captured["messages"] = messages
            return {
                "doctrine_family": "Contract interpretation",
                "detected_doctrine_gates": [{"id": "plain_meaning", "label": "Plain meaning", "rule": "Apply text first", "source_evidence": "fixture"}],
                "source_extraction": {"jurisdiction": "fixture", "clean_legal_issue": "interpretation", "trigger_facts": [], "source_limits": []},
                "neutral_question": "How should the clause be interpreted? Analyze.",
                "gold_answer": "Jurisdiction assumption:\nfixture",
                "variations": [{"id": "v1", "lane": "A", "changed_fact": "wording", "question": "variant", "expected_behavior": "same rule"}],
                "controller_card": {"primary_gate_id": "plain_meaning", "strongest_counterargument": "ambiguity"},
            }

        packet = build_frank_packet_with_llm(ROOT, config, json_generator=fake_generator)
        prompt = "\n\n".join(message["content"] for message in captured["messages"])

        self.assertIn("General Legal Reasoning Pipeline Protocol", prompt)
        self.assertIn("Do not hard-code Statute of Frauds labels", prompt)
        self.assertIn("do not assume Statute of Frauds or any other doctrine unless the source supports it", prompt)
        self.assertEqual(packet["doctrine_profile"]["primary_gate_id"], "plain_meaning")
        self.assertNotIn("statute_of_frauds", packet)
        self.assertIn("frank_instruction_context", packet["prompt_hashes"])

    def test_instruction_context_is_loaded_from_canonical_tree(self):
        context = load_agent_instruction_context(ROOT, "dasha")

        self.assertIn("instructions/00_GENERAL_LEGAL_REASONING_PROTOCOL.md", context["loaded_files"])
        self.assertIn("instructions/dasha/56_Dasha_Evaluation_Spec_v2.md", context["loaded_files"])
        self.assertIn("Statute of Frauds is the first calibration domain, not the global assumption", context["context"])

    def test_llm_rubric_category_normalization_maps_semantic_variants(self):
        self.assertEqual(_normalize_rubric_row({"id": "R1", "category": "doctrine_gate", "criterion": "x"})["category"], "doctrine")
        self.assertEqual(_normalize_rubric_row({"id": "R1", "category": "doctrine/gate", "criterion": "x"})["category"], "doctrine")
        self.assertEqual(_normalize_rubric_row({"id": "R2", "category": "exceptions_or_defenses", "criterion": "x"})["category"], "exceptions")
        self.assertEqual(_normalize_rubric_row({"id": "R2", "category": "exceptions/defenses", "criterion": "x"})["category"], "exceptions")
        self.assertEqual(_normalize_rubric_row({"id": "R2", "category": "compliance/elements", "criterion": "x"})["category"], "rule")
        self.assertEqual(_normalize_rubric_row({"id": "R3", "category": "variation_sensitivity", "criterion": "x"})["category"], "variation")

    def test_llm_rubric_rows_can_be_extracted_from_common_nested_shapes(self):
        raw = {
            "modules": [
                {"name": "Module 1", "rows": [{"id": "R1", "category": "doctrine", "criterion": "x"}]},
                {"name": "Module 2", "rows": [{"id": "R2", "category": "rule", "criterion": "y"}]},
            ]
        }

        rows = _extract_rubric_rows(raw)

        self.assertEqual([row["id"] for row in rows], ["R1", "R2"])
        self.assertEqual(_missing_required_categories(rows, ("doctrine", "rule", "facts")), ["facts"])

    def test_reasoning_signature_sanitizer_removes_unexpected_non_latin_tokens(self):
        cleaned = sanitize_reasoning_signature({"issue": "future будущая wife", "items": ["ok будущая"]})

        self.assertEqual(cleaned["issue"], "future wife")
        self.assertEqual(cleaned["items"], ["ok"])

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

    def test_dasha_can_cluster_llm_reasoning_signatures_without_sof_specific_labels(self):
        responses = [
            {
                "id": "r1",
                "model": "model-a",
                "text": "The covenant is enforceable because the text preserves the remedy.",
                "reasoning_signature": {
                    "doctrine": "contract interpretation",
                    "issue": "remedy covenant",
                    "rule_trigger": "express covenant",
                    "outcome": "enforceable",
                    "exception_or_defense": "none",
                    "reasoning_path": "plain meaning preserves remedy",
                    "conclusion": "claim succeeds",
                },
            },
            {
                "id": "r2",
                "model": "model-b",
                "text": "Plain meaning preserves the remedy, so the claim succeeds.",
                "reasoning_signature": {
                    "doctrine": "contract interpretation",
                    "issue": "remedy covenant",
                    "rule_trigger": "express covenant",
                    "outcome": "enforceable",
                    "exception_or_defense": "none",
                    "reasoning_path": "plain meaning preserves remedy",
                    "conclusion": "claim succeeds",
                },
            },
        ]

        clusters = cluster_responses(responses)

        self.assertEqual(clusters["method"], "llm_reasoning_signature")
        self.assertEqual(len(clusters["clusters"]), 1)
        self.assertEqual(clusters["clusters"][0]["member_response_ids"], ["r1", "r2"])

    def test_dasha_merges_paraphrased_llm_signatures_for_same_legal_reasoning_path(self):
        clusters = cluster_responses([
            {
                "id": "r1",
                "model": "gpt-a",
                "text": "The wife wins because the later certificate naming her supplies the writing and the replacement should not defeat her rights.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds marriage provision",
                    "issue": "premarital beneficiary promise",
                    "rule_trigger": "promise made in consideration of marriage plus certificate naming spouse",
                    "outcome": "Wife entitled to the death benefit",
                    "exception_or_defense": "issued certificate is a sufficient writing; replacement certificate defense rejected",
                    "reasoning_path": "marriage promise triggers SOF, certificate satisfies writing, replacement ineffective",
                    "conclusion": "wife prevails",
                },
            },
            {
                "id": "r2",
                "model": "claude-b",
                "text": "The spouse has the stronger claim because the beneficiary certificate memorializes the marriage bargain despite the later replacement.",
                "reasoning_signature": {
                    "doctrine": "SOF marriage-consideration beneficiary dispute",
                    "issue": "spouse beneficiary designation",
                    "rule_trigger": "marriage-conditioned promise and post-marriage benefit certificate",
                    "outcome": "Spouse likely has superior claim",
                    "exception_or_defense": "certificate/memorandum satisfies the writing requirement; association replacement argument is not enough",
                    "reasoning_path": "classify as marriage provision, use certificate as memorandum, reject later replacement",
                    "conclusion": "wife favored",
                },
            },
        ])

        self.assertEqual(clusters["method"], "llm_reasoning_signature")
        self.assertEqual(len(clusters["clusters"]), 1)
        self.assertEqual(clusters["clusters"][0]["size"], 2)

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

    def test_internal_validation_summary_and_table_are_generated_from_run_artifacts(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)

        summary = build_internal_validation_summary(self.output_dir)
        table_path = self.output_dir / "internal_validation_table.tex"
        write_internal_validation_table(summary, table_path)

        self.assertEqual(summary["status"], "internal_validation_passed")
        self.assertTrue(summary["stage_checks"]["frank"]["passed"])
        self.assertTrue(summary["stage_checks"]["dasha"]["passed"])
        self.assertTrue(table_path.exists())

    def test_replicate_client_polls_until_prediction_succeeds(self):
        payloads = [
            {"status": "processing", "urls": {"get": "https://replicate.local/predictions/1"}},
            {"status": "succeeded", "output": ["done"]},
        ]

        with (
            patch.object(provider_client, "_env_value", return_value="token"),
            patch.object(provider_client, "_post_json", return_value=payloads[0]),
            patch.object(provider_client, "_get_json", return_value=payloads[1]) as get_json,
            patch.object(provider_client.time, "sleep"),
        ):
            text = provider_client._replicate_text(
                ROOT,
                "owner/model",
                [{"role": "user", "content": "hello"}],
                temperature=0.1,
                max_tokens=10,
            )

        self.assertEqual(text, "done")
        get_json.assert_called_once()

    def test_internal_stress_suite_validates_500_response_reasoning_clusters(self):
        stress_dir = ROOT / "research/runs/internal_stress_test"
        if stress_dir.exists():
            shutil.rmtree(stress_dir)

        try:
            summary = run_internal_stress(stress_dir, sample_count=500, seed=99)
            table_path = stress_dir / "stress_table.tex"
            write_stress_table(summary, table_path)
            table_exists = table_path.exists()
        finally:
            if stress_dir.exists():
                shutil.rmtree(stress_dir)

        self.assertEqual(summary["status"], "internal_stress_passed")
        self.assertEqual(summary["sample_count"], 500)
        self.assertEqual(summary["observed_clusters"], summary["expected_reasoning_archetypes"])
        self.assertEqual(summary["cluster_purity"], 1.0)
        self.assertEqual(summary["cluster_completeness"], 1.0)
        self.assertEqual(summary["macro_f1"], 1.0)
        self.assertTrue(table_exists)

    def test_internal_stress_responses_are_not_provider_models(self):
        responses = build_stress_responses(sample_count=10, seed=3)

        self.assertEqual({response["provider"] for response in responses}, {"synthetic_fixture"})
        self.assertTrue(all(response["model"].startswith("model_") for response in responses))
        self.assertTrue(all(response.get("expected_reasoning_label") for response in responses))

    def test_artifact_examples_section_shows_responses_and_clusters_without_providers(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)
        section_path = self.output_dir / "artifact_examples.tex"

        write_artifact_examples_section(self.output_dir, section_path)

        text = section_path.read_text(encoding="utf-8")
        self.assertIn("\\section{Artifact Examples}", text)
        self.assertIn("Model Response Examples", text)
        self.assertIn("Dasha Cluster Examples", text)
        self.assertIn("fixture-model-a", text)
        self.assertIn("cluster\\_", text)
        self.assertNotIn("provider", text.lower())
        self.assertNotIn("replicate", text.lower())

    def test_natural_response_audit_uses_unlabeled_model_answers_to_same_question(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)
        summary = build_natural_response_audit(self.output_dir)
        table_path = self.output_dir / "natural_response_audit.tex"
        write_natural_response_audit_table(summary, table_path)

        self.assertEqual(summary["status"], "natural_response_audit_passed")
        self.assertEqual(summary["question_count"], 1)
        self.assertEqual(summary["expected_label_count"], 0)
        self.assertEqual(summary["clustered_response_count"], summary["response_count"])
        self.assertGreaterEqual(summary["cluster_count"], 1)
        self.assertTrue(all("member_models" in cluster for cluster in summary["clusters"]))
        table_text = table_path.read_text(encoding="utf-8")
        self.assertIn("Unlabeled model responses", table_text)
        self.assertNotIn("Expected reasoning archetypes", table_text)


if __name__ == "__main__":
    unittest.main()
