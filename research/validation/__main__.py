"""Command line interface for the research validation harness."""

from __future__ import annotations

import argparse
from pathlib import Path

from .config import load_config
from .pipeline import run_pipeline


def main() -> int:
    parser = argparse.ArgumentParser(prog="python3 -m research.validation")
    subcommands = parser.add_subparsers(dest="command", required=True)

    run_parser = subcommands.add_parser("run", help="Run the source-to-score research pipeline")
    run_parser.add_argument("--config", required=True, help="Path to research config JSON")
    run_parser.add_argument("--repo-root", default=".", help="Repository root")

    args = parser.parse_args()
    if args.command == "run":
        root = Path(args.repo_root).resolve()
        config = load_config(args.config, repo_root=root)
        result = run_pipeline(config, repo_root=root)
        print(f"{result.run_id}: {result.status}")
        print(result.output_dir)
        if result.quality_errors:
            for error in result.quality_errors:
                print(f"QUALITY: {error}")
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
