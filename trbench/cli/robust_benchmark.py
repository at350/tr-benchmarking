"""``trbench robust-benchmark``: free-form answers from every model for one question, then cluster.

The free-form counterpart of ``irac-benchmark``: same models, plain prose answers under a
short system prompt, ``--per-model`` samples each. Outputs go to ``<output-dir>/responses``
and ``<output-dir>/results``. Spends OpenAI and Replicate credits.
"""
import asyncio
import os
from typing import List

from trbench.env import load_env
from trbench.providers import openai_chat, replicate_input, replicate_predict, short_model_name, temperature_for
from trbench.results import FREE_FORM_NOISE, build_results_document, failure_report, free_form_fields, timestamp, write_json

DEFAULT_OUTPUT_DIR = os.path.join("runs", "free-form")
DEFAULT_PER_MODEL = 20
MAX_CONCURRENT_REPLICATE = 10
SYSTEM_PROMPT = "You are a helpful legal assistant."

# The question the saved robustness runs used (a parol-evidence / bounced-check hypothetical).
DEFAULT_QUESTION = (
    'A woman owned a 10-acre tract of rural farmland in fee simple absolute. The woman agreed to sell the '
    'farmland to a man, and each signed a writing stating that the farmland was being sold: ". . . for $10,000, '
    'receipt of which is acknowledged. " In actuality, the man had not yet paid the woman the $10,000. At the '
    'date set for closing, the woman transferred a deed to the farmland to the man, who gave the woman a check '
    'for $10,000. However, a few days after the woman deposited the check, she received notice from her bank '
    'that the check had not cleared, due to insufficient funds in the account. The woman then brought suit '
    "against the man. At trial, the woman seeks to testify that the man did not in fact pay her the $10,000 as "
    "recited in their written instrument. The man objects to the woman's proposed testimony. Will the trial "
    "court judge be correct in sustaining the man's objection?"
)
OPENAI_MODELS = ["gpt-4o", "gpt-4-turbo", "gpt-5-nano", "gpt-5.2"]  # gpt-5-pro never returned an answer in the saved runs
REPLICATE_MODELS = ["google/gemini-3-flash", "google/gemini-3-pro", "meta/llama-4-maverick-instruct",
                    "anthropic/claude-4.5-sonnet", "anthropic/claude-3.5-haiku"]


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--question-file", help="text file with the question (default: the built-in bounced-check hypothetical)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="root holding responses/ and results/ (default: %(default)s)")
    parser.add_argument("--per-model", type=int, default=DEFAULT_PER_MODEL, help="answers per model (default: %(default)s)")
    parser.add_argument("--openai-models", default=",".join(OPENAI_MODELS), help="comma-separated (default: %(default)s)")
    parser.add_argument("--replicate-models", default=",".join(REPLICATE_MODELS), help="comma-separated (default: %(default)s)")
    parser.add_argument("--dry-run", action="store_true", help="print the request plan and exit without calling any API")
    parser.set_defaults(run=run)


async def fetch_openai(client, model, question, index):
    try:
        text = await openai_chat(client, model, SYSTEM_PROMPT, question, temperature=temperature_for(model))
        return {"model": model, "prompt": question, "response": text, "id": f"{model}_{index}"}
    except Exception as exc:
        return {"error": str(exc), "model": model, "id": f"{model}_{index}"}


async def fetch_replicate(semaphore, token, model, question, index):
    name = short_model_name(model)
    async with semaphore:
        try:
            payload = replicate_input(model, question, SYSTEM_PROMPT, max_tokens=2048 if "sonnet" in name else 1000)
            text = await replicate_predict(model, payload, token)
            return {"model": name, "prompt": question, "response": text, "id": f"{name}_{index}"}
        except Exception as exc:
            return {"error": str(exc), "model": name, "id": f"{name}_{index}"}


async def collect(args, question) -> List[dict]:
    load_env()
    openai_key, replicate_token = os.getenv("OPENAI_API_KEY"), os.getenv("REPLICATE_API_TOKEN")
    openai_models = [m for m in args.openai_models.split(",") if m.strip()]
    replicate_models = [m for m in args.replicate_models.split(",") if m.strip()]
    print(f"OpenAI models ({'key found' if openai_key else 'OPENAI_API_KEY not set, skipped'}): {', '.join(openai_models) or '-'}")
    print(f"Replicate models ({'token found' if replicate_token else 'REPLICATE_API_TOKEN not set, skipped'}): {', '.join(replicate_models) or '-'}")
    if not openai_key:
        openai_models = []
    if not replicate_token:
        replicate_models = []
    total = (len(openai_models) + len(replicate_models)) * args.per_model
    print(f"Planned requests: {total} ({len(openai_models) + len(replicate_models)} models x {args.per_model}). Each request is one model call.")
    if args.dry_run:
        return []
    if total == 0:
        raise SystemExit("Nothing to do: no model has a usable key. Set OPENAI_API_KEY and/or REPLICATE_API_TOKEN (see .env.example).")

    from openai import AsyncOpenAI
    from tqdm.asyncio import tqdm

    tasks = []
    if openai_models:
        client = AsyncOpenAI(api_key=openai_key)
        tasks += [fetch_openai(client, m, question, i) for m in openai_models for i in range(args.per_model)]
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REPLICATE)
    tasks += [fetch_replicate(semaphore, replicate_token, m, question, i) for m in replicate_models for i in range(args.per_model)]
    return await tqdm.gather(*tasks)


def run(args) -> int:
    question = DEFAULT_QUESTION
    if args.question_file:
        with open(args.question_file, "r", encoding="utf-8") as handle:
            question = handle.read()
    stamp = timestamp()
    print(f"Robustness benchmark run {stamp}: {args.per_model} answers per model.")

    results = asyncio.run(collect(args, question))
    if args.dry_run:
        return 0
    valid = [r for r in results if "error" not in r]
    failures = [r for r in results if "error" in r]
    print(f"Collected {len(valid)} valid answers; {len(failures)} failures.")
    failure_counts = failure_report(failures, args.per_model)

    responses_path = write_json(os.path.join(args.output_dir, "responses", f"responses_{stamp}.json"), valid)
    print(f"Saved answers to {responses_path}")
    if not valid:
        print("No valid answers to cluster.")
        return 1

    from trbench.pipeline import LSHEvaluationPipeline

    print("\n--- Running clustering pipeline ---")
    pipeline = LSHEvaluationPipeline()
    pipeline.ingest_data(valid)
    clustering = pipeline.run_clustering(method="density")
    document = build_results_document(
        pipeline, clustering, valid,
        metadata={"timestamp": stamp, "question": question, "failures": failure_counts},
        member_fields=free_form_fields, noise_fields=FREE_FORM_NOISE,
    )
    results_path = write_json(os.path.join(args.output_dir, "results", f"run_{stamp}.json"), document)
    print(f"Results saved to {results_path} ({clustering['num_clusters']} clusters)")
    return 0
