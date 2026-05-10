"""Internal validation summaries for research calibration."""

from __future__ import annotations

import ast
import json
import math
import re
from collections import Counter
from pathlib import Path
from statistics import mean, pstdev
from typing import Any

from .dasha import _normalized_signature
from .metrics import bootstrap_ci, permutation_p_value_tvd, wilson_ci
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
    text = (
        text.replace("✓", "satisfied")
        .replace("→", r"\(\rightarrow\)")
        .replace("—", "-")
        .replace("–", "-")
        .replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
    )
    if len(text) > limit:
        text = text[: limit - 3].rstrip() + "..."
    return _latex_escape(text)


def _response_cluster_lookup(clusters: dict[str, Any]) -> dict[str, str]:
    lookup = {}
    for cluster in clusters.get("clusters", []):
        for response_id in cluster.get("member_response_ids", []):
            lookup[str(response_id)] = str(cluster.get("id", "unknown"))
    return lookup


def _member_model_summary(members: list[dict[str, Any]]) -> str:
    counts = Counter(str(member.get("model", "unknown")) for member in members)
    if not counts:
        return "unknown"
    parts = []
    for model, count in sorted(counts.items()):
        parts.append(f"{model} (n={count})" if count > 1 else model)
    return ", ".join(parts)


def _load(run_dir: Path, name: str) -> dict[str, Any] | list[dict[str, Any]]:
    return json.loads((run_dir / name).read_text(encoding="utf-8"))


def _gold_answer_excerpt(gold_answer: Any) -> str:
    if isinstance(gold_answer, str) and gold_answer.strip().startswith("{"):
        try:
            parsed = ast.literal_eval(gold_answer)
            if isinstance(parsed, dict):
                gold_answer = parsed
        except (SyntaxError, ValueError):
            pass
    if isinstance(gold_answer, dict):
        preferred = (
            "Bottom-line outcome",
            "Controlling doctrine",
            "Writing requirement and trigger",
        )
        parts = [f"{key}: {gold_answer[key]}" for key in preferred if gold_answer.get(key)]
        if parts:
            return " ".join(parts)
    return str(gold_answer)


def _row_support_excerpt(row: dict[str, Any]) -> str:
    support = row.get("source_support", [])
    if isinstance(support, list):
        return "; ".join(str(item) for item in support)
    return str(support)


def _representative_judge_rows(judge: dict[str, Any], limit: int = 8) -> list[tuple[str, dict[str, Any]]]:
    selected: list[tuple[str, dict[str, Any]]] = []
    preferred_rows = {"R0", "R1", "R4", "R6", "R8"}
    for cluster_score in judge.get("cluster_scores", []):
        cluster_id = str(cluster_score.get("cluster_id", "unknown"))
        for row in cluster_score.get("row_scores", []):
            if str(row.get("row_id", "")) in preferred_rows:
                selected.append((cluster_id, row))
                break
        if len(selected) >= limit:
            break
    if len(selected) < limit:
        for cluster_score in judge.get("cluster_scores", []):
            cluster_id = str(cluster_score.get("cluster_id", "unknown"))
            for row in cluster_score.get("row_scores", []):
                item = (cluster_id, row)
                if item not in selected:
                    selected.append(item)
                if len(selected) >= limit:
                    return selected
    return selected


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


def _response_track(response: dict[str, Any]) -> str:
    return str(response.get("track_id") or str(response.get("question_id", "original")).split(":")[-1])


def _cluster_signal_label(cluster: dict[str, Any]) -> str:
    signal = cluster.get("legal_signal", {})
    if signal.get("outcome_id"):
        return str(signal["outcome_id"])
    key = cluster.get("normalized_cluster_key", [])
    if len(key) >= 3:
        return str(key[2])
    return str(signal.get("outcome") or signal.get("conclusion") or cluster.get("id", "unknown"))


def _cluster_track(cluster: dict[str, Any]) -> str:
    members = cluster.get("members", [])
    if members:
        return _response_track(members[0])
    cluster_id = str(cluster.get("id", ""))
    if "__" in cluster_id:
        return cluster_id.split("__", 1)[0]
    return "unknown"


def _entropy(labels: list[str]) -> float:
    if not labels:
        return 0.0
    counts = Counter(labels)
    total = len(labels)
    return -sum((count / total) * math.log(count / total) for count in counts.values())


def _dominant_label(labels: list[str]) -> str:
    if not labels:
        return "unknown"
    return Counter(labels).most_common(1)[0][0]


def build_statistical_validation_summary(
    run_dir: str | Path,
    stress_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Build inferential and uncertainty diagnostics for the reported run."""

    run = Path(run_dir)
    responses = _load(run, "responses.json")
    clusters = _load(run, "dasha_clusters.json")
    judge = _load(run, "judge_scores.json")
    perturbation_report = _load(run, "perturbation_report.json") if (run / "perturbation_report.json").exists() else {}
    internal = _load(run, "internal_validation_summary.json") if (run / "internal_validation_summary.json").exists() else build_internal_validation_summary(run)

    response_to_cluster = {}
    response_to_label = {}
    cluster_labels = []
    cluster_sizes = []
    feature_similarities = []
    text_similarities = []
    for cluster in clusters.get("clusters", []):
        label = _cluster_signal_label(cluster)
        cluster_labels.append(label)
        cluster_sizes.append(len(cluster.get("member_response_ids", [])))
        feature_similarities.append(float(cluster.get("centroid_quality", {}).get("mean_feature_similarity", 0.0)))
        text_similarities.append(float(cluster.get("centroid_quality", {}).get("mean_text_similarity", 0.0)))
        for response_id in cluster.get("member_response_ids", []):
            response_to_cluster[str(response_id)] = str(cluster.get("id", "unknown"))
            response_to_label[str(response_id)] = label

    member_audit = internal.get("dasha_member_audit", {})
    checked_members = int(member_audit.get("checked_members", 0))
    mismatched_members = int(member_audit.get("mismatched_members", 0))
    coherent_members = checked_members - mismatched_members
    coherence_low, coherence_high = wilson_ci(coherent_members, checked_members)
    size_low, size_high = bootstrap_ci(cluster_sizes, iterations=1000, seed=23) if cluster_sizes else (0.0, 0.0)
    feature_low, feature_high = bootstrap_ci(feature_similarities, iterations=1000, seed=29) if feature_similarities else (0.0, 0.0)

    labels_by_track: dict[str, list[str]] = {}
    for response in responses:
        label = response_to_label.get(str(response.get("id")), "unclustered")
        labels_by_track.setdefault(_response_track(response), []).append(label)
    base_track = str(perturbation_report.get("base_track_id", "original"))
    base_labels = labels_by_track.get(base_track, [])
    perturbation_tests = []
    for track, labels in sorted(labels_by_track.items()):
        if track == base_track:
            continue
        tvd, p_value = permutation_p_value_tvd(base_labels, labels, iterations=2000, seed=31)
        perturbation_type = "unknown"
        expected_behavior = "unknown"
        passed = None
        for check in perturbation_report.get("checks", []):
            if check.get("track_id") == track:
                perturbation_type = str(check.get("perturbation_type", "unknown"))
                expected_behavior = str(check.get("expected_behavior", "unknown"))
                passed = bool(check.get("passed"))
                break
        perturbation_tests.append({
            "track_id": track,
            "perturbation_type": perturbation_type,
            "expected_behavior": expected_behavior,
            "base_n": len(base_labels),
            "track_n": len(labels),
            "base_dominant_label": _dominant_label(base_labels),
            "track_dominant_label": _dominant_label(labels),
            "total_variation_distance": round(tvd, 3),
            "permutation_p_value": round(p_value, 4),
            "metamorphic_check_passed": passed,
        })

    row_scores = [
        row
        for cluster_score in judge.get("cluster_scores", [])
        for row in cluster_score.get("row_scores", [])
    ]
    unstable_rows = judge.get("judge_stability", {}).get("unstable_rows", [])
    unstable_low, unstable_high = wilson_ci(len(unstable_rows), len(row_scores))
    score_ranges = [float(row.get("score_range", 0.0)) for row in row_scores]
    adjudicated_clusters = judge.get("judge_stability", {}).get("adjudicated_clusters", [])

    model_score_groups: dict[str, list[float]] = {}
    for member_score in judge.get("member_scores", []):
        model_score_groups.setdefault(str(member_score.get("model", "unknown")), []).append(float(member_score.get("projected_score", 0.0)))
    model_uncertainty = []
    for model, scores in sorted(model_score_groups.items()):
        low, high = bootstrap_ci(scores, iterations=1000, seed=37) if scores else (0.0, 0.0)
        model_uncertainty.append({
            "model": model,
            "n": len(scores),
            "mean_projected_score": round(mean(scores), 3) if scores else 0.0,
            "bootstrap_ci_low": round(low, 3),
            "bootstrap_ci_high": round(high, 3),
        })
    model_uncertainty.sort(key=lambda item: item["mean_projected_score"], reverse=True)
    top_margin = 0.0
    top_ci_overlaps_second = False
    if len(model_uncertainty) >= 2:
        top_margin = round(model_uncertainty[0]["mean_projected_score"] - model_uncertainty[1]["mean_projected_score"], 3)
        top_ci_overlaps_second = not (
            model_uncertainty[0]["bootstrap_ci_low"] > model_uncertainty[1]["bootstrap_ci_high"]
            or model_uncertainty[1]["bootstrap_ci_low"] > model_uncertainty[0]["bootstrap_ci_high"]
        )

    stress_summary: dict[str, Any] = {}
    if stress_dir and (Path(stress_dir) / "stress_summary.json").exists():
        stress_summary = _load(Path(stress_dir), "stress_summary.json")

    response_labels = [response_to_label.get(str(response.get("id")), "unclustered") for response in responses]
    label_entropy = _entropy(response_labels)
    top_share = Counter(response_labels).most_common(1)[0][1] / len(response_labels) if response_labels else 0.0
    summary = {
        "schema_version": "research.statistical_validation.v1",
        "run_id": internal.get("run_id"),
        "sample": {
            "natural_response_count": len(responses),
            "model_count": len({response.get("model") for response in responses}),
            "track_count": len(labels_by_track),
            "cluster_count": len(clusters.get("clusters", [])),
        },
        "dasha": {
            "member_coherence": round(coherent_members / checked_members, 3) if checked_members else 0.0,
            "member_coherence_wilson_ci": [round(coherence_low, 3), round(coherence_high, 3)],
            "mismatched_members": mismatched_members,
            "cluster_size_mean": round(mean(cluster_sizes), 3) if cluster_sizes else 0.0,
            "cluster_size_bootstrap_ci": [round(size_low, 3), round(size_high, 3)],
            "effective_cluster_count": round(math.exp(label_entropy), 3) if response_labels else 0.0,
            "top_cluster_label_share": round(top_share, 3),
            "mean_feature_similarity": round(mean(feature_similarities), 3) if feature_similarities else 0.0,
            "mean_feature_similarity_bootstrap_ci": [round(feature_low, 3), round(feature_high, 3)],
            "mean_text_similarity": round(mean(text_similarities), 3) if text_similarities else 0.0,
        },
        "perturbations": perturbation_tests,
        "judge": {
            "row_score_count": len(row_scores),
            "unstable_row_count": len(unstable_rows),
            "unstable_row_rate": round(len(unstable_rows) / len(row_scores), 3) if row_scores else 0.0,
            "unstable_row_rate_wilson_ci": [round(unstable_low, 3), round(unstable_high, 3)],
            "mean_row_score_range": round(mean(score_ranges), 3) if score_ranges else 0.0,
            "max_row_score_range": judge.get("judge_stability", {}).get("max_row_score_range", 0),
            "mean_pairwise_mae": judge.get("judge_stability", {}).get("mean_pairwise_mae", 0.0),
            "mean_pairwise_weighted_kappa": judge.get("judge_stability", {}).get("mean_pairwise_weighted_kappa", 0.0),
            "adjudicated_cluster_count": len(adjudicated_clusters),
            "stability_status": judge.get("judge_stability", {}).get("status", "unknown"),
        },
        "rankings": {
            "model_score_intervals": model_uncertainty,
            "top_model_margin": top_margin,
            "top_two_ci_overlap": top_ci_overlaps_second,
            "interpretation": (
                "Projected rankings are generated pipeline outputs. With six projected "
                "scores per model in the live run, overlapping bootstrap intervals should "
                "not be interpreted as statistically separated model performance."
            ),
        },
        "controlled_stress": stress_summary,
        "limitations": [
            "The live run is a single-case, 60-response study; it supports method diagnostics, not population-level model comparisons.",
            "Perturbation p-values are exploratory because there is one invariant and one material variant in the reported live run.",
            "Dasha member coherence measures agreement with the extracted signature key; it does not replace expert review of each legal abstraction.",
        ],
    }
    write_json(run / "statistical_validation.json", summary)
    return summary


def write_statistical_validation_table(summary: dict[str, Any], table_path: str | Path) -> None:
    path = Path(table_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    dasha = summary.get("dasha", {})
    judge = summary.get("judge", {})
    stress = summary.get("controlled_stress", {})
    perturbations = summary.get("perturbations", [])
    top_rank = (summary.get("rankings", {}).get("model_score_intervals") or [{}])[0]
    rows = [
        (
            "Dasha member coherence",
            f"{dasha.get('member_coherence', 0):.3f}",
            f"95 percent Wilson CI [{dasha.get('member_coherence_wilson_ci', [0, 0])[0]:.3f}, {dasha.get('member_coherence_wilson_ci', [0, 0])[1]:.3f}]",
            "No centroid/member key mismatches in the saved run; validates bookkeeping, not expert legal truth.",
        ),
        (
            "Dasha cluster diversity",
            f"{summary.get('sample', {}).get('cluster_count', 0)} clusters; effective count {dasha.get('effective_cluster_count', 0):.2f}",
            f"Mean size {dasha.get('cluster_size_mean', 0):.2f}; bootstrap CI [{dasha.get('cluster_size_bootstrap_ci', [0, 0])[0]:.2f}, {dasha.get('cluster_size_bootstrap_ci', [0, 0])[1]:.2f}]",
            "Natural responses did not collapse into a single reasoning family.",
        ),
        (
            "Judge panel stability",
            f"weighted kappa {judge.get('mean_pairwise_weighted_kappa', 0):.3f}; MAE {judge.get('mean_pairwise_mae', 0):.3f}",
            f"unstable rows {judge.get('unstable_row_count', 0)}/{judge.get('row_score_count', 0)}; Wilson CI [{judge.get('unstable_row_rate_wilson_ci', [0, 0])[0]:.3f}, {judge.get('unstable_row_rate_wilson_ci', [0, 0])[1]:.3f}]",
            "Adjudication is required and recorded; judge scores are not treated as silently final.",
        ),
        (
            "Projected ranking uncertainty",
            str(top_rank.get("model", "unknown")),
            f"mean {top_rank.get('mean_projected_score', 0):.3f}; bootstrap CI [{top_rank.get('bootstrap_ci_low', 0):.3f}, {top_rank.get('bootstrap_ci_high', 0):.3f}]; top-two overlap={summary.get('rankings', {}).get('top_two_ci_overlap')}",
            "The live ranking is inspectable but not statistically decisive across model families.",
        ),
        (
            "Controlled 500-response regression",
            f"macro-F1 {stress.get('macro_f1', 0):.3f}; purity {stress.get('cluster_purity', 0):.3f}",
            f"n={stress.get('sample_count', 0)}; clusters={stress.get('observed_clusters', 0)}",
            "Confirms scale/bookkeeping under known signatures; not natural discovery evidence.",
        ),
    ]
    for test in perturbations:
        rows.append((
            f"Perturbation: {test.get('track_id')}",
            f"TVD {test.get('total_variation_distance', 0):.3f}",
            f"permutation p={test.get('permutation_p_value', 1):.4f}; passed={test.get('metamorphic_check_passed')}",
            f"{test.get('perturbation_type')} edit: base dominant={test.get('base_dominant_label')}; track dominant={test.get('track_dominant_label')}",
        ))
    lines = [
        r"\begin{tabular}{p{0.21\linewidth}p{0.18\linewidth}p{0.27\linewidth}p{0.24\linewidth}}",
        r"\toprule",
        r"Validation target & Estimate & Uncertainty/statistic & Interpretation \\",
        r"\midrule",
    ]
    for label, estimate, stat, interpretation in rows:
        lines.append(
            f"{_latex_cell(label, limit=120)} & "
            f"{_latex_cell(estimate, limit=120)} & "
            f"{_latex_cell(stat, limit=180)} & "
            f"{_latex_cell(interpretation, limit=260)} \\\\"
        )
    lines.extend([r"\bottomrule", r"\end{tabular}", ""])
    path.write_text("\n".join(lines), encoding="utf-8")


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
    question_tracks = manifest.get("question_tracks", []) if isinstance(manifest.get("question_tracks"), list) else []
    expected_question_count = len(question_tracks) if question_tracks else 1
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
            "reasoning_signature_excerpt": (
                signal.get("primary_reasoning_path")
                or signal.get("reasoning_path")
                or signal.get("rule_trigger")
                or signal.get("conclusion", "")
            ),
            "secondary_path_profile": signal.get("secondary_path_profile", []),
            "secondary_cluster_profile": signal.get("secondary_cluster_profile", []),
        })

    coverage_passed = (
        len(responses) > 0
        and expected_label_count == 0
        and len(question_ids) == expected_question_count
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
        "expected_question_count": expected_question_count,
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
    frank = _load(run, "frank_packet.json")
    rubric = _load(run, "karthic_rubric.json")
    responses = _load(run, "responses.json")
    clusters = _load(run, "dasha_clusters.json")
    judge = _load(run, "judge_scores.json")
    zak = _load(run, "zak_packets.json")
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
    frank_variations = frank.get("variations", []) if isinstance(frank.get("variations"), list) else []
    lines.extend([
        r"\subsection{Frank Packet Example}",
        "",
        (
            "The following fields are direct excerpts from the live Frank packet. "
            "They show the source-derived scenario, expected answer, and the "
            "perturbation tracks that later generated model responses."
        ),
        "",
        r"\begin{longtable}{p{0.18\linewidth}p{0.72\linewidth}}",
        r"\toprule",
        r"Frank field & Live output excerpt \\",
        r"\midrule",
        f"Source & {_latex_cell(frank.get('source', {}).get('path', 'unknown'), limit=220)} \\\\",
        f"Doctrine family & {_latex_cell(frank.get('doctrine_family', 'unknown'), limit=240)} \\\\",
        f"Neutral question & {_latex_cell(frank.get('neutral_question', ''), limit=1150)} \\\\",
        f"Gold answer & {_latex_cell(_gold_answer_excerpt(frank.get('gold_answer', '')), limit=900)} \\\\",
    ])
    for variation in frank_variations[:3]:
        label = f"Variation {variation.get('id', 'unknown')} ({variation.get('perturbation_type', 'unknown')})"
        value = (
            f"Changed fact: {variation.get('changed_fact', '')} "
            f"Expected behavior: {variation.get('expected_behavior', '')} "
            f"Question: {variation.get('question', '')}"
        )
        lines.append(f"{_latex_cell(label, limit=120)} & {_latex_cell(value, limit=900)} \\\\")
    lines.extend([r"\bottomrule", r"\end{longtable}", ""])

    rubric_rows = rubric.get("rows", []) if isinstance(rubric.get("rows"), list) else []
    lines.extend([
        r"\subsection{Karthic Rubric Example}",
        "",
        (
            "Karthic generated the following row-level scoring instrument from "
            "the locked Frank packet. Each row is later applied by Judge to "
            "Dasha cluster representatives."
        ),
        "",
        r"\begin{longtable}{p{0.07\linewidth}p{0.12\linewidth}p{0.08\linewidth}p{0.43\linewidth}p{0.20\linewidth}}",
        r"\toprule",
        r"Row & Category & Weight & Criterion & Source support excerpt \\",
        r"\midrule",
    ])
    for row in rubric_rows:
        lines.append(
            f"{_latex_cell(row.get('id', 'unknown'), limit=20)} & "
            f"{_latex_cell(row.get('category', 'unknown'), limit=50)} & "
            f"{_latex_cell(row.get('weight', ''), limit=20)} & "
            f"{_latex_cell(row.get('criterion', ''), limit=430)} & "
            f"{_latex_cell(_row_support_excerpt(row), limit=220)} \\\\"
        )
    lines.extend([r"\bottomrule", r"\end{longtable}", ""])

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
        r"\begin{longtable}{p{0.18\linewidth}p{0.13\linewidth}p{0.61\linewidth}}",
        r"\toprule",
        r"Model & Dasha cluster & Response excerpt \\",
        r"\midrule",
    ])
    for response in responses:
        model = _latex_cell(response.get("model", "unknown"), limit=80)
        cluster_id = _latex_cell(response_cluster.get(str(response.get("id")), "unclustered"), limit=40)
        excerpt = _latex_cell(response.get("text", ""), limit=700)
        lines.append(f"{model} & {cluster_id} & {excerpt} \\\\")
    lines.extend([r"\bottomrule", r"\end{longtable}", ""])

    lines.extend([
        r"\subsection{Dasha Cluster Examples}",
        "",
        r"\begin{longtable}{p{0.12\linewidth}p{0.22\linewidth}p{0.22\linewidth}p{0.34\linewidth}}",
        r"\toprule",
        r"Cluster & Member models & Outcome & Reasoning signature excerpt \\",
        r"\midrule",
    ])
    for cluster in clusters.get("clusters", []):
        members = cluster.get("members", [])
        member_models = _member_model_summary(members)
        signal = cluster.get("legal_signal", {})
        reasoning = signal.get("primary_reasoning_path") or signal.get("reasoning_path") or signal.get("conclusion") or signal.get("outcome", "")
        lines.append(
            f"{_latex_cell(cluster.get('id', 'unknown'), limit=40)} & "
            f"{_latex_cell(member_models, limit=180)} & "
            f"{_latex_cell(signal.get('outcome', 'unknown'), limit=220)} & "
            f"{_latex_cell(reasoning, limit=620)} \\\\"
        )
    lines.extend([r"\bottomrule", r"\end{longtable}", ""])

    lines.extend([
        r"\subsection{Judge Scoring Examples}",
        "",
        (
            "Judge receives a Dasha representative response, the cluster legal "
            "signal, and the Karthic rows. These rows show examples of the "
            "row-level scores and rationales that are projected to cluster members."
        ),
        "",
        r"\begin{longtable}{p{0.15\linewidth}p{0.08\linewidth}p{0.08\linewidth}p{0.59\linewidth}}",
        r"\toprule",
        r"Cluster & Row & Score & Judge rationale excerpt \\",
        r"\midrule",
    ])
    for cluster_id, row in _representative_judge_rows(judge):
        score = row.get("mean_score", row.get("score", ""))
        score_text = f"{score:.2f}" if isinstance(score, (int, float)) else str(score)
        lines.append(
            f"{_latex_cell(cluster_id, limit=70)} & "
            f"{_latex_cell(row.get('row_id', row.get('id', 'unknown')), limit=20)} & "
            f"{_latex_cell(score_text, limit=20)} & "
            f"{_latex_cell(row.get('rationale', ''), limit=620)} \\\\"
        )
    lines.extend([r"\bottomrule", r"\end{longtable}", ""])

    lines.extend([
        r"\subsection{Zak Escalation Example}",
        "",
        (
            "Zak records when the judge layer should not be treated as silently "
            "final. The live run produced the following escalation packet."
        ),
        "",
        r"\begin{longtable}{p{0.18\linewidth}p{0.72\linewidth}}",
        r"\toprule",
        r"Zak field & Live output excerpt \\",
        r"\midrule",
    ])
    packets = zak.get("packets", []) if isinstance(zak.get("packets"), list) else []
    if packets:
        packet = packets[0]
        lines.extend([
            f"Packet id & {_latex_cell(packet.get('id', 'unknown'), limit=80)} \\\\",
            f"Question & {_latex_cell(packet.get('question', ''), limit=260)} \\\\",
            f"Disagreement summary & {_latex_cell(packet.get('disagreement_summary', ''), limit=360)} \\\\",
            f"Cluster ids & {_latex_cell(', '.join(str(item) for item in packet.get('cluster_ids', [])), limit=700)} \\\\",
            f"Rubric rows & {_latex_cell(', '.join(str(item) for item in packet.get('rubric_row_ids', [])), limit=260)} \\\\",
        ])
    else:
        lines.append(r"No packet & The live run did not trigger Zak escalation. \\")
    lines.extend([r"\bottomrule", r"\end{longtable}", ""])
    path.write_text("\n".join(lines), encoding="utf-8")
