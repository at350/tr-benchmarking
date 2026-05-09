"""Internal validation summaries for research calibration."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from statistics import mean, pstdev
from typing import Any

from .dasha import _normalized_signature
from .metrics import bootstrap_ci
from .utils import write_json


def _latex_escape(value: str) -> str:
    return (
        value.replace("\\", r"\textbackslash{}")
        .replace("&", r"\&")
        .replace("%", r"\%")
        .replace("$", r"\$")
        .replace("#", r"\#")
        .replace("_", r"\_")
        .replace("{", r"\{")
        .replace("}", r"\}")
    )


def _latex_cell(value: Any, limit: int = 500) -> str:
    text = re.sub(r"\s+", " ", str(value)).strip()
    if len(text) > limit:
        text = text[: limit - 3].rstrip() + "..."
    return _latex_escape(text)


def _response_cluster_lookup(clusters: dict[str, Any]) -> dict[str, str]:
    lookup = {}
    for cluster in clusters.get("clusters", []):
        for response_id in cluster.get("member_response_ids", []):
            lookup[str(response_id)] = str(cluster.get("id", "unknown"))
    return lookup


def _load(run_dir: Path, name: str) -> dict[str, Any] | list[dict[str, Any]]:
    return json.loads((run_dir / name).read_text(encoding="utf-8"))


def _cluster_purity(clusters: dict[str, Any]) -> float:
    values = []
    for cluster in clusters.get("clusters", []):
        members = cluster.get("members", [])
        if len(members) <= 1:
            values.append(1.0)
            continue
        signatures = []
        for member in members:
            if member.get("expected_reasoning_label"):
                signatures.append(str(member["expected_reasoning_label"]))
            elif member.get("reasoning_signature"):
                signatures.append(json.dumps(_normalized_signature(member["reasoning_signature"]), sort_keys=True))
            else:
                signature = member.get("legal_signal")
                signatures.append(json.dumps(signature, sort_keys=True))
        if not signatures:
            values.append(0.0)
            continue
        majority = max(signatures.count(item) for item in set(signatures))
        values.append(majority / len(members))
    return round(mean(values), 3) if values else 0.0


def _centroid_similarity(clusters: dict[str, Any]) -> float:
    values = [
        float(cluster.get("centroid_quality", {}).get("mean_text_similarity", 0.0))
        for cluster in clusters.get("clusters", [])
    ]
    return round(mean(values), 3) if values else 0.0


def _member_cluster_key(member: dict[str, Any]) -> tuple[str, ...]:
    if "_dasha_normalized_signature" in member:
        return tuple(str(item) for item in member["_dasha_normalized_signature"])
    if member.get("reasoning_signature"):
        return tuple(str(item) for item in _normalized_signature(member["reasoning_signature"]))
    signal = member.get("legal_signal", {})
    if signal:
        return tuple(str(signal.get(key, "")) for key in ("gate", "outcome", "exception", "reasoning"))
    return ("unknown",)


def _cluster_expected_key(cluster: dict[str, Any]) -> tuple[str, ...]:
    if cluster.get("normalized_cluster_key"):
        return tuple(str(item) for item in cluster["normalized_cluster_key"])
    members = cluster.get("members", [])
    if members:
        return _member_cluster_key(members[0])
    signal = cluster.get("legal_signal", {})
    if signal:
        return tuple(str(signal.get(key, "")) for key in ("gate", "outcome", "exception", "reasoning"))
    return ("unknown",)


def build_dasha_member_audit(clusters: dict[str, Any]) -> dict[str, Any]:
    """Assess whether each cluster member agrees with its centroid key."""

    cluster_audits = []
    total_checked = 0
    total_mismatched = 0
    for cluster in clusters.get("clusters", []):
        expected_key = _cluster_expected_key(cluster)
        mismatches = []
        for member in cluster.get("members", []):
            total_checked += 1
            member_key = _member_cluster_key(member)
            if member_key != expected_key:
                total_mismatched += 1
                mismatches.append({
                    "response_id": member.get("id", "unknown"),
                    "expected_key": list(expected_key),
                    "member_key": list(member_key),
                })
        checked = len(cluster.get("members", []))
        cluster_audits.append({
            "cluster_id": cluster.get("id", "unknown"),
            "member_count": checked,
            "mismatch_count": len(mismatches),
            "coherence": round((checked - len(mismatches)) / checked, 3) if checked else 0.0,
            "mismatches": mismatches,
        })
    coherence = round((total_checked - total_mismatched) / total_checked, 3) if total_checked else 0.0
    return {
        "schema_version": "research.dasha_member_audit.v1",
        "status": "member_audit_passed" if total_checked and total_mismatched == 0 else "needs_member_review",
        "checked_members": total_checked,
        "mismatched_members": total_mismatched,
        "overall_coherence": coherence,
        "clusters": cluster_audits,
    }


def _judge_score_stats(judge: dict[str, Any]) -> dict[str, Any]:
    scores = [float(item.get("weighted_score", 0.0)) for item in judge.get("cluster_scores", [])]
    low, high = bootstrap_ci(scores, iterations=500, seed=11) if scores else (0.0, 0.0)
    return {
        "cluster_score_mean": round(mean(scores), 3) if scores else 0.0,
        "cluster_score_sd": round(pstdev(scores), 3) if len(scores) > 1 else 0.0,
        "bootstrap_ci_low": round(low, 3),
        "bootstrap_ci_high": round(high, 3),
    }


def _unexpected_non_latin_text(clusters: dict[str, Any]) -> list[str]:
    flags = []
    pattern = re.compile(r"[\u0400-\u04FF\u0370-\u03FF\u0590-\u05FF\u0600-\u06FF]")
    for cluster in clusters.get("clusters", []):
        signal = json.dumps(cluster.get("legal_signal", {}), ensure_ascii=False)
        if pattern.search(signal):
            flags.append(cluster.get("id", "unknown"))
    return flags


def build_internal_validation_summary(run_dir: str | Path) -> dict[str, Any]:
    run = Path(run_dir)
    manifest = _load(run, "manifest.json")
    frank = _load(run, "frank_packet.json")
    rubric = _load(run, "karthic_rubric.json")
    responses = _load(run, "responses.json")
    clusters = _load(run, "dasha_clusters.json")
    judge = _load(run, "judge_scores.json")
    zak = _load(run, "zak_packets.json")
    perturbation_report = _load(run, "perturbation_report.json") if (run / "perturbation_report.json").exists() else {
        "status": "not_configured",
        "checks": [],
    }

    rows = rubric.get("rows", [])
    cluster_count = len(clusters.get("clusters", []))
    clustering_config = manifest.get("clustering", {}) if isinstance(manifest.get("clustering"), dict) else {}
    response_count = len(responses)
    model_count = len({response.get("model") for response in responses})
    default_min_clusters = 2 if response_count >= 5 and model_count >= 2 else 1
    min_observed_clusters = int(clustering_config.get("min_observed_clusters", default_min_clusters))
    row_score_count = sum(len(cluster.get("row_scores", [])) for cluster in judge.get("cluster_scores", []))
    expected_row_score_count = cluster_count * len(rows)
    quality_errors = manifest.get("quality_errors", [])
    non_latin_flags = _unexpected_non_latin_text(clusters)
    dasha_member_audit = build_dasha_member_audit(clusters)

    stage_checks = {
        "frank": {
            "passed": not any("Frank" in error for error in quality_errors),
            "evidence": [
                f"doctrine={frank.get('doctrine_family')}",
                f"question_chars={len(str(frank.get('neutral_question', '')))}",
                f"variations={len(frank.get('variations', []))}",
            ],
        },
        "karthic": {
            "passed": not any("Rubric" in error for error in quality_errors),
            "evidence": [
                f"rows={len(rows)}",
                "categories=" + ",".join(sorted({str(row.get("category")) for row in rows})),
            ],
        },
        "dasha": {
            "passed": (
                cluster_count >= min_observed_clusters
                and _cluster_purity(clusters) >= 0.95
                and dasha_member_audit["status"] == "member_audit_passed"
                and not non_latin_flags
            ),
            "evidence": [
                f"responses={response_count}",
                f"clusters={cluster_count}",
                f"min_observed_clusters={min_observed_clusters}",
                f"cluster_purity={_cluster_purity(clusters)}",
                f"member_coherence={dasha_member_audit['overall_coherence']}",
                f"mean_centroid_text_similarity={_centroid_similarity(clusters)}",
                f"non_latin_signal_flags={len(non_latin_flags)}",
            ],
        },
        "judge": {
            "passed": (
                expected_row_score_count > 0
                and row_score_count == expected_row_score_count
                and bool(judge.get("model_rankings"))
                and judge.get("judge_stability", {}).get("status", "not_repeated") != "needs_review"
            ),
            "evidence": [
                f"judge_model={str(judge.get('mode', '')).split(':')[-1] if judge.get('mode') else 'unknown'}",
                f"judge_panel={len(judge.get('judge_panel', [])) or 1}",
                f"row_scores={row_score_count}",
                f"agreement_score={judge.get('agreement_score')}",
                f"stability={judge.get('judge_stability', {}).get('status', 'not_repeated')}",
                f"judge_repeats={judge.get('judge_stability', {}).get('repeat_count', 1)}",
                f"model_rankings={len(judge.get('model_rankings', []))}",
            ],
        },
        "zak": {
            "passed": "packets" in zak,
            "evidence": [
                f"needs_zak={judge.get('needs_zak')}",
                f"packets={len(zak.get('packets', []))}",
            ],
        },
    }
    if perturbation_report.get("status") != "not_configured":
        checks = perturbation_report.get("checks", [])
        stage_checks["perturbations"] = {
            "passed": perturbation_report.get("status") == "perturbation_validation_passed",
            "evidence": [
                f"tracks={perturbation_report.get('track_count')}",
                f"invariant_checks={sum(1 for check in checks if check.get('perturbation_type') == 'invariant')}",
                f"material_checks={sum(1 for check in checks if check.get('perturbation_type') == 'material')}",
                f"status={perturbation_report.get('status')}",
            ],
        }
    all_passed = all(stage["passed"] for stage in stage_checks.values()) and not quality_errors
    summary = {
        "schema_version": "research.internal_validation.v1",
        "run_id": manifest.get("run_id"),
        "status": "internal_validation_passed" if all_passed else "needs_engineering_iteration",
        "quality_errors": quality_errors,
        "counts": {
            "responses": response_count,
            "models": model_count,
            "rubric_rows": len(rows),
            "clusters": cluster_count,
            "zak_packets": len(zak.get("packets", [])),
            "perturbation_tracks": perturbation_report.get("track_count", 0),
        },
        "stage_checks": stage_checks,
        "dasha_member_audit": dasha_member_audit,
        "judge_score_stats": _judge_score_stats(judge),
        "judge_stability": judge.get("judge_stability", {}),
        "model_rankings": judge.get("model_rankings", []),
    }
    write_json(run / "internal_validation_summary.json", summary)
    return summary


def write_internal_validation_table(summary: dict[str, Any], table_path: str | Path) -> None:
    path = Path(table_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        r"\begin{tabular}{lll}",
        r"\toprule",
        r"Stage & Status & Evidence \\",
        r"\midrule",
    ]
    for stage, data in summary["stage_checks"].items():
        status = "pass" if data["passed"] else "review"
        evidence = _latex_escape("; ".join(data["evidence"]))
        lines.append(f"{_latex_escape(stage.title())} & {status} & {evidence} \\\\")
    lines.extend([r"\bottomrule", r"\end{tabular}", ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_perturbation_validation_table(run_dir: str | Path, table_path: str | Path) -> None:
    run = Path(run_dir)
    report = _load(run, "perturbation_report.json")
    path = Path(table_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        r"\begin{tabular}{llll}",
        r"\toprule",
        r"Track & Type & Comparison & Status \\",
        r"\midrule",
    ]
    for check in report.get("checks", []):
        if check.get("perturbation_type") == "base":
            continue
        status = "pass" if check.get("passed") else "review"
        lines.append(
            f"{_latex_cell(check.get('track_id', 'unknown'), limit=80)} & "
            f"{_latex_cell(check.get('perturbation_type', 'unknown'), limit=40)} & "
            f"{_latex_cell(check.get('comparison', 'unknown'), limit=80)} & "
            f"{status} \\\\"
        )
    lines.extend([r"\bottomrule", r"\end{tabular}", ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def build_natural_response_audit(run_dir: str | Path) -> dict[str, Any]:
    """Summarize Dasha clustering on natural, unlabeled model answers."""

    run = Path(run_dir)
    responses = _load(run, "responses.json")
    clusters = _load(run, "dasha_clusters.json")
    manifest = _load(run, "manifest.json")
    clustering_config = manifest.get("clustering", {}) if isinstance(manifest.get("clustering"), dict) else {}
    default_min_clusters = 2 if len(responses) >= 5 and len({response.get("model") for response in responses}) >= 2 else 1
    min_observed_clusters = int(clustering_config.get("min_observed_clusters", default_min_clusters))
    response_ids = {str(response.get("id")) for response in responses}
    clustered_ids = [
        str(response_id)
        for cluster in clusters.get("clusters", [])
        for response_id in cluster.get("member_response_ids", [])
    ]
    duplicate_clustered_ids = [
        response_id
        for response_id, count in Counter(clustered_ids).items()
        if count > 1
    ]
    missing_clustered_ids = sorted(response_ids - set(clustered_ids))
    expected_label_count = sum(1 for response in responses if "expected_reasoning_label" in response)
    question_ids = {str(response.get("question_id", "unknown")) for response in responses}
    model_names = sorted({str(response.get("model", "unknown")) for response in responses})
    cluster_summaries = []
    dasha_member_audit = build_dasha_member_audit(clusters)
    for cluster in clusters.get("clusters", []):
        members = cluster.get("members", [])
        member_models = sorted({str(member.get("model", "unknown")) for member in members})
        signal = cluster.get("legal_signal", {})
        cluster_summaries.append({
            "id": cluster.get("id", "unknown"),
            "size": len(members),
            "member_models": member_models,
            "representative_response_id": cluster.get("representative_response_id"),
            "outcome": signal.get("outcome") or signal.get("conclusion", "unknown"),
            "reasoning_signature_excerpt": signal.get("reasoning_path") or signal.get("rule_trigger") or signal.get("conclusion", ""),
        })

    coverage_passed = (
        len(responses) > 0
        and expected_label_count == 0
        and len(question_ids) == 1
        and len(clustered_ids) == len(responses)
        and not duplicate_clustered_ids
        and not missing_clustered_ids
        and len(clusters.get("clusters", [])) > 0
    )
    diversity_passed = len(clusters.get("clusters", [])) >= min_observed_clusters
    passed = coverage_passed and diversity_passed
    passed = passed and dasha_member_audit["status"] == "member_audit_passed"
    summary = {
        "schema_version": "research.natural_response_audit.v1",
        "status": "natural_response_audit_passed" if passed else "needs_natural_response_review",
        "run_id": manifest.get("run_id"),
        "response_count": len(responses),
        "model_count": len(model_names),
        "models": model_names,
        "question_count": len(question_ids),
        "expected_label_count": expected_label_count,
        "cluster_count": len(clusters.get("clusters", [])),
        "min_observed_clusters": min_observed_clusters,
        "coverage_passed": coverage_passed,
        "diversity_passed": diversity_passed,
        "divergence_status": "observed_reasoning_divergence" if diversity_passed else "no_observed_reasoning_divergence",
        "clustered_response_count": len(clustered_ids),
        "duplicate_clustered_response_ids": duplicate_clustered_ids,
        "missing_clustered_response_ids": missing_clustered_ids,
        "member_audit": dasha_member_audit,
        "clusters": cluster_summaries,
        "interpretation": (
            "This audit checks Dasha on model answers generated before clustering. "
            "It does not use preassigned expected reasoning categories. A one-cluster "
            "result is acceptable only for smoke testing; Dasha discovery validation "
            "requires a tricky question and a model roster that produces multiple "
            "observed reasoning paths."
        ),
    }
    write_json(run / "natural_response_audit.json", summary)
    return summary


def write_natural_response_audit_table(summary: dict[str, Any], table_path: str | Path) -> None:
    path = Path(table_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [
        ("Unlabeled model responses", str(summary["response_count"])),
        ("Distinct response models", str(summary["model_count"])),
        ("Frank questions answered", str(summary["question_count"])),
        ("Preassigned reasoning labels", str(summary["expected_label_count"])),
        ("Observed Dasha clusters", str(summary["cluster_count"])),
        ("Member/centroid coherence", str(summary.get("member_audit", {}).get("overall_coherence", "unknown"))),
        ("Minimum target clusters", str(summary["min_observed_clusters"])),
        ("Divergence status", str(summary["divergence_status"])),
        ("Clustered responses", str(summary["clustered_response_count"])),
        ("Audit status", str(summary["status"])),
    ]
    lines = [
        r"\begin{tabular}{ll}",
        r"\toprule",
        r"Check & Value \\",
        r"\midrule",
        *[f"{_latex_escape(name)} & {_latex_escape(value)} \\\\" for name, value in rows],
        r"\bottomrule",
        r"\end{tabular}",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def write_artifact_examples_section(run_dir: str | Path, section_path: str | Path) -> None:
    run = Path(run_dir)
    responses = _load(run, "responses.json")
    clusters = _load(run, "dasha_clusters.json")
    response_cluster = _response_cluster_lookup(clusters)
    natural_prompt = all(
        response.get("answer_format") is None or response.get("answer_format") == "natural_unconstrained"
        for response in responses
    )
    path = Path(section_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        r"\section{Artifact Examples}",
        "",
        (
            "This appendix shows concrete artifacts from the live internal-validation "
            "run. The examples are generated from the run bundle rather than rewritten "
            "by hand."
        ),
        "",
    ]
    if not natural_prompt:
        lines.extend([
            (
                "Important limitation: these response examples come from a legacy "
                "structured-prompt smoke run. They demonstrate the artifact surface, "
                "but they are not final evidence of natural model response behavior. "
                "The corrected live protocol uses natural, question-only prompts. "
                "For that reason, the response and cluster example tables are withheld "
                "from this manuscript until the next live natural-prompt run is generated."
            ),
            "",
        ])
        path.write_text("\n".join(lines), encoding="utf-8")
        return
    lines.extend([
        r"\subsection{Model Response Examples}",
        "",
        r"\begin{tabular}{p{0.18\linewidth}p{0.13\linewidth}p{0.61\linewidth}}",
        r"\toprule",
        r"Model & Dasha cluster & Response excerpt \\",
        r"\midrule",
    ])
    for response in responses:
        model = _latex_cell(response.get("model", "unknown"), limit=80)
        cluster_id = _latex_cell(response_cluster.get(str(response.get("id")), "unclustered"), limit=40)
        excerpt = _latex_cell(response.get("text", ""), limit=700)
        lines.append(f"{model} & {cluster_id} & {excerpt} \\\\")
    lines.extend([r"\bottomrule", r"\end{tabular}", ""])

    lines.extend([
        r"\subsection{Dasha Cluster Examples}",
        "",
        r"\begin{tabular}{p{0.12\linewidth}p{0.22\linewidth}p{0.22\linewidth}p{0.34\linewidth}}",
        r"\toprule",
        r"Cluster & Member models & Outcome & Reasoning signature excerpt \\",
        r"\midrule",
    ])
    for cluster in clusters.get("clusters", []):
        members = cluster.get("members", [])
        member_models = ", ".join(str(member.get("model", "unknown")) for member in members)
        signal = cluster.get("legal_signal", {})
        reasoning = signal.get("reasoning_path") or signal.get("conclusion") or signal.get("outcome", "")
        lines.append(
            f"{_latex_cell(cluster.get('id', 'unknown'), limit=40)} & "
            f"{_latex_cell(member_models, limit=180)} & "
            f"{_latex_cell(signal.get('outcome', 'unknown'), limit=220)} & "
            f"{_latex_cell(reasoning, limit=620)} \\\\"
        )
    lines.extend([r"\bottomrule", r"\end{tabular}", ""])
    path.write_text("\n".join(lines), encoding="utf-8")
