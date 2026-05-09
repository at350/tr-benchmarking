"""Live-run call planning and budget enforcement."""

from __future__ import annotations

from typing import Any

from .config import ResearchConfig


LIVE_MODES = {"live", "live_openai", "live_multi_provider"}


def planned_call_counts(config: ResearchConfig) -> dict[str, Any]:
    """Estimate live calls before any model request is made."""

    base_response_samples = sum(spec.samples for spec in config.response_models)
    planned_question_tracks = 1
    if config.perturbations.enabled:
        planned_question_tracks += max(0, config.perturbations.max_variations)
    planned_response_calls = base_response_samples * planned_question_tracks
    planned_dasha_signature_calls = (
        planned_response_calls if config.clustering.method == "llm_reasoning_signature" else 0
    )
    planned_dasha_canonicalization_calls = (
        1 if config.clustering.method == "llm_reasoning_signature" and planned_dasha_signature_calls else 0
    )
    judge_invocations_per_cluster = (
        sum(spec.repeats for spec in config.judge.judge_models)
        if config.judge.judge_models
        else config.judge.repeats
    )
    estimated_min_clusters = max(
        config.clustering.min_observed_clusters,
        planned_question_tracks if config.perturbations.enabled else 1,
    )
    planned_min_judge_calls = (
        estimated_min_clusters * judge_invocations_per_cluster
        if config.judge.mode == "llm"
        else 0
    )
    return {
        "planned_question_tracks": planned_question_tracks,
        "base_response_samples_per_track": base_response_samples,
        "planned_response_calls": planned_response_calls,
        "planned_dasha_signature_calls": planned_dasha_signature_calls,
        "planned_dasha_canonicalization_calls": planned_dasha_canonicalization_calls,
        "judge_invocations_per_cluster": judge_invocations_per_cluster if config.judge.mode == "llm" else 0,
        "estimated_min_clusters_for_judging": estimated_min_clusters,
        "planned_min_judge_calls": planned_min_judge_calls,
        "planned_total_llm_calls_excluding_frank_karthic": (
            planned_response_calls + planned_dasha_signature_calls + planned_min_judge_calls
            + planned_dasha_canonicalization_calls
        ),
    }


def judge_invocations_per_cluster(config: ResearchConfig) -> int:
    """Return the number of LLM judge calls made for each Dasha cluster."""

    if config.judge.mode != "llm":
        return 0
    if config.judge.judge_models:
        return sum(spec.repeats for spec in config.judge.judge_models)
    return config.judge.repeats


def actual_judge_call_plan(config: ResearchConfig, clusters: dict[str, Any], call_plan: dict[str, Any]) -> dict[str, Any]:
    """Compute the live-call plan after Dasha reveals the actual cluster count."""

    cluster_count = len(clusters.get("clusters", []))
    actual_judge_calls = cluster_count * judge_invocations_per_cluster(config)
    return {
        **call_plan,
        "actual_clusters_for_judging": cluster_count,
        "actual_judge_calls": actual_judge_calls,
        "actual_total_llm_calls_excluding_frank_karthic": (
            call_plan["planned_response_calls"]
            + call_plan["planned_dasha_signature_calls"]
            + call_plan.get("planned_dasha_canonicalization_calls", 0)
            + actual_judge_calls
        ),
    }


def budget_violations(config: ResearchConfig, call_plan: dict[str, Any] | None = None) -> list[str]:
    """Return budget-cap violations for the planned run."""

    call_plan = call_plan or planned_call_counts(config)
    violations = []
    if (
        config.budget.max_response_calls > 0
        and call_plan["planned_response_calls"] > config.budget.max_response_calls
    ):
        violations.append("Planned response calls are within configured budget.")
    if (
        config.budget.max_judge_calls > 0
        and call_plan["planned_min_judge_calls"] > config.budget.max_judge_calls
    ):
        violations.append("Planned minimum judge calls are within configured budget.")
    if (
        config.budget.max_total_llm_calls_excluding_frank_karthic > 0
        and call_plan["planned_total_llm_calls_excluding_frank_karthic"]
        > config.budget.max_total_llm_calls_excluding_frank_karthic
    ):
        violations.append("Planned total LLM calls excluding Frank/Karthic are within configured budget.")
    return violations


def runtime_budget_violations(config: ResearchConfig, actual_plan: dict[str, Any]) -> list[str]:
    """Return budget-cap violations once actual cluster count is known."""

    violations = []
    if (
        config.budget.max_judge_calls > 0
        and actual_plan["actual_judge_calls"] > config.budget.max_judge_calls
    ):
        violations.append(
            "Actual judge calls exceed configured budget "
            f"({actual_plan['actual_judge_calls']} > {config.budget.max_judge_calls})."
        )
    if (
        config.budget.max_total_llm_calls_excluding_frank_karthic > 0
        and actual_plan["actual_total_llm_calls_excluding_frank_karthic"]
        > config.budget.max_total_llm_calls_excluding_frank_karthic
    ):
        violations.append(
            "Actual total LLM calls excluding Frank/Karthic exceed configured budget "
            f"({actual_plan['actual_total_llm_calls_excluding_frank_karthic']} > "
            f"{config.budget.max_total_llm_calls_excluding_frank_karthic})."
        )
    return violations


def enforce_live_budget(config: ResearchConfig) -> dict[str, Any]:
    """Raise before live execution if the configured plan exceeds hard caps."""

    call_plan = planned_call_counts(config)
    if config.mode not in LIVE_MODES:
        return call_plan
    violations = budget_violations(config, call_plan)
    if violations:
        raise RuntimeError("Live run exceeds configured budget: " + "; ".join(violations))
    return call_plan


def enforce_runtime_judge_budget(
    config: ResearchConfig,
    clusters: dict[str, Any],
    call_plan: dict[str, Any],
) -> dict[str, Any]:
    """Raise after Dasha if actual judge work would exceed live-run caps."""

    actual_plan = actual_judge_call_plan(config, clusters, call_plan)
    if config.mode not in LIVE_MODES:
        return actual_plan
    violations = runtime_budget_violations(config, actual_plan)
    if violations:
        raise RuntimeError("Live run exceeds configured runtime budget: " + "; ".join(violations))
    return actual_plan
