"""Dasha legal-reasoning clustering for Statute of Frauds validation."""

from __future__ import annotations

from collections import defaultdict
import re

from .utils import jaccard


def _contains_any(lower: str, terms: tuple[str, ...]) -> bool:
    return any(term in lower for term in terms)


def legal_signal(text: str, primary_gate_id: str | None = None) -> dict[str, str]:
    lower = text.lower()

    later_direct_outcome = bool(
        re.search(r"\b(children and sister|later-named beneficiaries|relatives|they)\b.{0,80}\b(better claim|likely win|prevail)\b", lower)
        or "association paperwork points the other way" in lower
    )
    later_certificate_controls = bool(
        re.search(r"\b(final|replacement|last)\s+certificate\b.{0,80}\b(controls|should control|governs|operative)\b", lower)
    )
    wife_wins = _contains_any(
        lower,
        (
            "wife has the better claim",
            "wife likely wins",
            "favors the wife",
            "wife the stronger",
            "wife's stronger",
            "beneficiary rights",
            "wife likely has",
        ),
    )

    later_wins = later_direct_outcome or (later_certificate_controls and not wife_wins)

    if later_wins:
        conclusion = "later_beneficiaries_win"
    elif wife_wins:
        conclusion = "wife_wins"
    elif _contains_any(lower, ("barred", "unenforceable", "cannot be enforced", "enforcement is unlikely")):
        conclusion = "sof_bars_claim"
    elif _contains_any(lower, ("enforceable", "may be enforceable", "not triggered", "outside the statute")):
        conclusion = "claim_enforceable"
    elif "wife" in lower:
        conclusion = "wife_wins"
    elif _contains_any(lower, ("children", "sister", "later-named")):
        conclusion = "later_beneficiaries_win"
    else:
        conclusion = "unclear"

    if _contains_any(lower, ("one-year", "one year", "within a year", "eighteen-month", "eighteen month", "nine months", "thirteen months")):
        gate = "one_year"
    elif _contains_any(lower, ("surety", "guarantee", "guaranty", "another's debt", "corporation's debt", "default")):
        gate = "suretyship"
    elif _contains_any(lower, ("marriage", "premarital", "fiancee", "spouse")):
        gate = "marriage"
    elif _contains_any(lower, ("land", "real estate", "lease", "deed")):
        gate = "land"
    elif _contains_any(lower, ("goods", "ucc", "$500", "merchant", "quantity")):
        gate = "goods"
    else:
        gate = "general_sof"
    if gate == "general_sof" and primary_gate_id:
        gate = primary_gate_id

    if _contains_any(lower, ("barred", "unenforceable", "no signed writing", "no writing", "requires a writing")):
        outcome = "barred"
    elif _contains_any(lower, ("not triggered", "outside the statute", "within a year is possible", "may be enforceable", "satisfy", "satisfies")):
        outcome = "enforceable"
    elif conclusion in {"wife_wins", "claim_enforceable"}:
        outcome = "enforceable"
    elif conclusion in {"later_beneficiaries_win", "sof_bars_claim"}:
        outcome = "barred"
    else:
        outcome = "uncertain"

    if gate == "marriage" and _contains_any(lower, ("certificate", "signed", "writing", "designation", "possession")):
        exception = "writing_or_substitute"
    elif _contains_any(lower, ("main purpose", "main-purpose", "own ownership", "own business")):
        exception = "main_purpose"
    elif _contains_any(lower, ("part performance", "partial performance")) or (gate == "land" and _contains_any(lower, ("possession", "improvements"))):
        exception = "part_performance"
    elif _contains_any(lower, ("estoppel", "reliance", "quit another job")):
        exception = "estoppel"
    elif _contains_any(lower, ("admission", "delivery", "payment", "merchant confirmation")):
        exception = "ucc_exception"
    elif _contains_any(lower, ("certificate", "signed", "writing", "designation")) and outcome == "enforceable":
        exception = "writing_or_substitute"
    else:
        exception = "none"

    if gate == "marriage" and _contains_any(lower, ("certificate", "replacement", "association", "beneficiary")):
        reasoning = "marriage_promise_certificate_rights" if outcome == "enforceable" else "association_replacement_controls"
    elif gate == "one_year":
        reasoning = "one_year_boundary_and_writing"
    elif gate == "suretyship":
        reasoning = "suretyship_collateral_or_main_purpose"
    elif gate == "land":
        reasoning = "land_interest_part_performance"
    elif gate == "goods":
        reasoning = "goods_threshold_and_ucc_exceptions"
    else:
        reasoning = "general_sof_reasoning"

    return {
        "conclusion": conclusion,
        "gate": gate,
        "outcome": outcome,
        "exception": exception,
        "reasoning": reasoning,
    }


def _feature_match_score(left: dict, right: dict) -> float:
    keys = ("gate", "outcome", "exception", "reasoning")
    return sum(1 for key in keys if left.get(key) == right.get(key)) / len(keys)


def choose_representative(members: list[dict]) -> str:
    if len(members) == 1:
        return members[0]["id"]
    best_id = members[0]["id"]
    best_score = -1.0
    for candidate in members:
        score = 0.0
        for other in members:
            if other is candidate:
                continue
            score += jaccard(candidate["text"], other["text"])
            score += _feature_match_score(candidate["legal_signal"], other["legal_signal"])
        if score > best_score:
            best_score = score
            best_id = candidate["id"]
    return best_id


def _centroid_quality(members: list[dict], representative_id: str) -> dict:
    representative = next(member for member in members if member["id"] == representative_id)
    others = [member for member in members if member["id"] != representative_id]
    if not others:
        return {"mean_text_similarity": 1.0, "mean_feature_similarity": 1.0, "member_count": 1}
    text_similarity = sum(jaccard(representative["text"], member["text"]) for member in others) / len(others)
    feature_similarity = sum(_feature_match_score(representative["legal_signal"], member["legal_signal"]) for member in others) / len(others)
    return {
        "mean_text_similarity": round(text_similarity, 3),
        "mean_feature_similarity": round(feature_similarity, 3),
        "member_count": len(members),
    }


def cluster_responses(responses: list[dict], primary_gate_id: str | None = None) -> dict:
    grouped: dict[tuple[str, str, str, str], list[dict]] = defaultdict(list)
    for response in responses:
        signal = legal_signal(response["text"], primary_gate_id=primary_gate_id)
        key = (signal["gate"], signal["outcome"], signal["exception"], signal["reasoning"])
        grouped[key].append({**response, "legal_signal": signal})

    clusters = []
    for index, ((gate, outcome, exception, reasoning), members) in enumerate(sorted(grouped.items()), start=1):
        representative_id = choose_representative(members)
        representative = next(member for member in members if member["id"] == representative_id)
        clusters.append({
            "id": f"cluster_{index}",
            "legal_signal": {
                "conclusion": representative["legal_signal"]["conclusion"],
                "gate": gate,
                "outcome": outcome,
                "exception": exception,
                "reasoning": reasoning,
            },
            "representative_response_id": representative_id,
            "member_response_ids": [member["id"] for member in members],
            "members": members,
            "size": len(members),
            "centroid_quality": _centroid_quality(members, representative_id),
        })

    return {
        "schema_version": "research.dasha.v2",
        "method": "hybrid_legal_feature_signature",
        "clusters": clusters,
    }
