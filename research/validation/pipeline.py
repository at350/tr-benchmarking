"""End-to-end source-to-score research pipeline runner."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from .config import ResearchConfig
from .dasha import cluster_responses
from .frank import build_frank_packet
from .judge import build_zak_packets, judge_clusters, judge_clusters_with_openai
from .karthic import build_karthic_rubric
from .llm_agents import (
    add_llm_reasoning_signatures,
    build_frank_packet_with_llm,
    build_karthic_rubric_with_llm,
    generate_model_responses,
)
from .openai_client import generate_live_responses
from .quality import find_mixed_reasoning_clusters, validate_frank_packet, validate_rubric_pack
from .report import build_markdown_report, ensure_paper_scaffold
from .utils import stable_hash, write_json


@dataclass(frozen=True)
class PipelineRunResult:
    run_id: str
    output_dir: Path
    status: str
    quality_errors: tuple[str, ...]


def _load_responses(config: ResearchConfig, repo_root: Path, frank_packet: dict) -> list[dict[str, Any]]:
    if config.mode == "offline":
        return json.loads(config.fixture_responses_path.read_text(encoding="utf-8"))
    if config.mode in {"live", "live_multi_provider"}:
        return generate_model_responses(repo_root, config, frank_packet)
    if config.mode == "live_openai":
        return generate_live_responses(repo_root, config, frank_packet)
    raise ValueError(f"Unsupported research pipeline mode: {config.mode}")


def run_pipeline(config: ResearchConfig, repo_root: str | Path) -> PipelineRunResult:
    """Run the complete research pipeline and export a fresh run bundle."""

    root = Path(repo_root)
    out = config.output_dir
    out.mkdir(parents=True, exist_ok=True)
    ensure_paper_scaffold(root)

    if config.agents["frank"].mode == "llm":
        frank = build_frank_packet_with_llm(root, config)
    else:
        frank = build_frank_packet(config.source_case_path, config.run_id)
    if config.agents["karthic"].mode == "llm":
        rubric = build_karthic_rubric_with_llm(root, config, frank)
    else:
        rubric = build_karthic_rubric(frank)
    responses = _load_responses(config, root, frank)
    if config.clustering.method == "llm_reasoning_signature":
        responses = add_llm_reasoning_signatures(root, config, frank, responses)
    clusters = cluster_responses(responses, primary_gate_id=frank.get("controller_card", {}).get("primary_gate_id"))
    if config.judge.mode == "llm":
        judge = judge_clusters_with_openai(root, clusters, rubric, config.judge)
    else:
        judge = judge_clusters(clusters, rubric, config.judge.agreement_threshold)
    zak = build_zak_packets(judge, clusters, rubric)

    quality_errors = []
    quality_errors.extend(validate_frank_packet(frank))
    quality_errors.extend(validate_rubric_pack(rubric, config.quality_gates))
    for mixed in find_mixed_reasoning_clusters(clusters, config.clustering.mixed_cluster_threshold):
        quality_errors.append(f"Mixed Dasha cluster {mixed['cluster_id']}: {mixed['reason']}")

    status = "internal_validation_ready" if not quality_errors else "needs_engineering_iteration"
    manifest = {
        "schema_version": "research.manifest.v1",
        "run_id": config.run_id,
        "pipeline_status": status,
        "mode": config.mode,
        "source_case_path": str(config.source_case_path),
        "output_dir": str(out),
        "models": list(config.models),
        "response_models": [spec.__dict__ for spec in config.response_models],
        "agents": {name: agent.__dict__ for name, agent in config.agents.items()},
        "responses_per_model": config.responses_per_model,
        "artifact_hashes": {
            "frank_packet": stable_hash(frank),
            "karthic_rubric": stable_hash(rubric),
            "dasha_clusters": stable_hash(clusters),
            "judge_scores": stable_hash(judge),
            "zak_packets": stable_hash(zak),
        },
        "prompt_hashes": {
            **frank.get("prompt_hashes", {}),
            **rubric.get("prompt_hashes", {}),
        },
        "quality_errors": quality_errors,
        "research_protocol_note": "Engineering calibration happens before freeze and is not treated as a research result.",
    }

    write_json(out / "manifest.json", manifest)
    write_json(out / "frank_packet.json", frank)
    write_json(out / "karthic_rubric.json", rubric)
    write_json(out / "responses.json", responses)
    write_json(out / "dasha_clusters.json", clusters)
    write_json(out / "judge_scores.json", judge)
    write_json(out / "zak_packets.json", zak)
    (out / "report.md").write_text(
        build_markdown_report(config.run_id, manifest, frank, rubric, clusters, judge, zak),
        encoding="utf-8",
    )

    return PipelineRunResult(
        run_id=config.run_id,
        output_dir=out,
        status=status,
        quality_errors=tuple(quality_errors),
    )
