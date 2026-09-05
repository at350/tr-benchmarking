"""``trbench generate``: collect free-form answers to one question from a set of models.

Appends to the responses file (ids are ``<model>_<index>``; existing ids are skipped so the
command can be re-run to top up). Spends OpenAI or Replicate credits.

    trbench generate --provider openai --count 100
    trbench generate --provider replicate --models anthropic/claude-3.5-haiku,meta/meta-llama-3-70b-instruct --count 40
"""
import asyncio
import os
from typing import List

from trbench.env import load_env
from trbench.providers import openai_chat, replicate_input, replicate_predict, short_model_name
from trbench.results import read_json, write_json

DEFAULT_OUTPUT = os.path.join("runs", "free-form", "responses", "responses.json")
SYSTEM_PROMPT = "You are a helpful legal assistant."
DEFAULT_MODELS = {
    "openai": ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "gpt-5.2", "gpt-5-mini"],
    "replicate": ["anthropic/claude-3.5-sonnet", "anthropic/claude-3.5-haiku",
                  "meta/meta-llama-3-70b-instruct", "mistralai/mixtral-8x7b-instruct-v0.1", "google/gemini-3-flash"],
}
# The Statute of Frauds (marriage provision) question behind runs/free-form/responses/responses.json.
DEFAULT_QUESTION = (
    "A father promised his son that if the son married the daughter of a politician within 18 months, the father "
    "would assume responsibility for the son's student loans.\nThe father was primarily motivated to make this promise "
    "by a tax deduction that he thought would be available to him if he paid the son's student loans, although he was "
    "also glad to help his son and hoped the son would marry the politician's daughter. The son agreed because he "
    "already planned to propose to the politician's daughter, but the father and son never signed a written contract. "
    "Fourteen months later, the son married the politician's daughter. The father refused to make any payments on the "
    "son's loans, however, because the father had learned that he would not in fact qualify for any tax deductions.\n"
    "Is the father's oral promise to pay off the son's student loans enforceable?"
)


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--provider", choices=["openai", "replicate"], required=True)
    parser.add_argument("--models", help="comma-separated model ids (default: the provider's built-in list)")
    parser.add_argument("--question-file", help="text file with the question (default: the built-in marriage-provision question)")
    parser.add_argument("--count", type=int, default=100, help="total answers to collect, spread over the models (default: %(default)s)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="responses file to append to (default: %(default)s)")
    parser.add_argument("--overwrite", action="store_true", help="replace the output file instead of appending")
    parser.add_argument("--concurrency", type=int, default=5, help="parallel requests (default: %(default)s)")
    parser.set_defaults(run=run)


def openai_temperature(model: str, index: int) -> float:
    """Vary temperature across samples so answers are not near-duplicates; small models run hotter."""
    return 1.0 if "mini" in model else round(0.7 + (index % 5) * 0.1, 1)


async def collect(args, question: str, models: List[str], existing_ids: set) -> List[dict]:
    load_env()
    per_model = args.count // len(models) + 1
    semaphore = asyncio.Semaphore(args.concurrency)

    if args.provider == "openai":
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise SystemExit("OPENAI_API_KEY not set (see .env.example).")
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=key)

        async def one(model, index):
            record_id = f"{model}_{index}"
            async with semaphore:
                try:
                    text = await openai_chat(client, model, SYSTEM_PROMPT, question, temperature=openai_temperature(model, index))
                except Exception as exc:
                    print(f"  {record_id}: {exc}")
                    return None
            return {"model": model, "prompt": question, "response": text, "id": record_id}
    else:
        token = os.getenv("REPLICATE_API_TOKEN")
        if not token:
            raise SystemExit("REPLICATE_API_TOKEN not set (see .env.example).")

        async def one(model, index):
            name = short_model_name(model)
            record_id = f"{name}_{index}"
            async with semaphore:
                try:
                    text = await replicate_predict(model, replicate_input(model, question, SYSTEM_PROMPT), token)
                except Exception as exc:
                    print(f"  {record_id}: {exc}")
                    return None
            return {"model": name, "prompt": question, "response": text, "id": record_id}

    tasks = []
    for model in models:
        label = model if args.provider == "openai" else short_model_name(model)
        for index in range(per_model):
            if f"{label}_{index}" not in existing_ids and len(tasks) < args.count:
                tasks.append(one(model, index))
    print(f"Requesting {len(tasks)} answers from {len(models)} {args.provider} models...")
    results = await asyncio.gather(*tasks)
    return [record for record in results if record]


def run(args) -> int:
    question = DEFAULT_QUESTION
    if args.question_file:
        with open(args.question_file, "r", encoding="utf-8") as handle:
            question = handle.read()
    models = [m for m in (args.models or ",".join(DEFAULT_MODELS[args.provider])).split(",") if m.strip()]

    existing: List[dict] = []
    if not args.overwrite and os.path.exists(args.output):
        existing = read_json(args.output)
    new_records = asyncio.run(collect(args, question, models, {record["id"] for record in existing}))
    write_json(args.output, existing + new_records)
    print(f"Saved {len(new_records)} new answers to {args.output} ({len(existing) + len(new_records)} total).")
    return 0
