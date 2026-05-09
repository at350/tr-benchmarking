import json
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from research.validation import provider_client
from research.validation.audit import build_no_call_audit
from research.validation.budget import enforce_runtime_judge_budget
from research.validation.claim_ledger import build_claim_ledger
from research.validation.config import load_config
from research.validation.dasha import cluster_responses
from research.validation.frank import build_frank_packet
from research.validation.freeze import build_protocol_freeze
from research.validation.handoff_manifest import build_handoff_manifest
from research.validation.instruction_context import load_agent_instruction_context
from research.validation.internal_stress import build_stress_responses, run_internal_stress, write_stress_table
from research.validation.internal_validation import (
    build_dasha_member_audit,
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
    canonicalize_llm_reasoning_signature_ids,
    model_response_messages,
    sanitize_reasoning_signature,
)
from research.validation.openai_client import _read_env_file
from research.validation.paper_lint import lint_paper
from research.validation.preflight import build_live_preflight
from research.validation.perturbations import (
    build_perturbation_report,
    build_question_tracks,
    cluster_responses_by_track,
)
from research.validation.pipeline import run_pipeline
from research.validation.quality import (
    find_mixed_reasoning_clusters,
    validate_frank_packet,
    validate_rubric_pack,
)
from research.validation.readiness import build_method_readiness_report
from research.validation.readiness import write_review_readiness_table
from research.validation.review_pack import build_review_packet
from research.validation.run_bundle import build_run_bundle_audit
from research.validation.secrets_lint import lint_secrets
from research.validation.source_metadata import read_source_text, source_case_record, validate_source_metadata
from research.validation.metrics import bootstrap_ci, macro_f1, mean_absolute_error, weighted_kappa
from research.validation.utils import write_json


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
        self.assertEqual(manifest["source_case_path"], "research/fixtures/tiny_source_case.txt")
        self.assertEqual(manifest["output_dir"], "research/runs/tiny_offline")
        self.assertEqual(json.loads((self.output_dir / "frank_packet.json").read_text())["source"]["path"], "research/fixtures/tiny_source_case.txt")

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
        self.assertGreaterEqual(config.judge.repeats, 2)
        self.assertGreater(config.judge.temperature, 0.0)

    def test_live_config_can_define_judge_panel(self):
        config = load_config(ROOT / "research/fixtures/live_multi_provider_config.example.json", repo_root=ROOT)

        self.assertGreaterEqual(len(config.judge.judge_models), 2)
        self.assertEqual(config.judge.judge_models[0].model, "gpt-5.2")
        self.assertTrue(all(spec.repeats >= 1 for spec in config.judge.judge_models))
        self.assertTrue(all(spec.temperature > 0.0 for spec in config.judge.judge_models))

    def test_protocol_freeze_records_config_source_instructions_and_judge_panel(self):
        output_path = ROOT / "research/runs/protocol_freeze_test.json"
        if output_path.exists():
            output_path.unlink()

        try:
            freeze = build_protocol_freeze(
                ROOT / "research/fixtures/live_multi_provider_config.example.json",
                repo_root=ROOT,
                output_path=output_path,
            )
            text = output_path.read_text(encoding="utf-8")
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(freeze["schema_version"], "research.protocol_freeze.v1")
        self.assertEqual(freeze["run_id"], "live_multi_provider_calibration")
        self.assertTrue(freeze["protocol_hash"])
        self.assertIn("source", freeze)
        self.assertEqual(freeze["source"]["metadata"]["case_id"], "anglemire_v_policemens_benev_assn_chicago_1939")
        self.assertEqual(freeze["source"]["metadata_path"], "cases/MarriageSoF_Anglemire v Policemens Benev Assn of Chicago.metadata.json")
        self.assertEqual(freeze["source"]["source_format"], "pdf")
        self.assertIn("frank", freeze["instruction_contexts"])
        self.assertIn("context_hash", freeze["instruction_contexts"]["frank"])
        self.assertGreaterEqual(len(freeze["judge"]["judge_models"]), 2)
        self.assertNotIn("OPENAI_API_KEY", text)
        self.assertNotIn("sk-", text)

    def test_real_pdf_source_case_has_metadata_and_extractable_text(self):
        source_path = ROOT / "cases/MarriageSoF_Anglemire v Policemens Benev Assn of Chicago.pdf"

        extracted = read_source_text(source_path)
        record = source_case_record(source_path, ROOT)

        self.assertEqual(validate_source_metadata(source_path), [])
        self.assertIn("Anglemire", extracted)
        self.assertIn("Statute of Frauds", extracted)
        self.assertEqual(record["source_format"], "pdf")
        self.assertEqual(record["metadata"]["citation"], "301 Ill. App. 277, 22 N.E.2d 713 (Ill. App. Ct. 1939)")

    def test_paper_lint_resolves_inputs_figures_bibliography_and_citations(self):
        output_path = ROOT / "research/runs/paper_lint_test.json"
        if output_path.exists():
            output_path.unlink()

        try:
            summary = lint_paper(ROOT / "paper", output_path=output_path)
            written = json.loads(output_path.read_text(encoding="utf-8"))
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(summary["status"], "paper_lint_passed")
        self.assertEqual(summary["errors"], [])
        self.assertEqual(summary["content_findings"], [])
        self.assertEqual(written["status"], "paper_lint_passed")
        self.assertIn("zheng2023judging", summary["citation_keys"])

    def test_paper_lint_flags_stale_or_nonportable_manuscript_content(self):
        temp_dir = ROOT / "research/runs/paper_lint_content_fixture"
        temp_dir.mkdir(parents=True, exist_ok=True)
        local_path = "/" + "Users" + "/example/project/paper"
        (temp_dir / "main.tex").write_text(
            "\n".join([
                "\\documentclass{article}",
                "\\bibliographystyle{plain}",
                "This paper reports six of nine gates.",
                "It accidentally names Replicate in the manuscript.",
                f"It also contains {local_path}.",
                "A typo says Statue of Frauds.",
            ]),
            encoding="utf-8",
        )

        try:
            summary = lint_paper(temp_dir)
        finally:
            shutil.rmtree(temp_dir)

        self.assertEqual(summary["status"], "needs_paper_lint_review")
        kinds = {finding["kind"] for finding in summary["content_findings"]}
        self.assertIn("stale_readiness_count", kinds)
        self.assertIn("provider_routing_name", kinds)
        self.assertIn("absolute_local_path", kinds)
        self.assertIn("statute_of_frauds_typo", kinds)
        self.assertIn("non_ieee_document_class", kinds)
        self.assertIn("non_ieee_bibliography_style", kinds)

    def test_secrets_lint_passes_current_shareable_repo_files(self):
        output_path = ROOT / "research/runs/secrets_lint_test.json"
        if output_path.exists():
            output_path.unlink()

        try:
            summary = lint_secrets(ROOT, output_path=output_path)
            written = json.loads(output_path.read_text(encoding="utf-8"))
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(summary["status"], "secrets_lint_passed", summary["findings"])
        self.assertEqual(written["status"], "secrets_lint_passed")
        self.assertEqual(written["repo_root"], ".")
        self.assertNotIn("/Users/", json.dumps(written))

    def test_secrets_lint_flags_realistic_api_key_patterns(self):
        temp_dir = ROOT / "research/runs/secrets_lint_fixture"
        temp_dir.mkdir(parents=True, exist_ok=True)
        fixture = temp_dir / "bad_config.txt"
        fake_key = "sk-" + "proj-" + "abcdefghijklmnopqrstuvwxyz123456"
        env_name = "OPENAI" + "_API_KEY"
        fixture.write_text(f"{env_name}={fake_key}\n", encoding="utf-8")

        try:
            summary = lint_secrets(temp_dir)
        finally:
            shutil.rmtree(temp_dir)

        self.assertEqual(summary["status"], "needs_secret_review")
        self.assertEqual(summary["findings"][0]["path"], "bad_config.txt")

    def test_secrets_lint_flags_absolute_local_paths_in_shareable_outputs(self):
        temp_dir = ROOT / "research/runs/shareability_lint_fixture"
        temp_dir.mkdir(parents=True, exist_ok=True)
        fixture = temp_dir / "bad_report.md"
        local_path = "/" + "Users" + "/example/project/research/runs/live"
        fixture.write_text(f"Run directory: {local_path}\n", encoding="utf-8")

        try:
            summary = lint_secrets(temp_dir)
        finally:
            shutil.rmtree(temp_dir)

        self.assertEqual(summary["status"], "needs_secret_review")
        self.assertEqual(summary["findings"][0]["kind"], "absolute_local_path")

    def test_review_packet_summarizes_current_machine_readable_evidence(self):
        output_dir = ROOT / "research/runs/review_packet_test"
        output_dir.mkdir(parents=True, exist_ok=True)
        markdown_path = output_dir / "packet.md"
        html_path = output_dir / "packet.html"
        json_path = output_dir / "packet.json"

        try:
            summary = build_review_packet(
                ROOT,
                output_markdown=markdown_path,
                output_html=html_path,
                output_json=json_path,
            )
            markdown = markdown_path.read_text(encoding="utf-8")
            written = json.loads(json_path.read_text(encoding="utf-8"))
        finally:
            shutil.rmtree(output_dir)

        self.assertEqual(summary["schema_version"], "research.internal_review_packet.v1")
        self.assertEqual(summary["status"], "ready_for_internal_review_with_declared_gaps")
        self.assertEqual(summary["bundle_status"], "run_bundle_reviewable")
        self.assertIn("Perturbation validation", summary["evidence_gaps"])
        self.assertTrue(summary["partial_gates_list"])
        self.assertIn("Internal Review Packet", markdown)
        self.assertIn("Run bundle integrity", markdown)
        self.assertEqual(written["status"], summary["status"])

    def test_claim_ledger_maps_paper_claims_to_evidence_and_gaps(self):
        output_dir = ROOT / "research/runs/claim_ledger_test"
        output_dir.mkdir(parents=True, exist_ok=True)
        markdown_path = output_dir / "ledger.md"
        html_path = output_dir / "ledger.html"
        json_path = output_dir / "ledger.json"

        try:
            ledger = build_claim_ledger(
                ROOT,
                output_json=json_path,
                output_markdown=markdown_path,
                output_html=html_path,
            )
            markdown = markdown_path.read_text(encoding="utf-8")
            written = json.loads(json_path.read_text(encoding="utf-8"))
        finally:
            shutil.rmtree(output_dir)

        self.assertEqual(ledger["schema_version"], "research.claim_ledger.v1")
        self.assertEqual(ledger["status"], "claim_ledger_ready")
        statuses = {claim["id"]: claim["status"] for claim in ledger["claims"]}
        self.assertEqual(statuses["C1"], "supported")
        self.assertEqual(statuses["C6"], "supported")
        self.assertIn(statuses["C7"], {"partial", "supported"})
        self.assertEqual(statuses["C8"], "supported")
        self.assertEqual(statuses["C12"], "supported")
        self.assertIn("real reported court case PDF", markdown)
        self.assertIn("Claim Ledger", markdown)
        self.assertEqual(written["status_counts"], ledger["status_counts"])

    def test_handoff_manifest_hashes_review_artifacts(self):
        output_path = ROOT / "research/runs/handoff_manifest_test.json"
        if output_path.exists():
            output_path.unlink()

        try:
            summary = build_handoff_manifest(ROOT, output_path=output_path)
            written = json.loads(output_path.read_text(encoding="utf-8"))
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(summary["schema_version"], "research.handoff_manifest.v1")
        self.assertEqual(summary["status"], "handoff_manifest_ready")
        paths = {item["path"] for item in summary["artifacts"]}
        self.assertIn("paper/main.tex", paths)
        self.assertIn("to_human/claim_ledger.json", paths)
        self.assertNotIn("to_human/handoff_manifest.json", paths)
        self.assertNotIn("to_human/no_call_audit.json", paths)
        self.assertTrue(summary["manifest_hash"])
        self.assertEqual(written["manifest_hash"], summary["manifest_hash"])

    def test_no_call_audit_regenerates_handoff_artifacts_without_live_calls(self):
        output_dir = ROOT / "research/runs/no_call_audit_test"
        output_dir.mkdir(parents=True, exist_ok=True)
        json_path = output_dir / "audit.json"
        markdown_path = output_dir / "audit.md"
        html_path = output_dir / "audit.html"

        try:
            summary = build_no_call_audit(
                ROOT,
                output_json=json_path,
                output_markdown=markdown_path,
                output_html=html_path,
            )
            written = json.loads(json_path.read_text(encoding="utf-8"))
            markdown = markdown_path.read_text(encoding="utf-8")
        finally:
            shutil.rmtree(output_dir)

        self.assertEqual(summary["schema_version"], "research.no_call_audit.v1")
        self.assertEqual(summary["status"], "no_call_audit_passed_with_declared_gaps")
        self.assertFalse(summary["live_calls_made"])
        self.assertEqual(summary["paper_lint"]["status"], "paper_lint_passed")
        self.assertEqual(summary["secrets_lint"]["status"], "secrets_lint_passed")
        self.assertEqual(summary["run_bundle"]["status"], "run_bundle_reviewable")
        self.assertEqual(summary["handoff_manifest"]["status"], "handoff_manifest_ready")
        self.assertIn("readiness gap: Perturbation validation", summary["warnings_and_gaps"])
        self.assertIn("No-Call Audit", markdown)
        self.assertIn("Run bundle", markdown)
        self.assertIn("Handoff manifest", markdown)
        self.assertEqual(written["status"], summary["status"])

    def test_run_bundle_audit_verifies_hashes_and_cross_artifacts(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)
        output_path = self.output_dir / "bundle_audit.json"

        summary = build_run_bundle_audit(self.output_dir, output_json=output_path)
        written = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(summary["schema_version"], "research.run_bundle_audit.v1")
        self.assertEqual(summary["status"], "run_bundle_reviewable")
        self.assertEqual(summary["run_dir"], "research/runs/tiny_offline")
        self.assertEqual(summary["counts"]["responses"], 6)
        self.assertEqual(summary["blocking_errors"], [])
        self.assertTrue(any(check["message"] == "frank_packet.json matches manifest hash" for check in summary["checks"]))
        self.assertTrue(any(check["message"] == "Dasha member ids are present in responses.json" for check in summary["checks"]))
        self.assertEqual(written["status"], summary["status"])
        self.assertNotIn("/Users/", json.dumps(written))

    def test_live_preflight_checks_readiness_without_model_calls(self):
        output_path = ROOT / "research/runs/live_preflight_test.json"
        if output_path.exists():
            output_path.unlink()

        try:
            summary = build_live_preflight(
                ROOT / "research/fixtures/live_multi_provider_config.example.json",
                repo_root=ROOT,
                output_path=output_path,
            )
            written = json.loads(output_path.read_text(encoding="utf-8"))
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(summary["status"], "live_preflight_passed")
        self.assertEqual(summary["total_response_samples"], 10)
        self.assertEqual(summary["call_plan"]["planned_question_tracks"], 3)
        self.assertEqual(summary["call_plan"]["planned_response_calls"], 30)
        self.assertEqual(summary["call_plan"]["planned_dasha_signature_calls"], 30)
        self.assertEqual(summary["call_plan"]["judge_invocations_per_cluster"], 3)
        self.assertEqual(summary["call_plan"]["planned_min_judge_calls"], 9)
        self.assertEqual(summary["call_plan"]["planned_total_llm_calls_excluding_frank_karthic"], 69)
        self.assertEqual(summary["budget"]["max_total_llm_calls_excluding_frank_karthic"], 80)
        self.assertEqual(summary["source_case"]["case_id"], "anglemire_v_policemens_benev_assn_chicago_1939")
        self.assertEqual(summary["source_case"]["jurisdiction"], "Illinois")
        self.assertTrue(summary["protocol_hash"])
        self.assertGreaterEqual(summary["response_model_count"], 5)
        self.assertEqual(summary["blocking_errors"], [])
        self.assertEqual(written["status"], "live_preflight_passed")
        self.assertTrue(any(check["message"] == "Protocol freeze manifest can be built." for check in summary["checks"]))
        self.assertTrue(any(check["message"] == "Source case metadata sidecar is complete." for check in summary["checks"]))
        self.assertTrue(any(check["message"] == "Perturbation config requires invariant checks." for check in summary["checks"]))
        self.assertTrue(any(check["message"] == "Perturbation config requires material checks." for check in summary["checks"]))
        self.assertTrue(any(check["message"] == "Planned total LLM calls excluding Frank/Karthic are within configured budget." for check in summary["checks"]))
        self.assertFalse(any("not enabled" in warning["message"] for warning in summary["warnings"]))

    def test_live_preflight_accepts_google_api_key_alias_for_gemini(self):
        with (
            patch.dict("os.environ", {"GOOGLE_API_KEY": "google-test-key"}, clear=True),
            patch("research.validation.preflight._read_env_file", return_value={}),
        ):
            summary = build_live_preflight(ROOT / "research/fixtures/live_multi_provider_config.example.json", repo_root=ROOT)

        self.assertTrue(summary["credential_report"]["gemini"]["available"])
        self.assertIn("GOOGLE_API_KEY", summary["credential_report"]["gemini"]["env"])
        self.assertFalse(any("gemini" in warning["message"].lower() for warning in summary["warnings"]))

    def test_live_preflight_blocks_non_live_fixture_config(self):
        summary = build_live_preflight(ROOT / "research/fixtures/tiny_config.json", repo_root=ROOT)

        self.assertEqual(summary["status"], "needs_live_preflight_review")
        self.assertTrue(any("live-capable" in error["message"] for error in summary["blocking_errors"]))

    def test_live_preflight_blocks_configs_that_exceed_call_budget(self):
        source = json.loads((ROOT / "research/fixtures/live_multi_provider_config.example.json").read_text(encoding="utf-8"))
        source["budget"] = {
            "max_response_calls": 29,
            "max_judge_calls": 8,
            "max_total_llm_calls_excluding_frank_karthic": 68,
        }
        config_path = ROOT / "research/runs/live_budget_limit_test.json"
        config_path.write_text(json.dumps(source, indent=2), encoding="utf-8")

        try:
            summary = build_live_preflight(config_path, repo_root=ROOT)
        finally:
            config_path.unlink(missing_ok=True)

        self.assertEqual(summary["status"], "needs_live_preflight_review")
        messages = [error["message"] for error in summary["blocking_errors"]]
        self.assertIn("Planned response calls are within configured budget.", messages)
        self.assertIn("Planned minimum judge calls are within configured budget.", messages)
        self.assertIn("Planned total LLM calls excluding Frank/Karthic are within configured budget.", messages)

    def test_live_pipeline_enforces_budget_before_any_llm_call(self):
        source = json.loads((ROOT / "research/fixtures/live_multi_provider_config.example.json").read_text(encoding="utf-8"))
        source["run_id"] = "live_budget_runtime_test"
        source["output_dir"] = "research/runs/live_budget_runtime_test"
        source["budget"] = {
            "max_response_calls": 29,
            "max_judge_calls": 12,
            "max_total_llm_calls_excluding_frank_karthic": 80,
        }
        config_path = ROOT / "research/runs/live_budget_runtime_test.json"
        output_dir = ROOT / "research/runs/live_budget_runtime_test"
        config_path.write_text(json.dumps(source, indent=2), encoding="utf-8")
        if output_dir.exists():
            shutil.rmtree(output_dir)

        try:
            config = load_config(config_path, repo_root=ROOT)
            with patch("research.validation.pipeline.build_frank_packet_with_llm") as frank_agent:
                with self.assertRaisesRegex(RuntimeError, "exceeds configured budget"):
                    run_pipeline(config, repo_root=ROOT)
            frank_agent.assert_not_called()
        finally:
            config_path.unlink(missing_ok=True)
            if output_dir.exists():
                shutil.rmtree(output_dir)

    def test_method_readiness_report_distinguishes_met_gates_from_evidence_gaps(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)
        output_path = ROOT / "research/runs/method_readiness_test.json"
        markdown_path = ROOT / "research/runs/method_readiness_test.md"
        table_path = ROOT / "research/runs/method_readiness_review_table.tex"
        if output_path.exists():
            output_path.unlink()
        if markdown_path.exists():
            markdown_path.unlink()
        if table_path.exists():
            table_path.unlink()

        try:
            report = build_method_readiness_report(
                self.output_dir,
                repo_root=ROOT,
                stress_dir=ROOT / "research/runs/internal_stress",
                output_path=output_path,
                markdown_path=markdown_path,
            )
            written = json.loads(output_path.read_text(encoding="utf-8"))
            markdown = markdown_path.read_text(encoding="utf-8")
            write_review_readiness_table(report, table_path)
            table = table_path.read_text(encoding="utf-8")
        finally:
            output_path.unlink(missing_ok=True)
            markdown_path.unlink(missing_ok=True)
            table_path.unlink(missing_ok=True)

        self.assertEqual(report["schema_version"], "research.method_readiness.v1")
        self.assertEqual(written["run_id"], "tiny_offline")
        self.assertEqual(report["total_gates"], 10)
        self.assertTrue(any(gate["gate"] == "Run bundle integrity" and gate["status"] == "met" for gate in report["gates"]))
        self.assertTrue(any(gate["gate"] == "Perturbation validation" and gate["status"] == "evidence_gap" for gate in report["gates"]))
        self.assertTrue(any(gate["gate"] == "Controlled scale regression" and gate["status"] == "met" for gate in report["gates"]))
        self.assertIn("Method Readiness Report", markdown)
        self.assertIn("Run bundle integrity", table)
        self.assertIn("Publication readiness", table)
        self.assertNotIn("6 of 9", table)

    def test_gemini_provider_accepts_google_api_key_alias(self):
        captured = {}

        def fake_post_json(url, headers, body):
            captured["url"] = url
            return {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}

        with (
            patch.dict("os.environ", {"GOOGLE_API_KEY": "google-test-key"}, clear=True),
            patch("research.validation.provider_client._read_env_file", return_value={}),
            patch.object(provider_client, "_post_json", side_effect=fake_post_json),
        ):
            text = provider_client._gemini_text(ROOT, "gemini-test", [{"role": "user", "content": "hello"}], 0.1, 10)

        self.assertEqual(text, "ok")
        self.assertIn("google-test-key", captured["url"])

    def test_multi_provider_config_defines_llm_agents_and_model_roster(self):
        config = load_config(ROOT / "research/fixtures/live_multi_provider_config.example.json", repo_root=ROOT)

        self.assertEqual(config.mode, "live_multi_provider")
        self.assertEqual(config.agents["frank"].mode, "llm")
        self.assertEqual(config.agents["karthic"].mode, "llm")
        self.assertEqual(config.clustering.method, "llm_reasoning_signature")
        self.assertEqual({spec.provider for spec in config.response_models}, {"openai", "anthropic", "gemini", "replicate"})
        self.assertGreaterEqual(sum(spec.samples for spec in config.response_models), 10)
        self.assertTrue(all(spec.temperature > 0.0 for spec in config.response_models))

    def test_preflight_counts_replicate_routed_models_by_actual_model_family(self):
        config_path = ROOT / "research/runs/replicate_family_preflight.json"
        output_path = ROOT / "research/runs/replicate_family_preflight_summary.json"
        payload = json.loads((ROOT / "research/fixtures/live_dasha_available_providers_config.json").read_text())
        payload["run_id"] = "replicate_family_preflight"
        payload["output_dir"] = "research/runs/replicate_family_preflight"
        payload["response_models"] = [
            {"provider": "replicate", "model": "google/gemini-3-flash", "samples": 1, "temperature": 0.55},
            {"provider": "replicate", "model": "anthropic/claude-4.5-sonnet", "samples": 1, "temperature": 0.55},
            {"provider": "replicate", "model": "meta/meta-llama-3-70b-instruct", "samples": 1, "temperature": 0.55},
            {"provider": "replicate", "model": "deepseek-ai/deepseek-r1", "samples": 1, "temperature": 0.55},
            {"provider": "replicate", "model": "openai/gpt-4.1-mini", "samples": 1, "temperature": 0.55},
        ]
        payload["budget"] = {
            "max_response_calls": 20,
            "max_judge_calls": 20,
            "max_total_llm_calls_excluding_frank_karthic": 50,
        }
        try:
            write_json(config_path, payload)
            summary = build_live_preflight(config_path, repo_root=ROOT, output_path=output_path)
        finally:
            if config_path.exists():
                config_path.unlink()
            if output_path.exists():
                output_path.unlink()

        self.assertEqual(summary["response_providers"], ["replicate"])
        self.assertGreaterEqual(len(summary["response_model_families"]), 5)
        self.assertIn("google", summary["response_model_families"])

    def test_replicate_roster_config_uses_provider_as_route_not_model_family(self):
        summary = build_live_preflight(
            ROOT / "research/fixtures/live_replicate_roster_config.example.json",
            repo_root=ROOT,
        )

        self.assertEqual(summary["status"], "live_preflight_passed")
        self.assertIn("replicate", summary["response_providers"])
        self.assertGreaterEqual(len(summary["response_model_families"]), 5)
        self.assertIn("google", summary["response_model_families"])
        self.assertIn("deepseek-ai", summary["response_model_families"])

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
        self.assertGreaterEqual(config.clustering.min_observed_clusters, 2)

    def test_perturbation_config_loads_question_variant_policy(self):
        config = load_config(ROOT / "research/fixtures/tiny_perturbation_config.json", repo_root=ROOT)

        self.assertTrue(config.perturbations.enabled)
        self.assertEqual(config.perturbations.max_variations, 2)
        self.assertTrue(config.perturbations.require_invariant)
        self.assertTrue(config.perturbations.require_material)

    def test_frank_variations_become_executable_question_tracks(self):
        packet = {
            "id": "frank_track_test",
            "neutral_question": "Original legal question?",
            "variations": [
                {
                    "id": "surface_name_swap",
                    "perturbation_type": "invariant",
                    "changed_fact": "Change Acme to BetaCo.",
                    "question": "Same legal question with BetaCo?",
                    "expected_behavior": "answer_invariant",
                },
                {
                    "id": "one_year_boundary",
                    "perturbation_type": "material",
                    "changed_fact": "Change nine months to thirteen months.",
                    "question": "Materially changed duration question?",
                    "expected_behavior": "answer_should_change",
                },
            ],
        }

        tracks = build_question_tracks(packet, max_variations=2)

        self.assertEqual([track["track_id"] for track in tracks], ["original", "surface_name_swap", "one_year_boundary"])
        self.assertEqual([track["question"] for track in tracks], [
            "Original legal question?",
            "Same legal question with BetaCo?",
            "Materially changed duration question?",
        ])
        self.assertEqual(tracks[1]["perturbation_type"], "invariant")
        self.assertEqual(tracks[2]["perturbation_type"], "material")

    def test_frank_quality_gate_rejects_abstract_doctrinal_questions(self):
        from research.validation.quality import question_quality_errors

        bad = (
            "If the only evidence is the premarital oral promise conditioned on marriage and no later "
            "certificate ever named the spouse, can the spouse enforce the promise?"
        )
        good = (
            "In Illinois, a member of a fraternal benefit association told his fiancee before their wedding "
            "that if she married him, he would change his benefit certificate so she would be the beneficiary. "
            "She agreed, they married, but he never obtained a new certificate, never signed a designation "
            "naming her, and later died while relatives claimed the death benefit under the existing association "
            "records. The spouse argues the oral premarital promise should be enforced, while the relatives argue "
            "the marriage provision of the Statute of Frauds bars the claim. Can the spouse enforce the promise "
            "to obtain the death benefit?"
        )

        self.assertTrue(question_quality_errors(bad, "bad"))
        self.assertEqual(question_quality_errors(good, "good"), [])

    def test_llm_frank_repairs_scenario_poor_variation_questions(self):
        config = load_config(ROOT / "research/fixtures/live_replicate_roster_config.example.json", repo_root=ROOT)
        bad_packet = {
            "doctrine_family": "Statute of Frauds",
            "detected_doctrine_gates": [{"id": "G1", "label": "Marriage provision", "rule": "Marriage promises need writing.", "source_evidence": "source"}],
            "source_extraction": {"jurisdiction": "Illinois"},
            "neutral_question": "Can the wife enforce the promise?",
            "gold_answer": "Jurisdiction assumption: Illinois.",
            "variations": [{
                "id": "A1",
                "lane": "A",
                "changed_fact": "No certificate.",
                "question": "If no certificate named the spouse, can she enforce the promise?",
                "expected_behavior": "bar_more_likely",
            }],
            "controller_card": {"primary_gate_id": "G1"},
        }
        repaired_packet = {
            "neutral_question": (
                "In Illinois, a member of a fraternal benefit association told his fiancee before their wedding "
                "that if she married him, he would change his benefit certificate so she would be the beneficiary. "
                "She agreed, they married, he obtained a certificate naming her, and she kept possession of it. "
                "After the marriage deteriorated, he obtained a replacement certificate naming relatives, and both "
                "sides claimed the death benefit after he died. Who has the better claim to the death benefit?"
            ),
            "variations": [{
                **bad_packet["variations"][0],
                "question": (
                    "In Illinois, a member of a fraternal benefit association told his fiancee before their wedding "
                    "that if she married him, he would change his benefit certificate so she would be the beneficiary. "
                    "She agreed and they married, but he never obtained a certificate naming her and never signed a "
                    "beneficiary designation. After he died, the spouse claimed the death benefit based only on the "
                    "oral premarital promise, while relatives argued the association records controlled. Can the spouse "
                    "enforce the promise under the marriage provision of the Statute of Frauds?"
                ),
            }],
        }

        with patch("research.validation.llm_agents.generate_json", side_effect=[bad_packet, repaired_packet]):
            packet = build_frank_packet_with_llm(ROOT, config)

        material_variation = next(item for item in packet["variations"] if item["perturbation_type"] == "material")
        invariant_variation = next(item for item in packet["variations"] if item["perturbation_type"] == "invariant")
        self.assertIn("fraternal benefit association", material_variation["question"])
        self.assertGreater(len(material_variation["question"].split()), 65)
        self.assertIn("Alex", invariant_variation["question"])
        self.assertEqual(packet["source_extraction"], {"jurisdiction": "Illinois"})
        self.assertEqual(packet["gold_answer"], "Jurisdiction assumption: Illinois.")

    def test_runtime_budget_blocks_judge_cluster_explosion_after_dasha(self):
        config = load_config(ROOT / "research/fixtures/live_replicate_roster_config.example.json", repo_root=ROOT)
        clusters = {"clusters": [{"id": f"cluster_{index}"} for index in range(40)]}
        call_plan = {
            "planned_response_calls": 60,
            "planned_dasha_signature_calls": 60,
            "planned_min_judge_calls": 6,
            "planned_total_llm_calls_excluding_frank_karthic": 126,
        }

        with self.assertRaisesRegex(RuntimeError, "Actual judge calls exceed configured budget"):
            enforce_runtime_judge_budget(config, clusters, call_plan)

    def test_question_tracks_synthesize_invariant_when_frank_only_emits_material_variations(self):
        packet = {
            "id": "material_only_track_test",
            "neutral_question": "Who has the better legal claim?",
            "variations": [
                {
                    "id": "no_certificate",
                    "perturbation_type": "material",
                    "changed_fact": "Remove the signed certificate.",
                    "question": "Who has the better claim if there is no signed certificate?",
                    "expected_behavior": "answer_should_change",
                },
                {
                    "id": "association_rules",
                    "perturbation_type": "material",
                    "changed_fact": "Add an association bylaw that makes the replacement certificate final.",
                    "question": "Who has the better claim under the replacement-certificate bylaw?",
                    "expected_behavior": "answer_should_change",
                },
            ],
        }

        tracks = build_question_tracks(packet, max_variations=2)

        self.assertEqual([track["track_id"] for track in tracks], ["original", "surface_invariant", "no_certificate"])
        self.assertEqual(tracks[1]["perturbation_type"], "invariant")
        self.assertIn("renamed Alex, Jordan", tracks[1]["question"])
        self.assertEqual(tracks[2]["perturbation_type"], "material")

    def test_base_question_track_excludes_variations_when_disabled(self):
        packet = build_frank_packet(ROOT / "research/fixtures/tiny_source_case.txt", "base_track_only")
        tracks = build_question_tracks(packet, max_variations=0)

        self.assertEqual(1, len(tracks))
        self.assertEqual("original", tracks[0]["track_id"])

    def test_track_aware_response_generation_sends_each_perturbed_question(self):
        config = load_config(ROOT / "research/fixtures/tiny_perturbation_config.json", repo_root=ROOT)
        packet = build_frank_packet(ROOT / "research/fixtures/tiny_source_case.txt", "track_generation")
        questions_seen = []

        def fake_text(**kwargs):
            questions_seen.append(kwargs["messages"][-1]["content"])
            return "The answer follows from the legal question."

        with patch("research.validation.llm_agents.generate_text", side_effect=fake_text):
            from research.validation.llm_agents import generate_model_responses

            responses = generate_model_responses(ROOT, config, packet)

        self.assertGreater(len({response["question_id"] for response in responses}), 1)
        self.assertEqual(len(questions_seen), sum(spec.samples for spec in config.response_models) * 3)
        self.assertTrue(any("Alpha Mutual" in question or "Beta Mutual" in question for question in questions_seen))
        self.assertTrue(all(response.get("track_id") for response in responses))
        self.assertTrue(all(response.get("perturbation_type") for response in responses))

    def test_dasha_signature_extraction_checkpoints_after_each_response(self):
        config = load_config(self.config_path, repo_root=ROOT)
        packet = build_frank_packet(ROOT / "research/fixtures/tiny_source_case.txt", "dasha_checkpoint")
        checkpoint_path = self.output_dir / "responses.json"
        responses = [
            {"id": "r1", "model": "m1", "text": "The wife wins because the certificate supports the promise."},
            {"id": "r2", "model": "m2", "text": "The later beneficiaries win because the replacement controls."},
        ]
        signatures = [
            {
                "doctrine": "Statute of Frauds",
                "issue": "beneficiary dispute",
                "rule_trigger": "marriage certificate",
                "outcome": "wife prevails",
                "exception_or_defense": "certificate",
                "reasoning_path": "certificate satisfies writing",
                "conclusion": "wife wins",
            },
            {
                "doctrine": "Statute of Frauds",
                "issue": "beneficiary dispute",
                "rule_trigger": "association replacement",
                "outcome": "later beneficiaries prevail",
                "exception_or_defense": "replacement",
                "reasoning_path": "replacement controls",
                "conclusion": "later beneficiaries win",
            },
        ]

        with patch("research.validation.llm_agents.generate_json", side_effect=signatures):
            from research.validation.llm_agents import add_llm_reasoning_signatures

            signed = add_llm_reasoning_signatures(ROOT, config, packet, responses, checkpoint_path=checkpoint_path)

        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        self.assertEqual(len(signed), 2)
        self.assertEqual(sum("reasoning_signature" in response for response in checkpoint), 2)
        self.assertEqual(checkpoint[0]["reasoning_signature"]["reasoning_path"], "certificate satisfies writing")

    def test_dasha_clusters_are_kept_separate_by_question_track(self):
        responses = [
            {"id": "base_1", "model": "m1", "track_id": "original", "question_id": "q:original", "text": "The wife wins because the marriage promise and certificate establish her rights."},
            {"id": "base_2", "model": "m2", "track_id": "original", "question_id": "q:original", "text": "The spouse has the stronger claim because the certificate supports the promise."},
            {"id": "var_1", "model": "m1", "track_id": "no_writing", "question_id": "q:no_writing", "text": "Without any writing or certificate, the marriage provision bars enforcement."},
            {"id": "var_2", "model": "m2", "track_id": "no_writing", "question_id": "q:no_writing", "text": "No writing means the Statute of Frauds likely bars the wife's claim."},
        ]

        clusters = cluster_responses_by_track(responses, primary_gate_id="marriage")

        track_ids = {cluster["track_id"] for cluster in clusters["clusters"]}
        self.assertEqual(track_ids, {"original", "no_writing"})
        for cluster in clusters["clusters"]:
            self.assertEqual({member["track_id"] for member in cluster["members"]}, {cluster["track_id"]})

    def test_perturbation_report_checks_invariant_and_material_behavior(self):
        tracks = [
            {"track_id": "original", "perturbation_type": "base", "expected_behavior": "baseline"},
            {"track_id": "surface", "perturbation_type": "invariant", "expected_behavior": "answer_invariant"},
            {"track_id": "duration", "perturbation_type": "material", "expected_behavior": "answer_should_change"},
        ]
        responses = [
            {"id": "r1", "track_id": "original", "model": "m", "text": "wife wins"},
            {"id": "r2", "track_id": "surface", "model": "m", "text": "wife wins"},
            {"id": "r3", "track_id": "duration", "model": "m", "text": "barred"},
        ]
        clusters = {
            "clusters": [
                {"id": "original__cluster_1", "track_id": "original", "member_response_ids": ["r1"], "legal_signal": {"outcome": "wife wins", "reasoning_path": "certificate satisfies writing"}},
                {"id": "surface__cluster_1", "track_id": "surface", "member_response_ids": ["r2"], "legal_signal": {"outcome": "wife wins", "reasoning_path": "certificate satisfies writing"}},
                {"id": "duration__cluster_1", "track_id": "duration", "member_response_ids": ["r3"], "legal_signal": {"outcome": "barred", "reasoning_path": "one year writing required"}},
            ]
        }

        report = build_perturbation_report(tracks, responses, clusters)

        self.assertEqual(report["status"], "perturbation_validation_passed")
        checks = {check["track_id"]: check for check in report["checks"]}
        self.assertTrue(checks["surface"]["passed"])
        self.assertEqual(checks["surface"]["comparison"], "invariant_preserved")
        self.assertTrue(checks["duration"]["passed"])
        self.assertEqual(checks["duration"]["comparison"], "material_difference_observed")

    def test_perturbation_report_uses_normalized_answer_bucket_for_invariant_edits(self):
        tracks = [
            {"track_id": "original", "perturbation_type": "base", "expected_behavior": "baseline"},
            {"track_id": "surface", "perturbation_type": "invariant", "expected_behavior": "answer_invariant"},
            {"track_id": "writing", "perturbation_type": "material", "expected_behavior": "answer_should_change"},
        ]
        responses = [
            {"id": "r1", "track_id": "original", "model": "m", "text": "later beneficiaries win"},
            {"id": "r2", "track_id": "surface", "model": "m", "text": "later named relatives prevail"},
            {"id": "r3", "track_id": "writing", "model": "m", "text": "wife wins"},
        ]
        clusters = {
            "clusters": [
                {
                    "id": "original__cluster_1",
                    "track_id": "original",
                    "member_response_ids": ["r1"],
                    "normalized_cluster_key": ["statute_of_frauds", "g1", "later_beneficiaries_control", "writing_or_certificate", "certificate_satisfies"],
                    "legal_signal": {"outcome": "Later beneficiaries prevail", "reasoning_path": "certificate and replacement rules control"},
                },
                {
                    "id": "surface__cluster_1",
                    "track_id": "surface",
                    "member_response_ids": ["r2"],
                    "normalized_cluster_key": ["statute_of_frauds", "g3", "later_beneficiaries_control", "writing_or_certificate", "different paraphrased path"],
                    "legal_signal": {"outcome": "Relatives have the better claim", "reasoning_path": "fraternal rules and no vested spouse right"},
                },
                {
                    "id": "writing__cluster_1",
                    "track_id": "writing",
                    "member_response_ids": ["r3"],
                    "normalized_cluster_key": ["statute_of_frauds", "g1", "wife_certificate_controls", "writing_or_certificate", "certificate_satisfies"],
                    "legal_signal": {"outcome": "Wife prevails", "reasoning_path": "signed writing creates enforceable right"},
                },
            ]
        }

        report = build_perturbation_report(tracks, responses, clusters)

        self.assertEqual(report["status"], "perturbation_validation_passed")
        checks = {check["track_id"]: check for check in report["checks"]}
        self.assertEqual(checks["surface"]["comparison"], "invariant_preserved")
        self.assertEqual(checks["writing"]["comparison"], "material_difference_observed")

    def test_pipeline_exports_perturbation_report_for_variant_config(self):
        config_path = ROOT / "research/fixtures/tiny_perturbation_config.json"
        output_dir = ROOT / "research/runs/tiny_perturbation"
        if output_dir.exists():
            shutil.rmtree(output_dir)

        try:
            config = load_config(config_path, repo_root=ROOT)
            result = run_pipeline(config, repo_root=ROOT)
            report = json.loads((output_dir / "perturbation_report.json").read_text())
            manifest = json.loads((output_dir / "manifest.json").read_text())
        finally:
            if output_dir.exists():
                shutil.rmtree(output_dir)

        self.assertEqual(result.status, "internal_validation_ready", result.quality_errors)
        self.assertEqual(report["status"], "perturbation_validation_passed")
        self.assertIn("perturbation_report", manifest["artifact_hashes"])
        self.assertGreater(len(manifest["question_tracks"]), 1)

    def test_live_response_prompt_is_natural_question_only_by_default(self):
        config = load_config(ROOT / "research/fixtures/live_multi_provider_config.example.json", repo_root=ROOT)
        frank_packet = {
            "neutral_question": "Who has the better claim to the benefit, and why?",
            "source": {"excerpt": "source should not be separately injected into natural response prompts"},
        }

        messages = model_response_messages(config, frank_packet)

        self.assertEqual(messages, [{"role": "user", "content": frank_packet["neutral_question"]}])
        rendered = json.dumps(messages)
        self.assertNotIn("Jurisdiction assumption", rendered)
        self.assertNotIn("Bottom-line outcome", rendered)
        self.assertNotIn("source should not be separately injected", rendered)

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

    def test_frank_uses_real_anglemire_pdf_without_spurious_sof_gates(self):
        packet = build_frank_packet(
            ROOT / "cases/MarriageSoF_Anglemire v Policemens Benev Assn of Chicago.pdf",
            "anglemire_pdf_regression",
            repo_root=ROOT,
        )

        gates = {gate["id"] for gate in packet["statute_of_frauds"]["gates"]}
        self.assertEqual(gates, {"marriage"})
        self.assertEqual(validate_frank_packet(packet), [])
        self.assertEqual(packet["source"]["metadata"]["case_id"], "anglemire_v_policemens_benev_assn_chicago_1939")

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

    def test_offline_contract_interpretation_fixture_runs_without_sof_assumption(self):
        config_path = ROOT / "research/fixtures/tiny_contract_config.json"
        output_dir = ROOT / "research/runs/tiny_contract_transfer"
        if output_dir.exists():
            shutil.rmtree(output_dir)

        try:
            config = load_config(config_path, repo_root=ROOT)
            result = run_pipeline(config, repo_root=ROOT)
            frank = json.loads((output_dir / "frank_packet.json").read_text())
            rubric = json.loads((output_dir / "karthic_rubric.json").read_text())
            clusters = json.loads((output_dir / "dasha_clusters.json").read_text())
            summary = build_internal_validation_summary(output_dir)
        finally:
            if output_dir.exists():
                shutil.rmtree(output_dir)

        self.assertEqual(result.status, "internal_validation_ready")
        self.assertEqual(frank["doctrine_family"], "Contract interpretation")
        self.assertNotIn("statute_of_frauds", frank)
        self.assertEqual(frank["doctrine_profile"]["primary_gate_id"], "plain_meaning")
        self.assertIn("Contract interpretation", rubric["rows"][1]["criterion"])
        self.assertGreaterEqual(len(clusters["clusters"]), 3)
        self.assertEqual(summary["status"], "internal_validation_passed")
        self.assertEqual(summary["dasha_member_audit"]["status"], "member_audit_passed")

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
        self.assertIn("normalized_cluster_key", clusters["clusters"][0])
        self.assertTrue(all("_dasha_normalized_signature" in member for member in clusters["clusters"][0]["members"]))

    def test_dasha_uses_frank_source_gate_aliases_for_non_sof_signature_buckets(self):
        frank_packet = {
            "doctrine_gates": [
                {
                    "id": "plain_meaning",
                    "label": "Plain meaning",
                    "rule": "Apply the ordinary meaning of unambiguous contract text.",
                    "source_evidence": "The covenant text expressly preserves the remedy.",
                },
                {
                    "id": "contra_proferentem",
                    "label": "Contra proferentem",
                    "rule": "Construe ambiguity against the drafter.",
                    "source_evidence": "The contract was drafted by the seller.",
                },
            ]
        }
        responses = [
            {
                "id": "r1",
                "model": "model-a",
                "text": "The express covenant preserves the remedy.",
                "reasoning_signature": {
                    "doctrine": "contract interpretation",
                    "issue": "remedy covenant",
                    "rule_trigger": "ordinary meaning of the covenant text",
                    "outcome": "enforceable",
                    "exception_or_defense": "none",
                    "reasoning_path": "plain text preserves the remedy",
                    "conclusion": "claim succeeds",
                },
            },
            {
                "id": "r2",
                "model": "model-b",
                "text": "The text is unambiguous, so the remedy remains available.",
                "reasoning_signature": {
                    "doctrine": "contract interpretation",
                    "issue": "remedy covenant",
                    "rule_trigger": "unambiguous contract text",
                    "outcome": "claim succeeds",
                    "exception_or_defense": "none",
                    "reasoning_path": "plain meaning controls",
                    "conclusion": "enforceable",
                },
            },
            {
                "id": "r3",
                "model": "model-c",
                "text": "Any ambiguity should be construed against the seller as drafter.",
                "reasoning_signature": {
                    "doctrine": "contract interpretation",
                    "issue": "remedy covenant",
                    "rule_trigger": "ambiguity against drafter",
                    "outcome": "claim succeeds",
                    "exception_or_defense": "none",
                    "reasoning_path": "contra proferentem resolves the ambiguity",
                    "conclusion": "enforceable",
                },
            },
        ]

        clusters = cluster_responses(responses, frank_packet=frank_packet)

        self.assertEqual(clusters["normalization"]["source_gate_ids"], ["contra_proferentem", "plain_meaning"])
        gate_buckets = {cluster["legal_signal"]["rule_trigger"] for cluster in clusters["clusters"]}
        self.assertEqual(gate_buckets, {"ordinary meaning of the covenant text", "ambiguity against drafter"})
        clustered_ids = [set(cluster["member_response_ids"]) for cluster in clusters["clusters"]]
        self.assertIn({"r1", "r2"}, clustered_ids)
        self.assertIn({"r3"}, clustered_ids)

    def test_dasha_reasoning_path_bucket_prevents_over_merging_same_outcome(self):
        responses = [
            {
                "id": "writing_path",
                "model": "m1",
                "text": "The certificate is a sufficient writing.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds marriage provision",
                    "issue": "beneficiary rights",
                    "rule_trigger": "promise in consideration of marriage with beneficiary certificate",
                    "outcome": "wife has enforceable rights",
                    "exception_or_defense": "certificate satisfies writing requirement",
                    "reasoning_path": "The later certificate naming the wife functions as a sufficient written memorandum of the premarital promise.",
                    "conclusion": "wife prevails",
                },
            },
            {
                "id": "equity_path",
                "model": "m2",
                "text": "Equity imposes a constructive trust.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds marriage provision",
                    "issue": "beneficiary rights",
                    "rule_trigger": "promise in consideration of marriage with beneficiary certificate",
                    "outcome": "wife has enforceable rights",
                    "exception_or_defense": "certificate satisfies writing requirement",
                    "reasoning_path": "Even if paperwork is disputed, equity imposes a constructive trust to prevent unjust enrichment.",
                    "conclusion": "wife prevails",
                },
            },
        ]

        clusters = cluster_responses(responses)
        keys = {tuple(cluster["normalized_cluster_key"]) for cluster in clusters["clusters"]}

        self.assertEqual(len(clusters["clusters"]), 2)
        self.assertTrue(any(key[4] == "writing_or_certificate_satisfies_gate" for key in keys))
        self.assertTrue(any(key[4] == "constructive_trust_or_equity" for key in keys))

    def test_dasha_no_writing_signature_does_not_bucket_as_certificate_exception(self):
        responses = [
            {
                "id": "no_writing_a",
                "model": "m1",
                "text": "No certificate was issued, so the oral premarital promise is barred.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds marriage provision",
                    "issue": "oral premarital beneficiary promise",
                    "rule_trigger": "promise made upon consideration of marriage",
                    "outcome": "claim barred",
                    "exception_or_defense": "no signed writing or certificate",
                    "reasoning_path": "The marriage-consideration gate applies and the absence of a writing bars the claim.",
                    "conclusion": "later beneficiaries prevail",
                },
            },
            {
                "id": "no_writing_b",
                "model": "m2",
                "text": "Without a certificate or sufficient writing, the statute defeats the spouse's claim.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds marriage provision",
                    "issue": "oral premarital beneficiary promise",
                    "rule_trigger": "antenuptial promise made in consideration of marriage",
                    "outcome": "barred by statute",
                    "exception_or_defense": "absence of writing",
                    "reasoning_path": "This turns on the marriage provision and no writing removes the promise from enforcement.",
                    "conclusion": "later beneficiaries control",
                },
            },
        ]

        clusters = cluster_responses(responses)
        keys = [tuple(cluster["normalized_cluster_key"]) for cluster in clusters["clusters"]]

        self.assertEqual(len(clusters["clusters"]), 1)
        self.assertEqual(keys[0][3], "no_writing_or_no_exception")
        self.assertEqual(keys[0][4], "statute_bars_no_writing")

    def test_dasha_does_not_treat_unenforceable_as_positive_enforceability(self):
        clusters = cluster_responses([
            {
                "id": "negative_enforceability",
                "model": "m1",
                "text": "The oral promise is unenforceable because it lacks a signed memorandum.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds marriage provision",
                    "issue": "premarital beneficiary promise",
                    "rule_trigger": "promise conditioned on marriage and beneficiary certificate",
                    "outcome": "Unenforceable; later beneficiaries take.",
                    "exception_or_defense": "The promise lacks a signed writing and no signed memorandum exists.",
                    "primary_reasoning_path": "No signed writing bars enforcement, so the later designation controls.",
                    "reasoning_path": "Apply the marriage-consideration writing requirement, find no signed memorandum, and treat the later designation as controlling.",
                    "conclusion": "The spouse cannot enforce the oral promise.",
                },
            }
        ])

        key = clusters["clusters"][0]["normalized_cluster_key"]

        self.assertEqual(key[2], "claim_fails_or_later_designation_controls")
        self.assertEqual(key[3], "no_writing_or_no_exception")

    def test_dasha_prefers_agent_canonical_ids_over_sof_keyword_fallbacks(self):
        responses = [
            {
                "id": "admin_a",
                "model": "m1",
                "text": "The agency acted arbitrarily because it ignored contrary record evidence.",
                "reasoning_signature": {
                    "doctrine_id": "administrative_law",
                    "doctrine": "Administrative Procedure Act review",
                    "issue": "agency record review",
                    "rule_trigger_id": "arbitrary_and_capricious_review",
                    "rule_trigger": "arbitrary and capricious review of agency action",
                    "outcome_id": "agency_action_invalid",
                    "outcome": "agency action should be vacated",
                    "exception_or_defense_id": "record_evidence_ignored",
                    "exception_or_defense": "agency ignored important record evidence",
                    "primary_reasoning_id": "failure_to_consider_important_aspect",
                    "primary_reasoning_path": "The response invalidates the action because the agency failed to consider an important aspect of the problem.",
                    "reasoning_path": "Arbitrary-and-capricious review turns on record evidence and reasoned decisionmaking.",
                    "secondary_paths": [
                        {
                            "path_id": "chenery_post_hoc_rationalization",
                            "gate_or_theory": "Chenery post hoc rationalization",
                            "posture": "rejected",
                            "reason": "not the controlling path in this response",
                            "effect_on_outcome": "no effect",
                        }
                    ],
                    "conclusion": "vacatur likely",
                },
            },
            {
                "id": "admin_b",
                "model": "m2",
                "text": "Vacatur follows because the agency failed to grapple with the record.",
                "reasoning_signature": {
                    "doctrine_id": "administrative_law",
                    "doctrine": "Administrative Procedure Act review",
                    "issue": "agency record review",
                    "rule_trigger_id": "arbitrary_and_capricious_review",
                    "rule_trigger": "arbitrary and capricious review",
                    "outcome_id": "agency_action_invalid",
                    "outcome": "vacate agency action",
                    "exception_or_defense_id": "record_evidence_ignored",
                    "exception_or_defense": "important evidence ignored",
                    "primary_reasoning_id": "failure_to_consider_important_aspect",
                    "primary_reasoning_path": "The response invalidates the action because the agency ignored a central aspect of the record.",
                    "reasoning_path": "The same APA reasoning path applies.",
                    "secondary_paths": [
                        {
                            "path_id": "chenery_post_hoc_rationalization",
                            "gate_or_theory": "Chenery post hoc rationalization",
                            "posture": "rejected",
                            "reason": "not needed to resolve the answer",
                            "effect_on_outcome": "no effect",
                        }
                    ],
                    "conclusion": "vacatur likely",
                },
            },
        ]

        clusters = cluster_responses(responses)

        self.assertEqual(len(clusters["clusters"]), 1)
        self.assertEqual(clusters["normalization"]["agent_canonical_ids_used"], True)
        self.assertEqual(
            clusters["clusters"][0]["normalized_cluster_key"],
            [
                "administrative_law",
                "arbitrary_and_capricious_review",
                "agency_action_invalid",
                "record_evidence_ignored",
                "failure_to_consider_important_aspect",
            ],
        )
        self.assertEqual(
            clusters["clusters"][0]["legal_signal"]["secondary_cluster_profile"],
            ["no_material_secondary_paths"],
        )

    def test_dasha_id_canonicalization_merges_agent_synonyms_before_clustering(self):
        config = load_config(ROOT / "research/fixtures/live_replicate_roster_config.example.json", repo_root=ROOT)
        responses = [
            {
                "id": "r1",
                "track_id": "original",
                "model": "m1",
                "text": "The agency loses because it ignored record evidence.",
                "reasoning_signature": {
                    "doctrine_id": "administrative_law",
                    "rule_trigger_id": "arbitrary_capricious",
                    "outcome_id": "vacatur",
                    "exception_or_defense_id": "ignored_record",
                    "primary_reasoning_id": "ignored_important_evidence",
                    "secondary_paths": [],
                },
            },
            {
                "id": "r2",
                "track_id": "original",
                "model": "m2",
                "text": "Vacatur follows from arbitrary-and-capricious review.",
                "reasoning_signature": {
                    "doctrine_id": "admin_law",
                    "rule_trigger_id": "arbitrary_and_capricious_review",
                    "outcome_id": "agency_action_invalid",
                    "exception_or_defense_id": "record_evidence_ignored",
                    "primary_reasoning_id": "failure_to_consider_important_aspect",
                    "secondary_paths": [],
                },
            },
        ]
        canonical_maps = {
            "canonical_maps": {
                "doctrine_id": {"admin_law": "administrative_law", "administrative_law": "administrative_law"},
                "rule_trigger_id": {
                    "arbitrary_capricious": "arbitrary_and_capricious_review",
                    "arbitrary_and_capricious_review": "arbitrary_and_capricious_review",
                },
                "outcome_id": {"vacatur": "agency_action_invalid", "agency_action_invalid": "agency_action_invalid"},
                "exception_or_defense_id": {
                    "ignored_record": "record_evidence_ignored",
                    "record_evidence_ignored": "record_evidence_ignored",
                },
                "primary_reasoning_id": {
                    "ignored_important_evidence": "failure_to_consider_important_aspect",
                    "failure_to_consider_important_aspect": "failure_to_consider_important_aspect",
                },
                "secondary_path_id": {},
            }
        }

        with patch("research.validation.llm_agents.generate_json", return_value=canonical_maps):
            canonicalized = canonicalize_llm_reasoning_signature_ids(ROOT, config, {"id": "admin_fixture"}, responses)

        clusters = cluster_responses(canonicalized)

        self.assertTrue(all(response["reasoning_signature"]["_dasha_id_canonicalized"] for response in canonicalized))
        self.assertEqual(len(clusters["clusters"]), 1)
        self.assertEqual(clusters["normalization"]["agent_canonical_ids_used"], True)

    def test_dasha_records_secondary_reasoning_paths_on_cluster_signal(self):
        responses = [
            {
                "id": "r1",
                "model": "m1",
                "text": "The spouse loses because there is no signed writing. Estoppel and part performance do not save the claim.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds marriage provision",
                    "issue": "oral premarital beneficiary promise",
                    "rule_trigger": "promise made upon consideration of marriage",
                    "outcome": "claim barred",
                    "exception_or_defense": "no signed writing or certificate",
                    "primary_reasoning_path": "The marriage-consideration gate applies and no writing bars enforcement.",
                    "reasoning_path": "The marriage-consideration gate applies and no writing bars enforcement.",
                    "secondary_paths": [
                        {
                            "gate_or_theory": "promissory estoppel",
                            "posture": "rejected",
                            "reason": "reliance does not defeat the writing requirement on these facts",
                            "effect_on_outcome": "no effect",
                        },
                        {
                            "gate_or_theory": "part performance",
                            "posture": "rejected",
                            "reason": "not a land-transfer performance doctrine",
                            "effect_on_outcome": "no effect",
                        },
                    ],
                    "conclusion": "later beneficiaries control",
                },
            },
            {
                "id": "r2",
                "model": "m2",
                "text": "No writing means the oral marriage promise fails; reliance and performance theories are considered but rejected.",
                "reasoning_signature": {
                    "doctrine": "SOF marriage provision",
                    "issue": "oral premarital beneficiary promise",
                    "rule_trigger": "marriage consideration",
                    "outcome": "barred by statute",
                    "exception_or_defense": "absence of writing",
                    "primary_reasoning_path": "No signed writing means the statute bars the promise.",
                    "reasoning_path": "No signed writing means the statute bars the promise.",
                    "secondary_paths": [
                        {
                            "gate_or_theory": "equitable estoppel/reliance",
                            "posture": "rejected",
                            "reason": "the answer treats reliance as legally insufficient",
                            "effect_on_outcome": "no effect",
                        },
                        {
                            "gate_or_theory": "partial performance",
                            "posture": "rejected",
                            "reason": "performance does not supply the missing memorandum",
                            "effect_on_outcome": "no effect",
                        },
                    ],
                    "conclusion": "claim fails",
                },
            },
        ]

        clusters = cluster_responses(responses)

        self.assertEqual(len(clusters["clusters"]), 1)
        profile = clusters["clusters"][0]["legal_signal"]["secondary_path_profile"]
        self.assertIn("promissory_estoppel_or_reliance:rejected", profile)
        self.assertIn("part_performance:rejected", profile)
        self.assertEqual(clusters["clusters"][0]["legal_signal"]["secondary_cluster_profile"], ["no_material_secondary_paths"])
        self.assertEqual(clusters["clusters"][0]["normalized_cluster_key"][5], "no_material_secondary_paths")

    def test_dasha_material_secondary_profile_prevents_same_primary_overmerge(self):
        responses = [
            {
                "id": "equity_secondary",
                "model": "m1",
                "text": "The claim is barred for lack of writing, but the answer treats constructive trust as a possible alternative route.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds",
                    "issue": "oral premarital promise",
                    "rule_trigger": "marriage consideration",
                    "outcome": "claim barred",
                    "exception_or_defense": "no writing",
                    "primary_reasoning_path": "No signed writing bars enforcement.",
                    "reasoning_path": "No signed writing bars enforcement.",
                    "secondary_paths": [
                        {
                            "gate_or_theory": "constructive trust",
                            "posture": "accepted",
                            "reason": "equity could prevent unjust enrichment despite the statutory bar",
                            "effect_on_outcome": "material fallback theory",
                        }
                    ],
                    "conclusion": "claim fails",
                },
            },
            {
                "id": "one_year_secondary",
                "model": "m2",
                "text": "The claim is barred for lack of writing, and the one-year gate is separately discussed.",
                "reasoning_signature": {
                    "doctrine": "Statute of Frauds",
                    "issue": "oral premarital promise",
                    "rule_trigger": "marriage consideration",
                    "outcome": "claim barred",
                    "exception_or_defense": "no writing",
                    "primary_reasoning_path": "No signed writing bars enforcement.",
                    "reasoning_path": "No signed writing bars enforcement.",
                    "secondary_paths": [
                        {
                            "gate_or_theory": "one-year provision",
                            "posture": "uncertain",
                            "reason": "timing could create a separate gate in other facts",
                            "effect_on_outcome": "not controlling here",
                        }
                    ],
                    "conclusion": "claim fails",
                },
            },
        ]

        clusters = cluster_responses(responses)
        profiles = {tuple(cluster["legal_signal"]["secondary_path_profile"]) for cluster in clusters["clusters"]}
        cluster_profiles = {tuple(cluster["legal_signal"]["secondary_cluster_profile"]) for cluster in clusters["clusters"]}

        self.assertEqual(len(clusters["clusters"]), 2)
        self.assertIn(("constructive_trust_or_equity:accepted",), profiles)
        self.assertIn(("one_year_gate:uncertain",), profiles)
        self.assertIn(("constructive_trust_or_equity:accepted",), cluster_profiles)
        self.assertIn(("one_year_gate:uncertain",), cluster_profiles)

    def test_dasha_member_audit_flags_centroid_member_key_mismatches(self):
        clusters = {
            "clusters": [
                {
                    "id": "cluster_1",
                    "normalized_cluster_key": ["contracts", "plain_meaning", "claim_enforceable", "none", "reasoning_bucket_v2"],
                    "members": [
                        {
                            "id": "r1",
                            "_dasha_normalized_signature": ["contracts", "plain_meaning", "claim_enforceable", "none", "reasoning_bucket_v2"],
                        },
                        {
                            "id": "r2",
                            "_dasha_normalized_signature": ["contracts", "contra_proferentem", "claim_enforceable", "none", "reasoning_bucket_v2"],
                        },
                    ],
                }
            ]
        }

        audit = build_dasha_member_audit(clusters)

        self.assertEqual(audit["status"], "needs_member_review")
        self.assertEqual(audit["checked_members"], 2)
        self.assertEqual(audit["mismatched_members"], 1)
        self.assertEqual(audit["clusters"][0]["mismatches"][0]["response_id"], "r2")

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

    def test_repeated_llm_judge_scores_are_aggregated_and_unstable_rows_escalate(self):
        from research.validation.config import JudgeConfig
        from research.validation.judge import build_zak_packets, judge_clusters_with_openai

        clusters = {
            "clusters": [{
                "id": "cluster_1",
                "representative_response_id": "r1",
                "legal_signal": {"outcome": "enforceable"},
                "member_response_ids": ["r1"],
                "members": [{"id": "r1", "model": "m1", "text": "The promise is enforceable because the writing supports it."}],
            }]
        }
        rubric = {
            "rows": [
                {"id": "R1", "category": "rule", "weight": 0.5, "criterion": "Apply the rule", "source_support": ["rule"]},
                {"id": "R2", "category": "facts", "weight": 0.5, "criterion": "Use the facts", "source_support": ["facts"]},
            ]
        }
        outputs = [
            {"row_scores": [{"row_id": "R1", "score": 4, "rationale": "strong"}, {"row_id": "R2", "score": 4, "rationale": "strong"}]},
            {"row_scores": [{"row_id": "R1", "score": 1, "rationale": "weak"}, {"row_id": "R2", "score": 4, "rationale": "strong"}]},
            {"row_scores": [{"row_id": "R1", "score": 4, "rationale": "adjudicated"}, {"row_id": "R2", "score": 4, "rationale": "adjudicated"}]},
        ]

        def fake_generate_json(**kwargs):
            return outputs.pop(0)

        judge_config = JudgeConfig(
            mode="llm",
            provider="openai",
            model="judge-test",
            agreement_threshold=0.7,
            escalation_margin=0.2,
            repeats=2,
        )
        with patch("research.validation.judge.generate_json", side_effect=fake_generate_json):
            scores = judge_clusters_with_openai(ROOT, clusters, rubric, judge_config)

        self.assertEqual(scores["judge_stability"]["repeat_count"], 2)
        self.assertEqual(scores["judge_stability"]["status"], "stable_after_adjudication")
        self.assertTrue(scores["cluster_scores"][0]["row_scores"][0]["adjudicated"])

        zak = build_zak_packets(scores, clusters, rubric)
        self.assertIn("packets", zak)

    def test_llm_judge_panel_records_models_and_aggregates_scores(self):
        from research.validation.config import JudgeConfig, JudgeModelSpec
        from research.validation.judge import judge_clusters_with_openai

        clusters = {
            "clusters": [{
                "id": "cluster_1",
                "representative_response_id": "r1",
                "legal_signal": {"outcome": "enforceable"},
                "member_response_ids": ["r1"],
                "members": [{"id": "r1", "model": "m1", "text": "The rule and facts support enforcement."}],
            }]
        }
        rubric = {
            "rows": [
                {"id": "R1", "category": "rule", "weight": 0.5, "criterion": "Apply the rule", "source_support": ["rule"]},
                {"id": "R2", "category": "facts", "weight": 0.5, "criterion": "Use the facts", "source_support": ["facts"]},
            ]
        }
        calls = []
        outputs = [
            {"row_scores": [{"row_id": "R1", "score": 4, "rationale": "judge-a"}, {"row_id": "R2", "score": 2, "rationale": "judge-a"}]},
            {"row_scores": [{"row_id": "R1", "score": 2, "rationale": "judge-b"}, {"row_id": "R2", "score": 2, "rationale": "judge-b"}]},
            {"row_scores": [{"row_id": "R1", "score": 3, "rationale": "adjudicated"}, {"row_id": "R2", "score": 2, "rationale": "adjudicated"}]},
        ]

        def fake_generate_json(**kwargs):
            calls.append((kwargs["provider"], kwargs["model"], kwargs["temperature"]))
            return outputs.pop(0)

        judge_config = JudgeConfig(
            mode="llm",
            provider="openai",
            model="unused-default",
            agreement_threshold=0.7,
            escalation_margin=0.2,
            repeats=1,
            judge_models=(
                JudgeModelSpec(provider="openai", model="judge-a", repeats=1),
                JudgeModelSpec(provider="anthropic", model="judge-b", repeats=1),
            ),
        )
        with patch("research.validation.judge.generate_json", side_effect=fake_generate_json):
            scores = judge_clusters_with_openai(ROOT, clusters, rubric, judge_config)

        self.assertEqual(calls, [("openai", "judge-a", 0.0), ("anthropic", "judge-b", 0.0), ("openai", "unused-default", 0.0)])
        self.assertEqual([item["model"] for item in scores["judge_panel"]], ["judge-a", "judge-b"])
        self.assertEqual(scores["judge_stability"]["repeat_count"], 2)
        self.assertEqual(scores["cluster_scores"][0]["row_scores"][0]["score"], 3)

    def test_low_margin_judge_scores_create_zak_packet(self):
        from research.validation.judge import build_zak_packets

        clusters = {
            "clusters": [
                {
                    "id": "cluster_a",
                    "representative_response_id": "a1",
                    "member_response_ids": ["a1"],
                    "members": [{"id": "a1", "model": "m1", "text": "The rule and facts support enforcement."}],
                },
                {
                    "id": "cluster_b",
                    "representative_response_id": "b1",
                    "member_response_ids": ["b1"],
                    "members": [{"id": "b1", "model": "m2", "text": "The rule and facts are close but uncertain."}],
                },
            ]
        }
        rubric = {
            "rows": [
                {"id": "R1", "category": "rule", "weight": 0.5, "criterion": "Apply the rule", "source_support": ["rule"]},
                {"id": "R2", "category": "facts", "weight": 0.5, "criterion": "Use the facts", "source_support": ["facts"]},
            ]
        }

        scores = judge_clusters(clusters, rubric, agreement_threshold=0.7)
        zak = build_zak_packets(scores, clusters, rubric)

        self.assertLess(scores["agreement_score"], 0.7)
        self.assertTrue(scores["needs_zak"])
        self.assertEqual(zak["packets"][0]["question"], "Review disputed representative clusters.")
        self.assertEqual(set(zak["packets"][0]["cluster_ids"]), {"cluster_a", "cluster_b"})

    def test_internal_validation_summary_and_table_are_generated_from_run_artifacts(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)

        summary = build_internal_validation_summary(self.output_dir)
        table_path = self.output_dir / "internal_validation_table.tex"
        write_internal_validation_table(summary, table_path)

        self.assertEqual(summary["status"], "internal_validation_passed")
        self.assertTrue(summary["stage_checks"]["frank"]["passed"])
        self.assertTrue(summary["stage_checks"]["dasha"]["passed"])
        self.assertEqual(summary["dasha_member_audit"]["status"], "member_audit_passed")
        self.assertTrue(table_path.exists())

    def test_replicate_client_polls_until_prediction_succeeds(self):
        payloads = [
            {"status": "processing", "urls": {"get": "https://replicate.local/predictions/1"}},
            {"status": "succeeded", "output": ["done"]},
        ]

        with (
            patch.object(provider_client, "_env_value", return_value="token"),
            patch.object(provider_client, "_post_json", return_value=payloads[0]) as post_json,
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
        self.assertEqual(post_json.call_args.args[2]["input"]["max_tokens"], 1024)
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
        self.assertIn("fixture-model-a (n=", text)
        self.assertNotIn("fixture-model-a, fixture-model-a", text)
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

    def test_natural_response_audit_flags_no_observed_reasoning_divergence(self):
        config = load_config(self.config_path, repo_root=ROOT)
        run_pipeline(config, repo_root=ROOT)
        responses = json.loads((self.output_dir / "responses.json").read_text())
        manifest = json.loads((self.output_dir / "manifest.json").read_text())
        manifest["clustering"] = {**manifest.get("clustering", {}), "min_observed_clusters": 2}
        one_cluster = {
            "schema_version": "research.dasha.llm.v1",
            "method": "llm_reasoning_signature",
            "clusters": [
                {
                    "id": "cluster_1",
                    "legal_signal": {
                        "outcome": "single reasoning path",
                        "reasoning_path": "all responses collapsed together",
                    },
                    "representative_response_id": responses[0]["id"],
                    "member_response_ids": [response["id"] for response in responses],
                    "members": responses,
                    "size": len(responses),
                    "centroid_quality": {
                        "mean_feature_similarity": 1.0,
                        "mean_text_similarity": 0.5,
                        "member_count": len(responses),
                    },
                }
            ],
        }
        (self.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (self.output_dir / "dasha_clusters.json").write_text(json.dumps(one_cluster, indent=2), encoding="utf-8")

        summary = build_natural_response_audit(self.output_dir)

        self.assertEqual(summary["status"], "needs_natural_response_review")
        self.assertFalse(summary["diversity_passed"])
        self.assertEqual(summary["divergence_status"], "no_observed_reasoning_divergence")


if __name__ == "__main__":
    unittest.main()
