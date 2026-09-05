"""The ``trbench`` command: one entry point, one subcommand per task.

Each subcommand lives in its own module exposing ``add_parser(subparsers)`` and ``run(args)``.
Heavy imports (torch, umap, matplotlib) happen inside ``run`` so ``trbench --help`` stays fast.
"""
import argparse
import importlib
import sys
from typing import List, Optional

from trbench import __version__

# (subcommand, module, one-line help)
COMMANDS = [
    ("cluster", "trbench.cli.cluster", "Embed and cluster saved free-form answers into a run file"),
    ("inspect", "trbench.cli.inspect_run", "Summarise a saved run: model mix, small clusters, verdict splits, excerpts"),
    ("generate", "trbench.cli.generate", "Collect free-form answers from OpenAI or Replicate models (spends credits)"),
    ("robust-benchmark", "trbench.cli.robust_benchmark", "Generate free-form answers from every model and cluster them (spends credits)"),
    ("irac-benchmark", "trbench.cli.irac_benchmark", "Generate IRAC-structured answers, cluster, and label doctrines (spends credits)"),
    ("poison", "trbench.cli.poison", "Inject deliberately wrong IRAC answers into a saved dataset and re-cluster"),
    ("visualize", "trbench.cli.visualize", "Draw the before/after embedding maps and the cluster-size chart"),
    ("grid-search", "trbench.cli.grid_search", "Sweep UMAP/HDBSCAN parameters against the verdict heuristic"),
    ("bridge", "trbench.cli.bridge", "JSON-in / JSON-out clustering used by the frontend"),
    ("replicate-check", "trbench.cli.replicate_check", "Send one request to Replicate models to check the token works (spends credits)"),
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="trbench",
        description="Cluster and inspect how language models reason about legal questions.",
        epilog="Commands that call model APIs read OPENAI_API_KEY / REPLICATE_API_TOKEN from the "
               "environment or a .env file in the current directory or a parent.",
    )
    parser.add_argument("--version", action="version", version=f"trbench {__version__}")
    subparsers = parser.add_subparsers(dest="command", metavar="<command>", required=True)
    for name, module_name, help_text in COMMANDS:
        module = importlib.import_module(module_name)
        module.add_parser(subparsers, name, help_text)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.run(args) or 0)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
