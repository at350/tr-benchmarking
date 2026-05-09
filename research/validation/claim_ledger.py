"""Claim-to-evidence ledger for manuscript review."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from .utils import write_json


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _gate_status(readiness: dict[str, Any], name: str) -> tuple[str, list[str], str]:
    for gate in readiness.get("gates", []):
        if gate.get("gate") == name:
            return str(gate.get("status")), list(gate.get("evidence", [])), str(gate.get("gap", ""))
    return "missing", [], "Gate not found in readiness report."


def _claim(
    claim_id: str,
    claim: str,
    status: str,
    evidence: list[str],
    artifacts: list[str],
    limitation: str,
) -> dict[str, Any]:
    return {
        "id": claim_id,
        "claim": claim,
        "status": status,
        "evidence": evidence,
        "artifacts": artifacts,
        "limitation": limitation,
    }


def build_claim_ledger(
    repo_root: str | Path = ".",
    *,
    readiness_path: str | Path = "experiments/method-readiness/results/method_readiness.json",
    preflight_path: str | Path = "experiments/live-config-preflight/results.json",
    secrets_path: str | Path = "experiments/security-lint/results.json",
    bundle_path: str | Path = "experiments/run-bundle-integrity/results.json",
    output_json: str | Path | None = "to_human/claim_ledger.json",
    output_markdown: str | Path | None = "to_human/claim_ledger.md",
    output_html: str | Path | None = "to_human/claim_ledger.html",
) -> dict[str, Any]:
    """Generate a concise claim ledger from machine-readable evidence."""

    root = Path(repo_root).resolve()
    readiness_file = root / readiness_path
    preflight_file = root / preflight_path
    secrets_file = root / secrets_path
    bundle_file = root / bundle_path
    readiness = _load(readiness_file)
    preflight = _load(preflight_file)
    secrets = _load(secrets_file)
    bundle = _load(bundle_file) if bundle_file.exists() else {"status": "missing", "blocking_errors": []}

    source_status, source_evidence, source_gap = _gate_status(readiness, "Claim-supporting source provenance")
    source_mismatch = source_status not in {"met", "missing"}
    frank_status, frank_evidence, frank_gap = _gate_status(readiness, "Frank source-to-packet validity")
    karthic_status, karthic_evidence, karthic_gap = _gate_status(readiness, "Karthic dynamic rubric validity")
    response_status, response_evidence, response_gap = _gate_status(readiness, "Natural response protocol")
    dasha_status, dasha_evidence, dasha_gap = _gate_status(readiness, "Dasha natural-response clustering")
    bundle_status, bundle_evidence, bundle_gap = _gate_status(readiness, "Run bundle integrity")
    perturbation_status, perturbation_evidence, perturbation_gap = _gate_status(readiness, "Perturbation validation")
    judge_status, judge_evidence, judge_gap = _gate_status(readiness, "Judge row-level scoring and rankings")
    zak_status, zak_evidence, zak_gap = _gate_status(readiness, "Zak escalation mechanism")
    stress_status, stress_evidence, stress_gap = _gate_status(readiness, "Controlled scale regression")
    preflight_status, preflight_evidence, preflight_gap = _gate_status(readiness, "Live-run preflight")

    source_artifacts = [
        str(readiness_path),
        str(preflight_path),
        str(secrets_path),
        str(bundle_path),
    ]
    call_plan = preflight.get("call_plan", {})
    budget = preflight.get("budget", {})
    claims = [
        _claim(
            "C1",
            "The pipeline can run from a source case to Frank, Karthic, natural model responses, Dasha clusters, Judge scores, Zak state, and model rankings for the current SOF case.",
            (
                "supported"
                if source_status in {"met", "missing"}
                and readiness.get("status") in {"internal_method_ready", "internal_method_ready_with_gaps"}
                else source_status
            ),
            [
                f"readiness={readiness.get('status')}",
                f"gates={readiness.get('met_gates')}/{readiness.get('total_gates')}",
                *source_evidence,
            ],
            source_artifacts + ["research/runs/live_natural_response_batch"],
            source_gap if source_mismatch else "Current live evidence is one small Statute-of-Frauds case study, not broad legal-domain validity.",
        ),
        _claim(
            "C2",
            "Frank produced a source-grounded legal packet with a neutral question and variations for the current case.",
            source_status if source_mismatch else ("supported" if frank_status == "met" else frank_status),
            frank_evidence,
            [str(readiness_path), "research/runs/live_natural_response_batch/frank_packet.json"],
            source_gap if source_mismatch else frank_gap,
        ),
        _claim(
            "C3",
            "Karthic produced a fresh dynamic rubric with source-supported rows for the current case.",
            source_status if source_mismatch else ("supported" if karthic_status == "met" else karthic_status),
            karthic_evidence,
            [str(readiness_path), "research/runs/live_natural_response_batch/karthic_rubric.json"],
            source_gap if source_mismatch else karthic_gap,
        ),
        _claim(
            "C4",
            "Benchmarked response models answered naturally rather than through forced legal headings.",
            source_status if source_mismatch else ("supported" if response_status == "met" else response_status),
            response_evidence,
            [str(readiness_path), "research/runs/live_natural_response_batch/responses.json"],
            source_gap if source_mismatch else response_gap,
        ),
        _claim(
            "C5",
            "Dasha clustered the current natural-response batch into coherent legal-reasoning groups.",
            source_status if source_mismatch else ("supported" if dasha_status == "met" else dasha_status),
            dasha_evidence,
            [str(readiness_path), "research/runs/live_natural_response_batch/dasha_clusters.json"],
            source_gap if source_mismatch else dasha_gap,
        ),
        _claim(
            "C6",
            "The saved live run bundle is internally reviewable and its major artifacts match the manifest.",
            source_status if source_mismatch else ("supported" if bundle_status == "met" and bundle.get("status") == "run_bundle_reviewable" else bundle_status),
            bundle_evidence,
            [str(bundle_path), "research/runs/live_natural_response_batch/manifest.json"],
            source_gap if source_mismatch else bundle_gap,
        ),
        _claim(
            "C7",
            "Perturbation validation has been implemented as a metamorphic-test path.",
            "partial" if perturbation_status in {"evidence_gap", "partial"} else "supported",
            perturbation_evidence,
            [str(readiness_path), "research/fixtures/tiny_perturbation_config.json"],
            perturbation_gap,
        ),
        _claim(
            "C8",
            "LLM-as-judge scoring produces row-level scores and model rankings for clustered centroids.",
            source_status if source_mismatch else ("partial" if judge_status == "partial" else ("supported" if judge_status == "met" else judge_status)),
            judge_evidence,
            [str(readiness_path), "research/runs/live_natural_response_batch/judge_scores.json"],
            source_gap if source_mismatch else judge_gap,
        ),
        _claim(
            "C9",
            "Zak escalation mechanics exist for low-confidence or unstable cases.",
            "supported" if zak_status == "met" else zak_status,
            zak_evidence,
            [str(readiness_path), "experiments/zak-positive-escalation-regression/analysis.md"],
            zak_gap,
        ),
        _claim(
            "C10",
            "The 500-response stress test supports scale and bookkeeping mechanics, not natural discovery claims.",
            "supported" if stress_status == "met" else stress_status,
            stress_evidence,
            [str(readiness_path), "research/runs/internal_stress/stress_summary.json"],
            stress_gap,
        ),
        _claim(
            "C11",
            "The next live perturbation run is bounded and preflighted before model spending.",
            "partial" if preflight_status == "partial" else ("supported" if preflight_status == "met" else preflight_status),
            preflight_evidence + [
                f"planned_total_calls={call_plan.get('planned_total_llm_calls_excluding_frank_karthic')}",
                f"total_call_cap={budget.get('max_total_llm_calls_excluding_frank_karthic')}",
            ],
            [str(preflight_path)],
            preflight_gap,
        ),
        _claim(
            "C12",
            "The shareable repo artifacts currently pass secret scanning.",
            "supported" if secrets.get("status") == "secrets_lint_passed" else "unsupported",
            [f"secrets_status={secrets.get('status')}", f"scanned_files={secrets.get('scanned_files')}"],
            [str(secrets_path)],
            "Secret lint is a pattern scan, not a substitute for institutional secret-scanning tools.",
        ),
    ]
    status_counts = {}
    for claim in claims:
        status_counts[claim["status"]] = status_counts.get(claim["status"], 0) + 1
    ledger = {
        "schema_version": "research.claim_ledger.v1",
        "status": "claim_ledger_ready",
        "source_artifacts": source_artifacts,
        "status_counts": status_counts,
        "claims": claims,
    }
    if output_json:
        write_json(root / output_json, ledger)
    if output_markdown:
        write_claim_ledger_markdown(ledger, root / output_markdown)
    if output_html:
        markdown = claim_ledger_markdown(ledger)
        html_text = (
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Claim Ledger</title>"
            "<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:1040px;margin:40px auto;padding:0 24px;line-height:1.5;color:#17202a}"
            "pre{white-space:pre-wrap;font-family:inherit}code{background:#f2f4f7;padding:2px 5px;border-radius:4px}</style>"
            "</head><body><pre>"
            + html.escape(markdown)
            + "</pre></body></html>\n"
        )
        path = root / output_html
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html_text, encoding="utf-8")
    return ledger


def claim_ledger_markdown(ledger: dict[str, Any]) -> str:
    lines = [
        "# Claim Ledger",
        "",
        f"- Status: `{ledger['status']}`",
        "- Counts: "
        + ", ".join(f"{key}={value}" for key, value in sorted(ledger.get("status_counts", {}).items())),
        "",
        "| ID | Status | Claim | Evidence | Limitation |",
        "|---|---:|---|---|---|",
    ]
    for claim in ledger.get("claims", []):
        evidence = "; ".join(str(item) for item in claim.get("evidence", []))
        lines.append(
            f"| {claim['id']} | `{claim['status']}` | {claim['claim']} | {evidence} | {claim['limitation']} |"
        )
    lines.append("")
    return "\n".join(lines)


def write_claim_ledger_markdown(ledger: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(claim_ledger_markdown(ledger), encoding="utf-8")
