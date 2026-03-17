"""Rubric evaluation service and matrix helpers."""

from __future__ import annotations

from collections import defaultdict

from .llm import LLMClient
from .models import LegalTaskExample, Rubric, RubricEvaluation


class RubricEvaluator:
    """Evaluate rubrics against a bank of candidate responses."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm_client = llm_client

    def evaluate(
        self,
        task: LegalTaskExample,
        rubrics: list[Rubric],
        responses: list[str],
    ) -> list[RubricEvaluation]:
        """Evaluate every rubric-response pair."""

        evaluations: list[RubricEvaluation] = []
        for rubric in rubrics:
            for response_index, response in enumerate(responses):
                result = self.llm_client.evaluate_rubric(
                    legal_question=task.legal_question,
                    response=response,
                    rubric_text=rubric.text,
                    golden_answer=task.golden_answer,
                )
                evaluations.append(
                    RubricEvaluation(
                        rubric_id=rubric.id,
                        response_index=response_index,
                        satisfied=bool(result.get("satisfied", False)),
                        confidence=float(result.get("confidence", 0.0))
                        if result.get("confidence") is not None
                        else None,
                        rationale=str(result.get("rationale", "")) if result.get("rationale") else None,
                    )
                )
        return evaluations

    @staticmethod
    def build_binary_matrix(
        rubrics: list[Rubric],
        evaluations: list[RubricEvaluation],
        response_count: int,
    ) -> list[list[int]]:
        """Build the rubric-response satisfaction matrix."""

        grouped: dict[str, dict[int, int]] = defaultdict(dict)
        for evaluation in evaluations:
            grouped[evaluation.rubric_id][evaluation.response_index] = 1 if evaluation.satisfied else 0

        matrix: list[list[int]] = []
        for rubric in rubrics:
            row = [grouped.get(rubric.id, {}).get(index, 0) for index in range(response_count)]
            matrix.append(row)
        return matrix

    @staticmethod
    def evaluation_index(evaluations: list[RubricEvaluation]) -> dict[str, list[RubricEvaluation]]:
        """Group evaluations by rubric id."""

        grouped: dict[str, list[RubricEvaluation]] = defaultdict(list)
        for evaluation in evaluations:
            grouped[evaluation.rubric_id].append(evaluation)
        for rubric_id, items in grouped.items():
            grouped[rubric_id] = sorted(items, key=lambda item: item.response_index)
        return dict(grouped)
