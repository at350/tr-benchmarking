"""``trbench replicate-check``: send one small request to Replicate models to confirm the token works.

A manual connectivity check before a long run; it spends a little credit.
"""
import asyncio
import os

from trbench.env import load_env
from trbench.providers import replicate_input, replicate_predict

DEFAULT_MODELS = ["anthropic/claude-3.5-haiku"]


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("models", nargs="*", default=DEFAULT_MODELS, help="Replicate model ids (default: %(default)s)")
    parser.set_defaults(run=run)


async def check(models, token):
    for model in models:
        print(f"Testing {model}...")
        try:
            text = await replicate_predict(model, replicate_input(model, "Reply with the single word: ready", "You are a test.", max_tokens=20), token, poll_timeout=120)
            print(f"  ok: {text.strip()[:80]!r}")
        except Exception as exc:
            print(f"  failed: {exc}")


def run(args) -> int:
    load_env()
    token = os.getenv("REPLICATE_API_TOKEN")
    if not token:
        raise SystemExit("REPLICATE_API_TOKEN is not set.")
    asyncio.run(check(args.models, token))
    return 0
