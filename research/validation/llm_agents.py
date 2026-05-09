"""LLM-driven Frank, Karthic, Dasha, and response-generation helpers."""

from __future__ import annotations

import json
from pathlib import Path
import re
import time
from typing import Any, Callable

from .config import AgentConfig, ResearchConfig
from .instruction_context import load_agent_instruction_context
from .perturbations import build_question_tracks
from .provider_client import generate_json, generate_text
from .utils import display_path, stable_hash


JsonGenerator = Callable[[list[dict[str, str]], AgentConfig], dict[str, Any]]
NON_LATIN_PATTERN = re.compile(r"[\u0400-\u04FF\u0370-\u03FF\u0590-\u05FF\u0600-\u06FF]+")


def structured_answer_instruction(headings: tuple[str, ...]) -> str:
    rendered = "\n".join(f"- {heading}" for heading in headings)
    return (
        "Answer in exactly these headings and in this order. Do not omit headings. "
        "Use the provided source and question only.\n"
        f"{rendered}"
    )


def model_response_messages(
    config: ResearchConfig,
    frank_packet: dict[str, Any],
    question: str | None = None,
) -> list[dict[str, str]]:
    """Build the prompt sent to benchmarked response models."""

    question = str(question or frank_packet["neutral_question"])
    if config.response_prompt_style == "structured_legacy":
        source_excerpt = frank_packet["source"]["excerpt"]
        format_instruction = structured_answer_instruction(config.answer_headings)
        return [
            {
                "role": "system",
                "content": (
                    "You are producing an independent benchmark answer to a legal question. "
                    "Use your own legal judgment from the supplied source and question; do not "
                    "try to match a hidden gold answer or harmonize with other models. Follow "
                    "the required structure exactly."
                ),
            },
            {
                "role": "user",
                "content": f"Source excerpt:\n{source_excerpt}\n\nQuestion:\n{question}\n\n{format_instruction}",
            },
        ]
    if config.response_prompt_style != "natural":
        raise ValueError(f"Unsupported response_prompt_style: {config.response_prompt_style}")
    return [{"role": "user", "content": question}]


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")[:80] or "unknown"


def sanitize_reasoning_signature(value: Any) -> Any:
    if isinstance(value, str):
        return re.sub(r"\s+", " ", NON_LATIN_PATTERN.sub("", value)).strip()
    if isinstance(value, list):
        return [sanitize_reasoning_signature(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_reasoning_signature(item) for key, item in value.items()}
    return value


def build_frank_packet_with_llm(
    repo_root: Path,
    config: ResearchConfig,
    json_generator: JsonGenerator | None = None,
) -> dict[str, Any]:
    source_text = config.source_case_path.read_text(encoding="utf-8")
    agent = config.agents["frank"]
    instruction_context = load_agent_instruction_context(repo_root, "frank")
    messages = [
        {
            "role": "system",
            "content": (
                "You are Frank, a legal benchmark source-to-question agent. "
                "You work across legal doctrines. Use the canonical instruction context. "
                "Return strict JSON only."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Canonical instruction context:\n{instruction_context['context']}\n\n"
                "Build a benchmark packet from this source case. Infer the doctrine from the source; "
                "do not assume Statute of Frauds or any other doctrine unless the source supports it. "
                "Return JSON with keys: "
                "doctrine_family, detected_doctrine_gates (array of {id,label,rule,source_evidence}), "
                "source_extraction {jurisdiction, clean_legal_issue, trigger_facts, source_limits}, "
                "neutral_question, gold_answer, variations (array of {id,lane,changed_fact,question,expected_behavior}), "
                "controller_card {packet_status,rubric_status,evaluation_status,primary_gate_id,strongest_counterargument}. "
                f"The gold_answer must use these headings: {list(config.answer_headings)}.\n\n"
                f"Source case:\n{source_text}"
            ),
        },
    ]
    raw = json_generator(messages, agent) if json_generator else generate_json(
        repo_root=repo_root,
        provider=agent.provider,
        model=agent.model,
        messages=messages,
        temperature=agent.temperature,
    )
    gates = raw.get("detected_doctrine_gates") or raw.get("gates") or []
    primary_gate = raw.get("controller_card", {}).get("primary_gate_id") or (gates[0]["id"] if gates else "general")
    raw_card = raw.get("controller_card", {})
    doctrine_family = str(raw.get("doctrine_family", config.domain))
    packet = {
        "schema_version": "research.frank.llm.v1",
        "id": f"frank_{config.run_id}",
        "source": {
            "path": display_path(config.source_case_path, repo_root),
            "sha256_16": stable_hash(source_text),
            "excerpt": source_text[:1200],
        },
        "selected_pack": "llm_inferred",
        "doctrine_family": doctrine_family,
        "doctrine_profile": {
            "inference_mode": "source_and_instruction_context",
            "instruction_context_hash": instruction_context["context_hash"],
            "loaded_instruction_files": instruction_context["loaded_files"].splitlines(),
            "primary_gate_id": primary_gate,
        },
        "doctrine_gates": gates,
        "source_extraction": raw.get("source_extraction", {}),
        "gold_answer": str(raw.get("gold_answer", "")),
        "neutral_question": str(raw.get("neutral_question", "")),
        "variations": raw.get("variations", []),
        "controller_card": {
            **raw_card,
            "packet_status": "ready_for_karthic",
            "rubric_status": "not_started",
            "evaluation_status": "not_ready",
            "primary_gate_id": primary_gate,
        },
        "prompt_hashes": {
            "frank_llm_source_to_packet": stable_hash({"messages": messages, "agent": agent.__dict__}),
            "frank_instruction_context": instruction_context["context_hash"],
        },
    }
    if "statute of frauds" in doctrine_family.lower():
        packet["statute_of_frauds"] = {
            "focus": True,
            "gates": gates,
            "primary_gate_id": primary_gate,
        }
    return packet


def build_karthic_rubric_with_llm(
    repo_root: Path,
    config: ResearchConfig,
    frank_packet: dict[str, Any],
    json_generator: JsonGenerator | None = None,
) -> dict[str, Any]:
    agent = config.agents["karthic"]
    instruction_context = load_agent_instruction_context(repo_root, "karthic")
    messages = [
        {
            "role": "system",
            "content": (
                "You are Karthic, a legal rubric-construction agent. Build source-grounded, "
                "non-duplicative rubric rows for any legal doctrine. Use the canonical instruction context. "
                "Return strict JSON only."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Canonical instruction context:\n{instruction_context['context']}\n\n"
                "Create a rubric for this locked Frank packet. Return JSON with key rows, where each row has "
                "id, category, weight, criterion, and source_support. Include rows for doctrine/gate, rule, facts, "
                "compliance or elements, exceptions or defenses, counterargument, conclusion, variation sensitivity, "
                "and source support when applicable. Weights must sum to 1.\n\n"
                f"Frank packet:\n{json.dumps(frank_packet, indent=2)}"
            ),
        },
    ]
    raw = json_generator(messages, agent) if json_generator else generate_json(
        repo_root=repo_root,
        provider=agent.provider,
        model=agent.model,
        messages=messages,
        temperature=agent.temperature,
    )
    rows = [_normalize_rubric_row(row) for row in _extract_rubric_rows(raw)]
    missing_categories = _missing_required_categories(rows, config.quality_gates.required_categories)
    if (len(rows) < config.quality_gates.min_rubric_rows or missing_categories) and json_generator is None:
        repair_messages = [
            {
                "role": "system",
                "content": (
                    "You are Karthic. Your previous rubric output failed schema validation. "
                    "Return only strict JSON with a top-level rows array."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Canonical instruction context:\n{instruction_context['context']}\n\n"
                    "Regenerate the rubric from this Frank packet. The JSON object must contain a top-level key rows. "
                    f"Create at least {config.quality_gates.min_rubric_rows} rows. Include all required canonical categories: "
                    f"{list(config.quality_gates.required_categories)}. Allowed semantic aliases are acceptable, but the criteria "
                    "must be source-grounded and doctrine-specific. Each row must have id, category, weight, criterion, and source_support. "
                    "Weights must sum to 1. Do not return modules without rows.\n\n"
                    f"Previous invalid output:\n{json.dumps(raw, indent=2)[:4000]}\n\n"
                    f"Frank packet:\n{json.dumps(frank_packet, indent=2)}"
                ),
            },
        ]
        raw = generate_json(
            repo_root=repo_root,
            provider=agent.provider,
            model=agent.model,
            messages=repair_messages,
            temperature=0.0,
            max_tokens=3600,
        )
        messages = messages + repair_messages
        rows = [_normalize_rubric_row(row) for row in _extract_rubric_rows(raw)]
    if rows:
        total = sum(float(row.get("weight", 0)) for row in rows)
        if not 0.99 <= total <= 1.01:
            weight = round(1.0 / len(rows), 4)
            rows = [{**row, "weight": weight} for row in rows]
            rows[-1]["weight"] = round(1.0 - sum(row["weight"] for row in rows[:-1]), 4)
    return {
        "schema_version": "research.karthic.llm.v1",
        "id": frank_packet["id"].replace("frank_", "karthic_"),
        "frank_packet_id": frank_packet["id"],
        "source_hash": frank_packet["source"]["sha256_16"],
        "primary_gate_id": frank_packet.get("controller_card", {}).get("primary_gate_id"),
        "rows": rows,
        "scoring_policy": raw.get("scoring_policy", {
            "scale": [0, 1, 2, 3, 4],
            "row_score_meaning": "0=absent or wrong, 2=partial, 4=source-grounded and materially complete",
            "projection_policy": "Judge cluster representatives, then project centroid row scores to all members.",
        }),
        "prompt_hashes": {
            "karthic_llm_packet_to_rubric": stable_hash({"messages": messages, "agent": agent.__dict__}),
            "karthic_instruction_context": instruction_context["context_hash"],
        },
    }


def _normalize_category(category: str) -> str:
    normalized = category.strip().lower().replace("-", "_").replace(" ", "_")
    mapping = {
        "doctrine/gate": "doctrine",
        "doctrine_gate": "doctrine",
        "gate": "doctrine",
        "compliance/elements": "rule",
        "compliance_or_elements": "rule",
        "elements": "rule",
        "exception": "exceptions",
        "exceptions/defenses": "exceptions",
        "exceptions_or_defenses": "exceptions",
        "defenses": "exceptions",
        "variation_sensitivity": "variation",
        "source": "source_support",
        "support": "source_support",
    }
    return mapping.get(normalized, normalized)


def _extract_rubric_rows(raw: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = [
        raw.get("rows"),
        raw.get("rubric_rows"),
        raw.get("scored_rows"),
        raw.get("rubric", {}).get("rows") if isinstance(raw.get("rubric"), dict) else None,
        raw.get("base_rubric", {}).get("rows") if isinstance(raw.get("base_rubric"), dict) else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, list):
            return [row for row in candidate if isinstance(row, dict)]
    modules = raw.get("modules")
    if isinstance(modules, list):
        rows: list[dict[str, Any]] = []
        for module in modules:
            if isinstance(module, dict) and isinstance(module.get("rows"), list):
                rows.extend(row for row in module["rows"] if isinstance(row, dict))
        if rows:
            return rows
    return []


def _missing_required_categories(rows: list[dict[str, Any]], required_categories: tuple[str, ...]) -> list[str]:
    categories = {_normalize_category(str(row.get("category", ""))) for row in rows}
    return [category for category in required_categories if category not in categories]


def _normalize_rubric_row(row: dict[str, Any]) -> dict[str, Any]:
    source_support = row.get("source_support", [])
    if isinstance(source_support, str):
        source_support = [source_support]
    return {
        **row,
        "id": str(row.get("id", "")),
        "category": _normalize_category(str(row.get("category", ""))),
        "criterion": str(row.get("criterion", "")),
        "source_support": [str(item) for item in source_support],
    }


def generate_model_responses(repo_root: Path, config: ResearchConfig, frank_packet: dict[str, Any]) -> list[dict[str, Any]]:
    max_variations = config.perturbations.max_variations if config.perturbations.max_variations > 0 else None
    tracks = (
        build_question_tracks(frank_packet, max_variations)
        if config.perturbations.enabled
        else build_question_tracks(frank_packet, 0)
    )
    responses: list[dict[str, Any]] = []
    for track in tracks:
        messages = model_response_messages(config, frank_packet, question=str(track["question"]))
        for spec in config.response_models:
            for sample_index in range(spec.samples):
                text = generate_text(
                    repo_root=repo_root,
                    provider=spec.provider,
                    model=spec.model,
                    messages=messages,
                    temperature=spec.temperature + (sample_index * 0.05),
                    max_tokens=1600,
                )
                responses.append({
                    "id": f"{_slug(spec.provider)}_{_slug(spec.model)}_{_slug(str(track['track_id']))}_{sample_index + 1}",
                    "provider": spec.provider,
                    "model": spec.model,
                    "sample_index": sample_index + 1,
                    "generated_at_unix": int(time.time()),
                    "question_id": track["question_id"],
                    "track_id": track["track_id"],
                    "variant_id": track["variant_id"],
                    "perturbation_type": track["perturbation_type"],
                    "expected_behavior": track["expected_behavior"],
                    "response_prompt_style": config.response_prompt_style,
                    "answer_format": "natural_unconstrained"
                    if config.response_prompt_style == "natural"
                    else list(config.answer_headings),
                    "text": text,
                })
    return responses


def add_llm_reasoning_signatures(
    repo_root: Path,
    config: ResearchConfig,
    frank_packet: dict[str, Any],
    responses: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    agent = config.agents["dasha"]
    instruction_context = load_agent_instruction_context(repo_root, "dasha")
    signed = []
    for response in responses:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are Dasha, a legal reasoning clustering agent. Extract a normalized reasoning signature. "
                    "Use the canonical instruction context. Return strict JSON only."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Canonical instruction context:\n{instruction_context['context']}\n\n"
                    "Return JSON with keys: doctrine, issue, rule_trigger, outcome, exception_or_defense, "
                    "reasoning_path, conclusion, key_distinguishing_facts. Keep values concise, normalized, and English-only. "
                    "Infer labels from the Frank packet and response; do not map responses into SOF labels unless SOF is source-supported. "
                    "Do not translate isolated words into another language.\n\n"
                    f"Frank packet:\n{json.dumps(frank_packet, indent=2)[:6000]}\n\n"
                    f"Response:\n{response['text']}"
                ),
            },
        ]
        signature = generate_json(
            repo_root=repo_root,
            provider=agent.provider,
            model=agent.model,
            messages=messages,
            temperature=agent.temperature,
            max_tokens=900,
        )
        signed.append({**response, "reasoning_signature": sanitize_reasoning_signature(signature)})
    return signed
