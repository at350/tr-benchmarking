"""Rubric weighting strategies for the legal RRD pipeline."""

from __future__ import annotations

from typing import Any

from .llm import LLMClient
from .models import LegalTaskExample, PipelineConfig, Rubric, RubricEvaluation
from .utils import (
    category_weight,
    content_tokens,
    covariance_matrix,
    flatten_structure_terms,
    invert_matrix,
    normalize_weights,
)


class WeightingEngine:
    """Assign final rubric weights using configurable strategies."""

    def __init__(self, llm_client: LLMClient, config: PipelineConfig) -> None:
        self.llm_client = llm_client
        self.config = config

    def assign_weights(
        self,
        task: LegalTaskExample,
        rubrics: list[Rubric],
        evaluations: list[RubricEvaluation],
        response_count: int,
        legal_structure: dict[str, Any],
    ) -> dict[str, float]:
        """Assign normalized final weights to active rubrics."""

        if not rubrics:
            return {}

        mode = self.config.weighting_mode.lower()
        if mode == "uniform":
            weights = {rubric.id: 1.0 for rubric in rubrics}
        elif mode == "llm":
            weights = self.llm_client.assign_rubric_weights(
                legal_question=task.legal_question,
                golden_answer=task.golden_answer,
                rubrics=rubrics,
            )
        elif mode == "whitened":
            weights = self._whitened_weights(rubrics, evaluations, response_count)
        elif mode == "doctrinal":
            weights = self._doctrinal_weights(rubrics, legal_structure)
        else:
            raise ValueError(f"Unsupported weighting mode: {self.config.weighting_mode}")

        if self.config.doctrinal_priority_weighting and mode != "doctrinal":
            doctrinal_weights = self._doctrinal_weights(rubrics, legal_structure)
            weights = self._blend(weights, doctrinal_weights, primary_weight=0.7)

        return normalize_weights(weights)

    def _doctrinal_weights(
        self,
        rubrics: list[Rubric],
        legal_structure: dict[str, Any],
    ) -> dict[str, float]:
        structure_terms = flatten_structure_terms(legal_structure)
        weights: dict[str, float] = {}
        for rubric in rubrics:
            overlap_bonus = 0.15
            if structure_terms:
                overlap_bonus *= sum(
                    1 for token in content_tokens(rubric.text) if token in set(content_tokens(" ".join(structure_terms)))
                ) / max(1, len(set(content_tokens(rubric.text))))
            specificity_bonus = min(0.25, len(set(content_tokens(rubric.text))) / 50.0)
            weights[rubric.id] = category_weight(rubric.category) + overlap_bonus + specificity_bonus
        return normalize_weights(weights)

    def _whitened_weights(
        self,
        rubrics: list[Rubric],
        evaluations: list[RubricEvaluation],
        response_count: int,
    ) -> dict[str, float]:
        if response_count < 2 or len(rubrics) == 1:
            return {rubric.id: 1.0 / len(rubrics) for rubric in rubrics}

        evaluation_lookup: dict[str, list[int]] = {rubric.id: [0] * response_count for rubric in rubrics}
        for evaluation in evaluations:
            if evaluation.rubric_id in evaluation_lookup:
                evaluation_lookup[evaluation.rubric_id][evaluation.response_index] = 1 if evaluation.satisfied else 0

        matrix = [evaluation_lookup[rubric.id] for rubric in rubrics]
        covariance = covariance_matrix(matrix)
        try:
            precision = invert_matrix(covariance, regularization=1e-3)
        except ValueError:
            return {rubric.id: 1.0 / len(rubrics) for rubric in rubrics}

        raw_weights: dict[str, float] = {}
        for row_index, rubric in enumerate(rubrics):
            diagonal = precision[row_index][row_index] if row_index < len(precision) else 1.0
            raw_weights[rubric.id] = max(1e-6, diagonal)
        return normalize_weights(raw_weights)

    @staticmethod
    def _blend(
        primary: dict[str, float],
        secondary: dict[str, float],
        primary_weight: float = 0.7,
    ) -> dict[str, float]:
        all_keys = set(primary) | set(secondary)
        blended = {}
        secondary_weight = 1.0 - primary_weight
        for key in all_keys:
            blended[key] = (primary.get(key, 0.0) * primary_weight) + (
                secondary.get(key, 0.0) * secondary_weight
            )
        return blended
