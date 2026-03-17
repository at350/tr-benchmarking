"""Recursive Rubric Decomposition package for legal-answer evaluation."""

from .llm import AnthropicLLMClient, LLMClient, MockLLMClient, OpenAILLMClient
from .models import LegalTaskExample, PipelineConfig, PipelineResult, Rubric, RubricEvaluation, RubricSet
from .pipeline import RRDPipeline

__all__ = [
    "LLMClient",
    "MockLLMClient",
    "OpenAILLMClient",
    "AnthropicLLMClient",
    "LegalTaskExample",
    "PipelineConfig",
    "PipelineResult",
    "Rubric",
    "RubricEvaluation",
    "RubricSet",
    "RRDPipeline",
]
