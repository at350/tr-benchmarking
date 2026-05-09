"""Question perturbation tracks and validation for research runs."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from .dasha import cluster_responses


MATERIAL_MARKERS = (
    "trigger",
    "bar",
    "barred",
    "compliance",
    "exception",
    "stronger",
    "weaker",
    "change",
    "different",
    "gate_",
    "answer_should_change",
)


def _classify_perturbation(variation: dict[str, Any]) -> str:
    explicit = str(variation.get("perturbation_type", "")).strip().lower()
    if explicit in {"base", "invariant", "material"}:
        return explicit
    expected = str(variation.get("expected_behavior", "")).lower()
    changed = str(variation.get("changed_fact", "")).lower()
    if "invariant" in expected or "no legal change" in expected or "same answer" in expected:
        return "invariant"
    if any(marker in expected for marker in MATERIAL_MARKERS):
        return "material"
    if any(marker in changed for marker in ("duration", "months", "year", "signed", "writing", "certificate", "price", "default")):
        return "material"
    return "invariant"


def build_question_tracks(frank_packet: dict[str, Any], max_variations: int | None = 0) -> list[dict[str, Any]]:
    """Convert Frank's original question and variations into executable tracks."""

    tracks = [{
        "track_id": "original",
        "variant_id": "original",
        "question_id": f"{frank_packet['id']}:original",
        "question": str(frank_packet.get("neutral_question", "")),
        "perturbation_type": "base",
        "changed_fact": "none",
        "expected_behavior": "baseline",
    }]
    variations = frank_packet.get("variations", [])
    if max_variations == 0:
        variations = []
    elif max_variations is not None and max_variations > 0:
        variations = variations[:max_variations]
    for index, variation in enumerate(variations, start=1):
        variant_id = str(variation.get("id") or f"variation_{index}")
        question = str(variation.get("question") or frank_packet.get("neutral_question", ""))
        tracks.append({
            "track_id": variant_id,
            "variant_id": variant_id,
            "question_id": f"{frank_packet['id']}:{variant_id}",
            "question": question,
            "perturbation_type": _classify_perturbation(variation),
            "changed_fact": str(variation.get("changed_fact", "")),
            "expected_behavior": str(variation.get("expected_behavior", "")),
        })
    return tracks


def cluster_responses_by_track(
    responses: list[dict[str, Any]],
    primary_gate_id: str | None = None,
    frank_packet: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Cluster each question track independently so variants cannot collapse together."""

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for response in responses:
        grouped[str(response.get("track_id") or response.get("question_id") or "original")].append(response)

    merged_clusters: list[dict[str, Any]] = []
    track_summaries: list[dict[str, Any]] = []
    for track_id, track_responses in grouped.items():
        clustered = cluster_responses(track_responses, primary_gate_id=primary_gate_id, frank_packet=frank_packet)
        track_cluster_ids = []
        for cluster in clustered.get("clusters", []):
            new_id = f"{track_id}__{cluster['id']}"
            track_cluster_ids.append(new_id)
            merged_clusters.append({
                **cluster,
                "id": new_id,
                "track_id": track_id,
                "question_id": track_responses[0].get("question_id"),
                "variant_id": track_responses[0].get("variant_id", track_id),
                "perturbation_type": track_responses[0].get("perturbation_type", "unknown"),
            })
        track_summaries.append({
            "track_id": track_id,
            "question_id": track_responses[0].get("question_id"),
            "response_count": len(track_responses),
            "cluster_ids": track_cluster_ids,
        })

    return {
        "schema_version": "research.dasha.track_clustered.v1",
        "method": "track_aware_legal_reasoning_signature",
        "track_count": len(grouped),
        "tracks": track_summaries,
        "clusters": merged_clusters,
    }


def _dominant_signal_for_track(clusters: dict[str, Any], track_id: str) -> dict[str, Any] | None:
    track_clusters = [cluster for cluster in clusters.get("clusters", []) if cluster.get("track_id") == track_id]
    if not track_clusters:
        return None
    dominant = max(track_clusters, key=lambda cluster: int(cluster.get("size", len(cluster.get("member_response_ids", [])))))
    signal = dominant.get("legal_signal", {})
    return {
        "cluster_id": dominant.get("id"),
        "outcome": signal.get("outcome") or signal.get("conclusion") or "unknown",
        "reasoning_path": signal.get("reasoning_path") or signal.get("reasoning") or signal.get("rule_trigger") or "",
    }


def _signal_key(signal: dict[str, Any] | None) -> tuple[str, str]:
    if not signal:
        return ("missing", "missing")
    return (str(signal.get("outcome", "")).lower(), str(signal.get("reasoning_path", "")).lower())


def build_perturbation_report(
    tracks: list[dict[str, Any]],
    responses: list[dict[str, Any]],
    clusters: dict[str, Any],
) -> dict[str, Any]:
    """Assess invariant and material perturbation behavior from clustered tracks."""

    base_track = next((track for track in tracks if track.get("perturbation_type") == "base"), tracks[0] if tracks else None)
    base_signal = _dominant_signal_for_track(clusters, str(base_track["track_id"])) if base_track else None
    response_counts: dict[str, int] = defaultdict(int)
    for response in responses:
        response_counts[str(response.get("track_id") or "original")] += 1

    checks = []
    for track in tracks:
        track_id = str(track["track_id"])
        perturbation_type = str(track.get("perturbation_type", "unknown"))
        signal = _dominant_signal_for_track(clusters, track_id)
        if perturbation_type == "base":
            comparison = "baseline"
            passed = bool(signal)
        elif not signal or not base_signal:
            comparison = "not_tested"
            passed = False
        elif perturbation_type == "invariant":
            passed = _signal_key(signal) == _signal_key(base_signal)
            comparison = "invariant_preserved" if passed else "invariant_broken"
        elif perturbation_type == "material":
            passed = _signal_key(signal) != _signal_key(base_signal)
            comparison = "material_difference_observed" if passed else "material_difference_missing"
        else:
            comparison = "unknown_perturbation_type"
            passed = False
        checks.append({
            "track_id": track_id,
            "perturbation_type": perturbation_type,
            "expected_behavior": track.get("expected_behavior", ""),
            "response_count": response_counts.get(track_id, 0),
            "dominant_signal": signal,
            "comparison": comparison,
            "passed": passed,
        })

    required_checks = [check for check in checks if check["perturbation_type"] in {"invariant", "material"}]
    status = "perturbation_validation_passed" if required_checks and all(check["passed"] for check in required_checks) else "needs_perturbation_review"
    return {
        "schema_version": "research.perturbation_validation.v1",
        "status": status,
        "track_count": len(tracks),
        "response_count": len(responses),
        "base_track_id": base_track["track_id"] if base_track else None,
        "checks": checks,
        "interpretation": (
            "Invariant perturbations should preserve the dominant legal answer path; "
            "material perturbations should change the dominant legal answer path or reasoning signature."
        ),
    }
