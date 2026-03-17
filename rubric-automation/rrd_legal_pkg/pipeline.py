"""Recursive Rubric Decomposition pipeline for legal-answer evaluation."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

from .evaluation import RubricEvaluator
from .extractors import LegalStructureExtractor
from .filters import MisalignmentFilter, RedundancyFilter
from .llm import BasePromptLLMClient, LLMClient
from .models import LegalTaskExample, PipelineConfig, PipelineResult, Rubric, RubricSet
from .utils import (
    CORE_CATEGORIES,
    STYLE_CATEGORIES,
    ensure_directory,
    flatten_structure_terms,
    jaccard_similarity,
    keyword_overlap_score,
    normalize_weights,
    rubric_specificity_score,
    seed_random,
    write_json,
    write_matrix_csv,
)
from .weighting import WeightingEngine


class RRDPipeline:
    """Primary orchestrator for legal recursive rubric decomposition."""

    def __init__(self, llm_client: LLMClient, config: PipelineConfig | None = None) -> None:
        self.llm_client = llm_client
        self.config = config or PipelineConfig()
        seed_random(self.config.random_seed)

        self.structure_extractor = LegalStructureExtractor(llm_client)
        self.rubric_evaluator = RubricEvaluator(llm_client)
        self.redundancy_filter = RedundancyFilter(
            llm_client=llm_client,
            similarity_threshold=self.config.redundancy_similarity_threshold,
        )
        self.misalignment_filter = MisalignmentFilter(llm_client=llm_client, config=self.config)
        self.weighting_engine = WeightingEngine(llm_client=llm_client, config=self.config)
        self._rubric_counter = 0

    def run(
        self,
        task: LegalTaskExample,
        output_dir: str | Path | None = None,
        verbose: bool = False,
    ) -> PipelineResult:
        """Execute the full RRD pipeline and optionally export artifacts."""

        working_task = replace(task)
        working_task.sample_responses = working_task.sample_responses or self._synthesize_responses(working_task)

        rubric_set = RubricSet()
        legal_structure = self.structure_extractor.extract(working_task)
        initial_rubrics = self._build_initial_rubrics(working_task, legal_structure)
        rubric_set.rubrics.extend(initial_rubrics)

        iteration_summary: list[dict[str, Any]] = []
        rejected_streak = 0

        for iteration in range(1, self.config.max_iterations + 1):
            active_rubrics = rubric_set.active_rubrics()
            if not active_rubrics:
                rubric_set.logs.append({"event": "pipeline_stop", "reason": "no_active_rubrics"})
                break

            current_evaluations = self.rubric_evaluator.evaluate(
                working_task,
                active_rubrics,
                working_task.sample_responses,
            )
            self._merge_evaluations(rubric_set, active_rubrics, current_evaluations)

            matrix = self.rubric_evaluator.build_binary_matrix(
                active_rubrics,
                current_evaluations,
                len(working_task.sample_responses),
            )
            decomposition_targets, immediate_rejections = self._granularity_scan(active_rubrics, matrix)
            for rubric_id, reason in immediate_rejections.items():
                self._mark_status(rubric_set, rubric_id, reason)

            new_rubrics = self._decompose_targets(
                task=working_task,
                legal_structure=legal_structure,
                rubric_set=rubric_set,
                target_ids=decomposition_targets,
            )

            if new_rubrics:
                new_evaluations = self.rubric_evaluator.evaluate(
                    working_task,
                    new_rubrics,
                    working_task.sample_responses,
                )
                self._merge_evaluations(rubric_set, new_rubrics, new_evaluations)

            active_rubrics = rubric_set.active_rubrics()
            active_evaluations = self._active_evaluations(rubric_set, active_rubrics)

            retained, redundancy_rejections, redundancy_logs = self.redundancy_filter.filter(
                active_rubrics,
                active_evaluations,
                len(working_task.sample_responses),
            )
            for rubric_id in redundancy_rejections:
                self._mark_status(rubric_set, rubric_id, "rejected_redundant")
            rubric_set.logs.extend(redundancy_logs)

            active_rubrics = retained
            if self.config.misalignment_enabled and active_rubrics:
                active_evaluations = self._active_evaluations(rubric_set, active_rubrics)
                retained, misalignment_rejections, misalignment_logs = self.misalignment_filter.filter(
                    task=working_task,
                    rubrics=active_rubrics,
                    evaluations=active_evaluations,
                    responses=working_task.sample_responses,
                    legal_structure=legal_structure,
                )
                for rubric_id in misalignment_rejections:
                    self._mark_status(rubric_set, rubric_id, "rejected_misaligned")
                rubric_set.logs.extend(misalignment_logs)

            round_summary = {
                "iteration": iteration,
                "starting_active_rubrics": len([rubric for rubric in rubric_set.rubrics if rubric.status in {"active", "decomposed"}]),
                "decomposition_targets": list(decomposition_targets),
                "new_rubrics": len(new_rubrics),
                "redundancy_rejections": len(redundancy_rejections),
                "immediate_rejections": dict(immediate_rejections),
                "active_after_iteration": len(rubric_set.active_rubrics()),
                "categories_present": sorted({rubric.category for rubric in rubric_set.active_rubrics()}),
                "average_specificity": round(
                    sum(rubric_specificity_score(rubric.text) for rubric in rubric_set.active_rubrics())
                    / max(1, len(rubric_set.active_rubrics())),
                    3,
                ),
            }
            iteration_summary.append(round_summary)
            rubric_set.logs.append({"event": "iteration_summary", **round_summary})

            total_rejections = len(immediate_rejections) + len(redundancy_rejections)
            rejected_streak = rejected_streak + total_rejections if not new_rubrics else 0
            if verbose:
                print(
                    f"[RRD] iteration={iteration} active={round_summary['active_after_iteration']} "
                    f"new={len(new_rubrics)} rejected={total_rejections}"
                )

            if not decomposition_targets and not new_rubrics:
                rubric_set.logs.append({"event": "pipeline_stop", "reason": "converged", "iteration": iteration})
                break
            if rejected_streak >= self.config.early_stop_rejected_threshold:
                rubric_set.logs.append(
                    {"event": "pipeline_stop", "reason": "early_stop_rejected_threshold", "iteration": iteration}
                )
                break

        self._coverage_repair(working_task, legal_structure, rubric_set)
        final_active = rubric_set.active_rubrics()
        final_evaluations = self._active_evaluations(rubric_set, final_active)
        final_matrix = self.rubric_evaluator.build_binary_matrix(
            final_active,
            final_evaluations,
            len(working_task.sample_responses),
        )
        coverage_audit = self._coverage_audit(legal_structure, final_active)
        weights = self.weighting_engine.assign_weights(
            task=working_task,
            rubrics=final_active,
            evaluations=final_evaluations,
            response_count=len(working_task.sample_responses),
            legal_structure=legal_structure,
        )
        rubric_set.weights = normalize_weights(weights)
        rubric_set.iteration_count = len(iteration_summary)

        result = PipelineResult(
            rubric_set=rubric_set,
            rubric_matrix=final_matrix,
            coverage_audit=coverage_audit,
            iteration_summary=iteration_summary,
        )

        if output_dir is not None:
            result.output_dir = str(self._export_outputs(output_dir, result, working_task))
        return result

    def _build_initial_rubrics(
        self,
        task: LegalTaskExample,
        legal_structure: dict[str, Any],
    ) -> list[Rubric]:
        proposals = self.llm_client.generate_initial_legal_rubrics(
            legal_question=task.legal_question,
            golden_answer=task.golden_answer,
            legal_structure=legal_structure,
            sample_responses=task.sample_responses,
        )
        rubrics: list[Rubric] = []
        for proposal in proposals:
            rubric = self._make_rubric(
                text=proposal["text"],
                category=proposal.get("category", "reasoning"),
                parent_id=None,
                depth=0,
                source="golden-derived",
                metadata={
                    "layer": proposal.get("layer", "core"),
                    "legal_basis": proposal.get("legal_basis", ""),
                    "binary_evaluable": proposal.get("binary_evaluable", True),
                },
            )
            if not self.config.include_style_rubrics and rubric.category.lower() in STYLE_CATEGORIES:
                rubric.status = "rejected_style"
            rubrics.append(rubric)

        rubrics.extend(self._required_category_rubrics(task, legal_structure, existing=rubrics))
        return self._dedupe_new_rubrics(rubrics, [])

    def _required_category_rubrics(
        self,
        task: LegalTaskExample,
        legal_structure: dict[str, Any],
        existing: list[Rubric],
    ) -> list[Rubric]:
        required: list[Rubric] = []
        existing_texts = [rubric.text for rubric in existing]
        if self.config.require_issue_spotting_rubrics and legal_structure.get("issues"):
            issue_text = "The response identifies the controlling legal issue raised by the facts."
            if not self._text_present(issue_text, existing_texts):
                required.append(
                    self._make_rubric(
                        text=issue_text,
                        category="issue",
                        parent_id=None,
                        depth=0,
                        source="coverage-required",
                        metadata={"reason": "require_issue_spotting_rubrics"},
                    )
                )
        if self.config.require_fact_application_rubrics:
            application_text = "The response applies the governing doctrine to the material facts."
            if not self._text_present(application_text, existing_texts):
                required.append(
                    self._make_rubric(
                        text=application_text,
                        category="application",
                        parent_id=None,
                        depth=0,
                        source="coverage-required",
                        metadata={"reason": "require_fact_application_rubrics"},
                    )
                )
        if (
            self.config.require_counterargument_rubrics
            and legal_structure.get("counterarguments")
            and not any(rubric.category == "counterargument" for rubric in existing)
        ):
            required.append(
                self._make_rubric(
                    text="The response addresses the principal counterargument or defense when relevant.",
                    category="counterargument",
                    parent_id=None,
                    depth=0,
                    source="coverage-required",
                    metadata={"reason": "require_counterargument_rubrics"},
                )
            )
        return required

    def _granularity_scan(
        self,
        active_rubrics: list[Rubric],
        matrix: list[list[int]],
    ) -> tuple[set[str], dict[str, str]]:
        decomposition_targets: set[str] = set()
        immediate_rejections: dict[str, str] = {}

        for rubric, row in zip(active_rubrics, matrix):
            match_count = sum(row)
            text_lower = rubric.text.lower()
            omnibus = any(
                marker in text_lower
                for marker in [
                    "all material elements",
                    "from issue to application",
                    "governing doctrine",
                    "all relevant",
                ]
            ) or (text_lower.count(" and ") >= 2 and rubric.category.lower() in CORE_CATEGORIES)
            broad_language = any(
                marker in text_lower
                for marker in [
                    "governing doctrine",
                    "governing standard",
                    "correctly analyzes",
                    "material elements",
                    "overall",
                    "principal",
                    "from issue to application",
                ]
            )

            if rubric.category.lower() in STYLE_CATEGORIES and not self.config.include_style_rubrics:
                immediate_rejections[rubric.id] = "rejected_style"
            elif match_count == 0:
                immediate_rejections[rubric.id] = "rejected_unsupported"
            elif omnibus:
                decomposition_targets.add(rubric.id)
            elif (
                match_count > self.config.decomposition_match_threshold
                and broad_language
                and rubric.category.lower() in {"element", "factor", "application", "reasoning"}
            ):
                decomposition_targets.add(rubric.id)

        return decomposition_targets, immediate_rejections

    def _decompose_targets(
        self,
        task: LegalTaskExample,
        legal_structure: dict[str, Any],
        rubric_set: RubricSet,
        target_ids: set[str],
    ) -> list[Rubric]:
        del legal_structure
        new_rubrics: list[Rubric] = []
        existing_active = rubric_set.active_rubrics()
        existing_texts = [rubric.text for rubric in rubric_set.rubrics]

        for rubric in existing_active:
            if rubric.id not in target_ids:
                continue
            proposals = self.llm_client.decompose_rubric(
                legal_question=task.legal_question,
                golden_answer=task.golden_answer,
                rubric_text=rubric.text,
                rubric_category=rubric.category,
                sample_responses=task.sample_responses,
            )[: self.config.max_new_rubrics_per_decomposition]
            accepted_children: list[Rubric] = []
            for proposal in proposals:
                if not proposal["text"]:
                    continue
                if self._text_present(proposal["text"], existing_texts):
                    continue
                child = self._make_rubric(
                    text=proposal["text"],
                    category=proposal.get("category", rubric.category),
                    parent_id=rubric.id,
                    depth=rubric.depth + 1,
                    source="decomposition",
                    metadata={"why_more_specific": proposal.get("why_more_specific", "")},
                )
                if not self.config.include_style_rubrics and child.category.lower() in STYLE_CATEGORIES:
                    child.status = "rejected_style"
                else:
                    accepted_children.append(child)
                    existing_texts.append(child.text)
            if accepted_children:
                rubric.status = "decomposed"
                rubric.metadata["decomposition_children"] = [child.id for child in accepted_children]
                new_rubrics.extend(accepted_children)

        return self._dedupe_new_rubrics(new_rubrics, rubric_set.rubrics)

    def _coverage_repair(
        self,
        task: LegalTaskExample,
        legal_structure: dict[str, Any],
        rubric_set: RubricSet,
    ) -> None:
        audit = self._coverage_audit(legal_structure, rubric_set.active_rubrics())
        missing_points = audit.get("missing_points", [])
        targeted_rubrics: list[Rubric] = []
        existing_texts = [rubric.text for rubric in rubric_set.rubrics]
        for point in missing_points[:6]:
            category = point.get("category", "reasoning")
            text = self._targeted_rubric_text(point.get("point", ""), category)
            if not text or self._text_present(text, existing_texts):
                continue
            rubric = self._make_rubric(
                text=text,
                category=category,
                parent_id=None,
                depth=0,
                source="coverage-audit",
                metadata={"repair_reason": point.get("reason", "")},
            )
            if rubric.category.lower() in STYLE_CATEGORIES and not self.config.include_style_rubrics:
                rubric.status = "rejected_style"
            targeted_rubrics.append(rubric)
            existing_texts.append(text)

        if not targeted_rubrics:
            return

        rubric_set.rubrics.extend(targeted_rubrics)
        new_evaluations = self.rubric_evaluator.evaluate(task, targeted_rubrics, task.sample_responses)
        self._merge_evaluations(rubric_set, targeted_rubrics, new_evaluations)

        active_rubrics = rubric_set.active_rubrics()
        active_evaluations = self._active_evaluations(rubric_set, active_rubrics)
        _, rejected_ids, redundancy_logs = self.redundancy_filter.filter(
            active_rubrics,
            active_evaluations,
            len(task.sample_responses),
        )
        for rubric_id in rejected_ids:
            self._mark_status(rubric_set, rubric_id, "rejected_redundant")
        rubric_set.logs.extend(redundancy_logs)

    def _coverage_audit(self, legal_structure: dict[str, Any], final_rubrics: list[Rubric]) -> dict[str, Any]:
        covered_categories = sorted({rubric.category for rubric in final_rubrics})
        required_categories = self._required_categories_from_structure(legal_structure)
        missing_categories = sorted(category for category in required_categories if category not in covered_categories)
        structure_terms = flatten_structure_terms(legal_structure)
        rubric_mapping: dict[str, list[str]] = {}
        missing_points: list[dict[str, str]] = []

        for rubric in final_rubrics:
            mapped_terms = [
                term for term in structure_terms if keyword_overlap_score(rubric.text, [term]) > 0.15
            ]
            rubric_mapping[rubric.id] = mapped_terms[:6]

        for category, items in legal_structure.items():
            if not isinstance(items, list):
                continue
            for item in items:
                point = item.get("name") if isinstance(item, dict) else str(item)
                if not point:
                    continue
                covered = any(keyword_overlap_score(rubric.text, [point]) > 0.15 for rubric in final_rubrics)
                if not covered:
                    missing_points.append(
                        {
                            "category": self._structure_key_to_category(category),
                            "point": point,
                            "reason": f"No final rubric directly covers the extracted {category[:-1] if category.endswith('s') else category}.",
                        }
                    )

        return {
            "covered_categories": covered_categories,
            "underrepresented_categories": missing_categories,
            "missing_points": missing_points,
            "rubric_mapping": rubric_mapping,
        }

    def _required_categories_from_structure(self, legal_structure: dict[str, Any]) -> set[str]:
        required = {"rule", "conclusion"}
        if legal_structure.get("issues") or self.config.require_issue_spotting_rubrics:
            required.add("issue")
        if legal_structure.get("elements"):
            required.add("element")
        if legal_structure.get("factors"):
            required.add("factor")
        if legal_structure.get("exceptions"):
            required.add("exception")
        if legal_structure.get("counterarguments") and self.config.require_counterargument_rubrics:
            required.add("counterargument")
        if legal_structure.get("applications") or self.config.require_fact_application_rubrics:
            required.add("application")
        return required

    @staticmethod
    def _structure_key_to_category(structure_key: str) -> str:
        mapping = {
            "issues": "issue",
            "sub_issues": "issue",
            "rules": "rule",
            "elements": "element",
            "factors": "factor",
            "exceptions": "exception",
            "applications": "application",
            "counterarguments": "counterargument",
            "conclusions": "conclusion",
            "omitted_but_implied": "reasoning",
        }
        return mapping.get(structure_key, "reasoning")

    @staticmethod
    def _targeted_rubric_text(point: str, category: str) -> str:
        if category == "issue":
            return f"The response addresses the legal issue of {point}."
        if category == "rule":
            return f"The response states the governing rule relating to {point} accurately."
        if category == "element":
            return f"The response addresses the element of {point}."
        if category == "factor":
            return f"The response analyzes the factor of {point}."
        if category == "exception":
            return f"The response addresses the exception or defense of {point} when relevant."
        if category == "application":
            return f"The response applies the legal analysis to the factual point that {point}."
        if category == "counterargument":
            return f"The response addresses the counterargument that {point}."
        if category == "conclusion":
            return f"The response reaches the conclusion that {point} with legal support."
        return f"The response addresses the legally material point that {point}."

    def _make_rubric(
        self,
        text: str,
        category: str,
        parent_id: str | None,
        depth: int,
        source: str,
        metadata: dict[str, Any] | None = None,
    ) -> Rubric:
        self._rubric_counter += 1
        return Rubric(
            id=f"R{self._rubric_counter:03d}",
            text=text.strip(),
            parent_id=parent_id,
            depth=depth,
            status="active",
            source=source,
            category=category.strip().lower(),
            metadata=metadata or {},
        )

    @staticmethod
    def _text_present(text: str, existing_texts: list[str]) -> bool:
        return any(jaccard_similarity(text, existing) >= 0.92 for existing in existing_texts)

    @staticmethod
    def _dedupe_new_rubrics(new_rubrics: list[Rubric], existing_rubrics: list[Rubric]) -> list[Rubric]:
        retained: list[Rubric] = []
        existing_texts = [rubric.text for rubric in existing_rubrics]
        for rubric in new_rubrics:
            if any(jaccard_similarity(rubric.text, existing_text) >= 0.92 for existing_text in existing_texts):
                rubric.status = "rejected_redundant"
                continue
            retained.append(rubric)
            existing_texts.append(rubric.text)
        return retained

    @staticmethod
    def _active_evaluations(rubric_set: RubricSet, active_rubrics: list[Rubric]) -> list[Any]:
        active_ids = {rubric.id for rubric in active_rubrics}
        return [evaluation for evaluation in rubric_set.evaluations if evaluation.rubric_id in active_ids]

    @staticmethod
    def _merge_evaluations(rubric_set: RubricSet, rubrics: list[Rubric], evaluations: list[Any]) -> None:
        replace_ids = {rubric.id for rubric in rubrics}
        rubric_set.evaluations = [
            evaluation for evaluation in rubric_set.evaluations if evaluation.rubric_id not in replace_ids
        ] + evaluations

    @staticmethod
    def _mark_status(rubric_set: RubricSet, rubric_id: str, status: str) -> None:
        for rubric in rubric_set.rubrics:
            if rubric.id == rubric_id and rubric.status == "active":
                rubric.status = status
                break

    def _synthesize_responses(self, task: LegalTaskExample) -> list[str]:
        sentences = [sentence.strip() for sentence in task.golden_answer.split(".") if sentence.strip()]
        if not sentences:
            return [task.golden_answer]

        full = task.golden_answer.strip()
        issue_rule = ". ".join(sentences[:2]).strip() + "."
        rule_plus_conclusion = ". ".join(sentences[:1] + sentences[-1:]).strip() + "."
        partial_application = ". ".join(sentences[:3]).strip() + "."
        generic = "The answer raises the basic issue but gives only a thin legal analysis and a brief conclusion."
        contrary = "The response gives a conclusory answer, mentions fairness, and omits the governing legal test."
        return [full, issue_rule, partial_application, rule_plus_conclusion, generic, contrary]

    def _export_outputs(
        self,
        output_dir: str | Path,
        result: PipelineResult,
        task: LegalTaskExample,
    ) -> Path:
        directory = ensure_directory(output_dir)
        final_rubrics = []
        active_rubrics = result.rubric_set.active_rubrics()
        for rubric in active_rubrics:
            payload = rubric.to_dict()
            payload["weight"] = result.rubric_set.weights.get(rubric.id, 0.0)
            final_rubrics.append(payload)

        write_json(directory / "final_rubrics.json", final_rubrics)
        write_matrix_csv(
            directory / "rubric_matrix.csv",
            rubric_rows=final_rubrics,
            matrix=result.rubric_matrix,
            response_headers=[f"response_{index}" for index, _ in enumerate(task.sample_responses)],
        )
        write_json(directory / "coverage_audit.json", result.coverage_audit)
        write_json(directory / "pipeline_log.json", result.rubric_set.logs)
        return directory
