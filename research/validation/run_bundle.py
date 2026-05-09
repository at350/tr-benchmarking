"""Run-bundle integrity checks for source-to-score research artifacts."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from .utils import stable_hash, write_json


CORE_ARTIFACTS = {
    "manifest": "manifest.json",
    "frank_packet": "frank_packet.json",
    "karthic_rubric": "karthic_rubric.json",
    "responses": "responses.json",
    "dasha_clusters": "dasha_clusters.json",
    "judge_scores": "judge_scores.json",
    "zak_packets": "zak_packets.json",
    "report": "report.md",
}

HASHED_ARTIFACTS = {
    "frank_packet": "frank_packet.json",
    "karthic_rubric": "karthic_rubric.json",
    "dasha_clusters": "dasha_clusters.json",
    "judge_scores": "judge_scores.json",
    "zak_packets": "zak_packets.json",
    "perturbation_report": "perturbation_report.json",
}


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _check(passed: bool, message: str, severity: str = "error", details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "passed": passed,
        "severity": severity,
        "message": message,
        "details": details or {},
    }


def _expected_response_count(manifest: dict[str, Any]) -> int | None:
    planned_tracks = 1
    call_plan = manifest.get("planned_call_counts")
    if isinstance(call_plan, dict) and isinstance(call_plan.get("planned_question_tracks"), int):
        planned_tracks = max(1, call_plan["planned_question_tracks"])
    elif isinstance(manifest.get("question_tracks"), list) and manifest["question_tracks"]:
        planned_tracks = len(manifest["question_tracks"])

    specs = manifest.get("response_models")
    if isinstance(specs, list) and specs:
        total = 0
        for spec in specs:
            if not isinstance(spec, dict):
                return None
            samples = spec.get("samples")
            if not isinstance(samples, int):
                return None
            total += samples
        return total * planned_tracks
    models = manifest.get("models")
    per_model = manifest.get("responses_per_model")
    if isinstance(models, list) and isinstance(per_model, int) and per_model > 0:
        return len(models) * per_model * planned_tracks
    return None


def _markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Run Bundle Integrity Audit",
        "",
        f"- Status: `{summary['status']}`",
        f"- Run: `{summary['run_id']}`",
        f"- Run directory: `{summary['run_dir']}`",
        "",
        "| Check | Severity | Status |",
        "|---|---:|---:|",
    ]
    for check in summary["checks"]:
        status = "pass" if check["passed"] else "fail"
        lines.append(f"| {check['message']} | `{check['severity']}` | `{status}` |")
    lines.append("")
    return "\n".join(lines)


def build_run_bundle_audit(
    run_dir: str | Path,
    *,
    repo_root: str | Path | None = None,
    output_json: str | Path | None = None,
    output_markdown: str | Path | None = None,
    output_html: str | Path | None = None,
) -> dict[str, Any]:
    """Verify that a run bundle is internally consistent and reviewable."""

    run = Path(run_dir).resolve()
    root = Path(repo_root).resolve() if repo_root is not None else Path.cwd().resolve()
    try:
        run_label = str(run.relative_to(root))
    except ValueError:
        run_label = str(Path(run_dir))
    checks: list[dict[str, Any]] = []
    loaded: dict[str, Any] = {}

    for name, filename in CORE_ARTIFACTS.items():
        path = run / filename
        exists = path.exists()
        checks.append(_check(exists, f"{filename} exists"))
        if not exists:
            continue
        if path.suffix == ".json":
            try:
                loaded[name] = _load_json(path)
                checks.append(_check(True, f"{filename} parses as JSON"))
            except json.JSONDecodeError as exc:
                checks.append(_check(False, f"{filename} parses as JSON", details={"error": str(exc)}))

    manifest = loaded.get("manifest", {}) if isinstance(loaded.get("manifest"), dict) else {}
    frank = loaded.get("frank_packet", {}) if isinstance(loaded.get("frank_packet"), dict) else {}
    rubric = loaded.get("karthic_rubric", {}) if isinstance(loaded.get("karthic_rubric"), dict) else {}
    responses = loaded.get("responses", []) if isinstance(loaded.get("responses"), list) else []
    clusters = loaded.get("dasha_clusters", {}) if isinstance(loaded.get("dasha_clusters"), dict) else {}
    judge = loaded.get("judge_scores", {}) if isinstance(loaded.get("judge_scores"), dict) else {}
    zak = loaded.get("zak_packets", {}) if isinstance(loaded.get("zak_packets"), dict) else {}

    checks.append(_check(manifest.get("schema_version") == "research.manifest.v1", "manifest schema is research.manifest.v1"))
    checks.append(_check(manifest.get("pipeline_status") == "internal_validation_ready", "manifest pipeline status is internal_validation_ready"))
    checks.append(_check(not manifest.get("quality_errors"), "manifest records no quality errors"))

    artifact_hashes = manifest.get("artifact_hashes", {}) if isinstance(manifest.get("artifact_hashes"), dict) else {}
    for artifact_name, filename in HASHED_ARTIFACTS.items():
        path = run / filename
        expected = artifact_hashes.get(artifact_name)
        if not expected and not path.exists():
            checks.append(_check(True, f"{filename} has no recorded hash because it is absent", severity="warning"))
            continue
        if not expected:
            checks.append(_check(False, f"{filename} has a manifest hash"))
            continue
        if not path.exists():
            checks.append(_check(False, f"{filename} exists for recorded manifest hash"))
            continue
        actual = stable_hash(_load_json(path))
        checks.append(
            _check(
                actual == expected,
                f"{filename} matches manifest hash",
                details={"expected": expected, "actual": actual},
            )
        )

    expected_count = _expected_response_count(manifest)
    if expected_count is not None:
        checks.append(
            _check(
                len(responses) == expected_count,
                "response count matches configured model sample plan",
                details={"expected": expected_count, "actual": len(responses)},
            )
        )
    checks.append(_check(manifest.get("response_prompt_style") == "natural", "response prompt style is natural"))
    checks.append(_check(all(response.get("response_prompt_style") == "natural" for response in responses), "all responses record natural prompt style"))
    checks.append(_check(all(response.get("id") and response.get("model") and response.get("text") for response in responses), "all responses have id, model, and text"))

    response_ids = {response.get("id") for response in responses}
    member_ids = {
        member_id
        for cluster in clusters.get("clusters", [])
        for member_id in cluster.get("member_response_ids", [])
    }
    checks.append(_check(bool(member_ids), "Dasha clusters include member response ids"))
    checks.append(
        _check(
            member_ids.issubset(response_ids),
            "Dasha member ids are present in responses.json",
            details={"missing": sorted(str(item) for item in member_ids - response_ids)},
        )
    )
    checks.append(_check(len(judge.get("cluster_scores", [])) == len(clusters.get("clusters", [])), "judge has one score block per Dasha cluster"))
    checks.append(_check("model_rankings" in judge and bool(judge.get("model_rankings")), "judge includes model rankings"))
    checks.append(_check("packets" in zak, "Zak artifact includes packets list"))

    blocking = [check for check in checks if not check["passed"] and check["severity"] == "error"]
    warning_count = sum(1 for check in checks if not check["passed"] and check["severity"] == "warning")
    summary = {
        "schema_version": "research.run_bundle_audit.v1",
        "status": "run_bundle_reviewable" if not blocking else "run_bundle_needs_review",
        "run_id": manifest.get("run_id", run.name),
        "run_dir": run_label,
        "checks": checks,
        "blocking_errors": blocking,
        "warning_count": warning_count,
        "counts": {
            "responses": len(responses),
            "clusters": len(clusters.get("clusters", [])),
            "rubric_rows": len(rubric.get("rows", [])),
            "zak_packets": len(zak.get("packets", [])),
        },
        "source": {
            "doctrine_family": frank.get("doctrine_family"),
            "frank_packet_id": frank.get("id"),
            "rubric_id": rubric.get("id"),
        },
    }
    if output_json:
        write_json(Path(output_json), summary)
    if output_markdown:
        markdown_path = Path(output_markdown)
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(_markdown(summary), encoding="utf-8")
    if output_html:
        html_path = Path(output_html)
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Run Bundle Integrity Audit</title>"
            "<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:1040px;margin:40px auto;padding:0 24px;line-height:1.5;color:#17202a}"
            "pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>"
            + html.escape(_markdown(summary))
            + "</pre></body></html>\n",
            encoding="utf-8",
        )
    return summary
