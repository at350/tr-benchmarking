"""Provider-agnostic text generation for research pipeline agents."""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .openai_client import _read_env_file, _ssl_context, extract_json_object


def _env_value(repo_root: Path, name: str) -> str:
    import os

    direct = os.environ.get(name, "").strip()
    if direct:
        return direct
    for env_path in (repo_root / ".env", repo_root / "frontend" / ".env"):
        candidate = _read_env_file(env_path).get(name, "").strip()
        if candidate:
            return candidate
    raise RuntimeError(f"{name} is not set in process env or ignored local env files.")


def _env_value_any(repo_root: Path, names: tuple[str, ...]) -> str:
    for name in names:
        try:
            return _env_value(repo_root, name)
        except RuntimeError:
            continue
    raise RuntimeError(
        "None of these credential names are set in process env or ignored local env files: "
        + ", ".join(names)
    )


def _post_json(url: str, headers: dict[str, str], body: dict[str, Any], timeout: int = 120) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout, context=_ssl_context()) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Provider request failed with HTTP {exc.code}: {detail}") from exc


def _get_json(url: str, headers: dict[str, str], timeout: int = 60) -> dict[str, Any]:
    request = Request(
        url,
        headers=headers,
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout, context=_ssl_context()) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Provider request failed with HTTP {exc.code}: {detail}") from exc


def _openai_text(repo_root: Path, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int) -> str:
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
    }
    if model.startswith("gpt-5") or model.startswith("o"):
        body["max_completion_tokens"] = max_tokens
    else:
        body["temperature"] = temperature
        body["max_tokens"] = max_tokens
    payload = _post_json(
        "https://api.openai.com/v1/chat/completions",
        {"Authorization": f"Bearer {_env_value(repo_root, 'OPENAI_API_KEY')}"},
        body,
    )
    return str(payload["choices"][0]["message"]["content"]).strip()


def _anthropic_text(repo_root: Path, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int) -> str:
    system = "\n\n".join(message["content"] for message in messages if message["role"] == "system")
    user_messages = [
        {"role": "assistant" if message["role"] == "assistant" else "user", "content": message["content"]}
        for message in messages
        if message["role"] != "system"
    ]
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": user_messages,
    }
    if system:
        body["system"] = system
    payload = _post_json(
        "https://api.anthropic.com/v1/messages",
        {
            "x-api-key": _env_value(repo_root, "ANTHROPIC_API_KEY"),
            "anthropic-version": "2023-06-01",
        },
        body,
    )
    return "\n".join(part.get("text", "") for part in payload.get("content", []) if part.get("type") == "text").strip()


def _gemini_text(repo_root: Path, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int) -> str:
    prompt = "\n\n".join(f"{message['role'].upper()}:\n{message['content']}" for message in messages)
    api_key = _env_value_any(repo_root, ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"))
    payload = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model)}:generateContent?key={api_key}",
        {},
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        },
    )
    parts = payload["candidates"][0]["content"].get("parts", [])
    return "\n".join(part.get("text", "") for part in parts).strip()


def _replicate_text(repo_root: Path, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int) -> str:
    if "/" not in model:
        raise ValueError("Replicate-hosted model identifier must be formatted as owner/model")
    owner, model_name = model.split("/", 1)
    prompt = "\n\n".join(f"{message['role'].upper()}:\n{message['content']}" for message in messages)
    authorization = f"Bearer {_env_value(repo_root, 'REPLICATE_API_TOKEN')}"
    payload = _post_json(
        f"https://api.replicate.com/v1/models/{owner}/{model_name}/predictions",
        {
            "Authorization": authorization,
            "Prefer": "wait",
        },
        {
            "input": {
                "prompt": prompt,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        },
    )
    for _ in range(12):
        if payload.get("status") in {"succeeded", "failed", "canceled"}:
            break
        get_url = payload.get("urls", {}).get("get")
        if not get_url:
            break
        time.sleep(5)
        payload = _get_json(get_url, {"Authorization": authorization})
    if payload.get("status") != "succeeded":
        if payload.get("error"):
            raise RuntimeError(f"Replicate prediction failed: {payload['error']}")
        raise RuntimeError(f"Replicate prediction did not finish successfully: {payload.get('status')}")
    output = payload.get("output")
    if isinstance(output, list):
        return "".join(str(item) for item in output).strip()
    if isinstance(output, dict):
        return json.dumps(output)
    return str(output or "").strip()


def generate_text(
    *,
    repo_root: Path,
    provider: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.2,
    max_tokens: int = 1800,
) -> str:
    provider_key = provider.lower()
    if provider_key == "openai":
        return _openai_text(repo_root, model, messages, temperature, max_tokens)
    if provider_key in {"anthropic", "claude"}:
        return _anthropic_text(repo_root, model, messages, temperature, max_tokens)
    if provider_key in {"google", "gemini"}:
        return _gemini_text(repo_root, model, messages, temperature, max_tokens)
    if provider_key == "replicate":
        return _replicate_text(repo_root, model, messages, temperature, max_tokens)
    raise ValueError(f"Unsupported provider: {provider}")


def generate_json(
    *,
    repo_root: Path,
    provider: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 2400,
) -> dict[str, Any]:
    raw = generate_text(
        repo_root=repo_root,
        provider=provider,
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    try:
        return extract_json_object(raw)
    except Exception:
        repaired = generate_text(
            repo_root=repo_root,
            provider=provider,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Repair malformed JSON. Return only valid JSON. Do not add markdown or commentary.",
                },
                {
                    "role": "user",
                    "content": f"Repair this into valid JSON without changing its meaning:\n\n{raw}",
                },
            ],
            temperature=0.0,
            max_tokens=max(max_tokens, 4000),
        )
        try:
            return extract_json_object(repaired)
        except Exception:
            fallback = _openai_text(
                repo_root,
                "gpt-4o-mini",
                [
                    {
                        "role": "system",
                        "content": "Extract and repair valid JSON. Return only one valid JSON object.",
                    },
                    {
                        "role": "user",
                        "content": f"Return the intended JSON object from this malformed output:\n\n{raw}",
                    },
                ],
                0.0,
                max(max_tokens, 4000),
            )
            return extract_json_object(fallback)
