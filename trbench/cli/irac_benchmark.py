"""``trbench irac-benchmark``: ask every model for IRAC-structured answers, cluster them, label doctrines.

Each model is sampled ``--per-model`` times under a system prompt demanding a strict
{issue, rule, application, conclusion} JSON object. Malformed answers are repaired where
possible and otherwise counted as failures. Outputs go to ``<output-dir>/responses`` and
``<output-dir>/results``. Spends OpenAI and Replicate credits, plus one GPT-4o call per cluster.
"""
import asyncio
import os
from typing import Dict, List

from trbench.env import env_flag, load_env
from trbench.irac.parsing import extract_json
from trbench.providers import openai_chat, replicate_input, replicate_predict, short_model_name, temperature_for
from trbench.results import IRAC_NOISE, build_results_document, failure_report, irac_fields, read_json, timestamp, write_json

DEFAULT_OUTPUT_DIR = os.path.join("runs", "irac")
DEFAULT_PER_MODEL = 20
MAX_CONCURRENT_REPLICATE = 10

SYSTEM_PROMPT = """You are an expert legal assistant. 

You must formulate your response using the IRAC method (Issue, Rule, Application, Conclusion).

You MUST return ONLY a strictly formatted JSON object. 
Do not include conversational conversational text. Do not use Markdown JSON block wrappers if your API does not support them natively; just return raw JSON text.

CRITICAL INSTRUCTION: Do NOT use acronyms or abbreviations under any circumstances. Spell out all legal terms fully (e.g., use "Intentional Infliction of Emotional Distress" instead of "IIED"). This ensures consistency across different evaluations.

Your JSON must exactly match the following schema:
{
  "issue": "A concise statement of the core legal question.",
  "rule": "The relevant legal doctrine or rules governing the issue.",
  "application": "How the rule directly applies to the specific facts provided.",
  "conclusion": "A direct, definitive answer to the legal question."
}
"""

OPENAI_MODELS = ["gpt-4o", "gpt-4-turbo", "gpt-5-nano", "gpt-5.2"]
REPLICATE_MODELS = [
    "google/gemini-3-flash", "google/gemini-3-pro", "meta/llama-4-maverick-instruct",
    "deepseek-ai/deepseek-v3.1", "anthropic/claude-4.5-sonnet", "anthropic/claude-3.5-haiku",
]
IRAC_KEYS = ("issue", "rule", "application", "conclusion")


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--question", required=True, help="text file containing the question")
    parser.add_argument("--resume", help="an existing responses_<timestamp>.json to top up: model/index ids already in it "
                                         "are not requested again (a run stopped part-way writes no file)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="root holding responses/ and results/ (default: %(default)s)")
    parser.add_argument("--per-model", type=int, default=DEFAULT_PER_MODEL, help="answers per model (default: %(default)s)")
    parser.add_argument("--openai-models", default=",".join(OPENAI_MODELS), help="comma-separated (default: %(default)s)")
    parser.add_argument("--replicate-models", default=",".join(REPLICATE_MODELS), help="comma-separated (default: %(default)s)")
    parser.add_argument("--dry-run", action="store_true", help="print the request plan and exit without calling any API")
    parser.set_defaults(run=run)


def standardize(parsed: dict) -> dict:
    lowered = {str(k).lower(): v for k, v in parsed.items()}
    return {key: lowered.get(key, "") for key in IRAC_KEYS}


def parse_irac(text: str):
    """Return the standardized IRAC dict, or an error string."""
    parsed = extract_json(text)
    if not parsed:
        return None, f"Failed to parse JSON from response:\n{text}"
    lowered = {str(k).lower() for k in parsed}
    if not all(key in lowered for key in IRAC_KEYS):
        return None, f"JSON parsed but missing core IRAC keys:\n{parsed}"
    return standardize(parsed), None


async def fetch_openai(client, model: str, question: str, index: int) -> dict:
    record_id = f"{model}_{index}"
    try:
        text = await openai_chat(client, model, SYSTEM_PROMPT, question, temperature=temperature_for(model))
    except Exception as exc:
        return {"error": str(exc), "model": model, "id": record_id}
    parsed, error = parse_irac(text)
    if error:
        return {"error": error, "model": model, "id": record_id}
    return {"model": model, "prompt": question, "response": parsed, "raw_text": text, "id": record_id}


async def fetch_replicate(semaphore, token: str, model: str, question: str, index: int) -> dict:
    name = short_model_name(model)
    record_id = f"{name}_{index}"
    async with semaphore:
        try:
            text = await replicate_predict(model, replicate_input(model, question, SYSTEM_PROMPT), token)
        except Exception as exc:
            return {"error": str(exc), "model": name, "id": record_id}
    parsed, error = parse_irac(text)
    if error:
        return {"error": error, "model": name, "id": record_id}
    return {"model": name, "prompt": question, "response": parsed, "raw_text": text, "id": record_id}


async def collect(args, question: str, existing_ids) -> List[dict]:
    load_env()
    openai_key, replicate_token = os.getenv("OPENAI_API_KEY"), os.getenv("REPLICATE_API_TOKEN")
    openai_models = [m for m in args.openai_models.split(",") if m.strip()]
    replicate_models = [m for m in args.replicate_models.split(",") if m.strip()]
    if env_flag("ENABLE_GROK4"):
        replicate_models.append("xai/grok-4")
    print(f"OpenAI models ({'key found' if openai_key else 'OPENAI_API_KEY not set, skipped'}): {', '.join(openai_models) or '-'}")
    print(f"Replicate models ({'token found' if replicate_token else 'REPLICATE_API_TOKEN not set, skipped'}): {', '.join(replicate_models) or '-'}")
    if not openai_key:
        print("Note: without OPENAI_API_KEY the per-cluster doctrine labels are also skipped.")

    # The plan covers every listed model so --dry-run shows the full cost before any key is
    # configured; only the models whose key is present are actually requested.
    openai_plan = [(m, i) for m in openai_models for i in range(args.per_model) if f"{m}_{i}" not in existing_ids]
    replicate_full = [(m, i) for m in replicate_models for i in range(args.per_model)
                      if f"{short_model_name(m)}_{i}" not in existing_ids]
    print(f"Planned requests: {len(openai_plan)} OpenAI + {len(replicate_full)} Replicate "
          f"({args.per_model} per model, {len(existing_ids)} already collected). Each request is one model call.")
    plan = openai_plan if openai_key else []
    replicate_plan = replicate_full if replicate_token else []
    if len(plan) + len(replicate_plan) < len(openai_plan) + len(replicate_full):
        print(f"Runnable with the keys present now: {len(plan)} OpenAI + {len(replicate_plan)} Replicate.")
    if args.dry_run:
        return []
    if not (plan or replicate_plan):
        if existing_ids:
            print("Nothing new to request; clustering the resumed answers as they are.")
            return []
        raise SystemExit("Nothing to do: no model has a usable key. Set OPENAI_API_KEY and/or REPLICATE_API_TOKEN (see .env.example).")

    from openai import AsyncOpenAI
    from tqdm.asyncio import tqdm

    tasks = []
    if plan:
        client = AsyncOpenAI(api_key=openai_key)
        tasks += [fetch_openai(client, m, question, i) for m, i in plan]
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REPLICATE)
    tasks += [fetch_replicate(semaphore, replicate_token, m, question, i) for m, i in replicate_plan]
    return await tqdm.gather(*tasks)


def run(args) -> int:
    with open(args.question, "r", encoding="utf-8") as handle:
        question = handle.read()
    stamp = timestamp()
    print(f"IRAC benchmark run {stamp}: {args.per_model} answers per model.")

    existing: List[dict] = read_json(args.resume) if args.resume else []
    if existing:
        print(f"Resuming from {args.resume}: {len(existing)} existing answers.")

    new_results = asyncio.run(collect(args, question, {item["id"] for item in existing}))
    if args.dry_run:
        return 0
    results = list(new_results) + existing
    valid = [r for r in results if "error" not in r]
    failures = [r for r in results if "error" in r]
    print(f"Collected {len(valid)} valid IRAC answers; {len(failures)} failures.")
    failure_counts: Dict[str, int] = failure_report(failures, args.per_model)

    responses_path = write_json(os.path.join(args.output_dir, "responses", f"responses_{stamp}.json"), valid)
    print(f"Saved answers to {responses_path}")
    if not valid:
        print("No parseable answers to cluster.")
        return 1

    from trbench.irac.pipeline import IRACEvaluationPipeline

    print("\n--- Running clustering pipeline ---")
    pipeline = IRACEvaluationPipeline()
    pipeline.ingest_data(valid)
    clustering = pipeline.run_clustering(method="density")
    document = build_results_document(
        pipeline, clustering, valid,
        metadata={"timestamp": stamp, "question": question, "schema": "IRAC", "failures": failure_counts},
        member_fields=irac_fields, noise_fields=IRAC_NOISE,
    )
    results_path = write_json(os.path.join(args.output_dir, "results", f"run_{stamp}.json"), document)
    print(f"Results saved to {results_path} ({clustering['num_clusters']} clusters)")
    return 0
