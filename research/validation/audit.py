"""Consolidated no-call audit for internal research review."""

from __future__ import annotations

import html
from pathlib import Path
from typing import Any

from .claim_ledger import build_claim_ledger
from .handoff_manifest import build_handoff_manifest
from .paper_lint import lint_paper
from .preflight import build_live_preflight
from .readiness import build_method_readiness_report, write_review_readiness_table
from .review_pack import build_review_packet
from .run_bundle import build_run_bundle_audit
from .secrets_lint import lint_secrets
from .utils import write_json


def _markdown(summary: dict[str, Any]) -> str:
    rows = [
        ("Paper lint", summary["paper_lint"]["status"], f"errors={len(summary['paper_lint'].get('errors', []))}"),
        ("Secrets lint", summary["secrets_lint"]["status"], f"findings={len(summary['secrets_lint'].get('findings', []))}"),
        ("Live preflight", summary["preflight"]["status"], f"warnings={len(summary['preflight'].get('warnings', []))}; blocking_errors={len(summary['preflight'].get('blocking_errors', []))}"),
        ("Run bundle", summary["run_bundle"]["status"], f"checks={summary['run_bundle'].get('check_count')}; blocking_errors={summary['run_bundle'].get('blocking_errors')}"),
        ("Readiness", summary["readiness"]["status"], f"gates={summary['readiness'].get('met_gates')}/{summary['readiness'].get('total_gates')}; partial={summary['readiness'].get('partial_gates')}"),
        ("Review packet", summary["review_pack"]["status"], ", ".join(summary["review_pack_artifacts"])),
        ("Claim ledger", summary["claim_ledger"]["status"], f"counts={summary['claim_ledger'].get('status_counts')}"),
        ("Handoff manifest", summary["handoff_manifest"]["status"], f"artifacts={summary['handoff_manifest'].get('artifact_count')}; hash={summary['handoff_manifest'].get('manifest_hash')}"),
    ]
    lines = [
        "# No-Call Audit",
        "",
        f"- Status: `{summary['status']}`",
        f"- Live calls made: `{summary['live_calls_made']}`",
        "",
        "| Check | Status | Notes |",
        "|---|---:|---|",
    ]
    for name, status, notes in rows:
        lines.append(f"| {name} | `{status}` | {notes} |")
    lines.extend(["", "## Declared Gaps And Warnings", ""])
    for item in summary.get("warnings_and_gaps", []):
        lines.append(f"- {item}")
    if not summary.get("warnings_and_gaps"):
        lines.append("- None.")
    lines.append("")
    return "\n".join(lines)


def build_no_call_audit(
    repo_root: str | Path = ".",
    *,
    run_dir: str | Path = "research/runs/live_natural_response_batch",
    live_config_path: str | Path = "research/fixtures/live_multi_provider_config.example.json",
    stress_dir: str | Path = "research/runs/internal_stress",
    output_json: str | Path = "to_human/no_call_audit.json",
    output_markdown: str | Path = "to_human/no_call_audit.md",
    output_html: str | Path = "to_human/no_call_audit.html",
) -> dict[str, Any]:
    """Run all no-call review checks and regenerate handoff artifacts."""

    root = Path(repo_root).resolve()
    paper = lint_paper(root / "paper")
    secrets = lint_secrets(root, output_path=root / "experiments/security-lint/results.json")
    preflight = build_live_preflight(
        root / live_config_path,
        repo_root=root,
        output_path=root / "experiments/live-config-preflight/results.json",
    )
    bundle = build_run_bundle_audit(
        root / run_dir,
        repo_root=root,
        output_json=root / "experiments/run-bundle-integrity/results.json",
        output_markdown=root / "experiments/run-bundle-integrity/analysis.md",
    )
    readiness = build_method_readiness_report(
        root / run_dir,
        repo_root=root,
        live_config_path=root / live_config_path,
        stress_dir=root / stress_dir,
        output_path=root / "experiments/method-readiness/results/method_readiness.json",
        markdown_path=root / "experiments/method-readiness/analysis.md",
    )
    write_review_readiness_table(readiness, root / "paper/tables/review_readiness.tex")
    review = build_review_packet(root)
    ledger = build_claim_ledger(root)
    handoff = build_handoff_manifest(root)

    blocking = []
    if paper["status"] != "paper_lint_passed":
        blocking.extend(paper.get("errors", []))
    if secrets["status"] != "secrets_lint_passed":
        blocking.extend(secrets.get("errors", []))
    if preflight["status"] != "live_preflight_passed":
        blocking.extend(check["message"] for check in preflight.get("blocking_errors", []))
    if bundle["status"] != "run_bundle_reviewable":
        blocking.extend(check["message"] for check in bundle.get("blocking_errors", []))
    if readiness["status"] == "needs_method_work":
        blocking.append("Method readiness report needs method work.")
    if review["status"] != "ready_for_internal_review_with_declared_gaps":
        blocking.append("Review packet is not ready for internal review.")
    if ledger["status"] != "claim_ledger_ready":
        blocking.append("Claim ledger is not ready.")
    if handoff["status"] != "handoff_manifest_ready":
        blocking.append("Handoff manifest is not ready.")

    warnings_and_gaps = []
    warnings_and_gaps.extend(f"preflight warning: {item['message']}" for item in preflight.get("warnings", []))
    warnings_and_gaps.extend(f"readiness gap: {gate['gate']}" for gate in readiness.get("gates", []) if gate.get("status") == "evidence_gap")
    warnings_and_gaps.extend(f"partial claim: {claim['id']} {claim['claim']}" for claim in ledger.get("claims", []) if claim.get("status") == "partial")

    status = "no_call_audit_failed" if blocking else "no_call_audit_passed_with_declared_gaps"
    summary = {
        "schema_version": "research.no_call_audit.v1",
        "status": status,
        "live_calls_made": False,
        "paper_lint": {"status": paper["status"], "errors": paper.get("errors", [])},
        "secrets_lint": {"status": secrets["status"], "findings": secrets.get("findings", [])},
        "preflight": {
            "status": preflight["status"],
            "warnings": preflight.get("warnings", []),
            "blocking_errors": preflight.get("blocking_errors", []),
            "call_plan": preflight.get("call_plan", {}),
            "budget": preflight.get("budget", {}),
        },
        "run_bundle": {
            "status": bundle["status"],
            "check_count": len(bundle.get("checks", [])),
            "blocking_errors": len(bundle.get("blocking_errors", [])),
            "counts": bundle.get("counts", {}),
        },
        "readiness": {
            "status": readiness["status"],
            "met_gates": readiness.get("met_gates"),
            "partial_gates": readiness.get("partial_gates"),
            "total_gates": readiness.get("total_gates"),
        },
        "review_pack": {"status": review["status"]},
        "review_pack_artifacts": [
            "to_human/internal_review_packet.md",
            "to_human/internal_review_packet.html",
            "to_human/internal_review_packet.json",
        ],
        "claim_ledger": {
            "status": ledger["status"],
            "status_counts": ledger.get("status_counts", {}),
        },
        "handoff_manifest": {
            "status": handoff["status"],
            "artifact_count": handoff.get("artifact_count"),
            "manifest_hash": handoff.get("manifest_hash"),
        },
        "blocking_errors": blocking,
        "warnings_and_gaps": warnings_and_gaps,
    }
    write_json(root / output_json, summary)
    markdown = _markdown(summary)
    markdown_path = root / output_markdown
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(markdown, encoding="utf-8")
    html_path = root / output_html
    html_path.parent.mkdir(parents=True, exist_ok=True)
    html_path.write_text(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>No-Call Audit</title>"
        "<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:1040px;margin:40px auto;padding:0 24px;line-height:1.5;color:#17202a}"
        "pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>"
        + html.escape(markdown)
        + "</pre></body></html>\n",
        encoding="utf-8",
    )
    return summary
