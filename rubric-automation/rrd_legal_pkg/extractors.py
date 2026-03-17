"""Legal-structure extraction service."""

from __future__ import annotations

from typing import Any

from .llm import LLMClient
from .models import LegalTaskExample


class LegalStructureExtractor:
    """Thin service wrapper around the LLM legal-structure extractor."""

    def __init__(self, llm_client: LLMClient) -> None:
        self.llm_client = llm_client

    def extract(self, task: LegalTaskExample) -> dict[str, Any]:
        """Extract doctrinal structure from the legal task."""

        return self.llm_client.extract_legal_structure(
            legal_question=task.legal_question,
            golden_answer=task.golden_answer,
            jurisdiction=task.jurisdiction,
            legal_domain=task.legal_domain,
        )
