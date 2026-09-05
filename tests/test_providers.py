"""Replicate create-and-poll client against a fake HTTP server (httpx.MockTransport)."""
import asyncio
import json

import httpx
import pytest

from trbench.providers import replicate_input, replicate_predict, short_model_name


def make_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def predict(client, **kwargs):
    return asyncio.run(replicate_predict("anthropic/claude-3.5-haiku", {"input": {}}, "token",
                                         client=client, poll_interval=0, retry_backoff=0, **kwargs))


def test_success_after_polling():
    calls = {"get": 0}

    def handler(request):
        if request.method == "POST":
            assert request.url.path == "/v1/models/anthropic/claude-3.5-haiku/predictions"
            assert request.headers["Authorization"] == "Token token"
            return httpx.Response(201, json={"urls": {"get": "https://api.replicate.com/v1/predictions/p1"}})
        calls["get"] += 1
        status = "processing" if calls["get"] < 3 else "succeeded"
        return httpx.Response(200, json={"status": status, "output": ["Un", "enforceable."]})

    assert predict(make_client(handler)) == "Unenforceable."
    assert calls["get"] == 3


def test_rate_limited_create_retries_then_succeeds():
    posts = {"n": 0}

    def handler(request):
        if request.method == "POST":
            posts["n"] += 1
            if posts["n"] < 3:
                return httpx.Response(429, text="slow down")
            return httpx.Response(201, json={"urls": {"get": "https://api.replicate.com/v1/predictions/p1"}})
        return httpx.Response(200, json={"status": "succeeded", "output": "ok"})

    assert predict(make_client(handler)) == "ok"
    assert posts["n"] == 3


def test_persistent_rate_limit_is_reported_not_key_error():
    def handler(request):
        return httpx.Response(429, text="slow down")

    with pytest.raises(RuntimeError, match="after 2 attempts.*429"):
        predict(make_client(handler), create_attempts=2)


def test_failed_prediction_raises_with_reason():
    def handler(request):
        if request.method == "POST":
            return httpx.Response(201, json={"urls": {"get": "https://api.replicate.com/v1/predictions/p1"}})
        return httpx.Response(200, json={"status": "failed", "error": "model exploded"})

    with pytest.raises(RuntimeError, match="failed: model exploded"):
        predict(make_client(handler))


def test_poll_deadline_is_enforced():
    def handler(request):
        if request.method == "POST":
            return httpx.Response(201, json={"urls": {"get": "https://api.replicate.com/v1/predictions/p1"}})
        return httpx.Response(200, json={"status": "processing"})

    with pytest.raises(RuntimeError, match="timed out"):
        predict(make_client(handler), poll_timeout=0)


def test_transient_poll_errors_are_skipped():
    calls = {"get": 0}

    def handler(request):
        if request.method == "POST":
            return httpx.Response(201, json={"urls": {"get": "https://api.replicate.com/v1/predictions/p1"}})
        calls["get"] += 1
        if calls["get"] == 1:
            return httpx.Response(429)
        return httpx.Response(200, json={"status": "succeeded", "output": "done"})

    assert predict(make_client(handler)) == "done"


@pytest.mark.parametrize("model,expected_keys", [
    ("deepseek-ai/deepseek-v3.1", {"prompt", "thinking", "top_p", "max_tokens", "temperature", "presence_penalty", "frequency_penalty"}),
    ("google/gemini-3-pro", {"prompt", "temperature"}),
    ("anthropic/claude-4.5-sonnet", {"prompt", "max_tokens", "temperature"}),
    ("meta/llama-4-maverick-instruct", {"prompt", "system_prompt", "max_tokens", "temperature"}),
])
def test_replicate_input_shapes_payload_per_model(model, expected_keys):
    payload = replicate_input(model, "Q?", "SYS")
    assert set(payload["input"]) == expected_keys
    assert "Q?" in json.dumps(payload)


def test_claude_sonnet_gets_longer_output_budget():
    assert replicate_input("anthropic/claude-4.5-sonnet", "q", "s")["input"]["max_tokens"] == 2048
    assert replicate_input("anthropic/claude-3.5-haiku", "q", "s")["input"]["max_tokens"] == 1000


def test_short_model_name():
    assert short_model_name("anthropic/claude-3.5-haiku") == "claude-3.5-haiku"
    assert short_model_name("gpt-4o") == "gpt-4o"


def test_client_errors_are_reported_without_retrying():
    posts = {"n": 0}

    def handler(request):
        posts["n"] += 1
        return httpx.Response(401, text="invalid token")

    with pytest.raises(RuntimeError, match="rejected.*401"):
        predict(make_client(handler))
    assert posts["n"] == 1
