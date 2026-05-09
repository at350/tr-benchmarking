"""Checksum manifest for internal research handoff artifacts."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from .utils import write_json


HANDOFF_PATTERNS = (
    "README_RESEARCH.md",
    "VISION.md",
    "findings.md",
    "research-log.md",
    "research-state.yaml",
    "paper/main.tex",
    "paper/references.bib",
    "paper/sections/*.tex",
    "paper/tables/*.tex",
    "paper/figures/*",
    "research/fixtures/live_multi_provider_config.example.json",
    "research/fixtures/live_natural_response_batch_config.example.json",
    "research/fixtures/tiny_perturbation_config.json",
    "research/fixtures/tiny_contract_config.json",
    "experiments/*/protocol.md",
    "experiments/*/analysis.md",
    "experiments/*/results*.json",
    "experiments/*/results/*.json",
    "to_human/*.md",
    "to_human/*.json",
    "research/validation/*.py",
)

HANDOFF_EXCLUDED_FILENAMES = {
    "handoff_manifest.json",
    "no_call_audit.json",
    "no_call_audit.md",
    "no_call_audit.html",
}


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _record(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path.relative_to(root)),
        "sha256_16": _file_hash(path),
        "bytes": path.stat().st_size,
    }


def _matched_files(root: Path) -> list[Path]:
    files: set[Path] = set()
    for pattern in HANDOFF_PATTERNS:
        for path in root.glob(pattern):
            if path.is_file() and path.name not in HANDOFF_EXCLUDED_FILENAMES:
                files.add(path)
    return sorted(files, key=lambda item: str(item.relative_to(root)))


def build_handoff_manifest(
    repo_root: str | Path = ".",
    *,
    output_path: str | Path = "to_human/handoff_manifest.json",
) -> dict[str, Any]:
    """Write hashes for artifacts expected to be reviewed or regenerated."""

    root = Path(repo_root).resolve()
    records = [_record(path, root) for path in _matched_files(root)]
    digest = hashlib.sha256(
        "\n".join(f"{item['path']}:{item['sha256_16']}:{item['bytes']}" for item in records).encode("utf-8")
    ).hexdigest()[:16]
    summary = {
        "schema_version": "research.handoff_manifest.v1",
        "status": "handoff_manifest_ready" if records else "handoff_manifest_empty",
        "artifact_count": len(records),
        "manifest_hash": digest,
        "patterns": list(HANDOFF_PATTERNS),
        "excluded_filenames": sorted(HANDOFF_EXCLUDED_FILENAMES),
        "artifacts": records,
    }
    write_json(root / output_path, summary)
    return summary
