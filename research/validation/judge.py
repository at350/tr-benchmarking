"""Rubric-aware judging and Zak escalation packet generation."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

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


def _aggregate_scores(clusters: dict, rubric: dict, agreement_threshold: float, cluster_row_scores: dict[str, list[dict]], mode: str) -> dict:
    cluster_scores = []
    member_scores = []
    row_weights = {row["id"]: row["weight"] for row in rubric["rows"]}

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
                "projected_score": weighted,
            })

    sorted_scores = sorted(cluster_scores, key=lambda item: item["weighted_score"], reverse=True)
    top = sorted_scores[0]["weighted_score"] if sorted_scores else 0
    runner_up = sorted_scores[1]["weighted_score"] if len(sorted_scores) > 1 else 0
    agreement = min(1.0, max(0.0, (top - runner_up) / 4.0 + agreement_threshold))
    return {
        "schema_version": "research.judge.v2",
        "mode": mode,
        "cluster_scores": cluster_scores,
        "member_scores": member_scores,
        "model_rankings": _rank_models(member_scores),
        "agreement_score": round(agreement, 3),
        "needs_zak": agreement < agreement_threshold,
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
        provider=getattr(judge_config, "provider", "openai"),
        model=judge_config.model,
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


def judge_clusters_with_openai(repo_root: Path, clusters: dict, rubric: dict, judge_config: Any) -> dict:
    cluster_row_scores = {}
    for cluster in clusters["clusters"]:
        cluster_row_scores[cluster["id"]] = _judge_representative_with_llm(repo_root, cluster, rubric, judge_config)
    return _aggregate_scores(
        clusters,
        rubric,
        judge_config.agreement_threshold,
        cluster_row_scores,
        mode=f"llm_rubric_projection:{judge_config.model}",
    )


def build_zak_packets(judge_scores: dict, clusters: dict, rubric: dict) -> dict:
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
