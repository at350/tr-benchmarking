"""Typed data models for the Recursive Rubric Decomposition pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class LegalTaskExample:
    """Input bundle for a legal-answer evaluation task."""

    legal_question: str
    golden_answer: str
    sample_responses: list[str] = field(default_factory=list)
    jurisdiction: str | None = None
    legal_domain: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LegalTaskExample":
        """Create a task object from a JSON-compatible dictionary."""

        return cls(
            legal_question=str(data["legal_question"]).strip(),
            golden_answer=str(data["golden_answer"]).strip(),
            sample_responses=[str(item).strip() for item in data.get("sample_responses", [])],
            jurisdiction=data.get("jurisdiction"),
            legal_domain=data.get("legal_domain"),
            metadata=dict(data.get("metadata", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the task."""

        return asdict(self)


@dataclass
class Rubric:
    """A single rubric criterion in the decomposition tree."""

    id: str
    text: str
    parent_id: str | None
    depth: int
    status: str
    source: str
    category: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the rubric."""

        return asdict(self)


@dataclass
class RubricEvaluation:
    """Evaluation of one rubric against one candidate response."""

    rubric_id: str
    response_index: int
    satisfied: bool
    confidence: float | None = None
    rationale: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the evaluation."""

        return asdict(self)


@dataclass
class RubricSet:
    """The working rubric collection plus evaluation artifacts."""

    rubrics: list[Rubric] = field(default_factory=list)
    evaluations: list[RubricEvaluation] = field(default_factory=list)
    weights: dict[str, float] = field(default_factory=dict)
    iteration_count: int = 0
    logs: list[dict[str, Any]] = field(default_factory=list)

    def active_rubrics(self) -> list[Rubric]:
        """Return rubrics that remain active for final scoring."""

        return [rubric for rubric in self.rubrics if rubric.status == "active"]

    def rubric_index(self) -> dict[str, Rubric]:
        """Map rubric ids to rubric objects."""

        return {rubric.id: rubric for rubric in self.rubrics}

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the rubric set."""

        return {
            "rubrics": [rubric.to_dict() for rubric in self.rubrics],
            "evaluations": [evaluation.to_dict() for evaluation in self.evaluations],
            "weights": dict(self.weights),
            "iteration_count": self.iteration_count,
            "logs": list(self.logs),
        }


@dataclass
class PipelineConfig:
    """Configuration knobs for recursive rubric generation and refinement."""

    decomposition_match_threshold: int = 3
    max_iterations: int = 4
    early_stop_rejected_threshold: int = 8
    redundancy_similarity_threshold: float = 0.82
    misalignment_enabled: bool = True
    weighting_mode: str = "doctrinal"
    llm_model_name: str = "gpt-4.1-mini"
    max_new_rubrics_per_decomposition: int = 6
    include_style_rubrics: bool = False
    doctrinal_priority_weighting: bool = True
    require_fact_application_rubrics: bool = True
    require_issue_spotting_rubrics: bool = True
    require_counterargument_rubrics: bool = True
    random_seed: int | None = 7
    misalignment_mode: str = "golden"
    misalignment_threshold: float = 0.6
    llm_max_retries: int = 3
    llm_temperature: float = 0.1

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the config."""

        return asdict(self)


@dataclass
class PipelineResult:
    """Top-level result returned by the pipeline runner."""

    rubric_set: RubricSet
    rubric_matrix: list[list[int]]
    coverage_audit: dict[str, Any]
    iteration_summary: list[dict[str, Any]]
    output_dir: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the full result."""

        return {
            "rubric_set": self.rubric_set.to_dict(),
            "rubric_matrix": [list(row) for row in self.rubric_matrix],
            "coverage_audit": dict(self.coverage_audit),
            "iteration_summary": list(self.iteration_summary),
            "output_dir": self.output_dir,
        }
