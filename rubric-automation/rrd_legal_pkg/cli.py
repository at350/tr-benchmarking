"""CLI entry point for the legal Recursive Rubric Decomposition pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .llm import AnthropicLLMClient, MockLLMClient, OpenAILLMClient
from .models import LegalTaskExample, PipelineConfig
from .pipeline import RRDPipeline


def build_parser() -> argparse.ArgumentParser:
    """Construct the argument parser."""

    parser = argparse.ArgumentParser(description="Recursive Rubric Decomposition for legal-answer evaluation.")
    parser.add_argument("--input", type=Path, help="Path to a legal task JSON file.")
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"), help="Directory for exported artifacts.")
    parser.add_argument("--threshold", type=int, default=3, help="Decomposition match threshold.")
    parser.add_argument("--max-iterations", type=int, default=4, help="Maximum RRD iterations.")
    parser.add_argument(
        "--disable-misalignment",
        action="store_true",
        help="Disable rubric misalignment filtering.",
    )
    parser.add_argument(
        "--weighting",
        choices=["uniform", "llm", "whitened", "doctrinal"],
        default="doctrinal",
        help="Final weighting strategy.",
    )
    parser.add_argument(
        "--include-style-rubrics",
        action="store_true",
        help="Retain secondary presentation rubrics.",
    )
    parser.add_argument("--verbose", action="store_true", help="Print iteration progress.")
    parser.add_argument(
        "--provider",
        choices=["mock", "openai", "anthropic"],
        default="mock",
        help="LLM provider to use.",
    )
    parser.add_argument("--model", default="gpt-4.1-mini", help="Model name for a real LLM client.")
    parser.add_argument("--demo", action="store_true", help="Run the bundled toy demo input.")
    return parser


def load_task(input_path: Path) -> LegalTaskExample:
    """Read a legal task JSON file."""

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    return LegalTaskExample.from_dict(payload)


def main() -> int:
    """Run the CLI and return a process exit code."""

    parser = build_parser()
    args = parser.parse_args()

    if not args.demo and not args.input:
        parser.error("Either --input or --demo is required.")

    input_path = args.input
    if args.demo:
        input_path = Path(__file__).resolve().parent.parent / "examples" / "toy_legal_task.json"

    task = load_task(input_path)
    config = PipelineConfig(
        decomposition_match_threshold=args.threshold,
        max_iterations=args.max_iterations,
        misalignment_enabled=not args.disable_misalignment,
        weighting_mode=args.weighting,
        llm_model_name=args.model,
        include_style_rubrics=args.include_style_rubrics,
    )

    if args.provider == "openai":
        llm_client = OpenAILLMClient(
            model_name=config.llm_model_name,
            max_retries=config.llm_max_retries,
            temperature=config.llm_temperature,
        )
    elif args.provider == "anthropic":
        llm_client = AnthropicLLMClient(
            model_name=config.llm_model_name,
            max_retries=config.llm_max_retries,
            temperature=config.llm_temperature,
        )
    else:
        llm_client = MockLLMClient()

    pipeline = RRDPipeline(llm_client=llm_client, config=config)
    output_dir = args.output_dir / input_path.stem
    result = pipeline.run(task, output_dir=output_dir, verbose=args.verbose)

    print(f"Final active rubrics: {len(result.rubric_set.active_rubrics())}")
    print(f"Iterations: {result.rubric_set.iteration_count}")
    print(f"Output directory: {result.output_dir}")
    print(f"Covered categories: {', '.join(result.coverage_audit['covered_categories'])}")
    if result.coverage_audit["underrepresented_categories"]:
        print(
            "Underrepresented categories: "
            + ", ".join(result.coverage_audit["underrepresented_categories"])
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
