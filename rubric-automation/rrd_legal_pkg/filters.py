"""Redundancy and misalignment filters for rubric refinement."""

from __future__ import annotations

import math
from typing import Any

from .llm import LLMClient
from .models import LegalTaskExample, PipelineConfig, Rubric, RubricEvaluation
from .utils import (
    STYLE_CATEGORIES,
    category_weight,
    content_tokens,
    cosine_similarity_binary,
    flatten_structure_terms,
    jaccard_similarity,
    keyword_overlap_score,
    rubric_specificity_score,
    variance,
)


class RedundancyFilter:
    """Filter substantively or behaviorally redundant rubrics."""

    def __init__(self, llm_client: LLMClient, similarity_threshold: float = 0.82) -> None:
        self.llm_client = llm_client
        self.similarity_threshold = similarity_threshold

    def filter(
        self,
        rubrics: list[Rubric],
        evaluations: list[RubricEvaluation],
        response_count: int,
    ) -> tuple[list[Rubric], set[str], list[dict[str, Any]]]:
        """Return retained rubrics, rejected ids, and audit logs."""

        vectors = self._build_vectors(evaluations, response_count)
        retained: list[Rubric] = []
        rejected_ids: set[str] = set()
        logs: list[dict[str, Any]] = []

        for rubric in sorted(rubrics, key=lambda item: (item.depth, item.id)):
            if rubric.id in rejected_ids:
                continue
            for kept in retained:
                text_similarity = jaccard_similarity(rubric.text, kept.text)
                behavior_similarity = cosine_similarity_binary(
                    vectors.get(rubric.id, [0] * response_count),
                    vectors.get(kept.id, [0] * response_count),
                )
                llm_redundant = False
                llm_reason = ""
                if 0.65 <= text_similarity < self.similarity_threshold:
                    llm_result = self.llm_client.detect_redundancy(rubric.text, [kept])
                    llm_redundant = bool(llm_result.get("redundant", False))
                    llm_reason = str(llm_result.get("reason", ""))
                behavior_redundant = behavior_similarity >= 0.98 and (
                    text_similarity >= 0.55
                    or rubric.category == kept.category
                    or rubric.text.lower() in kept.text.lower()
                    or kept.text.lower() in rubric.text.lower()
                )
                if text_similarity >= self.similarity_threshold or behavior_redundant or llm_redundant:
                    loser, winner = self._choose_loser(rubric, kept, vectors, response_count)
                    rejected_ids.add(loser.id)
                    logs.append(
                        {
                            "event": "redundancy_rejection",
                            "rejected_rubric_id": loser.id,
                            "kept_rubric_id": winner.id,
                            "text_similarity": round(text_similarity, 3),
                            "behavior_similarity": round(behavior_similarity, 3),
                            "llm_reason": llm_reason,
                        }
                    )
                    break
            if rubric.id not in rejected_ids:
                retained.append(rubric)

        return retained, rejected_ids, logs

    @staticmethod
    def _build_vectors(
        evaluations: list[RubricEvaluation],
        response_count: int,
    ) -> dict[str, list[int]]:
        vectors: dict[str, list[int]] = {}
        for evaluation in evaluations:
            if evaluation.rubric_id not in vectors:
                vectors[evaluation.rubric_id] = [0] * response_count
            vectors[evaluation.rubric_id][evaluation.response_index] = 1 if evaluation.satisfied else 0
        return vectors

    def _choose_loser(
        self,
        rubric_a: Rubric,
        rubric_b: Rubric,
        vectors: dict[str, list[int]],
        response_count: int,
    ) -> tuple[Rubric, Rubric]:
        vector_a = vectors.get(rubric_a.id, [0] * response_count)
        vector_b = vectors.get(rubric_b.id, [0] * response_count)
        score_a = self._rubric_keep_score(rubric_a, vector_a)
        score_b = self._rubric_keep_score(rubric_b, vector_b)
        if score_a >= score_b:
            return rubric_b, rubric_a
        return rubric_a, rubric_b

    @staticmethod
    def _rubric_keep_score(rubric: Rubric, vector: list[int]) -> float:
        discrimination = variance([float(value) for value in vector])
        specificity = rubric_specificity_score(rubric.text)
        style_penalty = 0.35 if rubric.category.lower() in STYLE_CATEGORIES else 0.0
        return (
            category_weight(rubric.category)
            + specificity
            + discrimination
            + rubric.depth * 0.05
            - style_penalty
        )


class MisalignmentFilter:
    """Reject rubrics that do not align with the golden answer or legal structure."""

    def __init__(self, llm_client: LLMClient, config: PipelineConfig) -> None:
        self.llm_client = llm_client
        self.config = config

    def filter(
        self,
        task: LegalTaskExample,
        rubrics: list[Rubric],
        evaluations: list[RubricEvaluation],
        responses: list[str],
        legal_structure: dict[str, Any],
    ) -> tuple[list[Rubric], set[str], list[dict[str, Any]]]:
        """Return retained rubrics, rejected ids, and audit logs."""

        rejected_ids: set[str] = set()
        logs: list[dict[str, Any]] = []
        vectors = RedundancyFilter._build_vectors(evaluations, len(responses))
        response_quality = [self._response_quality(task.golden_answer, response) for response in responses]
        structure_terms = flatten_structure_terms(legal_structure)

        for rubric in rubrics:
            category = rubric.category.lower()
            golden_eval = self.llm_client.evaluate_rubric(
                legal_question=task.legal_question,
                response=task.golden_answer,
                rubric_text=rubric.text,
                golden_answer=task.golden_answer,
            )
            golden_fail = not bool(golden_eval.get("satisfied", False))
            style_penalty = 0.35 if category in STYLE_CATEGORIES else 0.0
            structure_overlap = keyword_overlap_score(rubric.text, structure_terms)
            vector = vectors.get(rubric.id, [0] * len(responses))
            indiscriminate_penalty = 0.20 if len(set(vector)) <= 1 and len(vector) > 1 else 0.0

            misalignment_score = 0.0
            reasons: list[str] = []
            if self.config.misalignment_mode == "golden":
                if golden_fail:
                    misalignment_score += 0.75
                    reasons.append("Golden answer does not satisfy the rubric.")
            elif self.config.misalignment_mode == "model_strength":
                proxy_correlation = self._quality_correlation(vector, response_quality)
                if proxy_correlation < -0.20:
                    misalignment_score += 0.65
                    reasons.append("Rubric rewards weaker responses more than stronger proxies.")

            if structure_overlap < 0.10 and category not in STYLE_CATEGORIES:
                misalignment_score += 0.20
                reasons.append("Rubric is weakly grounded in extracted legal structure.")
            if style_penalty:
                misalignment_score += style_penalty
                reasons.append("Rubric is primarily stylistic.")
            if indiscriminate_penalty:
                misalignment_score += indiscriminate_penalty
                reasons.append("Rubric is not discriminative over the response set.")

            if misalignment_score >= self.config.misalignment_threshold:
                rejected_ids.add(rubric.id)
                logs.append(
                    {
                        "event": "misalignment_rejection",
                        "rubric_id": rubric.id,
                        "score": round(misalignment_score, 3),
                        "reasons": reasons,
                    }
                )

        retained = [rubric for rubric in rubrics if rubric.id not in rejected_ids]
        return retained, rejected_ids, logs

    @staticmethod
    def _response_quality(golden_answer: str, response: str) -> float:
        token_overlap = keyword_overlap_score(response, content_tokens(golden_answer)[:20])
        length_bonus = min(1.0, len(response.split()) / max(1.0, len(golden_answer.split())))
        return (token_overlap * 0.7) + (length_bonus * 0.3)

    @staticmethod
    def _quality_correlation(vector: list[int], qualities: list[float]) -> float:
        if not vector or len(vector) != len(qualities):
            return 0.0
        mean_x = sum(vector) / len(vector)
        mean_y = sum(qualities) / len(qualities)
        numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(vector, qualities))
        denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in vector))
        denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in qualities))
        if denom_x == 0 or denom_y == 0:
            return 0.0
        return numerator / (denom_x * denom_y)
