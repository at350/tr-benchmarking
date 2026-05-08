"""Metrics used by paper-ready validation reports."""

from __future__ import annotations

import random
from collections import Counter
from typing import Sequence


def mean_absolute_error(expected: Sequence[float], actual: Sequence[float]) -> float:
    if len(expected) != len(actual):
        raise ValueError("Expected and actual arrays must have equal length")
    if not expected:
        return 0.0
    return sum(abs(left - right) for left, right in zip(expected, actual)) / len(expected)


def macro_f1(expected: Sequence[str], actual: Sequence[str]) -> float:
    labels = sorted(set(expected) | set(actual))
    if not labels:
        return 0.0
    scores = []
    for label in labels:
        tp = sum(1 for left, right in zip(expected, actual) if left == label and right == label)
        fp = sum(1 for left, right in zip(expected, actual) if left != label and right == label)
        fn = sum(1 for left, right in zip(expected, actual) if left == label and right != label)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        scores.append((2 * precision * recall / (precision + recall)) if precision + recall else 0.0)
    return sum(scores) / len(scores)


def weighted_kappa(expected: Sequence[int], actual: Sequence[int]) -> float:
    if len(expected) != len(actual):
        raise ValueError("Expected and actual arrays must have equal length")
    if not expected:
        return 0.0
    labels = sorted(set(expected) | set(actual))
    if len(labels) == 1:
        return 1.0
    label_to_index = {label: index for index, label in enumerate(labels)}
    max_distance = len(labels) - 1
    observed = 0.0
    for left, right in zip(expected, actual):
        observed += (abs(label_to_index[left] - label_to_index[right]) / max_distance) ** 2
    observed /= len(expected)

    left_counts = Counter(expected)
    right_counts = Counter(actual)
    expected_disagreement = 0.0
    total = len(expected)
    for left in labels:
        for right in labels:
            weight = (abs(label_to_index[left] - label_to_index[right]) / max_distance) ** 2
            expected_disagreement += weight * (left_counts[left] / total) * (right_counts[right] / total)
    if expected_disagreement == 0:
        return 1.0
    return 1 - observed / expected_disagreement


def bootstrap_ci(values: Sequence[float], iterations: int = 1000, seed: int = 7, alpha: float = 0.05) -> tuple[float, float]:
    if not values:
        return (0.0, 0.0)
    rng = random.Random(seed)
    means = []
    for _ in range(iterations):
        sample = [rng.choice(values) for _ in values]
        means.append(sum(sample) / len(sample))
    means.sort()
    low_index = max(0, int((alpha / 2) * iterations) - 1)
    high_index = min(iterations - 1, int((1 - alpha / 2) * iterations) - 1)
    return means[low_index], means[high_index]
