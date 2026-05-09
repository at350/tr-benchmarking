"""Quality gates for internal research calibration."""

from __future__ import annotations

import json

from .config import QualityGateConfig
from .utils import jaccard, tokenize


SCENARIO_FACT_TERMS = {
    "agreed",
    "argues",
    "beneficiary",
    "certificate",
    "changed",
    "claimed",
    "contract",
    "died",
    "drafted",
    "later",
    "married",
    "named",
    "obtained",
    "oral",
    "paid",
    "possession",
    "promise",
    "promised",
    "refused",
    "replacement",
    "signed",
    "wedding",
    "wife",
    "writing",
}


def question_quality_errors(question: str, label: str = "question") -> list[str]:
    """Return errors when a Frank question is too abstract for natural model benchmarking."""

    text = " ".join(str(question or "").split())
    word_count = len(text.split())
    tokens = tokenize(text)
    sentence_count = sum(text.count(mark) for mark in ".?!")
    fact_hits = len(tokens & SCENARIO_FACT_TERMS)
    errors = []
    if word_count < 65:
        errors.append(f"{label} is too short to be a self-contained legal scenario")
    if sentence_count < 3:
        errors.append(f"{label} does not include enough factual scenario sentences")
    if "?" not in text:
        errors.append(f"{label} lacks a neutral call question")
    if text.lower().startswith("if ") and word_count < 90:
        errors.append(f"{label} is framed as an abstract conditional rather than a case-like hypo")
    if fact_hits < 4:
        errors.append(f"{label} lacks enough concrete party, timing, writing, or dispute facts")
    return errors


def validate_frank_packet(packet: dict) -> list[str]:
    errors = []
    required = ["source", "selected_pack", "doctrine_family", "source_extraction", "gold_answer", "neutral_question", "variations", "controller_card"]
    for key in required:
        if not packet.get(key):
            errors.append(f"Frank packet missing {key}")
    errors.extend(question_quality_errors(str(packet.get("neutral_question", "")), "Frank neutral_question"))
    for variation in packet.get("variations", []):
        if isinstance(variation, dict):
            variation_id = variation.get("id", "unknown")
            errors.extend(question_quality_errors(str(variation.get("question", "")), f"Frank variation {variation_id} question"))
    if "Bounded uncertainty:" in str(packet):
        errors.append("Frank packet contains deprecated standalone Bounded uncertainty heading")
    if packet.get("controller_card", {}).get("packet_status") != "ready_for_karthic":
        errors.append("Frank packet is not ready_for_karthic")
    return errors


def validate_rubric_pack(rubric: dict, gates: QualityGateConfig) -> list[str]:
    errors = []
    rows = rubric.get("rows", [])
    if len(rows) < gates.min_rubric_rows:
        errors.append(f"Rubric has fewer than {gates.min_rubric_rows} rows")

    categories = {row.get("category") for row in rows}
    for category in gates.required_categories:
        if category not in categories:
            errors.append(f"Rubric missing required category {category}")

    for index, left in enumerate(rows):
        if not left.get("id") or not left.get("criterion"):
            errors.append("Rubric row missing id or criterion")
        for right in rows[index + 1:]:
            if jaccard(left.get("criterion", ""), right.get("criterion", "")) > gates.max_duplicate_similarity:
                errors.append(f"Rubric rows {left.get('id')} and {right.get('id')} appear duplicate")
    return errors


def find_mixed_reasoning_clusters(clusters: dict, threshold: float) -> list[dict]:
    mixed = []
    for cluster in clusters.get("clusters", []):
        signals = {(
            member.get("legal_signal", {}).get("conclusion"),
            member.get("legal_signal", {}).get("reasoning"),
        ) for member in cluster.get("members", [])}
        if len(signals) > 1:
            mixed.append({"cluster_id": cluster["id"], "reason": "multiple legal signals"})
            continue
        members = cluster.get("members", [])
        if len(members) > 1:
            representative = next((member for member in members if member["id"] == cluster["representative_response_id"]), members[0])
            similarities = [jaccard(representative["text"], member["text"]) for member in members if member is not representative]
            representative_signal_terms = tokenize(json.dumps(representative.get("legal_signal", {}), sort_keys=True))
            shared_legal_terms = [
                len(
                    (
                        tokenize(representative["text"])
                        | representative_signal_terms
                    )
                    & (
                        tokenize(member["text"])
                        | tokenize(json.dumps(member.get("legal_signal", {}), sort_keys=True))
                    )
                    & {
                        "wife",
                        "marriage",
                        "premarital",
                        "certificate",
                        "replacement",
                        "association",
                        "beneficiaries",
                        "children",
                        "sister",
                        "promise",
                        "contract",
                        "interpretation",
                        "plain",
                        "meaning",
                        "ambiguity",
                        "remedy",
                        "damages",
                        "seller",
                        "buyer",
                        "covenant",
                    }
                )
                for member in members
                if member is not representative
            ]
            if similarities and sum(similarities) / len(similarities) < threshold and min(shared_legal_terms or [0]) < 2:
                mixed.append({"cluster_id": cluster["id"], "reason": "low centroid/member lexical overlap"})
    return mixed
