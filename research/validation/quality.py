"""Quality gates for calibration before JD review."""

from __future__ import annotations

from .config import QualityGateConfig
from .utils import jaccard, tokenize


def validate_frank_packet(packet: dict) -> list[str]:
    errors = []
    required = ["source", "selected_pack", "doctrine_family", "source_extraction", "gold_answer", "neutral_question", "variations", "controller_card"]
    for key in required:
        if not packet.get(key):
            errors.append(f"Frank packet missing {key}")
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
            shared_legal_terms = [
                len(tokenize(representative["text"]) & tokenize(member["text"]) & {
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
                })
                for member in members
                if member is not representative
            ]
            if similarities and sum(similarities) / len(similarities) < threshold and min(shared_legal_terms or [0]) < 2:
                mixed.append({"cluster_id": cluster["id"], "reason": "low centroid/member lexical overlap"})
    return mixed
