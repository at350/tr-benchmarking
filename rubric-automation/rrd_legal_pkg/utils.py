"""Utility helpers for text processing, similarity, JSON parsing, and exports."""

from __future__ import annotations

import csv
import json
import math
import random
import re
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "because",
    "by",
    "for",
    "from",
    "has",
    "have",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "then",
    "there",
    "these",
    "they",
    "this",
    "to",
    "under",
    "was",
    "were",
    "whether",
    "which",
    "with",
}


CATEGORY_PRIORITY = {
    "issue": 1.20,
    "issue spotting": 1.20,
    "rule": 1.35,
    "rule statement": 1.35,
    "element": 1.30,
    "factor": 1.15,
    "exception": 1.20,
    "defense": 1.20,
    "application": 1.35,
    "reasoning": 1.10,
    "counterargument": 1.00,
    "conclusion": 1.15,
    "organization": 0.45,
    "clarity": 0.45,
    "style": 0.35,
}


STYLE_CATEGORIES = {"organization", "clarity", "style"}
CORE_CATEGORIES = {
    "issue",
    "issue spotting",
    "rule",
    "rule statement",
    "element",
    "factor",
    "exception",
    "defense",
    "application",
    "reasoning",
    "counterargument",
    "conclusion",
}


def seed_random(seed: int | None) -> None:
    """Set the process-local RNG seed when provided."""

    if seed is not None:
        random.seed(seed)


def ensure_directory(path: str | Path) -> Path:
    """Create a directory if needed and return it as a Path."""

    directory = Path(path)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def sanitize_text(text: str) -> str:
    """Normalize whitespace without altering legal content materially."""

    return re.sub(r"\s+", " ", text or "").strip()


def sentence_split(text: str) -> list[str]:
    """Split text into lightweight sentence-like chunks."""

    cleaned = sanitize_text(text)
    if not cleaned:
        return []
    pieces = re.split(r"(?<=[.!?])\s+|\n+", cleaned)
    return [piece.strip(" -") for piece in pieces if piece.strip(" -")]


def tokenize(text: str) -> list[str]:
    """Tokenize text into lowercased alphanumeric tokens."""

    return re.findall(r"[a-zA-Z0-9']+", text.lower())


def content_tokens(text: str) -> list[str]:
    """Return non-stopword tokens useful for rough semantic matching."""

    tokens = [token for token in tokenize(text) if token not in STOPWORDS]
    return [token[:-1] if token.endswith("s") and len(token) > 4 else token for token in tokens]


def jaccard_similarity(left: str, right: str) -> float:
    """Compute Jaccard similarity over normalized token sets."""

    left_set = set(content_tokens(left))
    right_set = set(content_tokens(right))
    if not left_set and not right_set:
        return 1.0
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def cosine_similarity_binary(left: Sequence[int], right: Sequence[int]) -> float:
    """Compute cosine similarity on binary vectors."""

    if len(left) != len(right):
        raise ValueError("Vectors must have the same length.")
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


def safe_json_loads(raw_text: str) -> Any:
    """Parse JSON robustly from an LLM response that may contain stray text."""

    text = raw_text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start_candidates = [index for index in (text.find("{"), text.find("[")) if index != -1]
        if not start_candidates:
            raise
        start = min(start_candidates)
        end_object = text.rfind("}")
        end_array = text.rfind("]")
        end = max(end_object, end_array)
        if end == -1 or end < start:
            raise
        fragment = text[start : end + 1]
        return json.loads(fragment)


def serialize(obj: Any) -> Any:
    """Convert dataclasses and paths into JSON-friendly structures."""

    if is_dataclass(obj):
        return asdict(obj)
    if isinstance(obj, Path):
        return str(obj)
    if isinstance(obj, dict):
        return {str(key): serialize(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [serialize(item) for item in obj]
    return obj


def normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    """Normalize positive weights to sum to one, with a uniform fallback."""

    filtered = {key: max(0.0, float(value)) for key, value in weights.items()}
    total = sum(filtered.values())
    if total <= 0:
        if not filtered:
            return {}
        uniform = 1.0 / len(filtered)
        return {key: uniform for key in filtered}
    return {key: value / total for key, value in filtered.items()}


def arithmetic_mean(values: Sequence[float]) -> float:
    """Return the arithmetic mean with a zero fallback."""

    if not values:
        return 0.0
    return sum(values) / len(values)


def variance(values: Sequence[float]) -> float:
    """Return the sample variance with a zero fallback."""

    if len(values) < 2:
        return 0.0
    mean_value = arithmetic_mean(values)
    return sum((value - mean_value) ** 2 for value in values) / (len(values) - 1)


def covariance_matrix(matrix: list[list[int]]) -> list[list[float]]:
    """Compute a covariance matrix for rubric score rows."""

    if not matrix:
        return []
    row_count = len(matrix)
    col_count = len(matrix[0]) if matrix[0] else 0
    if col_count < 2:
        return [[1.0 if i == j else 0.0 for j in range(row_count)] for i in range(row_count)]
    means = [arithmetic_mean(row) for row in matrix]
    covariances: list[list[float]] = []
    for i in range(row_count):
        row_values: list[float] = []
        for j in range(row_count):
            covariance = sum(
                (matrix[i][k] - means[i]) * (matrix[j][k] - means[j]) for k in range(col_count)
            ) / (col_count - 1)
            row_values.append(covariance)
        covariances.append(row_values)
    return covariances


def identity_matrix(size: int) -> list[list[float]]:
    """Create an identity matrix."""

    return [[1.0 if row == col else 0.0 for col in range(size)] for row in range(size)]


def invert_matrix(matrix: list[list[float]], regularization: float = 1e-6) -> list[list[float]]:
    """Invert a square matrix with Gauss-Jordan elimination and ridge regularization."""

    size = len(matrix)
    if size == 0:
        return []
    augmented = []
    identity = identity_matrix(size)
    for row_index in range(size):
        row = list(matrix[row_index])
        row[row_index] += regularization
        augmented.append(row + identity[row_index])

    for col in range(size):
        pivot_row = max(range(col, size), key=lambda row_index: abs(augmented[row_index][col]))
        pivot = augmented[pivot_row][col]
        if abs(pivot) < 1e-12:
            raise ValueError("Matrix is singular and cannot be inverted.")
        if pivot_row != col:
            augmented[col], augmented[pivot_row] = augmented[pivot_row], augmented[col]
        pivot = augmented[col][col]
        augmented[col] = [value / pivot for value in augmented[col]]
        for row_index in range(size):
            if row_index == col:
                continue
            factor = augmented[row_index][col]
            augmented[row_index] = [
                current - factor * reference
                for current, reference in zip(augmented[row_index], augmented[col])
            ]
    return [row[size:] for row in augmented]


def write_json(path: str | Path, payload: Any) -> None:
    """Write JSON with stable formatting."""

    Path(path).write_text(json.dumps(serialize(payload), indent=2, sort_keys=True), encoding="utf-8")


def write_matrix_csv(
    path: str | Path,
    rubric_rows: list[dict[str, Any]],
    matrix: list[list[int]],
    response_headers: list[str],
) -> None:
    """Export a rubric-response matrix as CSV."""

    with Path(path).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rubric_id", "category", "text", *response_headers])
        for rubric_row, row in zip(rubric_rows, matrix):
            writer.writerow([rubric_row["id"], rubric_row["category"], rubric_row["text"], *row])


def keyword_overlap_score(text: str, reference_terms: Iterable[str]) -> float:
    """Compute how many reference terms appear in the text."""

    reference = [term for term in reference_terms if term]
    if not reference:
        return 0.0
    text_tokens = set(content_tokens(text))
    hits = 0
    for term in reference:
        term_tokens = set(content_tokens(term))
        if term_tokens and term_tokens <= text_tokens:
            hits += 1
        elif text_tokens & term_tokens:
            hits += 0.5
    return hits / len(reference)


def flatten_structure_terms(structure: dict[str, Any]) -> list[str]:
    """Flatten a legal structure object into a list of salient names."""

    terms: list[str] = []
    for value in structure.values():
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    name = item.get("name")
                    if name:
                        terms.append(str(name))
                elif item:
                    terms.append(str(item))
    return terms


def rubric_specificity_score(text: str) -> float:
    """Approximate rubric specificity from lexical content."""

    tokens = content_tokens(text)
    unique_tokens = len(set(tokens))
    omnibus_penalty = 0.20 if " all " in f" {text.lower()} " or " and " in f" {text.lower()} " else 0.0
    return max(0.1, unique_tokens / 10.0 - omnibus_penalty)


def category_weight(category: str) -> float:
    """Return the default doctrinal priority for a rubric category."""

    return CATEGORY_PRIORITY.get(category.lower(), 1.0)
