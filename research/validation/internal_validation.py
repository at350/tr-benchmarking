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

    rows = rubric.get("rows", [])
    cluster_count = len(clusters.get("clusters", []))
    response_count = len(responses)
    model_count = len({response.get("model") for response in responses})
    row_score_count = sum(len(cluster.get("row_scores", [])) for cluster in judge.get("cluster_scores", []))
    expected_row_score_count = cluster_count * len(rows)
    quality_errors = manifest.get("quality_errors", [])
    non_latin_flags = _unexpected_non_latin_text(clusters)

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
            "passed": cluster_count > 0 and _cluster_purity(clusters) >= 0.95 and not non_latin_flags,
            "evidence": [
                f"responses={response_count}",
                f"clusters={cluster_count}",
                f"cluster_purity={_cluster_purity(clusters)}",
                f"mean_centroid_text_similarity={_centroid_similarity(clusters)}",
                f"non_latin_signal_flags={len(non_latin_flags)}",
            ],
        },
        "judge": {
            "passed": expected_row_score_count > 0 and row_score_count == expected_row_score_count and bool(judge.get("model_rankings")),
            "evidence": [
                f"judge_model={str(judge.get('mode', '')).split(':')[-1] if judge.get('mode') else 'unknown'}",
                f"row_scores={row_score_count}",
                f"agreement_score={judge.get('agreement_score')}",
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
        },
        "stage_checks": stage_checks,
        "judge_score_stats": _judge_score_stats(judge),
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


def build_natural_response_audit(run_dir: str | Path) -> dict[str, Any]:
    """Summarize Dasha clustering on natural, unlabeled model answers."""

    run = Path(run_dir)
    responses = _load(run, "responses.json")
    clusters = _load(run, "dasha_clusters.json")
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

    passed = (
        len(responses) > 0
        and expected_label_count == 0
        and len(question_ids) == 1
        and len(clustered_ids) == len(responses)
        and not duplicate_clustered_ids
        and not missing_clustered_ids
        and len(clusters.get("clusters", [])) > 0
    )
    summary = {
        "schema_version": "research.natural_response_audit.v1",
        "status": "natural_response_audit_passed" if passed else "needs_natural_response_review",
        "run_id": _load(run, "manifest.json").get("run_id"),
        "response_count": len(responses),
        "model_count": len(model_names),
        "models": model_names,
        "question_count": len(question_ids),
        "expected_label_count": expected_label_count,
        "cluster_count": len(clusters.get("clusters", [])),
        "clustered_response_count": len(clustered_ids),
        "duplicate_clustered_response_ids": duplicate_clustered_ids,
        "missing_clustered_response_ids": missing_clustered_ids,
        "clusters": cluster_summaries,
        "interpretation": (
            "This audit checks Dasha on model answers generated before clustering. "
            "It does not use preassigned expected reasoning categories."
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
        r"\subsection{Model Response Examples}",
        "",
        r"\begin{tabular}{p{0.18\linewidth}p{0.13\linewidth}p{0.61\linewidth}}",
        r"\toprule",
        r"Model & Dasha cluster & Response excerpt \\",
        r"\midrule",
    ]
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
