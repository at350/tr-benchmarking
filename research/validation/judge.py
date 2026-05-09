"""Rubric-aware judging and Zak escalation packet generation."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

from .metrics import mean_absolute_error, weighted_kappa
from .provider_client import generate_json
from .utils import tokenize


CATEGORY_TERMS = {
    "gate": {"gate", "trigger", "statute", "frauds", "one", "year", "surety", "marriage", "land", "goods"},
    "doctrine": {"statute", "frauds", "doctrine", "enforceability", "contract", "promise"},
    "rule": {"rule", "writing", "trigger", "within", "year", "collateral", "quantity", "signed"},
    "facts": {"facts", "oral", "promise", "signed", "writing", "performed", "certificate", "debt", "months"},
    "writing": {"writing", "signed", "certificate", "designation", "quantity", "compliance"},
    "exceptions": {"exception", "estoppel", "reliance", "part", "performance", "main", "purpose", "admission", "delivery", "payment"},
    "counterargument": {"counterargument", "argue", "but", "however", "depends", "opposing"},
    "conclusion": {"likely", "therefore", "because", "barred", "enforceable", "wins", "better"},
    "variation": {"nine", "thirteen", "months", "changed", "variation", "boundary", "trigger"},
    "source_support": {"source", "facts", "record", "case", "provided"},
}


def score_text_against_row(text: str, row: dict) -> int:
    lower_tokens = tokenize(text)
    criterion_tokens = tokenize(row.get("criterion", ""))
    category_terms = CATEGORY_TERMS.get(row.get("category", ""), set())

    category_hits = len(lower_tokens & category_terms)
    criterion_hits = len(lower_tokens & criterion_tokens)
    source_terms = set()
    for support in row.get("source_support", []):
        source_terms |= tokenize(str(support))
    source_hits = len(lower_tokens & source_terms)

    if category_hits >= 3 and (criterion_hits >= 3 or source_hits >= 2):
        return 4
    if category_hits >= 2 and (criterion_hits >= 2 or source_hits >= 1):
        return 3
    if category_hits >= 1 or criterion_hits >= 2:
        return 2
    if criterion_hits == 1:
        return 1
    return 0


def _row_score(row: dict, representative_text: str) -> dict:
    score = score_text_against_row(representative_text, row)
    return {
        "row_id": row["id"],
        "category": row["category"],
        "score": score,
        "rationale": (
            f"Deterministic offline judge matched representative text against the {row['category']} "
            "rubric row, category terms, and source-support terms."
        ),
    }


def _rank_models(member_scores: list[dict]) -> list[dict]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for item in member_scores:
        grouped[item["model"]].append(float(item["projected_score"]))
    rankings = [
        {
            "model": model,
            "mean_projected_score": round(sum(scores) / len(scores), 3),
            "n": len(scores),
        }
        for model, scores in grouped.items()
    ]
    return sorted(rankings, key=lambda item: item["mean_projected_score"], reverse=True)


def _judge_stability_from_repeats(repeats_by_cluster: dict[str, list[list[dict]]]) -> dict[str, Any]:
    pairwise_mae: list[float] = []
    pairwise_kappa: list[float] = []
    max_row_range = 0
    unstable_rows: list[dict[str, Any]] = []

    for cluster_id, repeat_sets in repeats_by_cluster.items():
        if len(repeat_sets) < 2:
            continue
        by_repeat = [
            {row_score["row_id"]: int(row_score["score"]) for row_score in repeat_set}
            for repeat_set in repeat_sets
        ]
        row_ids = sorted(set().union(*(set(item) for item in by_repeat)))
        for row_id in row_ids:
            values = [scores[row_id] for scores in by_repeat if row_id in scores]
            if len(values) < 2:
                continue
            row_range = max(values) - min(values)
            max_row_range = max(max_row_range, row_range)
            if row_range >= 2:
                unstable_rows.append({
                    "cluster_id": cluster_id,
                    "row_id": row_id,
                    "scores": values,
                    "range": row_range,
                })
        for left_index in range(len(by_repeat)):
            for right_index in range(left_index + 1, len(by_repeat)):
                common = sorted(set(by_repeat[left_index]) & set(by_repeat[right_index]))
                if not common:
                    continue
                left = [by_repeat[left_index][row_id] for row_id in common]
                right = [by_repeat[right_index][row_id] for row_id in common]
                pairwise_mae.append(mean_absolute_error(left, right))
                pairwise_kappa.append(weighted_kappa(left, right))

    if not pairwise_mae:
        return {
            "repeat_count": 1,
            "status": "not_repeated",
            "mean_pairwise_mae": 0.0,
            "mean_pairwise_weighted_kappa": 1.0,
            "max_row_score_range": 0,
            "unstable_rows": [],
        }
    return {
        "repeat_count": max(len(items) for items in repeats_by_cluster.values()) if repeats_by_cluster else 1,
        "status": "stable" if not unstable_rows and sum(pairwise_mae) / len(pairwise_mae) <= 0.5 else "needs_review",
        "mean_pairwise_mae": round(sum(pairwise_mae) / len(pairwise_mae), 3),
        "mean_pairwise_weighted_kappa": round(sum(pairwise_kappa) / len(pairwise_kappa), 3),
        "max_row_score_range": max_row_range,
        "unstable_rows": unstable_rows,
    }


def _aggregate_repeated_row_scores(repeat_sets: list[list[dict]]) -> list[dict]:
    by_row: dict[str, list[dict]] = defaultdict(list)
    for repeat_set in repeat_sets:
        for row_score in repeat_set:
            by_row[row_score["row_id"]].append(row_score)

    aggregated = []
    for row_id, items in by_row.items():
        scores = [int(item["score"]) for item in items]
        first = items[0]
        mean_score = sum(scores) / len(scores)
        aggregated.append({
            "row_id": row_id,
            "category": first["category"],
            "score": int(round(mean_score)),
            "mean_score": round(mean_score, 3),
            "score_range": max(scores) - min(scores),
            "repeat_scores": scores,
            "rationale": first.get("rationale", ""),
        })
    return sorted(aggregated, key=lambda item: item["row_id"])


def _aggregate_scores(
    clusters: dict,
    rubric: dict,
    agreement_threshold: float,
    cluster_row_scores: dict[str, list[dict]],
    mode: str,
    judge_stability: dict[str, Any] | None = None,
    judge_panel: list[dict[str, Any]] | None = None,
) -> dict:
    cluster_scores = []
    member_scores = []
    row_weights = {row["id"]: row["weight"] for row in rubric["rows"]}
    max_weighted_score = sum(4.0 * float(weight) for weight in row_weights.values())

    for cluster in clusters["clusters"]:
        row_scores = cluster_row_scores[cluster["id"]]
        weighted = sum(score["score"] * row_weights[score["row_id"]] for score in row_scores)
        weighted = round(weighted, 3)
        cluster_scores.append({
            "cluster_id": cluster["id"],
            "representative_response_id": cluster["representative_response_id"],
            "legal_signal": cluster.get("legal_signal", {}),
            "weighted_score": weighted,
            "row_scores": row_scores,
            "projection_policy": "Representative centroid score applies to all responses in this Dasha cluster.",
        })
        for member in cluster["members"]:
            member_scores.append({
                "response_id": member["id"],
                "model": member.get("model", "unknown"),
                "cluster_id": cluster["id"],
                "question_id": member.get("question_id"),
                "track_id": member.get("track_id", cluster.get("track_id")),
                "variant_id": member.get("variant_id", cluster.get("variant_id")),
                "perturbation_type": member.get("perturbation_type", cluster.get("perturbation_type")),
                "projected_score": weighted,
            })

    sorted_scores = sorted(cluster_scores, key=lambda item: item["weighted_score"], reverse=True)
    top = sorted_scores[0]["weighted_score"] if sorted_scores else 0
    runner_up = sorted_scores[1]["weighted_score"] if len(sorted_scores) > 1 else 0
    agreement = 1.0
    if len(sorted_scores) > 1 and max_weighted_score > 0:
        agreement = min(1.0, max(0.0, (top - runner_up) / max_weighted_score))
    return {
        "schema_version": "research.judge.v2",
        "mode": mode,
        "cluster_scores": cluster_scores,
        "member_scores": member_scores,
        "model_rankings": _rank_models(member_scores),
        "agreement_score": round(agreement, 3),
        "needs_zak": agreement < agreement_threshold,
        "judge_panel": judge_panel or [],
        "judge_stability": judge_stability or {
            "repeat_count": 1,
            "status": "not_repeated",
            "mean_pairwise_mae": 0.0,
            "mean_pairwise_weighted_kappa": 1.0,
            "max_row_score_range": 0,
            "unstable_rows": [],
        },
        "llm_judge_note": "Live LLM judging should use the same row schema and projection policy after calibration; offline tests keep this deterministic.",
    }


def judge_clusters(clusters: dict, rubric: dict, agreement_threshold: float) -> dict:
    cluster_row_scores = {}
    for cluster in clusters["clusters"]:
        representative = next(member for member in cluster["members"] if member["id"] == cluster["representative_response_id"])
        cluster_row_scores[cluster["id"]] = [_row_score(row, representative["text"]) for row in rubric["rows"]]
    return _aggregate_scores(
        clusters,
        rubric,
        agreement_threshold,
        cluster_row_scores,
        mode="deterministic_offline_rubric_projection",
    )


def _judge_representative_with_llm(
    repo_root: Path,
    cluster: dict,
    rubric: dict,
    judge_config: Any,
    provider: str | None = None,
    model: str | None = None,
) -> list[dict[str, Any]]:
    representative = next(member for member in cluster["members"] if member["id"] == cluster["representative_response_id"])
    compact_rows = [
        {
            "id": row["id"],
            "category": row["category"],
            "criterion": row["criterion"],
            "source_support": row.get("source_support", []),
        }
        for row in rubric["rows"]
    ]
    parsed = generate_json(
        repo_root=repo_root,
        provider=provider or getattr(judge_config, "provider", "openai"),
        model=model or judge_config.model,
        messages=[
            {
                "role": "system",
                "content": "You are a calibrated legal benchmark judge. Return only strict JSON.",
            },
            {
                "role": "user",
                "content": (
                    "Apply every rubric row to the response. Score each row from 0 to 4. "
                    "Return JSON: {\"row_scores\":[{\"row_id\":\"...\",\"score\":0,\"rationale\":\"...\"}]}.\n\n"
                    f"Legal cluster signal:\n{cluster.get('legal_signal', {})}\n\n"
                    f"Rubric rows:\n{compact_rows}\n\n"
                    f"Response:\n{representative['text']}"
                ),
            },
        ],
        temperature=0.0,
        max_tokens=2200,
    )
    by_id = {row["id"]: row for row in rubric["rows"]}
    normalized = []
    for item in parsed.get("row_scores", []):
        row_id = str(item.get("row_id", ""))
        if row_id in by_id:
            normalized.append({
                "row_id": row_id,
                "category": by_id[row_id]["category"],
                "score": max(0, min(4, int(item.get("score", 0)))),
                "rationale": str(item.get("rationale", ""))[:800],
            })
    if len(normalized) != len(rubric["rows"]):
        missing = sorted(set(by_id) - {item["row_id"] for item in normalized})
        raise ValueError(f"LLM judge output missing rubric rows: {missing}")
    return normalized


def _judge_panel(judge_config: Any) -> list[dict[str, Any]]:
    configured = list(getattr(judge_config, "judge_models", ()) or [])
    if not configured:
        configured = [judge_config]
    panel = []
    for item in configured:
        panel.append({
            "provider": str(getattr(item, "provider", getattr(judge_config, "provider", "openai"))),
            "model": str(getattr(item, "model", getattr(judge_config, "model", "unknown"))),
            "repeats": max(1, int(getattr(item, "repeats", getattr(judge_config, "repeats", 1)))),
        })
    return panel


def judge_clusters_with_openai(repo_root: Path, clusters: dict, rubric: dict, judge_config: Any) -> dict:
    cluster_row_scores = {}
    repeats_by_cluster = {}
    panel = _judge_panel(judge_config)
    for cluster in clusters["clusters"]:
        repeat_sets = []
        for judge_model in panel:
            for _ in range(judge_model["repeats"]):
                repeat_sets.append(
                    _judge_representative_with_llm(
                        repo_root,
                        cluster,
                        rubric,
                        judge_config,
                        provider=judge_model["provider"],
                        model=judge_model["model"],
                    )
                )
        repeats_by_cluster[cluster["id"]] = repeat_sets
        cluster_row_scores[cluster["id"]] = (
            repeat_sets[0]
            if len(repeat_sets) == 1
            else _aggregate_repeated_row_scores(repeat_sets)
        )
    panel_models = ",".join(item["model"] for item in panel)
    return _aggregate_scores(
        clusters,
        rubric,
        judge_config.agreement_threshold,
        cluster_row_scores,
        mode=f"llm_rubric_projection:{panel_models}",
        judge_stability=_judge_stability_from_repeats(repeats_by_cluster),
        judge_panel=panel,
    )


def build_zak_packets(judge_scores: dict, clusters: dict, rubric: dict) -> dict:
    stability = judge_scores.get("judge_stability", {})
    if stability.get("status") == "needs_review":
        return {
            "schema_version": "research.zak.v1",
            "packets": [{
                "id": "zak_1",
                "question": "Review unstable judge rows.",
                "rubric_row_ids": sorted({item["row_id"] for item in stability.get("unstable_rows", [])}),
                "cluster_ids": sorted({item["cluster_id"] for item in stability.get("unstable_rows", [])}),
                "disagreement_summary": (
                    "Repeated judge calls produced row-level score ranges above the configured stability tolerance."
                ),
            }],
        }
    if not judge_scores["needs_zak"]:
        return {
            "schema_version": "research.zak.v1",
            "packets": [],
            "reason": "No escalation because the judge agreement threshold was met.",
        }
    return {
        "schema_version": "research.zak.v1",
        "packets": [{
            "id": "zak_1",
            "question": "Review disputed representative clusters.",
            "rubric_row_ids": [row["id"] for row in rubric["rows"]],
            "cluster_ids": [cluster["id"] for cluster in clusters["clusters"]],
            "disagreement_summary": "Judge confidence did not meet the configured threshold.",
        }],
    }
