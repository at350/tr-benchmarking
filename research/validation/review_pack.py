"""Human-facing review packets for internal research handoff."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from .utils import write_json


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def _status_line(label: str, value: Any) -> str:
    return f"- {label}: `{value}`"


def _markdown_table(rows: list[tuple[str, str, str]]) -> list[str]:
    lines = ["| Item | Status | Notes |", "|---|---:|---|"]
    for item, status, notes in rows:
        lines.append(f"| {item} | `{status}` | {notes} |")
    return lines


def _markdown_to_html(markdown: str, title: str) -> str:
    body = html.escape(markdown)
    body = body.replace("\n", "<br>\n")
    return (
        "<!doctype html>\n"
        "<html><head><meta charset=\"utf-8\"><title>"
        + html.escape(title)
        + "</title><style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:980px;margin:40px auto;padding:0 24px;line-height:1.5;color:#17202a}"
        "code{background:#f2f4f7;padding:2px 5px;border-radius:4px}"
        "br{line-height:1.65}"
        "</style></head><body><pre style=\"white-space:pre-wrap;font-family:inherit\">"
        + html.escape(markdown)
        + "</pre></body></html>\n"
    )


def build_review_packet(
    repo_root: str | Path = ".",
    *,
    readiness_path: str | Path = "experiments/method-readiness/results/method_readiness.json",
    preflight_path: str | Path = "experiments/live-config-preflight/results.json",
    secrets_path: str | Path = "experiments/security-lint/results.json",
    bundle_path: str | Path = "experiments/run-bundle-integrity/results.json",
    output_markdown: str | Path = "to_human/internal_review_packet.md",
    output_html: str | Path | None = "to_human/internal_review_packet.html",
    output_json: str | Path | None = "to_human/internal_review_packet.json",
) -> dict[str, Any]:
    """Generate a concise review packet from current validation artifacts."""

    root = Path(repo_root).resolve()
    readiness_file = root / readiness_path
    preflight_file = root / preflight_path
    secrets_file = root / secrets_path
    bundle_file = root / bundle_path
    readiness = _load(readiness_file)
    preflight = _load(preflight_file)
    secrets = _load(secrets_file)
    bundle = _load(bundle_file) if bundle_file.exists() else {"status": "missing"}

    met_gates = readiness.get("met_gates", 0)
    total_gates = readiness.get("total_gates", 0)
    partial_gates = readiness.get("partial_gates", 0)
    evidence_gaps = [gate for gate in readiness.get("gates", []) if gate.get("status") == "evidence_gap"]
    partials = [gate for gate in readiness.get("gates", []) if gate.get("status") == "partial"]
    call_plan = preflight.get("call_plan", {})
    budget = preflight.get("budget", {})
    warnings = preflight.get("warnings", [])

    review_status = "ready_for_internal_review_with_declared_gaps"
    if readiness.get("status") == "needs_method_work" or secrets.get("status") != "secrets_lint_passed":
        review_status = "needs_cleanup_before_internal_review"

    summary = {
        "schema_version": "research.internal_review_packet.v1",
        "status": review_status,
        "readiness_status": readiness.get("status"),
        "met_gates": met_gates,
        "partial_gates": partial_gates,
        "total_gates": total_gates,
        "preflight_status": preflight.get("status"),
        "preflight_warning_count": len(warnings),
        "secrets_status": secrets.get("status"),
        "bundle_status": bundle.get("status"),
        "source_artifacts": {
            "readiness": _rel(readiness_file, root),
            "preflight": _rel(preflight_file, root),
            "secrets": _rel(secrets_file, root),
            "bundle": _rel(bundle_file, root) if bundle_file.exists() else "missing",
        },
        "evidence_gaps": [gate.get("gate") for gate in evidence_gaps],
        "partial_gates_list": [gate.get("gate") for gate in partials],
        "call_plan": call_plan,
        "budget": budget,
    }

    rows = [
        ("Method readiness", str(readiness.get("status")), f"{met_gates}/{total_gates} gates met; {partial_gates} partial."),
        ("Run bundle integrity", str(bundle.get("status")), f"{bundle.get('counts', {}).get('responses', 'n/a')} responses; {bundle.get('counts', {}).get('clusters', 'n/a')} clusters; {len(bundle.get('blocking_errors', []))} blocking error(s)."),
        ("Live preflight", str(preflight.get("status")), f"{len(warnings)} warning(s); {len(preflight.get('blocking_errors', []))} blocking error(s)."),
        ("Secret lint", str(secrets.get("status")), f"{secrets.get('scanned_files')} files scanned."),
        ("Live call plan", "bounded", f"{call_plan.get('planned_total_llm_calls_excluding_frank_karthic')} planned calls excluding Frank/Karthic; cap {budget.get('max_total_llm_calls_excluding_frank_karthic')}."),
    ]
    lines = [
        "# Internal Review Packet",
        "",
        _status_line("Status", review_status),
        _status_line("Readiness run", readiness.get("run_id")),
        _status_line("Source artifacts", ", ".join(summary["source_artifacts"].values())),
        "",
        "## Current Evidence",
        "",
        *_markdown_table(rows),
        "",
        "## Declared Gaps",
        "",
    ]
    if evidence_gaps:
        lines.extend(f"- {gate.get('gate')}: {gate.get('gap')}" for gate in evidence_gaps)
    else:
        lines.append("- None.")
    lines.extend(["", "## Partial Gates", ""])
    if partials:
        lines.extend(f"- {gate.get('gate')}: {gate.get('gap')}" for gate in partials)
    else:
        lines.append("- None.")
    lines.extend([
        "",
        "## Next Run",
        "",
        "- Resolve or explicitly accept the Gemini credential warning.",
        "- Run the bounded live perturbation config when model budget is approved.",
        "- Regenerate bundle audit, readiness, preflight, secret lint, and this review packet after the run.",
        "",
    ])
    markdown = "\n".join(lines)
    markdown_path = root / output_markdown
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(markdown, encoding="utf-8")
    if output_html:
        html_path = root / output_html
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(_markdown_to_html(markdown, "Internal Review Packet"), encoding="utf-8")
    if output_json:
        write_json(root / output_json, summary)
    return summary
