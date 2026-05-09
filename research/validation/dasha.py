"""Dasha legal-reasoning clustering for source-grounded benchmark responses."""

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


def _member_signal_key(member: dict) -> tuple[str, ...]:
    if "_dasha_normalized_signature" in member:
        return tuple(str(item) for item in member["_dasha_normalized_signature"])
    signal = member.get("legal_signal", {})
    if signal:
        return tuple(str(signal.get(key, "")) for key in ("gate", "outcome", "exception", "reasoning"))
    if "reasoning_signature" in member:
        return _normalized_signature(member["reasoning_signature"])
    return ("unknown",)


def _signature_text(signature: dict) -> str:
    values = []
    for key in ("doctrine", "issue", "rule_trigger", "outcome", "exception_or_defense", "reasoning_path", "conclusion"):
        value = signature.get(key, "")
        if isinstance(value, list):
            value = " ".join(str(item) for item in value)
        values.append(str(value))
    return " ".join(values).lower()


def _bucket_outcome(signature: dict) -> str:
    text = _signature_text(signature)
    if _contains_any(
        text,
        (
            "signed premarital",
            "signed note",
            "signed writing satisfies",
            "signed memorandum",
            "satisfies the statute",
            "satisfies the writing requirement",
            "no longer barred",
        ),
    ) and _contains_any(text, ("enforceable", "satisfies", "supports enforcing", "supports enforcement", "claim")):
        return "claim_succeeds"
    if _contains_any(
        text,
        (
            "seller has the stronger",
            "seller's argument",
            "seller argues",
            "exclusive remedy",
            "limits all remedies",
            "displacing damages",
            "displace damages",
        ),
    ) and not _contains_any(
        text,
        (
            "buyer has the stronger",
            "buyer's interpretation likely prevails",
            "buyer likely prevails",
            "preserves damages",
            "all remedies available",
        ),
    ):
        return "seller_limited_remedy_controls"
    if _contains_any(
        text,
        (
            "buyer has the stronger",
            "buyer's interpretation likely prevails",
            "buyer likely prevails",
            "preserves damages",
            "all remedies available",
            "damages available",
        ),
    ):
        return "buyer_remedy_preserved"
    if _contains_any(text, ("later-named", "children and sister", "replacement certificate controls", "later beneficiaries", "superior claim to the death")) and not _contains_any(text, ("wife prevails", "wife entitled", "wife favored", "spouse likely has superior")):
        return "claim_fails_or_later_designation_controls"
    if _contains_any(text, ("wife prevails", "wife entitled", "wife favored", "spouse likely has superior", "wife has superior", "wife has the better", "spouse has the stronger")):
        return "claim_succeeds"
    if _contains_any(text, ("barred", "unenforceable", "fails", "no superior claim")):
        return "claim_fails_or_later_designation_controls"
    if _contains_any(text, ("enforceable", "succeeds", "superior claim")):
        return "claim_succeeds"
    return "outcome_uncertain"


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")[:80] or "unknown"


def _tokens(value: str) -> set[str]:
    stop = {
        "a",
        "an",
        "and",
        "are",
        "as",
        "by",
        "for",
        "from",
        "in",
        "is",
        "of",
        "or",
        "the",
        "to",
        "with",
    }
    return {token for token in re.findall(r"[a-z0-9]+", value.lower()) if len(token) > 2 and token not in stop}


def _source_gate_aliases(frank_packet: dict | None = None) -> dict[str, tuple[str, ...]]:
    """Build doctrine-general trigger aliases from Frank's detected gates."""

    if not frank_packet:
        return {}
    raw_gates = (
        frank_packet.get("doctrine_gates")
        or frank_packet.get("detected_doctrine_gates")
        or frank_packet.get("statute_of_frauds", {}).get("gates")
        or []
    )
    aliases: dict[str, tuple[str, ...]] = {}
    for gate in raw_gates:
        if not isinstance(gate, dict):
            continue
        gate_id = _slug(str(gate.get("id") or gate.get("label") or gate.get("rule") or "gate"))
        candidates = [
            str(gate.get("id", "")),
            str(gate.get("label", "")),
            str(gate.get("rule", "")),
            str(gate.get("source_evidence", "")),
        ]
        aliases[gate_id] = tuple(
            sorted({candidate.lower().strip() for candidate in candidates if candidate and candidate.strip()})
        )
    return aliases


def _bucket_from_source_gates(text: str, gate_aliases: dict[str, tuple[str, ...]]) -> str | None:
    if not gate_aliases:
        return None
    text_tokens = _tokens(text)
    best_gate: str | None = None
    best_score = 0.0
    for gate_id, aliases in gate_aliases.items():
        score = 0.0
        for alias in aliases:
            if alias and alias in text:
                score = max(score, 1.0)
            alias_tokens = _tokens(alias)
            if alias_tokens:
                score = max(score, len(text_tokens & alias_tokens) / len(alias_tokens))
        if score > best_score:
            best_gate = gate_id
            best_score = score
    return best_gate if best_score >= 0.5 else None


def _bucket_trigger(signature: dict, gate_aliases: dict[str, tuple[str, ...]] | None = None) -> str:
    text = _signature_text(signature)
    if _contains_any(text, ("marriage", "premarital", "spouse", "wife", "fiancee", "fiancée")):
        if _contains_any(text, ("certificate", "beneficiary", "designation", "replacement")):
            return "marriage_beneficiary_certificate"
        return "marriage_consideration"
    if _contains_any(text, ("one-year", "one year", "within a year", "eighteen-month", "thirteen months")):
        return "one_year"
    if _contains_any(text, ("executor", "administrator", "estate", "decedent", "deceased")):
        return "executor_administrator"
    if _contains_any(text, ("surety", "guaranty", "guarantee", "another's debt", "another person", "debt")):
        return "suretyship"
    if _contains_any(text, ("land", "real estate", "lease", "deed", "property")):
        return "land_interest"
    if _contains_any(text, ("goods", "merchant", "quantity", "$500")) or re.search(r"\bucc\b", text):
        return "goods"
    source_gate = _bucket_from_source_gates(text, gate_aliases or {})
    if source_gate and not re.fullmatch(r"g\d+", source_gate):
        return source_gate
    return re.sub(r"[^a-z0-9]+", "_", str(signature.get("rule_trigger", "general")).lower()).strip("_")[:80] or "general"


def _bucket_exception(signature: dict) -> str:
    text = _signature_text(signature)
    has_actual_writing = _contains_any(
        text,
        (
            "signed premarital",
            "signed note",
            "signed writing satisfies",
            "signed memorandum",
            "satisfies the statute",
            "satisfies the writing requirement",
            "writing satisfies",
            "sufficient signed writing",
        ),
    )
    if _contains_any(text, ("no signed writing", "no writing", "lack of writing", "absence of writing")) and not has_actual_writing:
        return "no_writing_or_no_exception"
    if _contains_any(
        text,
        (
            "signed premarital",
            "signed note",
            "signed writing",
            "signed memorandum",
            "satisfies the statute",
            "satisfies writing",
            "writing satisfies",
            "sufficient signed writing",
        ),
    ):
        return "writing_or_certificate"
    if _contains_any(
        text,
        (
            "no signed writing",
            "no writing",
            "lack of writing",
            "absence of writing",
            "absent a sufficient writing",
            "without a certificate",
            "no certificate",
            "never obtained any certificate",
            "not evidenced by a writing",
        ),
    ):
        return "no_writing_or_no_exception"
    if _contains_any(text, ("certificate", "memorandum", "sufficient writing", "signed writing", "writing requirement", "satisfies writing")):
        return "writing_or_certificate"
    if _contains_any(text, ("replacement", "bylaw", "association rule", "last designation", "final certificate")):
        return "replacement_or_bylaw_defense"
    if _contains_any(text, ("main purpose", "main-purpose", "own business", "own interest")):
        return "main_purpose"
    if _contains_any(text, ("estoppel", "reliance", "part performance", "performance")):
        return "equitable_or_performance"
    if _contains_any(text, ("none", "no exception")):
        return "none"
    return re.sub(r"[^a-z0-9]+", "_", str(signature.get("exception_or_defense", "none")).lower()).strip("_")[:80] or "none"


def _bucket_reasoning_path(signature: dict) -> str:
    """Normalize the legal theory used by a response, not just its outcome."""

    text = _signature_text(signature)
    if _contains_any(text, ("promissory estoppel", "equitable estoppel", "reliance")):
        return "promissory_estoppel_or_reliance"
    if _contains_any(text, ("constructive trust", "unjust enrichment", "equity enforces", "equitable claim")):
        return "constructive_trust_or_equity"
    if _contains_any(
        text,
        (
            "oral promise barred",
            "no signed writing",
            "lack of writing",
            "absence of a writing",
            "absence of writing",
            "statute of frauds bars",
            "unenforceable under the statute",
        ),
    ):
        return "statute_bars_no_writing"
    if _contains_any(
        text,
        (
            "certificate satisfies",
            "certificate as a writing",
            "certificate as memorandum",
            "certificate/memorandum",
            "sufficient writing",
            "written memorandum",
            "memorializes",
            "signed writing",
        ),
    ):
        return "writing_or_certificate_satisfies_gate"
    if _contains_any(
        text,
        (
            "replacement certificate controls",
            "association rules control",
            "bylaws control",
            "final certificate",
            "last designation",
            "change of beneficiary",
        ),
    ):
        return "association_or_replacement_controls"
    if _contains_any(text, ("one-year", "one year", "cannot be performed within", "within a year")):
        return "one_year_gate_reasoning"
    if _contains_any(
        text,
        (
            "marriage-consideration",
            "marriage consideration",
            "made upon consideration of marriage",
            "antenuptial",
            "premarital promise",
            "marriage provision",
        ),
    ):
        return "marriage_consideration_gate_reasoning"
    if _contains_any(text, ("depends", "jurisdiction-dependent", "fact-dependent", "if ", "assuming", "uncertain")):
        return "conditional_multigate_reasoning"
    if _contains_any(text, ("main purpose", "main-purpose", "own business", "own pecuniary interest")):
        return "main_purpose_suretyship_exception"
    if _contains_any(text, ("contra proferentem", "against the drafter", "construe against")):
        return "contra_proferentem_reasoning"
    if _contains_any(text, ("plain meaning", "ordinary meaning", "text-first", "unambiguous")):
        return "plain_meaning_reasoning"
    if _contains_any(text, ("exclusive remedy", "specific remedy", "service-credit schedule")):
        return "exclusive_remedy_reasoning"
    raw = str(signature.get("reasoning_path") or signature.get("conclusion") or "general_reasoning")
    return re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")[:80] or "general_reasoning"


def _coarsen_reasoning_bucket(signature: dict, outcome: str, exception: str, reasoning: str) -> str:
    """Collapse prose-level signature variation into reviewable legal-reasoning families."""

    text = _signature_text(signature)
    if reasoning in {"writing_or_certificate_satisfies_gate", "constructive_trust_or_equity"}:
        return reasoning
    if outcome == "claim_fails_or_later_designation_controls":
        if exception == "no_writing_or_no_exception" and not _contains_any(text, ("bylaw", "replacement", "change of beneficiary", "later designation")):
            return "statute_bars_no_writing"
        if _contains_any(text, ("bylaw", "beneficiary", "replacement", "certificate", "change of beneficiary", "later designation")):
            return "sof_bar_and_later_designation_controls"
        return "sof_bar_no_valid_exception"
    if outcome == "claim_succeeds":
        if _contains_any(text, ("constructive trust", "unjust enrichment", "equity", "equitable claim")):
            return "constructive_trust_or_equity"
        if exception == "writing_or_certificate" or _contains_any(text, ("signed writing", "signed note", "memorandum", "satisfies")):
            return "signed_writing_satisfies_sof_and_supports_enforcement"
        if _contains_any(text, ("estoppel", "reliance", "part performance", "constructive trust", "equity")):
            return "equitable_override_or_constructive_trust"
        return "claimant_enforcement_reasoning"
    if outcome == "outcome_uncertain":
        if exception == "writing_or_certificate":
            return "signed_writing_with_bylaw_or_remedy_uncertainty"
        return "conditional_or_fact_dependent_reasoning"
    return reasoning


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


def cluster_responses(
    responses: list[dict],
    primary_gate_id: str | None = None,
    frank_packet: dict | None = None,
) -> dict:
    if responses and all("reasoning_signature" in response for response in responses):
        return cluster_responses_by_signature(responses, frank_packet=frank_packet)

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


def _normalized_signature(
    signature: dict,
    gate_aliases: dict[str, tuple[str, ...]] | None = None,
) -> tuple[str, str, str, str, str]:
    doctrine = _signature_text({"doctrine": signature.get("doctrine", "")})
    if "statute of frauds" in doctrine or "sof" in doctrine:
        doctrine_bucket = "statute_of_frauds"
    elif "contract" in doctrine:
        doctrine_bucket = "contracts"
    else:
        doctrine_bucket = re.sub(r"[^a-z0-9]+", "_", doctrine).strip("_")[:80] or "unknown"
    trigger = _bucket_trigger(signature, gate_aliases=gate_aliases)
    outcome = _bucket_outcome(signature)
    exception = _bucket_exception(signature)
    reasoning = _coarsen_reasoning_bucket(
        signature,
        outcome=outcome,
        exception=exception,
        reasoning=_bucket_reasoning_path(signature),
    )
    return (
        doctrine_bucket,
        trigger,
        outcome,
        exception,
        reasoning,
    )


def cluster_responses_by_signature(responses: list[dict], frank_packet: dict | None = None) -> dict:
    gate_aliases = _source_gate_aliases(frank_packet)
    grouped: dict[tuple[str, str, str, str, str], list[dict]] = defaultdict(list)
    for response in responses:
        signature_key = _normalized_signature(response["reasoning_signature"], gate_aliases=gate_aliases)
        grouped[signature_key].append({**response, "_dasha_normalized_signature": list(signature_key)})

    clusters = []
    for index, (signature_key, members) in enumerate(sorted(grouped.items()), start=1):
        representative_id = choose_representative([
            {
                **member,
                "legal_signal": {
                    "gate": signature_key[1],
                    "outcome": signature_key[2],
                    "exception": signature_key[3],
                    "reasoning": signature_key[4],
                },
            }
            for member in members
        ])
        signature = members[0]["reasoning_signature"]
        clusters.append({
            "id": f"cluster_{index}",
            "legal_signal": {
                "doctrine": str(signature.get("doctrine", "unknown")),
                "issue": str(signature.get("issue", "unknown")),
                "rule_trigger": str(signature.get("rule_trigger", "unknown")),
                "outcome": str(signature.get("outcome", "unknown")),
                "exception_or_defense": str(signature.get("exception_or_defense", "none")),
                "reasoning_path": str(signature.get("reasoning_path", "unknown")),
                "conclusion": str(signature.get("conclusion", "unknown")),
            },
            "representative_response_id": representative_id,
            "member_response_ids": [member["id"] for member in members],
            "normalized_cluster_key": list(signature_key),
            "members": members,
            "size": len(members),
            "centroid_quality": {
                "mean_feature_similarity": 1.0,
                "mean_text_similarity": 1.0 if len(members) == 1 else round(
                    sum(jaccard(members[0]["text"], member["text"]) for member in members[1:]) / (len(members) - 1),
                    3,
                ),
                "member_count": len(members),
            },
        })
    return {
        "schema_version": "research.dasha.llm.v1",
        "method": "llm_reasoning_signature",
        "normalization": {
            "version": "reasoning_bucket_v3",
            "source_gate_aliases_used": bool(gate_aliases),
            "source_gate_ids": sorted(gate_aliases),
        },
        "clusters": clusters,
    }
