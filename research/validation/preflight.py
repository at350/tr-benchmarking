"""No-call readiness checks for live research-run configs."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .budget import budget_violations, planned_call_counts
from .config import ResearchConfig, load_config
from .freeze import build_protocol_freeze
from .openai_client import _read_env_file
from .utils import write_json


PROVIDER_ENV = {
    "openai": ("OPENAI_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "claude": ("ANTHROPIC_API_KEY",),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"),
    "google": ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"),
    "replicate": ("REPLICATE_API_TOKEN",),
}


def _env_available(repo_root: Path, name: str) -> bool:
    import os

    if os.environ.get(name, "").strip():
        return True
    for env_path in (repo_root / ".env", repo_root / "frontend" / ".env"):
        if _read_env_file(env_path).get(name, "").strip():
            return True
    return False


def _credential_report(repo_root: Path, config: ResearchConfig) -> dict[str, Any]:
    providers = {agent.provider for agent in config.agents.values() if agent.mode == "llm"}
    providers |= {spec.provider for spec in config.response_models}
    if config.judge.mode == "llm":
        providers.add(config.judge.provider)
        providers |= {spec.provider for spec in config.judge.judge_models}
    if config.clustering.method == "llm_reasoning_signature":
        providers.add(config.clustering.provider)

    report = {}
    for provider in sorted(providers):
        env_names = PROVIDER_ENV.get(provider.lower(), ())
        report[provider] = {
            "env": " or ".join(env_names) if env_names else "unknown",
            "available": bool(env_names and any(_env_available(repo_root, name) for name in env_names)),
        }
    return report


def _check(condition: bool, message: str, severity: str = "error") -> dict[str, Any]:
    return {"passed": bool(condition), "severity": severity, "message": message}


def _budget_checks(config: ResearchConfig, call_plan: dict[str, Any]) -> list[dict[str, Any]]:
    violations = set(budget_violations(config, call_plan))
    checks = []
    if config.budget.max_response_calls > 0:
        checks.append(_check(
            "Planned response calls are within configured budget." not in violations,
            "Planned response calls are within configured budget.",
        ))
    if config.budget.max_judge_calls > 0:
        checks.append(_check(
            "Planned minimum judge calls are within configured budget." not in violations,
            "Planned minimum judge calls are within configured budget.",
        ))
    if config.budget.max_total_llm_calls_excluding_frank_karthic > 0:
        checks.append(_check(
            "Planned total LLM calls excluding Frank/Karthic are within configured budget." not in violations,
            "Planned total LLM calls excluding Frank/Karthic are within configured budget.",
        ))
    if not checks:
        checks.append(_check(False, "No explicit live-call budget is configured.", severity="warning"))
    return checks


def build_live_preflight(
    config_path: str | Path,
    repo_root: str | Path,
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    """Check whether a live config is ready to freeze/run without API calls."""

    root = Path(repo_root).resolve()
    config_file = Path(config_path)
    if not config_file.is_absolute():
        config_file = root / config_file
    config = load_config(config_file, repo_root=root)
    freeze = build_protocol_freeze(config_file, repo_root=root)
    total_samples = sum(spec.samples for spec in config.response_models)
    call_plan = planned_call_counts(config)
    model_families = {spec.provider for spec in config.response_models}
    credential_report = _credential_report(root, config)
    missing_credentials = [
        provider
        for provider, item in credential_report.items()
        if item["env"] != "unknown" and not item["available"]
    ]

    checks = [
        _check(config.mode in {"live", "live_openai", "live_multi_provider"}, "Config mode is live-capable."),
        _check(config.response_prompt_style == "natural", "Benchmarked response models answer with natural question-only prompting."),
        _check(len(config.response_models) >= 3, "Response roster has at least three configured model identifiers."),
        _check(total_samples >= 9, "Response roster has at least nine total samples."),
        _check(len(model_families) >= 3, "Response roster spans at least three provider/model-family routes."),
        _check(all(agent.mode == "llm" for agent in config.agents.values()), "Frank, Karthic, and Dasha are configured as LLM agents."),
        _check(config.clustering.method == "llm_reasoning_signature", "Dasha uses LLM reasoning-signature clustering."),
        _check(config.clustering.min_observed_clusters >= 2, "Dasha requires at least two observed reasoning clusters."),
        _check(config.judge.mode == "llm", "Judge is configured for LLM row-level scoring."),
        _check(config.judge.repeats >= 2 or bool(config.judge.judge_models), "Judge stability uses repeats or a judge panel."),
        _check(bool(config.judge.judge_models), "Judge panel is configured.", severity="warning"),
        _check(config.quality_gates.min_rubric_rows >= 8, "Rubric quality gate requires at least eight rows."),
        _check(config.source_case_path.exists(), "Source case file exists."),
        _check(bool(freeze.get("protocol_hash")), "Protocol freeze manifest can be built."),
        *_budget_checks(config, call_plan),
    ]
    if config.perturbations.enabled:
        checks.extend([
            _check(config.perturbations.require_invariant, "Perturbation config requires invariant checks."),
            _check(config.perturbations.require_material, "Perturbation config requires material checks."),
        ])
    else:
        checks.append(_check(False, "Perturbation validation is not enabled for this live config.", severity="warning"))

    if missing_credentials:
        checks.append(_check(False, "Missing local credentials for: " + ", ".join(missing_credentials), severity="warning"))

    blocking_errors = [check for check in checks if check["severity"] == "error" and not check["passed"]]
    warnings = [check for check in checks if check["severity"] == "warning" and not check["passed"]]
    summary = {
        "schema_version": "research.live_preflight.v1",
        "status": "live_preflight_passed" if not blocking_errors else "needs_live_preflight_review",
        "run_id": config.run_id,
        "config_path": str(config_file.relative_to(root) if config_file.is_relative_to(root) else config_file),
        "protocol_hash": freeze["protocol_hash"],
        "total_response_samples": total_samples,
        "call_plan": call_plan,
        "budget": {
            "max_response_calls": config.budget.max_response_calls,
            "max_judge_calls": config.budget.max_judge_calls,
            "max_total_llm_calls_excluding_frank_karthic": config.budget.max_total_llm_calls_excluding_frank_karthic,
        },
        "response_model_count": len(config.response_models),
        "response_providers": sorted(model_families),
        "credential_report": credential_report,
        "checks": checks,
        "warnings": warnings,
        "blocking_errors": blocking_errors,
    }
    if output_path:
        write_json(Path(output_path), summary)
    return summary
