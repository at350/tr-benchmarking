"""Command line interface for the research validation harness."""

from __future__ import annotations

import argparse
from pathlib import Path

from .audit import build_no_call_audit
from .claim_ledger import build_claim_ledger
from .config import load_config
from .freeze import build_protocol_freeze
from .handoff_manifest import build_handoff_manifest
from .internal_stress import run_internal_stress, write_stress_table
from .internal_validation import (
    build_internal_validation_summary,
    build_natural_response_audit,
    build_statistical_validation_summary,
    write_artifact_examples_section,
    write_internal_validation_table,
    write_natural_response_audit_table,
    write_perturbation_validation_table,
    write_statistical_validation_table,
)
from .paper_lint import lint_paper
from .pipeline import run_pipeline
from .preflight import build_live_preflight
from .readiness import build_method_readiness_report, write_review_readiness_table
from .review_pack import build_review_packet
from .run_bundle import build_run_bundle_audit
from .secrets_lint import lint_secrets


def main() -> int:
    parser = argparse.ArgumentParser(prog="python3 -m research.validation")
    subcommands = parser.add_subparsers(dest="command", required=True)

    run_parser = subcommands.add_parser("run", help="Run the source-to-score research pipeline")
    run_parser.add_argument("--config", required=True, help="Path to research config JSON")
    run_parser.add_argument("--repo-root", default=".", help="Repository root")
    validate_parser = subcommands.add_parser("validate", help="Build internal validation evidence for a completed run")
    validate_parser.add_argument("--run-dir", required=True, help="Completed research run directory")
    validate_parser.add_argument("--table", default=None, help="Optional LaTeX table output path")
    validate_parser.add_argument("--artifact-section", default=None, help="Optional LaTeX artifact examples section output path")
    validate_parser.add_argument("--natural-table", default=None, help="Optional natural-response Dasha audit table output path")
    validate_parser.add_argument("--perturbation-table", default=None, help="Optional perturbation validation table output path")
    validate_parser.add_argument("--stats-json", default=None, help="Optional statistical validation JSON output path")
    validate_parser.add_argument("--stats-table", default=None, help="Optional statistical validation LaTeX table output path")
    validate_parser.add_argument("--stress-dir", default="research/runs/internal_stress", help="Optional stress run directory for statistical validation")
    stress_parser = subcommands.add_parser("stress", help="Run deterministic internal stress checks")
    stress_parser.add_argument("--output-dir", default="research/runs/internal_stress", help="Output directory for stress artifacts")
    stress_parser.add_argument("--sample-count", type=int, default=500, help="Number of controlled responses to generate")
    stress_parser.add_argument("--seed", type=int, default=2026, help="Deterministic random seed")
    stress_parser.add_argument("--table", default=None, help="Optional LaTeX table output path")
    freeze_parser = subcommands.add_parser("freeze", help="Write a frozen protocol manifest for a run config")
    freeze_parser.add_argument("--config", required=True, help="Path to research config JSON")
    freeze_parser.add_argument("--repo-root", default=".", help="Repository root")
    freeze_parser.add_argument("--output", required=True, help="Output JSON path for the freeze manifest")
    paper_lint_parser = subcommands.add_parser("paper-lint", help="Run static LaTeX manuscript reference checks")
    paper_lint_parser.add_argument("--paper-root", default="paper", help="Paper directory")
    paper_lint_parser.add_argument("--output", default=None, help="Optional JSON output path")
    preflight_parser = subcommands.add_parser("preflight", help="Run no-call readiness checks for a live config")
    preflight_parser.add_argument("--config", required=True, help="Path to research config JSON")
    preflight_parser.add_argument("--repo-root", default=".", help="Repository root")
    preflight_parser.add_argument("--output", default=None, help="Optional JSON output path")
    readiness_parser = subcommands.add_parser("readiness", help="Build a Vision-gate method readiness report")
    readiness_parser.add_argument("--run-dir", required=True, help="Completed research run directory")
    readiness_parser.add_argument("--repo-root", default=".", help="Repository root")
    readiness_parser.add_argument("--live-config", default=None, help="Optional live config path for no-call preflight evidence")
    readiness_parser.add_argument("--stress-dir", default=None, help="Optional deterministic stress run directory")
    readiness_parser.add_argument("--output", default=None, help="Optional JSON report output path")
    readiness_parser.add_argument("--markdown", default=None, help="Optional Markdown report output path")
    readiness_parser.add_argument("--review-table", default=None, help="Optional LaTeX review-readiness table output path")
    bundle_parser = subcommands.add_parser("bundle-audit", help="Audit a completed run bundle for integrity and reviewability")
    bundle_parser.add_argument("--run-dir", required=True, help="Completed research run directory")
    bundle_parser.add_argument("--repo-root", default=".", help="Repository root for relative artifact paths")
    bundle_parser.add_argument("--json", default=None, help="Optional JSON output path")
    bundle_parser.add_argument("--markdown", default=None, help="Optional Markdown output path")
    bundle_parser.add_argument("--html", default=None, help="Optional HTML output path")
    secrets_parser = subcommands.add_parser("secrets-lint", help="Scan shareable repo files for likely API keys")
    secrets_parser.add_argument("--repo-root", default=".", help="Repository root")
    secrets_parser.add_argument("--output", default=None, help="Optional JSON output path")
    review_parser = subcommands.add_parser("review-pack", help="Build a human-facing internal review packet")
    review_parser.add_argument("--repo-root", default=".", help="Repository root")
    review_parser.add_argument("--readiness", default="experiments/method-readiness/results/method_readiness.json")
    review_parser.add_argument("--preflight", default="experiments/live-config-preflight/results.json")
    review_parser.add_argument("--secrets", default="experiments/security-lint/results.json")
    review_parser.add_argument("--bundle", default="experiments/run-bundle-integrity/results.json")
    review_parser.add_argument("--markdown", default="to_human/internal_review_packet.md")
    review_parser.add_argument("--html", default="to_human/internal_review_packet.html")
    review_parser.add_argument("--json", default="to_human/internal_review_packet.json")
    claim_parser = subcommands.add_parser("claim-ledger", help="Build a claim-to-evidence ledger for manuscript review")
    claim_parser.add_argument("--repo-root", default=".", help="Repository root")
    claim_parser.add_argument("--readiness", default="experiments/method-readiness/results/method_readiness.json")
    claim_parser.add_argument("--preflight", default="experiments/live-config-preflight/results.json")
    claim_parser.add_argument("--secrets", default="experiments/security-lint/results.json")
    claim_parser.add_argument("--bundle", default="experiments/run-bundle-integrity/results.json")
    claim_parser.add_argument("--markdown", default="to_human/claim_ledger.md")
    claim_parser.add_argument("--html", default="to_human/claim_ledger.html")
    claim_parser.add_argument("--json", default="to_human/claim_ledger.json")
    audit_parser = subcommands.add_parser("no-call-audit", help="Run all no-call review checks and regenerate handoff artifacts")
    audit_parser.add_argument("--repo-root", default=".", help="Repository root")
    audit_parser.add_argument("--run-dir", default="research/runs/live_natural_response_batch")
    audit_parser.add_argument("--live-config", default="research/fixtures/live_multi_provider_config.example.json")
    audit_parser.add_argument("--stress-dir", default="research/runs/internal_stress")
    audit_parser.add_argument("--json", default="to_human/no_call_audit.json")
    audit_parser.add_argument("--markdown", default="to_human/no_call_audit.md")
    audit_parser.add_argument("--html", default="to_human/no_call_audit.html")
    handoff_parser = subcommands.add_parser("handoff-manifest", help="Write hashes for internal review handoff artifacts")
    handoff_parser.add_argument("--repo-root", default=".", help="Repository root")
    handoff_parser.add_argument("--output", default="to_human/handoff_manifest.json", help="Output JSON manifest path")

    args = parser.parse_args()
    if args.command == "run":
        root = Path(args.repo_root).resolve()
        config = load_config(args.config, repo_root=root)
        result = run_pipeline(config, repo_root=root)
        print(f"{result.run_id}: {result.status}")
        print(result.output_dir)
        if result.quality_errors:
            for error in result.quality_errors:
                print(f"QUALITY: {error}")
            return 2
    if args.command == "validate":
        summary = build_internal_validation_summary(args.run_dir)
        if args.table:
            write_internal_validation_table(summary, args.table)
        if args.artifact_section:
            write_artifact_examples_section(args.run_dir, args.artifact_section)
        if args.natural_table:
            natural_summary = build_natural_response_audit(args.run_dir)
            write_natural_response_audit_table(natural_summary, args.natural_table)
        if args.perturbation_table:
            write_perturbation_validation_table(args.run_dir, args.perturbation_table)
        if args.stats_json or args.stats_table:
            stats = build_statistical_validation_summary(args.run_dir, stress_dir=args.stress_dir)
            if args.stats_json:
                from .utils import write_json
                write_json(Path(args.stats_json), stats)
            if args.stats_table:
                write_statistical_validation_table(stats, args.stats_table)
        print(f"{summary['run_id']}: {summary['status']}")
        return 0 if summary["status"] == "internal_validation_passed" else 2
    if args.command == "stress":
        summary = run_internal_stress(args.output_dir, sample_count=args.sample_count, seed=args.seed)
        if args.table:
            write_stress_table(summary, args.table)
        print(f"internal_stress: {summary['status']}")
        print(args.output_dir)
        return 0 if summary["status"] == "internal_stress_passed" else 2
    if args.command == "freeze":
        freeze = build_protocol_freeze(args.config, repo_root=Path(args.repo_root).resolve(), output_path=args.output)
        print(f"{freeze['run_id']}: protocol_frozen")
        print(args.output)
        print(f"protocol_hash={freeze['protocol_hash']}")
        return 0
    if args.command == "paper-lint":
        summary = lint_paper(args.paper_root, output_path=args.output)
        print(summary["status"])
        if args.output:
            print(args.output)
        for error in summary["errors"]:
            print(f"PAPER: {error}")
        return 0 if summary["status"] == "paper_lint_passed" else 2
    if args.command == "preflight":
        summary = build_live_preflight(args.config, repo_root=Path(args.repo_root).resolve(), output_path=args.output)
        print(summary["status"])
        if args.output:
            print(args.output)
        for check in summary["checks"]:
            if not check["passed"]:
                prefix = "PREFLIGHT" if check["severity"] == "error" else "PREFLIGHT-WARN"
                print(f"{prefix}: {check['message']}")
        return 0 if summary["status"] == "live_preflight_passed" else 2
    if args.command == "readiness":
        report = build_method_readiness_report(
            args.run_dir,
            repo_root=Path(args.repo_root).resolve(),
            live_config_path=args.live_config,
            stress_dir=args.stress_dir,
            output_path=args.output,
            markdown_path=args.markdown,
        )
        print(report["status"])
        print(f"gates={report['met_gates']}/{report['total_gates']}")
        if args.output:
            print(args.output)
        if args.markdown:
            print(args.markdown)
        if args.review_table:
            write_review_readiness_table(report, args.review_table)
            print(args.review_table)
        return 0 if report["status"] in {"internal_method_ready", "internal_method_ready_with_gaps"} else 2
    if args.command == "bundle-audit":
        summary = build_run_bundle_audit(
            args.run_dir,
            repo_root=args.repo_root,
            output_json=args.json,
            output_markdown=args.markdown,
            output_html=args.html,
        )
        print(summary["status"])
        if args.json:
            print(args.json)
        if args.markdown:
            print(args.markdown)
        if args.html:
            print(args.html)
        print(f"checks={len(summary['checks'])}")
        print(f"blocking_errors={len(summary['blocking_errors'])}")
        return 0 if summary["status"] == "run_bundle_reviewable" else 2
    if args.command == "secrets-lint":
        summary = lint_secrets(args.repo_root, output_path=args.output)
        print(summary["status"])
        if args.output:
            print(args.output)
        for error in summary["errors"]:
            print(f"SECRET: {error}")
        return 0 if summary["status"] == "secrets_lint_passed" else 2
    if args.command == "review-pack":
        summary = build_review_packet(
            args.repo_root,
            readiness_path=args.readiness,
            preflight_path=args.preflight,
            secrets_path=args.secrets,
            bundle_path=args.bundle,
            output_markdown=args.markdown,
            output_html=args.html,
            output_json=args.json,
        )
        print(summary["status"])
        print(args.markdown)
        print(args.html)
        print(args.json)
        return 0 if summary["status"] == "ready_for_internal_review_with_declared_gaps" else 2
    if args.command == "claim-ledger":
        ledger = build_claim_ledger(
            args.repo_root,
            readiness_path=args.readiness,
            preflight_path=args.preflight,
            secrets_path=args.secrets,
            bundle_path=args.bundle,
            output_json=args.json,
            output_markdown=args.markdown,
            output_html=args.html,
        )
        print(ledger["status"])
        print(args.markdown)
        print(args.html)
        print(args.json)
        return 0 if ledger["status"] == "claim_ledger_ready" else 2
    if args.command == "no-call-audit":
        summary = build_no_call_audit(
            args.repo_root,
            run_dir=args.run_dir,
            live_config_path=args.live_config,
            stress_dir=args.stress_dir,
            output_json=args.json,
            output_markdown=args.markdown,
            output_html=args.html,
        )
        print(summary["status"])
        print(args.markdown)
        print(args.html)
        print(args.json)
        return 0 if summary["status"] == "no_call_audit_passed_with_declared_gaps" else 2
    if args.command == "handoff-manifest":
        summary = build_handoff_manifest(args.repo_root, output_path=args.output)
        print(summary["status"])
        print(args.output)
        print(f"artifact_count={summary['artifact_count']}")
        print(f"manifest_hash={summary['manifest_hash']}")
        return 0 if summary["status"] == "handoff_manifest_ready" else 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
