"""Thin clients for the two model providers the benchmarks query.

OpenAI models go through the official SDK; Replicate-hosted models (Claude, Gemini, Llama,
DeepSeek, Grok) go through Replicate's REST API with a create-then-poll loop, retries on
transient errors, and a hard deadline. Every command that generates answers uses these two
functions instead of carrying its own copy.
"""
import asyncio
import time
from typing import Any, Dict, Optional

import httpx

REPLICATE_API = "https://api.replicate.com/v1"
DEFAULT_POLL_TIMEOUT = 600      # seconds before a single prediction is abandoned
DEFAULT_CREATE_ATTEMPTS = 5     # POST attempts (429s and 5xx back off exponentially)
POLL_INTERVAL = 3               # seconds between status checks


def replicate_input(model: str, question: str, system_prompt: str, *, temperature: float = 0.7,
                    max_tokens: int = 1000) -> Dict[str, Any]:
    """Shape the request body for a Replicate model; the hosted models differ in what they accept."""
    name = model.lower()
    if "deepseek" in name:
        return {"input": {"prompt": f"{question}\n\n{system_prompt}", "thinking": "None", "top_p": 1,
                          "max_tokens": max_tokens, "temperature": temperature,
                          "presence_penalty": 0, "frequency_penalty": 0}}
    if "gemini" in name:
        return {"input": {"prompt": f"System Instruction: {system_prompt}\n\nUser Question: {question}",
                          "temperature": temperature}}
    if "claude" in name:
        # Replicate's Claude models reject a separate system_prompt field.
        return {"input": {"prompt": f"System Instruction: {system_prompt}\n\nUser Question: {question}",
                          "max_tokens": 2048 if "sonnet" in name else max_tokens, "temperature": temperature}}
    return {"input": {"prompt": question, "system_prompt": system_prompt,
                      "max_tokens": max_tokens, "temperature": temperature}}


def short_model_name(model: str) -> str:
    """'anthropic/claude-3.5-haiku' -> 'claude-3.5-haiku' (the name saved runs use)."""
    return model.split("/")[-1]


async def replicate_predict(
    model: str,
    payload: Dict[str, Any],
    token: str,
    *,
    client: Optional[httpx.AsyncClient] = None,
    poll_timeout: float = DEFAULT_POLL_TIMEOUT,
    create_attempts: int = DEFAULT_CREATE_ATTEMPTS,
    poll_interval: float = POLL_INTERVAL,
    retry_backoff: float = 1.0,
) -> str:
    """Create a prediction and poll until it finishes. Returns the output text.

    Raises RuntimeError with a readable reason on rate limiting (429) or server errors (5xx) that
    never clear, on a request Replicate rejects outright (bad token, unknown model, invalid input:
    reported immediately, not retried), on a failed or cancelled prediction, or on a prediction
    that does not finish before ``poll_timeout``.
    ``poll_interval`` and ``retry_backoff`` exist so tests can run without real delays.
    """
    owner, name = (model.split("/") + ["unknown"])[:2] if "/" in model else ("unknown", model)
    url = f"{REPLICATE_API}/models/{owner}/{name}/predictions"
    headers = {"Authorization": f"Token {token}", "Content-Type": "application/json"}

    own_client = client is None
    client = client or httpx.AsyncClient(timeout=60.0)
    try:
        for attempt in range(create_attempts):
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 201:
                break
            if response.status_code != 429 and response.status_code < 500:
                # A bad token, unknown model, or invalid input will not fix itself: report it now.
                raise RuntimeError(f"Replicate rejected the request: {response.status_code} {response.text[:200]}")
            await asyncio.sleep(min(2 ** attempt + 2, 60) * retry_backoff)
        else:
            raise RuntimeError(f"Replicate refused the request after {create_attempts} attempts: "
                               f"{response.status_code} {response.text[:200]}")

        get_url = response.json()["urls"]["get"]
        deadline = time.monotonic() + poll_timeout
        while True:
            if time.monotonic() > deadline:
                raise RuntimeError(f"Prediction timed out after {poll_timeout:.0f}s")
            await asyncio.sleep(poll_interval)
            status_response = await client.get(get_url, headers=headers)
            if status_response.status_code != 200:
                continue  # rate limited or transient: poll again
            prediction = status_response.json()
            status = prediction.get("status")
            if status == "succeeded":
                output = prediction.get("output")
                return "".join(output) if isinstance(output, list) else str(output)
            if status in ("failed", "canceled"):
                raise RuntimeError(f"Prediction {status}: {prediction.get('error', 'no detail')}")
    finally:
        if own_client:
            await client.aclose()


async def openai_chat(client, model: str, system_prompt: str, question: str, *, temperature: float = 0.7) -> str:
    """One chat completion; returns the message text."""
    response = await client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": question}],
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def temperature_for(model: str, default: float = 0.7) -> float:
    """gpt-5-nano is sampled hotter, as in the saved runs."""
    return 1.0 if model == "gpt-5-nano" else default
