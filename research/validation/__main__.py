"""Command line interface for the research validation harness."""

from __future__ import annotations

import argparse
from pathlib import Path

from .config import load_config
from .internal_stress import run_internal_stress, write_stress_table
from .internal_validation import (
    build_internal_validation_summary,
    build_natural_response_audit,
    write_artifact_examples_section,
    write_internal_validation_table,
    write_natural_response_audit_table,
)
from .pipeline import run_pipeline


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
    stress_parser = subcommands.add_parser("stress", help="Run deterministic internal stress checks")
    stress_parser.add_argument("--output-dir", default="research/runs/internal_stress", help="Output directory for stress artifacts")
    stress_parser.add_argument("--sample-count", type=int, default=500, help="Number of controlled responses to generate")
    stress_parser.add_argument("--seed", type=int, default=2026, help="Deterministic random seed")
    stress_parser.add_argument("--table", default=None, help="Optional LaTeX table output path")

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
        print(f"{summary['run_id']}: {summary['status']}")
        return 0 if summary["status"] == "internal_validation_passed" else 2
    if args.command == "stress":
        summary = run_internal_stress(args.output_dir, sample_count=args.sample_count, seed=args.seed)
        if args.table:
            write_stress_table(summary, args.table)
        print(f"internal_stress: {summary['status']}")
        print(args.output_dir)
        return 0 if summary["status"] == "internal_stress_passed" else 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
