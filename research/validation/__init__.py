"""Canonical research validation harness for the source-to-score pipeline."""

from .config import load_config
from .pipeline import run_pipeline

__all__ = ["load_config", "run_pipeline"]
