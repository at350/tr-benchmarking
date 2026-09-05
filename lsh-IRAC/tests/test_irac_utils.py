"""Tests for the IRAC response parsing and formatting helpers (pure functions, no model needed)."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
for entry in (ROOT, ROOT / "lsh-IRAC"):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

from irac_utils import extract_json, format_irac_for_embedding  # noqa: E402

IRAC = {"issue": "Is the oral promise enforceable?", "rule": "Statute of Frauds.", "application": "No writing.", "conclusion": "Unenforceable."}


@pytest.mark.parametrize("text", [
    json.dumps(IRAC),
    "```json\n" + json.dumps(IRAC) + "\n```",
    "```\n" + json.dumps(IRAC, indent=2) + "\n```",
    "Sure! Here is the analysis:\n" + json.dumps(IRAC) + "\n\nLet me know if you need more.",
    "Here you go:\n```json\n" + json.dumps(IRAC) + "\n```\nHope this helps.",
])
def test_extract_json_handles_common_model_output_shapes(text):
    assert extract_json(text) == IRAC


def test_extract_json_falls_back_from_broken_code_fence_to_raw_braces():
    text = "```json\n{not valid json}\n```\n" + json.dumps(IRAC)
    assert extract_json(text) == IRAC


@pytest.mark.parametrize("text", ["", None, "no json here", "{unbalanced", "```json\n{\"a\": }\n```"])
def test_extract_json_returns_none_when_nothing_parses(text):
    assert extract_json(text) is None


def test_format_irac_for_embedding_labels_sections_and_skips_empty_ones():
    formatted = format_irac_for_embedding({"issue": "  Is it   enforceable? ", "rule": "", "application": None, "conclusion": "No."})
    assert formatted == "Issue: Is it enforceable?\nConclusion: No."


def test_format_irac_for_embedding_strips_ai_boilerplate():
    formatted = format_irac_for_embedding({"rule": "As an AI language model, I note the rule. The Statute of Frauds applies."})
    assert formatted == "Rule: The Statute of Frauds applies."
