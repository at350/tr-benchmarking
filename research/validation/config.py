"""Configuration loading for reproducible research validation runs."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ModelSpec:
    provider: str
    model: str
    samples: int
    temperature: float


@dataclass(frozen=True)
class AgentConfig:
    mode: str
    provider: str
    model: str
    temperature: float


@dataclass(frozen=True)
class ClusteringConfig:
    method: str
    min_cluster_size: int
    min_observed_clusters: int
    mixed_cluster_threshold: float
    provider: str
    model: str


@dataclass(frozen=True)
class JudgeConfig:
    mode: str
    provider: str
    model: str
    agreement_threshold: float
    escalation_margin: float
    repeats: int
    temperature: float = 0.0
    judge_models: tuple["JudgeModelSpec", ...] = ()


@dataclass(frozen=True)
class JudgeModelSpec:
    provider: str
    model: str
    repeats: int
    temperature: float = 0.0


@dataclass(frozen=True)
class QualityGateConfig:
    min_rubric_rows: int
    max_duplicate_similarity: float
    required_categories: tuple[str, ...]


@dataclass(frozen=True)
class PerturbationConfig:
    enabled: bool
    max_variations: int
    require_invariant: bool
    require_material: bool


@dataclass(frozen=True)
class BudgetConfig:
    max_response_calls: int
    max_judge_calls: int
    max_total_llm_calls_excluding_frank_karthic: int


@dataclass(frozen=True)
class ResearchConfig:
    run_id: str
    domain: str
    source_case_path: Path
    output_dir: Path
    mode: str
    models: tuple[str, ...]
    response_models: tuple[ModelSpec, ...]
    response_prompt_style: str
    answer_headings: tuple[str, ...]
    agents: dict[str, AgentConfig]
    responses_per_model: int
    clustering: ClusteringConfig
    judge: JudgeConfig
    quality_gates: QualityGateConfig
    perturbations: PerturbationConfig
    budget: BudgetConfig
    fixture_responses_path: Path


def _resolve(repo_root: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return repo_root / path


def load_config(config_path: str | Path, repo_root: str | Path | None = None) -> ResearchConfig:
    """Load a JSON research-run config and resolve repo-relative paths."""

    config_path = Path(config_path)
    root = Path(repo_root) if repo_root is not None else config_path.resolve().parents[2]
    raw: dict[str, Any] = json.loads(config_path.read_text(encoding="utf-8"))

    clustering = raw.get("clustering", {})
    judge = raw.get("judge", {})
    gates = raw.get("quality_gates", {})
    perturbations = raw.get("perturbations", {})
    budget = raw.get("budget", {})
    agents_raw = raw.get("agents", {})

    source_case = _resolve(root, raw["source_case_path"])
    output_dir = _resolve(root, raw["output_dir"])
    fixture_responses = _resolve(
        root,
        raw.get("fixture_responses_path", "research/fixtures/tiny_responses.json"),
    )

    legacy_models = tuple(str(item) for item in raw.get("models", []))
    response_models = tuple(
        ModelSpec(
            provider=str(item.get("provider", "openai")),
            model=str(item["model"]),
            samples=int(item.get("samples", raw.get("responses_per_model", 1))),
            temperature=float(item.get("temperature", 0.35)),
        )
        for item in raw.get("response_models", [])
    )
    if not response_models:
        response_models = tuple(
            ModelSpec(
                provider="openai",
                model=model,
                samples=int(raw.get("responses_per_model", 0)),
                temperature=0.35,
            )
            for model in legacy_models
        )

    default_agent = {"mode": "deterministic", "provider": "openai", "model": "gpt-4o-mini", "temperature": 0.0}
    agents = {
        name: AgentConfig(
            mode=str({**default_agent, **agents_raw.get(name, {})}.get("mode")),
            provider=str({**default_agent, **agents_raw.get(name, {})}.get("provider")),
            model=str({**default_agent, **agents_raw.get(name, {})}.get("model")),
            temperature=float({**default_agent, **agents_raw.get(name, {})}.get("temperature", 0.0)),
        )
        for name in ("frank", "karthic", "dasha")
    }

    return ResearchConfig(
        run_id=str(raw["run_id"]),
        domain=str(raw.get("domain", "auto")),
        source_case_path=source_case,
        output_dir=output_dir,
        mode=str(raw.get("mode", "offline")),
        models=legacy_models,
        response_models=response_models,
        response_prompt_style=str(raw.get("response_prompt_style", "natural")),
        answer_headings=tuple(str(item) for item in raw.get("answer_headings", [
            "Jurisdiction assumption",
            "Bottom-line outcome",
            "Controlling doctrine",
            "Transaction / formation characterization",
            "Writing requirement and trigger",
            "Compliance / substitute / exception analysis",
            "Other defenses or competing doctrines",
            "Strongest counterargument",
        ])),
        agents=agents,
        responses_per_model=int(raw.get("responses_per_model", 0)),
        clustering=ClusteringConfig(
            method=str(clustering.get("method", "legal_signal")),
            min_cluster_size=int(clustering.get("min_cluster_size", 2)),
            min_observed_clusters=int(clustering.get("min_observed_clusters", 1)),
            mixed_cluster_threshold=float(clustering.get("mixed_cluster_threshold", 0.34)),
            provider=str(clustering.get("provider", agents["dasha"].provider)),
            model=str(clustering.get("model", agents["dasha"].model)),
        ),
        judge=JudgeConfig(
            mode=str(judge.get("mode", "deterministic")),
            provider=str(judge.get("provider", "openai")),
            model=str(judge.get("model", "gpt-4o-mini")),
            agreement_threshold=float(judge.get("agreement_threshold", 0.7)),
            escalation_margin=float(judge.get("escalation_margin", 0.2)),
            repeats=max(1, int(judge.get("repeats", 1))),
            temperature=float(judge.get("temperature", 0.0)),
            judge_models=tuple(
                JudgeModelSpec(
                    provider=str(item.get("provider", judge.get("provider", "openai"))),
                    model=str(item.get("model", judge.get("model", "gpt-4o-mini"))),
                    repeats=max(1, int(item.get("repeats", judge.get("repeats", 1)))),
                    temperature=float(item.get("temperature", judge.get("temperature", 0.0))),
                )
                for item in judge.get("judge_models", [])
            ),
        ),
        quality_gates=QualityGateConfig(
            min_rubric_rows=int(gates.get("min_rubric_rows", 5)),
            max_duplicate_similarity=float(gates.get("max_duplicate_similarity", 0.82)),
            required_categories=tuple(str(item) for item in gates.get("required_categories", [])),
        ),
        perturbations=PerturbationConfig(
            enabled=bool(perturbations.get("enabled", False)),
            max_variations=int(perturbations.get("max_variations", 0)),
            require_invariant=bool(perturbations.get("require_invariant", False)),
            require_material=bool(perturbations.get("require_material", False)),
        ),
        budget=BudgetConfig(
            max_response_calls=int(budget.get("max_response_calls", 0)),
            max_judge_calls=int(budget.get("max_judge_calls", 0)),
            max_total_llm_calls_excluding_frank_karthic=int(
                budget.get("max_total_llm_calls_excluding_frank_karthic", 0)
            ),
        ),
        fixture_responses_path=fixture_responses,
    )
