"""Karthic dynamic rubric generation for Statute of Frauds benchmarks."""

from __future__ import annotations

from .utils import stable_hash


def _row(row_id: str, category: str, criterion: str, source_support: list[str]) -> dict:
    return {
        "id": row_id,
        "category": category,
        "weight": 0.0,
        "criterion": criterion,
        "source_support": source_support[:4],
    }


def build_karthic_rubric(frank_packet: dict) -> dict:
    gates = frank_packet.get("statute_of_frauds", {}).get("gates", [])
    primary_gate = gates[0] if gates else {"id": "general_sof", "label": frank_packet.get("doctrine_family", "Statute of Frauds")}
    source_facts = frank_packet.get("source_extraction", {}).get("trigger_facts", [])
    variation_ids = [variation["id"] for variation in frank_packet.get("variations", [])]
    gate_label = primary_gate["label"]

    rows = [
        _row(
            "K-SOF-GATE-01",
            "gate",
            f"Identifies {gate_label} as the controlling Statute of Frauds gate and explains why the source facts do or do not trigger it.",
            source_facts,
        ),
        _row(
            "K-DOC-01",
            "doctrine",
            "Frames the answer as a Statute of Frauds enforceability problem rather than a generic fairness, contract, or beneficiary dispute.",
            source_facts,
        ),
        _row(
            "K-RULE-01",
            "rule",
            f"States the operative rule for {gate_label} with the correct boundary condition and burden of analysis.",
            [primary_gate.get("rule", "")],
        ),
        _row(
            "K-FACT-01",
            "facts",
            "Uses the legally material source facts, including the alleged promise, timing, writing status, performance facts, and parties' roles.",
            source_facts,
        ),
        _row(
            "K-WRITING-01",
            "writing",
            "Separates whether a signed writing exists from whether an exception, substitute, or equitable doctrine can overcome noncompliance.",
            source_facts,
        ),
        _row(
            "K-EXC-01",
            "exceptions",
            "Analyzes only source-supported exceptions or substitutes, such as main-purpose, part performance, admissions, delivery, payment, or estoppel when applicable.",
            source_facts,
        ),
        _row(
            "K-COUNTER-01",
            "counterargument",
            "States the strongest legally plausible counterargument without treating it as automatic or ignoring the controlling gate.",
            frank_packet.get("source_extraction", {}).get("source_limits", []),
        ),
        _row(
            "K-CONC-01",
            "conclusion",
            "Gives a bottom-line likely outcome tied to gate, writing/compliance, exceptions, and the source facts.",
            [frank_packet.get("gold_answer", "")[:500]],
        ),
        _row(
            "K-VAR-01",
            "variation",
            f"Correctly explains whether each Frank variation changes the gate, writing analysis, exception analysis, or only surface facts: {', '.join(variation_ids)}.",
            variation_ids,
        ),
        _row(
            "K-SRC-01",
            "source_support",
            "Avoids unsupported generic Statute of Frauds statements and anchors every important legal move in the source case or documented pipeline assumptions.",
            source_facts,
        ),
    ]

    weight = round(1.0 / len(rows), 4)
    rows = [{**row, "weight": weight} for row in rows]
    rows[-1]["weight"] = round(1.0 - sum(row["weight"] for row in rows[:-1]), 4)

    return {
        "schema_version": "research.karthic.v2",
        "id": frank_packet["id"].replace("frank_", "karthic_"),
        "frank_packet_id": frank_packet["id"],
        "source_hash": frank_packet["source"]["sha256_16"],
        "primary_gate_id": primary_gate["id"],
        "rows": rows,
        "scoring_policy": {
            "scale": [0, 1, 2, 3, 4],
            "row_score_meaning": "0=absent or wrong, 2=partial, 4=source-grounded and materially complete",
            "projection_policy": "Judge cluster representatives, then project representative row scores to all members in that Dasha cluster.",
        },
        "prompt_hashes": {
            "karthic_packet_to_rubric": stable_hash({"packet": frank_packet["id"], "primary_gate": primary_gate, "rows": rows}),
        },
    }
