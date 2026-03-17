"""LLM client abstractions for legal structure extraction and rubric operations."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from abc import ABC, abstractmethod
from typing import Any

from .prompts import (
    BINARY_RUBRIC_EVALUATION_PROMPT,
    COVERAGE_AUDIT_PROMPT,
    INITIAL_LEGAL_RUBRIC_PROMPT,
    LEGAL_RUBRIC_DECOMPOSITION_PROMPT,
    LEGAL_STRUCTURE_EXTRACTION_PROMPT,
    LEGAL_WEIGHT_ASSIGNMENT_PROMPT,
    REDUNDANCY_ADJUDICATION_PROMPT,
)
from .utils import (
    category_weight,
    content_tokens,
    flatten_structure_terms,
    jaccard_similarity,
    keyword_overlap_score,
    normalize_weights,
    safe_json_loads,
    sanitize_text,
    sentence_split,
)


STRUCTURE_KEYS = [
    "issues",
    "sub_issues",
    "rules",
    "elements",
    "factors",
    "exceptions",
    "applications",
    "counterarguments",
    "conclusions",
    "omitted_but_implied",
]


DOMAIN_DEFAULTS = {
    "negligence": {
        "issues": ["Whether the defendant is liable for negligence."],
        "rules": ["Negligence requires duty, breach, causation, and damages."],
        "elements": ["duty", "breach", "causation", "damages"],
        "exceptions": ["comparative negligence", "assumption of risk"],
    },
    "battery": {
        "issues": ["Whether the defendant committed battery."],
        "rules": ["Battery requires intent, harmful or offensive contact, and causation."],
        "elements": ["intent", "harmful or offensive contact", "causation"],
        "exceptions": ["consent", "self-defense", "privilege"],
    },
    "contract": {
        "issues": ["Whether an enforceable contract exists and was breached."],
        "rules": ["A contract claim typically requires offer, acceptance, consideration, breach, and damages."],
        "elements": ["offer", "acceptance", "consideration", "breach", "damages"],
        "exceptions": ["statute of frauds", "defense of mistake", "impracticability"],
    },
}


class LLMClient(ABC):
    """Abstract interface for all LLM-backed rubric services."""

    @abstractmethod
    def extract_legal_structure(
        self,
        legal_question: str,
        golden_answer: str,
        jurisdiction: str | None = None,
        legal_domain: str | None = None,
    ) -> dict[str, Any]:
        """Extract a structured representation of the legal question and answer."""

    @abstractmethod
    def generate_initial_legal_rubrics(
        self,
        legal_question: str,
        golden_answer: str,
        legal_structure: dict[str, Any],
        sample_responses: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Generate initial rubric proposals from the legal task."""

    @abstractmethod
    def decompose_rubric(
        self,
        legal_question: str,
        golden_answer: str,
        rubric_text: str,
        rubric_category: str,
        sample_responses: list[str],
    ) -> list[dict[str, Any]]:
        """Decompose an overly broad rubric into narrower children."""

    @abstractmethod
    def evaluate_rubric(
        self,
        legal_question: str,
        response: str,
        rubric_text: str,
        golden_answer: str | None = None,
    ) -> dict[str, Any]:
        """Evaluate a candidate response against a single rubric."""

    @abstractmethod
    def detect_redundancy(self, rubric_text: str, existing_rubrics: list[Any]) -> dict[str, Any]:
        """Assess whether a rubric duplicates an existing one."""

    @abstractmethod
    def assign_rubric_weights(
        self,
        legal_question: str,
        golden_answer: str,
        rubrics: list[Any],
    ) -> dict[str, float]:
        """Assign relative rubric weights."""


class BasePromptLLMClient(LLMClient):
    """Prompt-driven LLM client with JSON parsing and retry handling."""

    def __init__(self, model_name: str, max_retries: int = 3, temperature: float = 0.1) -> None:
        self.model_name = model_name
        self.max_retries = max_retries
        self.temperature = temperature

    @abstractmethod
    def _complete(self, prompt: str) -> str:
        """Send a prompt to the underlying provider and return raw text."""

    def _complete_json(self, prompt_name: str, prompt: str) -> Any:
        """Call the model with retries until valid JSON is returned."""

        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                raw = self._complete(prompt)
                return safe_json_loads(raw)
            except Exception as exc:  # pragma: no cover - exercised with a real provider
                last_error = exc
                repair_suffix = (
                    "\n\nYour last reply could not be parsed as JSON. "
                    "Return valid JSON only and include every required key."
                )
                prompt = f"{prompt}{repair_suffix}"
        raise ValueError(f"{prompt_name} failed after {self.max_retries} attempts: {last_error}") from last_error

    def extract_legal_structure(
        self,
        legal_question: str,
        golden_answer: str,
        jurisdiction: str | None = None,
        legal_domain: str | None = None,
    ) -> dict[str, Any]:
        prompt = LEGAL_STRUCTURE_EXTRACTION_PROMPT.format(
            jurisdiction=jurisdiction or "unspecified",
            legal_domain=legal_domain or "unspecified",
            legal_question=legal_question,
            golden_answer=golden_answer,
        )
        payload = self._complete_json("extract_legal_structure", prompt)
        return self._normalize_structure(payload)

    def generate_initial_legal_rubrics(
        self,
        legal_question: str,
        golden_answer: str,
        legal_structure: dict[str, Any],
        sample_responses: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        prompt = INITIAL_LEGAL_RUBRIC_PROMPT.format(
            legal_question=legal_question,
            golden_answer=golden_answer,
            legal_structure_json=json.dumps(legal_structure, indent=2, sort_keys=True),
            sample_responses_json=json.dumps(sample_responses or [], indent=2),
        )
        payload = self._complete_json("generate_initial_legal_rubrics", prompt)
        rubrics = payload.get("rubrics", []) if isinstance(payload, dict) else []
        return [self._normalize_rubric_dict(item) for item in rubrics if isinstance(item, dict)]

    def decompose_rubric(
        self,
        legal_question: str,
        golden_answer: str,
        rubric_text: str,
        rubric_category: str,
        sample_responses: list[str],
    ) -> list[dict[str, Any]]:
        prompt = LEGAL_RUBRIC_DECOMPOSITION_PROMPT.format(
            legal_question=legal_question,
            golden_answer=golden_answer,
            rubric_text=rubric_text.replace('"', "'"),
            rubric_category=rubric_category,
            sample_responses_json=json.dumps(sample_responses, indent=2),
        )
        payload = self._complete_json("decompose_rubric", prompt)
        children = payload.get("children", []) if isinstance(payload, dict) else []
        return [self._normalize_child_dict(item) for item in children if isinstance(item, dict)]

    def evaluate_rubric(
        self,
        legal_question: str,
        response: str,
        rubric_text: str,
        golden_answer: str | None = None,
    ) -> dict[str, Any]:
        prompt = BINARY_RUBRIC_EVALUATION_PROMPT.format(
            legal_question=legal_question,
            rubric_text=rubric_text,
            response=response,
            golden_answer=golden_answer or "",
        )
        payload = self._complete_json("evaluate_rubric", prompt)
        return {
            "satisfied": bool(payload.get("satisfied", False)),
            "confidence": float(payload.get("confidence", 0.0)),
            "rationale": str(payload.get("rationale", "")),
        }

    def detect_redundancy(self, rubric_text: str, existing_rubrics: list[Any]) -> dict[str, Any]:
        comparison_text = [
            item.text if hasattr(item, "text") else item.get("text", str(item))
            for item in existing_rubrics
        ]
        if not comparison_text:
            return {"redundant": False, "reason": "No existing rubrics.", "preferred_rubric": "either"}
        prompt = REDUNDANCY_ADJUDICATION_PROMPT.format(
            rubric_a=rubric_text,
            rubric_b=comparison_text[0],
        )
        payload = self._complete_json("detect_redundancy", prompt)
        return {
            "redundant": bool(payload.get("redundant", False)),
            "reason": str(payload.get("reason", "")),
            "preferred_rubric": str(payload.get("preferred_rubric", "either")),
        }

    def assign_rubric_weights(
        self,
        legal_question: str,
        golden_answer: str,
        rubrics: list[Any],
    ) -> dict[str, float]:
        rubric_payload = []
        for rubric in rubrics:
            rubric_payload.append(
                {
                    "id": getattr(rubric, "id", rubric.get("id")),
                    "text": getattr(rubric, "text", rubric.get("text")),
                    "category": getattr(rubric, "category", rubric.get("category")),
                }
            )
        prompt = LEGAL_WEIGHT_ASSIGNMENT_PROMPT.format(
            legal_question=legal_question,
            golden_answer=golden_answer,
            rubrics_json=json.dumps(rubric_payload, indent=2),
        )
        payload = self._complete_json("assign_rubric_weights", prompt)
        return normalize_weights({key: float(value) for key, value in payload.get("weights", {}).items()})

    def coverage_audit(
        self,
        legal_question: str,
        golden_answer: str,
        legal_structure: dict[str, Any],
        rubrics: list[Any],
    ) -> dict[str, Any]:
        """Optional LLM-backed coverage audit hook used by the pipeline when available."""

        rubric_payload = []
        for rubric in rubrics:
            rubric_payload.append(
                {
                    "id": getattr(rubric, "id", rubric.get("id")),
                    "text": getattr(rubric, "text", rubric.get("text")),
                    "category": getattr(rubric, "category", rubric.get("category")),
                }
            )
        prompt = COVERAGE_AUDIT_PROMPT.format(
            legal_question=legal_question,
            golden_answer=golden_answer,
            legal_structure_json=json.dumps(legal_structure, indent=2, sort_keys=True),
            rubrics_json=json.dumps(rubric_payload, indent=2),
        )
        payload = self._complete_json("coverage_audit", prompt)
        return payload if isinstance(payload, dict) else {}

    @staticmethod
    def _normalize_structure(payload: Any) -> dict[str, Any]:
        structure = payload if isinstance(payload, dict) else {}
        normalized = {}
        for key in STRUCTURE_KEYS:
            value = structure.get(key, [])
            normalized[key] = value if isinstance(value, list) else []
        return normalized

    @staticmethod
    def _normalize_rubric_dict(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "text": sanitize_text(str(payload.get("text", ""))),
            "category": str(payload.get("category", "reasoning")).strip().lower(),
            "layer": str(payload.get("layer", "core")).strip().lower(),
            "legal_basis": sanitize_text(str(payload.get("legal_basis", ""))),
            "binary_evaluable": bool(payload.get("binary_evaluable", True)),
        }

    @staticmethod
    def _normalize_child_dict(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "text": sanitize_text(str(payload.get("text", ""))),
            "category": str(payload.get("category", "reasoning")).strip().lower(),
            "why_more_specific": sanitize_text(str(payload.get("why_more_specific", ""))),
        }


class OpenAILLMClient(BasePromptLLMClient):
    """Optional OpenAI-backed client. Requires the `openai` package and an API key."""

    def __init__(
        self,
        model_name: str,
        api_key: str | None = None,
        base_url: str | None = None,
        max_retries: int = 3,
        temperature: float = 0.1,
    ) -> None:
        super().__init__(model_name=model_name, max_retries=max_retries, temperature=temperature)
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        if not self.api_key:
            raise ValueError("OpenAI API key missing. Set OPENAI_API_KEY or pass api_key explicitly.")
        try:
            from openai import OpenAI  # type: ignore
        except ImportError as exc:  # pragma: no cover - depends on local environment
            raise ImportError(
                "The `openai` package is not installed. Install it or use the mocked client."
            ) from exc
        self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def _complete(self, prompt: str) -> str:
        completion = self._client.chat.completions.create(
            model=self.model_name,
            temperature=self.temperature,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You are a careful legal evaluation assistant. Return valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        content = completion.choices[0].message.content
        if not content:
            raise ValueError("OpenAI returned an empty response.")
        return content


class AnthropicLLMClient(BasePromptLLMClient):
    """Optional Anthropic-backed client using direct HTTP requests."""

    def __init__(
        self,
        model_name: str,
        api_key: str | None = None,
        base_url: str | None = None,
        max_retries: int = 3,
        temperature: float = 0.1,
    ) -> None:
        super().__init__(model_name=model_name, max_retries=max_retries, temperature=temperature)
        self.api_key = api_key or os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
        self.base_url = base_url or os.getenv("ANTHROPIC_BASE_URL") or "https://api.anthropic.com/v1/messages"
        if not self.api_key:
            raise ValueError("Anthropic API key missing. Set CLAUDE_API_KEY or ANTHROPIC_API_KEY.")

    def _complete(self, prompt: str) -> str:
        payload = {
            "model": self.model_name,
            "max_tokens": 4000,
            "temperature": self.temperature,
            "system": "You are a careful legal evaluation assistant. Return valid JSON only.",
            "messages": [{"role": "user", "content": prompt}],
        }
        request = urllib.request.Request(
            self.base_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=120) as response:  # pragma: no cover - real network path
            raw_payload = json.loads(response.read().decode("utf-8"))
        content_blocks = raw_payload.get("content", [])
        text_parts = [
            block.get("text", "")
            for block in content_blocks
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        content = "".join(text_parts).strip()
        if not content:
            raise ValueError("Anthropic returned an empty response.")
        return content


class MockLLMClient(LLMClient):
    """Deterministic heuristic implementation for offline testing and demos."""

    def extract_legal_structure(
        self,
        legal_question: str,
        golden_answer: str,
        jurisdiction: str | None = None,
        legal_domain: str | None = None,
    ) -> dict[str, Any]:
        del jurisdiction
        sentences = sentence_split(f"{legal_question} {golden_answer}")
        domain_key = self._detect_domain(legal_question, golden_answer, legal_domain)
        defaults = DOMAIN_DEFAULTS.get(domain_key, {})

        structure = {key: [] for key in STRUCTURE_KEYS}
        structure["issues"] = self._extract_issue_items(legal_question, golden_answer, defaults)
        structure["sub_issues"] = self._extract_sub_issue_items(sentences)
        structure["rules"] = self._extract_rule_items(sentences, defaults)
        structure["elements"] = self._extract_component_items(sentences, defaults, "elements")
        structure["factors"] = self._extract_factor_items(sentences)
        structure["exceptions"] = self._extract_exception_items(sentences, defaults)
        structure["applications"] = self._extract_application_items(golden_answer)
        structure["counterarguments"] = self._extract_counterarguments(golden_answer)
        structure["conclusions"] = self._extract_conclusions(golden_answer, defaults)
        structure["omitted_but_implied"] = self._extract_implied_items(structure)
        return structure

    def generate_initial_legal_rubrics(
        self,
        legal_question: str,
        golden_answer: str,
        legal_structure: dict[str, Any],
        sample_responses: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        del legal_question, golden_answer, sample_responses
        rubrics: list[dict[str, Any]] = []

        for issue in legal_structure.get("issues", [])[:2]:
            rubrics.append(
                self._rubric_dict(
                    f"The response identifies the primary legal issue of {issue['name']}.",
                    "issue",
                    legal_basis=issue.get("support", issue["name"]),
                )
            )

        for rule in legal_structure.get("rules", [])[:2]:
            rubrics.append(
                self._rubric_dict(
                    f"The response states the governing rule for {rule['name']} accurately.",
                    "rule",
                    legal_basis=rule.get("support", rule["name"]),
                )
            )

        if legal_structure.get("elements") or legal_structure.get("factors"):
            rubrics.append(
                self._rubric_dict(
                    "The response addresses all material elements or factors of the governing doctrine.",
                    "element",
                    legal_basis="Element or factor coverage derived from the golden answer.",
                )
            )
        for element in legal_structure.get("elements", [])[:4]:
            rubrics.append(
                self._rubric_dict(
                    f"The response addresses the {element['name']} element.",
                    "element",
                    legal_basis=element.get("support", element["name"]),
                )
            )

        for exception in legal_structure.get("exceptions", [])[:2]:
            rubrics.append(
                self._rubric_dict(
                    f"The response addresses the {exception['name']} exception or defense when supported by the facts.",
                    "exception",
                    legal_basis=exception.get("support", exception["name"]),
                )
            )

        rubrics.append(
            self._rubric_dict(
                "The response applies the governing legal standard to the facts rather than merely reciting doctrine.",
                "application",
                legal_basis="Factual application is a core legal evaluation dimension.",
            )
        )
        rubrics.append(
            self._rubric_dict(
                "The response correctly analyzes the governing doctrine from issue to application.",
                "reasoning",
                legal_basis="Broad doctrinal reasoning check intended for recursive decomposition.",
            )
        )

        if legal_structure.get("counterarguments"):
            rubrics.append(
                self._rubric_dict(
                    "The response addresses the principal counterargument or defense raised by the facts.",
                    "counterargument",
                    legal_basis="Counterargument handling appears in the golden answer or natural issue structure.",
                )
            )

        rubrics.append(
            self._rubric_dict(
                "The response reaches a legally supported conclusion consistent with the governing analysis.",
                "conclusion",
                legal_basis="The conclusion should follow from the rule-and-facts analysis.",
            )
        )
        rubrics.append(
            self._rubric_dict(
                "The response is organized clearly enough to keep the legal analysis easy to follow.",
                "organization",
                layer="secondary",
                legal_basis="Secondary presentation criterion.",
            )
        )
        return self._dedupe_rubrics(rubrics)

    def decompose_rubric(
        self,
        legal_question: str,
        golden_answer: str,
        rubric_text: str,
        rubric_category: str,
        sample_responses: list[str],
    ) -> list[dict[str, Any]]:
        del sample_responses
        structure = self.extract_legal_structure(legal_question, golden_answer)
        children: list[dict[str, Any]] = []
        rubric_lower = rubric_text.lower()
        category = rubric_category.lower()

        if category in {"reasoning", "application"} or "issue to application" in rubric_lower:
            for issue in structure.get("issues", [])[:1]:
                children.append(
                    self._child_dict(
                        f"The response identifies the issue of {issue['name']}.",
                        "issue",
                        "Separates issue spotting from broader reasoning.",
                    )
                )
            for rule in structure.get("rules", [])[:1]:
                children.append(
                    self._child_dict(
                        f"The response states the governing rule for {rule['name']} accurately.",
                        "rule",
                        "Separates rule statement from broader reasoning.",
                    )
                )
            children.append(
                self._child_dict(
                    "The response applies the governing legal standard to the facts with explanation.",
                    "application",
                    "Separates factual application from general doctrinal correctness.",
                )
            )
            children.append(
                self._child_dict(
                    "The response reaches a conclusion supported by the legal analysis.",
                    "conclusion",
                    "Separates outcome support from the rest of the analysis.",
                )
            )

        if category in {"element", "factor"} or "all material elements" in rubric_lower:
            components = structure.get("elements") or structure.get("factors")
            for component in components[:5]:
                children.append(
                    self._child_dict(
                        f"The response addresses the {component['name']} element.",
                        "element" if structure.get("elements") else "factor",
                        "Splits grouped doctrinal components into independently evaluable items.",
                    )
                )
            children.append(
                self._child_dict(
                    "The response applies the material elements or factors to the facts rather than listing them abstractly.",
                    "application",
                    "Separates coverage from factual application.",
                )
            )

        if category == "issue":
            for rule in structure.get("rules", [])[:1]:
                children.append(
                    self._child_dict(
                        f"The response states the governing rule for {rule['name']} accurately.",
                        "rule",
                        "Separates issue spotting from the governing rule.",
                    )
                )
            children.append(
                self._child_dict(
                    "The response explains why the identified issue matters under the facts.",
                    "application",
                    "Separates spotting the issue from applying it.",
                )
            )

        if category == "rule":
            for element in structure.get("elements", [])[:4]:
                children.append(
                    self._child_dict(
                        f"The response addresses the {element['name']} element.",
                        "element",
                        "Separates the governing rule from its material elements.",
                    )
                )
            if structure.get("exceptions"):
                for exception in structure["exceptions"][:2]:
                    children.append(
                        self._child_dict(
                            f"The response addresses the {exception['name']} exception or defense if the facts make it relevant.",
                            "exception",
                            "Separates the main rule from legally distinct exceptions or defenses.",
                        )
                    )

        return self._dedupe_children(children)

    def evaluate_rubric(
        self,
        legal_question: str,
        response: str,
        rubric_text: str,
        golden_answer: str | None = None,
    ) -> dict[str, Any]:
        structure = self.extract_legal_structure(legal_question, golden_answer or "")
        category = self._infer_category(rubric_text)
        rubric_terms = self._select_reference_terms(rubric_text, structure)
        overlap = keyword_overlap_score(response, rubric_terms)
        response_lower = response.lower()
        analysis_markers = any(
            marker in response_lower
            for marker in ["because", "since", "here", "under these facts", "therefore", "thus"]
        )
        counter_markers = any(
            marker in response_lower
            for marker in ["however", "although", "but", "defense", "counterargument", "consent"]
        )

        satisfied = False
        rationale = ""
        if category in {"issue", "rule", "element", "factor", "exception"}:
            threshold = 0.45 if category == "rule" else 0.40
            satisfied = overlap >= threshold
            rationale = "Key doctrinal terms are present." if satisfied else "Key doctrinal terms are missing."
        elif category in {"application", "reasoning"}:
            satisfied = overlap >= 0.25 and analysis_markers
            rationale = (
                "The response connects legal points to facts."
                if satisfied
                else "The response does not adequately tie doctrine to facts."
            )
        elif category == "counterargument":
            satisfied = overlap >= 0.20 and counter_markers
            rationale = (
                "The response addresses a defense or competing position."
                if satisfied
                else "The response lacks a meaningful counterargument or defense discussion."
            )
        elif category == "conclusion":
            conclusion_terms = [item.get("name", "") for item in structure.get("conclusions", [])]
            conclusion_overlap = keyword_overlap_score(response, conclusion_terms)
            satisfied = analysis_markers or conclusion_overlap >= 0.25 or "likely" in response_lower
            rationale = "The response includes a supported legal conclusion." if satisfied else "The response lacks a supported conclusion."
        else:
            satisfied = len(response.split()) >= 40
            rationale = "The response is readable and structured." if satisfied else "The response is too thin to satisfy the presentation rubric."

        confidence = min(0.99, 0.40 + overlap * 0.55 + (0.10 if satisfied else 0.0))
        return {"satisfied": satisfied, "confidence": round(confidence, 3), "rationale": rationale}

    def detect_redundancy(self, rubric_text: str, existing_rubrics: list[Any]) -> dict[str, Any]:
        best_similarity = 0.0
        best_match_text = ""
        for item in existing_rubrics:
            candidate_text = item.text if hasattr(item, "text") else item.get("text", str(item))
            similarity = jaccard_similarity(rubric_text, candidate_text)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match_text = candidate_text
        redundant = best_similarity >= 0.85 or rubric_text.lower() == best_match_text.lower()
        return {
            "redundant": redundant,
            "reason": f"Best similarity={best_similarity:.2f} against existing rubric.",
            "preferred_rubric": "B" if redundant else "either",
            "similarity": round(best_similarity, 3),
        }

    def assign_rubric_weights(
        self,
        legal_question: str,
        golden_answer: str,
        rubrics: list[Any],
    ) -> dict[str, float]:
        del legal_question, golden_answer
        raw_weights: dict[str, float] = {}
        for rubric in rubrics:
            rubric_id = getattr(rubric, "id", rubric.get("id"))
            category = getattr(rubric, "category", rubric.get("category"))
            text = getattr(rubric, "text", rubric.get("text"))
            base = category_weight(str(category))
            specificity_bonus = min(0.35, len(set(content_tokens(text))) / 40.0)
            raw_weights[str(rubric_id)] = base + specificity_bonus
        return normalize_weights(raw_weights)

    @staticmethod
    def _rubric_dict(
        text: str,
        category: str,
        layer: str = "core",
        legal_basis: str = "",
        binary_evaluable: bool = True,
    ) -> dict[str, Any]:
        return {
            "text": sanitize_text(text),
            "category": category,
            "layer": layer,
            "legal_basis": sanitize_text(legal_basis),
            "binary_evaluable": binary_evaluable,
        }

    @staticmethod
    def _child_dict(text: str, category: str, why_more_specific: str) -> dict[str, Any]:
        return {
            "text": sanitize_text(text),
            "category": category,
            "why_more_specific": sanitize_text(why_more_specific),
        }

    @staticmethod
    def _detect_domain(legal_question: str, golden_answer: str, legal_domain: str | None = None) -> str:
        haystack = f"{legal_domain or ''} {legal_question} {golden_answer}".lower()
        for key in DOMAIN_DEFAULTS:
            if key in haystack:
                return key
        return "general"

    def _extract_issue_items(
        self,
        legal_question: str,
        golden_answer: str,
        defaults: dict[str, Any],
    ) -> list[dict[str, str]]:
        candidates = []
        for sentence in sentence_split(f"{legal_question} {golden_answer}"):
            lower = sentence.lower()
            if "whether" in lower or lower.startswith("issue"):
                candidates.append(sentence)
        if not candidates and defaults.get("issues"):
            candidates = list(defaults["issues"])
        if not candidates and legal_question.strip():
            candidates = [legal_question.strip()]
        return self._to_named_items(candidates)

    def _extract_sub_issue_items(self, sentences: list[str]) -> list[dict[str, str]]:
        candidates = []
        for sentence in sentences:
            lower = sentence.lower()
            if any(marker in lower for marker in ["sub-issue", "also whether", "in addition", "separately"]):
                candidates.append(sentence)
        return self._to_named_items(candidates)

    def _extract_rule_items(self, sentences: list[str], defaults: dict[str, Any]) -> list[dict[str, str]]:
        candidates = []
        for sentence in sentences:
            lower = sentence.lower()
            if any(
                marker in lower
                for marker in [
                    "requires",
                    "must show",
                    "must prove",
                    "rule",
                    "standard",
                    "elements are",
                    "occurs when",
                ]
            ):
                candidates.append(sentence)
        if not candidates and defaults.get("rules"):
            candidates = list(defaults["rules"])
        return self._to_named_items(candidates)

    def _extract_component_items(
        self,
        sentences: list[str],
        defaults: dict[str, Any],
        component_key: str,
    ) -> list[dict[str, str]]:
        found: list[str] = []
        for sentence in sentences:
            lower = sentence.lower()
            if any(marker in lower for marker in ["requires", "must show", "must prove", "elements are"]):
                found.extend(self._split_components(sentence))
        if not found and defaults.get(component_key):
            found = list(defaults[component_key])
        return self._to_named_items(found)

    def _extract_factor_items(self, sentences: list[str]) -> list[dict[str, str]]:
        found: list[str] = []
        for sentence in sentences:
            lower = sentence.lower()
            if "factors include" in lower or "courts consider" in lower:
                found.extend(self._split_components(sentence))
        return self._to_named_items(found)

    def _extract_exception_items(self, sentences: list[str], defaults: dict[str, Any]) -> list[dict[str, str]]:
        candidates = []
        for sentence in sentences:
            lower = sentence.lower()
            if any(marker in lower for marker in ["unless", "except", "defense", "privilege", "consent", "self-defense"]):
                candidates.append(sentence)
        if not candidates and defaults.get("exceptions"):
            candidates = list(defaults["exceptions"])
        return self._to_named_items(candidates)

    def _extract_application_items(self, golden_answer: str) -> list[dict[str, str]]:
        candidates = []
        for sentence in sentence_split(golden_answer):
            lower = sentence.lower()
            if any(marker in lower for marker in ["here", "because", "on these facts", "applied", "as applied"]):
                candidates.append(sentence)
        return self._to_named_items(candidates)

    def _extract_counterarguments(self, golden_answer: str) -> list[dict[str, str]]:
        candidates = []
        for sentence in sentence_split(golden_answer):
            lower = sentence.lower()
            if any(marker in lower for marker in ["however", "although", "defendant may argue", "counterargument", "defense"]):
                candidates.append(sentence)
        return self._to_named_items(candidates)

    def _extract_conclusions(self, golden_answer: str, defaults: dict[str, Any]) -> list[dict[str, str]]:
        candidates = []
        for sentence in sentence_split(golden_answer):
            lower = sentence.lower()
            if any(marker in lower for marker in ["therefore", "thus", "likely", "conclusion", "in sum"]):
                candidates.append(sentence)
        if not candidates:
            last_sentence = sentence_split(golden_answer)[-1:] or []
            candidates.extend(last_sentence)
        if not candidates and defaults.get("issues"):
            candidates.extend(defaults["issues"])
        return self._to_named_items(candidates)

    def _extract_implied_items(self, structure: dict[str, Any]) -> list[dict[str, str]]:
        candidates: list[str] = []
        if structure.get("rules") and not structure.get("applications"):
            candidates.append("Application of the governing rule to the material facts.")
        if structure.get("elements") and not structure.get("conclusions"):
            candidates.append("An overall conclusion tying the elements to the likely outcome.")
        return self._to_named_items(candidates)

    @staticmethod
    def _split_components(text: str) -> list[str]:
        working = text
        for anchor in ["requires", "must show", "must prove", "elements are", "factors include", "courts consider"]:
            pattern = re.compile(re.escape(anchor), re.IGNORECASE)
            match = pattern.search(working)
            if match:
                working = working[match.end() :]
                break
        working = re.sub(r"\b(plaintiff|defendant|claimant|court)\b", "", working, flags=re.IGNORECASE)
        working = working.replace(" and ", ", ")
        parts = [part.strip(" .,:;-") for part in working.split(",")]
        cleaned = []
        for part in parts:
            if len(part) < 3:
                continue
            part = re.sub(r"^(that|the|a|an)\s+", "", part, flags=re.IGNORECASE)
            if 2 <= len(part.split()) <= 8:
                cleaned.append(part)
        return cleaned

    @staticmethod
    def _to_named_items(items: list[str]) -> list[dict[str, str]]:
        normalized: list[dict[str, str]] = []
        seen: set[str] = set()
        for item in items:
            cleaned = sanitize_text(item)
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append({"name": cleaned, "support": cleaned})
        return normalized

    @staticmethod
    def _dedupe_rubrics(rubrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        deduped: list[dict[str, Any]] = []
        for rubric in rubrics:
            key = rubric["text"].lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(rubric)
        return deduped

    @staticmethod
    def _dedupe_children(children: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        deduped: list[dict[str, Any]] = []
        for child in children:
            if not child["text"]:
                continue
            key = child["text"].lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(child)
        return deduped

    @staticmethod
    def _infer_category(rubric_text: str) -> str:
        text = rubric_text.lower()
        if "issue" in text:
            return "issue"
        if "rule" in text or "standard" in text:
            return "rule"
        if "element" in text:
            return "element"
        if "factor" in text:
            return "factor"
        if "exception" in text or "defense" in text:
            return "exception"
        if "counterargument" in text:
            return "counterargument"
        if "conclusion" in text:
            return "conclusion"
        if "apply" in text or "facts" in text:
            return "application"
        if "organized" in text or "clear" in text:
            return "organization"
        return "reasoning"

    def _select_reference_terms(self, rubric_text: str, structure: dict[str, Any]) -> list[str]:
        explicit_terms = []
        rubric_lower = rubric_text.lower()
        for term in flatten_structure_terms(structure):
            if any(token in rubric_lower for token in content_tokens(term)):
                explicit_terms.append(term)
        if explicit_terms:
            return explicit_terms
        if "element" in rubric_lower:
            return [item.get("name", "") for item in structure.get("elements", [])]
        if "rule" in rubric_lower:
            return [item.get("name", "") for item in structure.get("rules", [])]
        if "issue" in rubric_lower:
            return [item.get("name", "") for item in structure.get("issues", [])]
        if "counterargument" in rubric_lower:
            return [item.get("name", "") for item in structure.get("counterarguments", [])]
        if "conclusion" in rubric_lower:
            return [item.get("name", "") for item in structure.get("conclusions", [])]
        if "apply" in rubric_lower or "facts" in rubric_lower:
            return [item.get("name", "") for item in structure.get("applications", [])] or flatten_structure_terms(structure)
        return flatten_structure_terms(structure)[:8]
