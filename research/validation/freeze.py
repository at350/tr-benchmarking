"""Frozen protocol manifests for reproducible research runs."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
import json
from pathlib import Path
from typing import Any

from .config import ResearchConfig, load_config
from .instruction_context import INSTRUCTION_FILES, load_agent_instruction_context
from .utils import stable_hash, write_json


def _serializable(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if is_dataclass(value):
        return {key: _serializable(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {str(key): _serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serializable(item) for item in value]
    return value


def _file_record(path: Path, relative_path: str) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    return {
        "path": relative_path,
        "sha256_16": stable_hash(text),
        "bytes": len(text.encode("utf-8")),
    }


def _source_record(config: ResearchConfig, repo_root: Path) -> dict[str, Any]:
    try:
        relative = str(config.source_case_path.relative_to(repo_root))
    except ValueError:
        relative = str(config.source_case_path)
    return _file_record(config.source_case_path, relative)


def build_protocol_freeze(
    config_path: str | Path,
    repo_root: str | Path,
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    """Build and optionally write a frozen protocol manifest for a run config."""

    root = Path(repo_root).resolve()
    config_file = Path(config_path)
    if not config_file.is_absolute():
        config_file = root / config_file
    config = load_config(config_file, repo_root=root)
    raw_config = json.loads(config_file.read_text(encoding="utf-8"))

    instruction_contexts = {}
    instruction_files = {}
    for agent_name in sorted(INSTRUCTION_FILES):
        context = load_agent_instruction_context(root, agent_name)
        instruction_contexts[agent_name] = {
            "context_hash": context["context_hash"],
            "loaded_files": context["loaded_files"].splitlines(),
        }
        instruction_files[agent_name] = [
            _file_record(root / relative_path, relative_path)
            for relative_path in INSTRUCTION_FILES[agent_name]
        ]

    freeze = {
        "schema_version": "research.protocol_freeze.v1",
        "run_id": config.run_id,
        "config_path": str(config_file.relative_to(root) if config_file.is_relative_to(root) else config_file),
        "config_hash": stable_hash(raw_config),
        "source": _source_record(config, root),
        "mode": config.mode,
        "response_prompt_style": config.response_prompt_style,
        "agents": _serializable(config.agents),
        "response_models": _serializable(config.response_models),
        "clustering": _serializable(config.clustering),
        "judge": _serializable(config.judge),
        "quality_gates": _serializable(config.quality_gates),
        "perturbations": _serializable(config.perturbations),
        "budget": _serializable(config.budget),
        "fixture_responses_path": str(config.fixture_responses_path),
        "instruction_contexts": instruction_contexts,
        "instruction_files": instruction_files,
        "normalization": {
            "dasha_signature_version": "reasoning_bucket_v2",
            "judge_score_scale": "0-4",
            "score_projection_policy": "Representative centroid score applies to all responses in the Dasha cluster.",
        },
    }
    freeze["protocol_hash"] = stable_hash(freeze)
    if output_path:
        write_json(Path(output_path), freeze)
    return freeze
