"""Method-readiness reporting for the research validation pipeline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .internal_validation import build_internal_validation_summary, build_natural_response_audit
from .preflight import build_live_preflight
from .run_bundle import build_run_bundle_audit
from .utils import write_json


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _status(passed: bool, partial: bool = False) -> str:
    if passed:
        return "met"
    if partial:
        return "partial"
    return "evidence_gap"


def _gate(name: str, status: str, evidence: list[str], gap: str = "") -> dict[str, Any]:
    return {
        "gate": name,
        "status": status,
        "evidence": evidence,
        "gap": gap,
    }


def _latex_escape(value: Any) -> str:
    text = str(value)
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    for raw, escaped in replacements.items():
        text = text.replace(raw, escaped)
    return text


def _status_label(status: str) -> str:
    return {
        "met": "Met",
        "partial": "Partial",
        "evidence_gap": "Evidence gap",
    }.get(status, status.replace("_", " ").title())


def _compact_evidence(gate: dict[str, Any]) -> str:
    evidence = [str(item) for item in gate.get("evidence", [])]
    status = gate.get("status")
    if status == "met":
        selected = evidence[:3]
    elif status == "partial":
        selected = evidence[:2] + ([gate.get("gap", "")] if gate.get("gap") else [])
    else:
        selected = evidence[:1] + ([gate.get("gap", "")] if gate.get("gap") else [])
    return "; ".join(item for item in selected if item)


def build_method_readiness_report(
    run_dir: str | Path,
    *,
    repo_root: str | Path = ".",
    live_config_path: str | Path | None = None,
    stress_dir: str | Path | None = None,
    output_path: str | Path | None = None,
    markdown_path: str | Path | None = None,
) -> dict[str, Any]:
    """Build a single auditable report against the Vision validation gates."""

    root = Path(repo_root).resolve()
    run = Path(run_dir)
    if not run.is_absolute():
        run = root / run
    summary = build_internal_validation_summary(run)
    manifest = _load_json(run / "manifest.json")
    responses = _load_json(run / "responses.json")
    natural_audit = build_natural_response_audit(run)
    bundle = build_run_bundle_audit(run, repo_root=root)

    preflight = None
    if live_config_path:
        preflight = build_live_preflight(live_config_path, repo_root=root)
    source_gate = None
    if preflight:
        manifest_source = manifest.get("source", {}) if isinstance(manifest.get("source"), dict) else {}
        preflight_source = preflight.get("source", {}) if isinstance(preflight.get("source"), dict) else {}
        manifest_source_path = manifest_source.get("path") or manifest.get("source_case_path")
        preflight_source_path = preflight_source.get("path")
        source_match = (
            bool(manifest_source_path)
            and manifest_source_path == preflight_source_path
            and bool(manifest_source.get("sha256_16"))
            and manifest_source.get("sha256_16") == preflight_source.get("sha256_16")
        )
        source_case = preflight.get("source_case", {}) if isinstance(preflight.get("source_case"), dict) else {}
        source_gate = _gate(
            "Claim-supporting source provenance",
            _status(source_match),
            [
                f"run_source={manifest_source_path or 'missing'}",
                f"protocol_source={preflight_source_path or 'missing'}",
                f"case_id={source_case.get('case_id', 'missing')}",
                f"source_type={source_case.get('source_type', 'missing')}",
            ],
            "Rerun the full pipeline when the frozen real-case source differs from the completed run bundle.",
        )

    stress = None
    if stress_dir:
        stress_path = Path(stress_dir)
        if not stress_path.is_absolute():
            stress_path = root / stress_path
        candidate = stress_path / "stress_summary.json"
        if candidate.exists():
            stress = _load_json(candidate)

    checks = summary.get("stage_checks", {})
    perturbation = checks.get("perturbations")
    judge_stability = summary.get("judge_stability", {})
    model_count = summary.get("counts", {}).get("models", 0)
    response_count = summary.get("counts", {}).get("responses", 0)
    clusters = summary.get("counts", {}).get("clusters", 0)

    gates = []
    if source_gate:
        gates.append(source_gate)
    gates.extend([
        _gate(
            "Frank source-to-packet validity",
            _status(checks.get("frank", {}).get("passed", False)),
            checks.get("frank", {}).get("evidence", []),
            "Run Frank on held-out source cases before broad external-validity claims.",
        ),
        _gate(
            "Karthic dynamic rubric validity",
            _status(checks.get("karthic", {}).get("passed", False)),
            checks.get("karthic", {}).get("evidence", []),
            "Add held-out rubric artifact review and later expert agreement.",
        ),
        _gate(
            "Natural response protocol",
            _status(
                manifest.get("response_prompt_style") == "natural" and response_count > 0,
                partial=response_count > 0,
            ),
            [
                f"response_prompt_style={manifest.get('response_prompt_style', 'unknown')}",
                f"responses={response_count}",
                f"models={model_count}",
            ],
            "Live model rosters should use question-only prompting by default.",
        ),
        _gate(
            "Run bundle integrity",
            _status(bundle.get("status") == "run_bundle_reviewable"),
            [
                f"bundle_status={bundle.get('status')}",
                f"checks={len(bundle.get('checks', []))}",
                f"blocking_errors={len(bundle.get('blocking_errors', []))}",
                f"responses={bundle.get('counts', {}).get('responses')}",
                f"clusters={bundle.get('counts', {}).get('clusters')}",
            ],
            "Regenerate bundle audit after any claim-supporting run or artifact rewrite.",
        ),
        _gate(
            "Dasha natural-response clustering",
            _status(checks.get("dasha", {}).get("passed", False) and natural_audit.get("status") != "needs_natural_response_review"),
            checks.get("dasha", {}).get("evidence", []) + [
                f"natural_audit={natural_audit.get('status')}",
                f"observed_clusters={clusters}",
            ],
            "Run larger natural batches across more model families and held-out questions.",
        ),
        _gate(
            "Perturbation validation",
            _status(bool(perturbation and perturbation.get("passed")), partial=bool(perturbation)),
            perturbation.get("evidence", []) if perturbation else ["perturbation_report=not_configured"],
            "Run invariant and material perturbation tracks with live model responses.",
        ),
        _gate(
            "Judge row-level scoring and rankings",
            _status(
                checks.get("judge", {}).get("passed", False)
                and judge_stability.get("status") not in {"not_repeated", "", None},
                partial=bool(summary.get("model_rankings")),
            ),
            checks.get("judge", {}).get("evidence", []),
            "Quantify live repeat or panel stability before stronger reliability claims.",
        ),
        _gate(
            "Zak escalation mechanism",
            _status(checks.get("zak", {}).get("passed", False)),
            checks.get("zak", {}).get("evidence", []),
            "Calibrate live escalation thresholds with repeated judge evidence.",
        ),
        _gate(
            "Controlled scale regression",
            _status(bool(stress and stress.get("status") == "internal_stress_passed")),
            [
                f"stress_status={stress.get('status') if stress else 'missing'}",
                f"stress_responses={stress.get('sample_count') if stress else 'missing'}",
                f"stress_macro_f1={stress.get('macro_f1') if stress else 'missing'}",
            ],
            "Keep this separated from live discovery evidence.",
        ),
        _gate(
            "Live-run preflight",
            _status(
                bool(preflight and preflight.get("status") == "live_preflight_passed" and not preflight.get("warnings")),
                partial=bool(preflight and preflight.get("status") == "live_preflight_passed"),
            ),
            [
                f"preflight_status={preflight.get('status') if preflight else 'not_run'}",
                f"warnings={len(preflight.get('warnings', [])) if preflight else 'n/a'}",
                f"blocking_errors={len(preflight.get('blocking_errors', [])) if preflight else 'n/a'}",
            ],
            "Resolve credential warnings before claim-supporting paid live runs.",
        ),
    ])

    met = sum(1 for gate in gates if gate["status"] == "met")
    partial = sum(1 for gate in gates if gate["status"] == "partial")
    gaps = [gate for gate in gates if gate["status"] != "met"]
    status = "internal_method_ready_with_gaps" if checks and met >= 6 else "needs_method_work"
    if not gaps:
        status = "internal_method_ready"

    report = {
        "schema_version": "research.method_readiness.v1",
        "status": status,
        "run_id": summary.get("run_id"),
        "run_dir": str(run.relative_to(root) if run.is_relative_to(root) else run),
        "met_gates": met,
        "partial_gates": partial,
        "total_gates": len(gates),
        "gates": gates,
        "judge_stability": judge_stability,
        "preflight_warnings": preflight.get("warnings", []) if preflight else [],
        "interpretation": (
            "This report is an internal readiness artifact. It distinguishes "
            "implemented and tested method components from live-evidence gaps."
        ),
    }
    if output_path:
        write_json(Path(output_path), report)
    if markdown_path:
        write_method_readiness_markdown(report, markdown_path)
    return report


def write_method_readiness_markdown(report: dict[str, Any], path: str | Path) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Method Readiness Report",
        "",
        f"- Status: `{report['status']}`",
        f"- Run: `{report['run_id']}`",
        f"- Gates met: {report['met_gates']} / {report['total_gates']}",
        f"- Partial gates: {report['partial_gates']}",
        "",
        "| Gate | Status | Evidence | Remaining gap |",
        "|---|---:|---|---|",
    ]
    for gate in report["gates"]:
        evidence = "; ".join(gate["evidence"])
        lines.append(f"| {gate['gate']} | `{gate['status']}` | {evidence} | {gate['gap']} |")
    lines.extend(["", report["interpretation"], ""])
    output.write_text("\n".join(lines), encoding="utf-8")


def write_review_readiness_table(report: dict[str, Any], table_path: str | Path) -> None:
    """Generate the manuscript readiness table from machine-readable gates."""

    path = Path(table_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        r"\begin{tabular}{p{0.25\linewidth}p{0.18\linewidth}p{0.47\linewidth}}",
        r"\toprule",
        r"Vision gate & Current status & Evidence \\",
        r"\midrule",
    ]
    for gate in report.get("gates", []):
        lines.append(
            f"{_latex_escape(gate.get('gate', 'Unknown gate'))} & "
            f"{_latex_escape(_status_label(str(gate.get('status', 'unknown'))))} & "
            f"{_latex_escape(_compact_evidence(gate))} \\\\"
        )
    lines.append(
        "Publication readiness & Not yet met & "
        "Requires held-out cases, expert review, live perturbation evidence, broader rosters, and frozen reliability thresholds. \\\\"
    )
    lines.extend([r"\bottomrule", r"\end{tabular}", ""])
    path.write_text("\n".join(lines), encoding="utf-8")
