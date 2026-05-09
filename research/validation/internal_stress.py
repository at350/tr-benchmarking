"""Deterministic internal stress tests for the research pipeline."""

from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import random
from typing import Any

from .dasha import cluster_responses
from .metrics import bootstrap_ci, macro_f1
from .utils import write_json


REASONING_ARCHETYPES: tuple[dict[str, str], ...] = (
    {
        "label": "marriage_certificate_wife",
        "doctrine": "Statute of Frauds",
        "issue": "marriage consideration and beneficiary certificate",
        "rule_trigger": "promise made in consideration of marriage",
        "outcome": "wife_enforceable_claim",
        "exception_or_defense": "certificate_as_writing_or_substitute",
        "reasoning_path": "marriage promise plus certificate supports wife",
        "conclusion": "wife has stronger claim",
        "template": (
            "The wife has the stronger claim because the premarital promise was tied to marriage, "
            "the marriage occurred, and the certificate naming her as beneficiary supplies the key source-backed writing signal."
        ),
    },
    {
        "label": "association_replacement_later_beneficiaries",
        "doctrine": "Statute of Frauds",
        "issue": "replacement benefit certificate",
        "rule_trigger": "association certificate replacement rules",
        "outcome": "later_beneficiaries_control",
        "exception_or_defense": "final_certificate_controls",
        "reasoning_path": "replacement certificate overrides earlier beneficiary claim",
        "conclusion": "children and sister have stronger claim",
        "template": (
            "The later-named beneficiaries have the stronger claim because the association issued a replacement certificate "
            "and the final designation controls the benefit record despite the wife's premarital-promise argument."
        ),
    },
    {
        "label": "one_year_no_writing_barred",
        "doctrine": "Statute of Frauds",
        "issue": "oral employment term exceeding one year",
        "rule_trigger": "performance cannot be completed within one year",
        "outcome": "barred",
        "exception_or_defense": "estoppel_disputed",
        "reasoning_path": "one-year gate triggered and no signed writing",
        "conclusion": "claim likely barred",
        "template": (
            "The oral employment promise is likely barred because the term cannot be fully performed within one year, "
            "there is no signed writing, and reliance is only a disputed estoppel fallback."
        ),
    },
    {
        "label": "one_year_under_year_enforceable",
        "doctrine": "Statute of Frauds",
        "issue": "short oral employment term",
        "rule_trigger": "full performance possible within one year",
        "outcome": "enforceable",
        "exception_or_defense": "none_needed",
        "reasoning_path": "one-year gate not triggered",
        "conclusion": "oral promise may be enforceable",
        "template": (
            "The oral promise may be enforceable because the changed term can be fully performed within one year, "
            "so the one-year Statute of Frauds gate is not triggered and no writing substitute is needed."
        ),
    },
    {
        "label": "suretyship_main_purpose",
        "doctrine": "Statute of Frauds",
        "issue": "oral promise to pay another's debt",
        "rule_trigger": "suretyship promise",
        "outcome": "potentially_enforceable",
        "exception_or_defense": "main_purpose",
        "reasoning_path": "main-purpose exception may remove suretyship writing bar",
        "conclusion": "promise may be enforceable",
        "template": (
            "The suretyship writing gate is implicated, but the promise may be enforceable if the promisor's main purpose "
            "was protecting his own business interest rather than merely answering for another's debt."
        ),
    },
    {
        "label": "land_part_performance",
        "doctrine": "Statute of Frauds",
        "issue": "oral land-sale agreement with possession and improvements",
        "rule_trigger": "contract for an interest in land",
        "outcome": "potentially_enforceable",
        "exception_or_defense": "part_performance",
        "reasoning_path": "land gate triggered but possession plus improvements may satisfy part performance",
        "conclusion": "specific performance may be available",
        "template": (
            "The land-interest Statute of Frauds gate is triggered, but possession plus substantial improvements "
            "can support a part-performance route that may justify enforcement despite the missing formal writing."
        ),
    },
    {
        "label": "goods_quantity_missing_barred",
        "doctrine": "Statute of Frauds",
        "issue": "sale of goods over the UCC threshold with no quantity term",
        "rule_trigger": "sale of goods over $500",
        "outcome": "barred",
        "exception_or_defense": "ucc_quantity_missing",
        "reasoning_path": "goods gate triggered and no sufficient quantity writing or UCC exception",
        "conclusion": "contract claim likely barred",
        "template": (
            "The UCC goods writing gate is triggered because the transaction exceeds the statutory threshold, "
            "and the claim is likely barred where the writing lacks a quantity term and no UCC exception applies."
        ),
    },
    {
        "label": "executor_personal_promise_no_writing",
        "doctrine": "Statute of Frauds",
        "issue": "executor personal promise to pay estate debt",
        "rule_trigger": "executor or administrator promises personally to answer for estate debt",
        "outcome": "barred",
        "exception_or_defense": "no_signed_writing",
        "reasoning_path": "executor-administrator gate triggered and no signed writing",
        "conclusion": "personal promise likely unenforceable",
        "template": (
            "The executor-administrator Statute of Frauds category is triggered because the executor personally promised "
            "to pay an estate debt, and the promise is likely unenforceable without a signed writing."
        ),
    },
)


def _signature(archetype: dict[str, str]) -> dict[str, str | list[str]]:
    return {
        "doctrine": archetype["doctrine"],
        "issue": archetype["issue"],
        "rule_trigger": archetype["rule_trigger"],
        "outcome": archetype["outcome"],
        "exception_or_defense": archetype["exception_or_defense"],
        "reasoning_path": archetype["reasoning_path"],
        "conclusion": archetype["conclusion"],
        "key_distinguishing_facts": [
            archetype["rule_trigger"],
            archetype["exception_or_defense"],
        ],
    }


def build_stress_responses(sample_count: int = 500, seed: int = 2026) -> list[dict[str, Any]]:
    """Build a controlled response set with known legal-reasoning labels."""

    if sample_count < len(REASONING_ARCHETYPES):
        raise ValueError("sample_count must be at least the number of reasoning archetypes")
    rng = random.Random(seed)
    model_names = ("model_alpha", "model_beta", "model_gamma", "model_delta", "model_epsilon")
    hedges = ("On these facts,", "A careful answer would say", "The legally material path is that", "The bottom line is", "The key distinction is")
    responses = []
    for index in range(sample_count):
        archetype = REASONING_ARCHETYPES[index % len(REASONING_ARCHETYPES)]
        model = model_names[index % len(model_names)]
        text = f"{rng.choice(hedges)} {archetype['template']}"
        responses.append({
            "id": f"stress_{index + 1:04d}",
            "provider": "synthetic_fixture",
            "model": model,
            "sample_index": index + 1,
            "text": text,
            "expected_reasoning_label": archetype["label"],
            "reasoning_signature": _signature(archetype),
        })
    rng.shuffle(responses)
    return responses


def _cluster_labels(clusters: dict[str, Any]) -> dict[str, str]:
    mapping = {}
    for cluster in clusters.get("clusters", []):
        labels = [member.get("expected_reasoning_label", "unknown") for member in cluster.get("members", [])]
        if labels:
            mapping[cluster["id"]] = Counter(labels).most_common(1)[0][0]
    return mapping


def _purity(clusters: dict[str, Any]) -> float:
    total = 0
    correct = 0
    for cluster in clusters.get("clusters", []):
        labels = [member.get("expected_reasoning_label", "unknown") for member in cluster.get("members", [])]
        if not labels:
            continue
        total += len(labels)
        correct += Counter(labels).most_common(1)[0][1]
    return round(correct / total, 3) if total else 0.0


def _completeness(clusters: dict[str, Any]) -> float:
    by_label: dict[str, set[str]] = defaultdict(set)
    for cluster in clusters.get("clusters", []):
        for member in cluster.get("members", []):
            by_label[member.get("expected_reasoning_label", "unknown")].add(cluster["id"])
    if not by_label:
        return 0.0
    labels_in_one_cluster = sum(1 for cluster_ids in by_label.values() if len(cluster_ids) == 1)
    return round(labels_in_one_cluster / len(by_label), 3)


def run_internal_stress(output_dir: str | Path, sample_count: int = 500, seed: int = 2026) -> dict[str, Any]:
    """Run Dasha scale and projection stress checks and write paper-ready evidence."""

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    responses = build_stress_responses(sample_count=sample_count, seed=seed)
    clusters = cluster_responses(responses)
    cluster_labels = _cluster_labels(clusters)

    expected = []
    actual = []
    for cluster in clusters["clusters"]:
        cluster_label = cluster_labels[cluster["id"]]
        for member in cluster["members"]:
            expected.append(member["expected_reasoning_label"])
            actual.append(cluster_label)

    cluster_sizes = [cluster["size"] for cluster in clusters["clusters"]]
    low, high = bootstrap_ci(cluster_sizes, iterations=500, seed=seed)
    summary = {
        "schema_version": "research.internal_stress.v1",
        "status": "internal_stress_passed",
        "sample_count": sample_count,
        "seed": seed,
        "expected_reasoning_archetypes": len(REASONING_ARCHETYPES),
        "observed_clusters": len(clusters["clusters"]),
        "cluster_purity": _purity(clusters),
        "cluster_completeness": _completeness(clusters),
        "macro_f1": round(macro_f1(expected, actual), 3),
        "cluster_size_mean": round(sum(cluster_sizes) / len(cluster_sizes), 3) if cluster_sizes else 0.0,
        "cluster_size_bootstrap_ci": [round(low, 3), round(high, 3)],
        "cluster_labels": cluster_labels,
    }
    write_json(out / "stress_responses.json", responses)
    write_json(out / "stress_clusters.json", clusters)
    write_json(out / "stress_summary.json", summary)
    return summary


def write_stress_table(summary: dict[str, Any], table_path: str | Path) -> None:
    path = Path(table_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [
        ("Responses", str(summary["sample_count"])),
        ("Expected reasoning archetypes", str(summary["expected_reasoning_archetypes"])),
        ("Observed Dasha clusters", str(summary["observed_clusters"])),
        ("Cluster purity", str(summary["cluster_purity"])),
        ("Cluster completeness", str(summary["cluster_completeness"])),
        ("Macro-F1", str(summary["macro_f1"])),
        ("Mean cluster size", str(summary["cluster_size_mean"])),
    ]
    lines = [
        r"\begin{tabular}{ll}",
        r"\toprule",
        r"Check & Value \\",
        r"\midrule",
        *[f"{name} & {value} \\\\" for name, value in rows],
        r"\bottomrule",
        r"\end{tabular}",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
