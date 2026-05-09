"""Small OpenAI HTTP client used by live research runs.

The validation pipeline keeps this dependency-light so offline tests do not
require the OpenAI Python package.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import ssl
import time
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .perturbations import build_question_tracks


CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_openai_api_key(repo_root: Path) -> str:
    """Load an API key from process env or ignored local env files."""

    direct = os.environ.get("OPENAI_API_KEY", "").strip()
    if direct:
        return direct

    for env_path in (repo_root / ".env", repo_root / "frontend" / ".env"):
        candidate = _read_env_file(env_path).get("OPENAI_API_KEY", "").strip()
        if candidate:
            return candidate

    raise RuntimeError(
        "OPENAI_API_KEY is not set. Add it to an ignored env file or export it before live_openai runs."
    )


def chat_completion(
    *,
    repo_root: Path,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.45,
    max_tokens: int = 900,
) -> str:
    """Call OpenAI chat completions and return the assistant text."""

    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    request = Request(
        CHAT_COMPLETIONS_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {load_openai_api_key(repo_root)}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=90, context=_ssl_context()) as response:
            payload: dict[str, Any] = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI request failed with HTTP {exc.code}: {detail}") from exc

    try:
        return str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected OpenAI response shape: {payload}") from exc


def generate_live_responses(repo_root: Path, config: Any, frank_packet: dict) -> list[dict[str, Any]]:
    """Generate fresh model answers to the locked Frank neutral question."""

    responses: list[dict[str, Any]] = []
    max_variations = (
        config.perturbations.max_variations
        if getattr(config, "perturbations", None) and config.perturbations.max_variations > 0
        else None
    )
    tracks = (
        build_question_tracks(frank_packet, max_variations)
        if getattr(config, "perturbations", None) and config.perturbations.enabled
        else build_question_tracks(frank_packet, 0)
    )
    response_prompt_style = getattr(config, "response_prompt_style", "natural")
    if response_prompt_style != "natural":
        raise ValueError("live_openai response generation only supports natural response prompts")

    for track in tracks:
        for model in config.models:
            for sample_index in range(config.responses_per_model):
                text = chat_completion(
                    repo_root=repo_root,
                    model=model,
                    messages=[{"role": "user", "content": str(track["question"])}],
                    temperature=0.35 + (sample_index * 0.08),
                )
                responses.append({
                    "id": f"{model.replace('/', '_')}_{track['track_id']}_{sample_index + 1}",
                    "model": model,
                    "sample_index": sample_index + 1,
                    "generated_at_unix": int(time.time()),
                    "question_id": track["question_id"],
                    "track_id": track["track_id"],
                    "variant_id": track["variant_id"],
                    "perturbation_type": track["perturbation_type"],
                    "expected_behavior": track["expected_behavior"],
                    "response_prompt_style": response_prompt_style,
                    "answer_format": "natural_unconstrained",
                    "text": text,
                })

    return responses


def extract_json_object(text: str) -> dict[str, Any]:
    """Extract a JSON object from a model response."""

    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError(f"No JSON object found in model response: {text[:200]}")
    return json.loads(stripped[start:end + 1])


def judge_representative_with_openai(
    *,
    repo_root: Path,
    model: str,
    rubric: dict[str, Any],
    representative: dict[str, Any],
    legal_signal: dict[str, Any],
) -> list[dict[str, Any]]:
    """Use an LLM judge to score one Dasha centroid against Karthic rubric rows."""

    compact_rows = [
        {
            "id": row["id"],
            "category": row["category"],
            "criterion": row["criterion"],
            "source_support": row.get("source_support", []),
        }
        for row in rubric["rows"]
    ]
    prompt = (
        "You are a calibrated legal benchmark judge. Apply each rubric row to the response. "
        "Use only the rubric, source support snippets, and response. Score each row on 0-4. "
        "Return strict JSON with this shape: {\"row_scores\":[{\"row_id\":\"...\",\"score\":0,\"rationale\":\"...\"}]}.\n\n"
        f"Legal cluster signal:\n{json.dumps(legal_signal, indent=2)}\n\n"
        f"Rubric rows:\n{json.dumps(compact_rows, indent=2)}\n\n"
        f"Response:\n{representative['text']}"
    )
    output = chat_completion(
        repo_root=repo_root,
        model=model,
        messages=[
            {"role": "system", "content": "Return only valid JSON. Do not include markdown."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.0,
        max_tokens=1800,
    )
    parsed = extract_json_object(output)
    row_scores = parsed.get("row_scores")
    if not isinstance(row_scores, list):
        raise ValueError(f"LLM judge output missing row_scores: {parsed}")
    by_id = {row["id"]: row for row in rubric["rows"]}
    normalized = []
    for item in row_scores:
        row_id = str(item.get("row_id", ""))
        if row_id not in by_id:
            continue
        score = max(0, min(4, int(item.get("score", 0))))
        normalized.append({
            "row_id": row_id,
            "category": by_id[row_id]["category"],
            "score": score,
            "rationale": str(item.get("rationale", "LLM judge supplied no rationale."))[:800],
        })
    if len(normalized) != len(rubric["rows"]):
        missing = sorted(set(by_id) - {item["row_id"] for item in normalized})
        raise ValueError(f"LLM judge output missing rubric rows: {missing}")
    return normalized
