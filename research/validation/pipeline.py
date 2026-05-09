"""End-to-end source-to-score research pipeline runner."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from .budget import enforce_live_budget, enforce_runtime_judge_budget
from .config import ResearchConfig
from .dasha import cluster_responses
from .frank import build_frank_packet
from .judge import build_zak_packets, judge_clusters, judge_clusters_with_openai
from .karthic import build_karthic_rubric
from .llm_agents import (
    add_llm_reasoning_signatures,
    build_frank_packet_with_llm,
    build_karthic_rubric_with_llm,
    generate_model_responses_with_checkpoint,
)
from .openai_client import generate_live_responses
from .perturbations import build_perturbation_report, build_question_tracks, cluster_responses_by_track
from .quality import find_mixed_reasoning_clusters, validate_frank_packet, validate_rubric_pack
from .report import build_markdown_report, ensure_paper_scaffold
from .source_metadata import source_case_record
from .utils import display_path, stable_hash, write_json


@dataclass(frozen=True)
class PipelineRunResult:
    run_id: str
    output_dir: Path
    status: str
    quality_errors: tuple[str, ...]


def _load_responses(
    config: ResearchConfig,
    repo_root: Path,
    frank_packet: dict,
    checkpoint_path: Path | None = None,
) -> list[dict[str, Any]]:
    if config.mode == "offline":
        return json.loads(config.fixture_responses_path.read_text(encoding="utf-8"))
    if config.mode in {"live", "live_multi_provider"}:
        return generate_model_responses_with_checkpoint(repo_root, config, frank_packet, checkpoint_path=checkpoint_path)
    if config.mode == "live_openai":
        return generate_live_responses(repo_root, config, frank_packet)
    raise ValueError(f"Unsupported research pipeline mode: {config.mode}")


def _resume_json_if_present(path: Path) -> Any | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def run_pipeline(config: ResearchConfig, repo_root: str | Path) -> PipelineRunResult:
    """Run the complete research pipeline and export a fresh run bundle."""

    root = Path(repo_root)
    out = config.output_dir
    out.mkdir(parents=True, exist_ok=True)
    ensure_paper_scaffold(root)
    print(f"[research-run] {config.run_id}: planning", flush=True)
    call_plan = enforce_live_budget(config)

    print(f"[research-run] {config.run_id}: Frank source-to-packet", flush=True)
    frank = _resume_json_if_present(out / "frank_packet.json") if config.mode in {"live", "live_openai", "live_multi_provider"} else None
    if frank is not None:
        print(f"[research-run] {config.run_id}: reusing Frank checkpoint", flush=True)
    elif config.agents["frank"].mode == "llm":
        frank = build_frank_packet_with_llm(root, config)
    else:
        frank = build_frank_packet(config.source_case_path, config.run_id, repo_root=root)
    write_json(out / "frank_packet.json", frank)
    print(f"[research-run] {config.run_id}: Karthic rubric", flush=True)
    rubric = _resume_json_if_present(out / "karthic_rubric.json") if config.mode in {"live", "live_openai", "live_multi_provider"} else None
    if rubric is not None:
        print(f"[research-run] {config.run_id}: reusing Karthic checkpoint", flush=True)
    elif config.agents["karthic"].mode == "llm":
        rubric = build_karthic_rubric_with_llm(root, config, frank)
    else:
        rubric = build_karthic_rubric(frank)
    write_json(out / "karthic_rubric.json", rubric)
    print(f"[research-run] {config.run_id}: model responses", flush=True)
    responses = _load_responses(config, root, frank, checkpoint_path=out / "responses.json")
    for response in responses:
        response.setdefault("response_prompt_style", config.response_prompt_style)
        if config.response_prompt_style == "natural":
            response.setdefault("answer_format", "natural_unconstrained")
        response.setdefault("question_id", frank.get("id"))
    write_json(out / "responses.json", responses)
    if config.clustering.method == "llm_reasoning_signature":
        print(f"[research-run] {config.run_id}: Dasha reasoning signatures", flush=True)
        responses = add_llm_reasoning_signatures(root, config, frank, responses, checkpoint_path=out / "responses.json")
        write_json(out / "responses.json", responses)
    max_variations = config.perturbations.max_variations if config.perturbations.max_variations > 0 else None
    tracks = build_question_tracks(frank, max_variations) if config.perturbations.enabled else build_question_tracks(frank, 0)
    has_multiple_tracks = len({str(response.get("track_id") or response.get("question_id") or "original") for response in responses}) > 1
    print(f"[research-run] {config.run_id}: Dasha clustering", flush=True)
    if config.perturbations.enabled or has_multiple_tracks:
        clusters = cluster_responses_by_track(
            responses,
            primary_gate_id=frank.get("controller_card", {}).get("primary_gate_id"),
            frank_packet=frank,
        )
    else:
        clusters = cluster_responses(
            responses,
            primary_gate_id=frank.get("controller_card", {}).get("primary_gate_id"),
            frank_packet=frank,
        )
    write_json(out / "dasha_clusters.json", clusters)
    call_plan = enforce_runtime_judge_budget(config, clusters, call_plan)
    print(f"[research-run] {config.run_id}: judge scoring", flush=True)
    if config.judge.mode == "llm":
        judge = judge_clusters_with_openai(root, clusters, rubric, config.judge)
    else:
        judge = judge_clusters(clusters, rubric, config.judge.agreement_threshold)
    adjudicated_clusters = (
        judge.get("judge_stability", {}).get("adjudicated_clusters", [])
        if isinstance(judge.get("judge_stability"), dict)
        else []
    )
    if adjudicated_clusters:
        adjudication_calls = len(adjudicated_clusters)
        call_plan = {
            **call_plan,
            "actual_adjudication_calls": adjudication_calls,
            "actual_judge_calls_including_adjudication": (
                call_plan.get("actual_judge_calls", call_plan.get("planned_min_judge_calls", 0))
                + adjudication_calls
            ),
            "actual_total_llm_calls_excluding_frank_karthic_including_adjudication": (
                call_plan.get(
                    "actual_total_llm_calls_excluding_frank_karthic",
                    call_plan.get("planned_total_llm_calls_excluding_frank_karthic", 0),
                )
                + adjudication_calls
            ),
        }
    print(f"[research-run] {config.run_id}: Zak and validation artifacts", flush=True)
    zak = build_zak_packets(judge, clusters, rubric)
    perturbation_report = build_perturbation_report(tracks, responses, clusters) if config.perturbations.enabled else {
        "schema_version": "research.perturbation_validation.v1",
        "status": "not_configured",
        "track_count": 1,
        "checks": [],
    }

    quality_errors = []
    quality_errors.extend(validate_frank_packet(frank))
    quality_errors.extend(validate_rubric_pack(rubric, config.quality_gates))
    for mixed in find_mixed_reasoning_clusters(clusters, config.clustering.mixed_cluster_threshold):
        quality_errors.append(f"Mixed Dasha cluster {mixed['cluster_id']}: {mixed['reason']}")
    if len(clusters.get("clusters", [])) < config.clustering.min_observed_clusters:
        quality_errors.append(
            "Dasha observed "
            f"{len(clusters.get('clusters', []))} clusters, below configured diversity target "
            f"{config.clustering.min_observed_clusters}"
        )
    if config.perturbations.enabled:
        checks = perturbation_report.get("checks", [])
        has_invariant = any(check.get("perturbation_type") == "invariant" for check in checks)
        has_material = any(check.get("perturbation_type") == "material" for check in checks)
        if config.perturbations.require_invariant and not has_invariant:
            quality_errors.append("Perturbation validation did not include an invariant question edit.")
        if config.perturbations.require_material and not has_material:
            quality_errors.append("Perturbation validation did not include a material legal question edit.")
        if perturbation_report.get("status") != "perturbation_validation_passed":
            quality_errors.append("Perturbation validation needs review.")

    status = "internal_validation_ready" if not quality_errors else "needs_engineering_iteration"
    manifest = {
        "schema_version": "research.manifest.v1",
        "run_id": config.run_id,
        "pipeline_status": status,
        "mode": config.mode,
        "source_case_path": display_path(config.source_case_path, root),
        "source": source_case_record(config.source_case_path, root),
        "output_dir": display_path(out, root),
        "models": list(config.models),
        "response_models": [spec.__dict__ for spec in config.response_models],
        "response_prompt_style": config.response_prompt_style,
        "perturbations": config.perturbations.__dict__,
        "budget": config.budget.__dict__,
        "planned_call_counts": call_plan,
        "question_tracks": tracks,
        "agents": {name: agent.__dict__ for name, agent in config.agents.items()},
        "clustering": config.clustering.__dict__,
        "responses_per_model": config.responses_per_model,
        "artifact_hashes": {
            "frank_packet": stable_hash(frank),
            "karthic_rubric": stable_hash(rubric),
            "dasha_clusters": stable_hash(clusters),
            "judge_scores": stable_hash(judge),
            "zak_packets": stable_hash(zak),
            "perturbation_report": stable_hash(perturbation_report),
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
    write_json(out / "perturbation_report.json", perturbation_report)
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
