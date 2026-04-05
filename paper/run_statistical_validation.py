#!/usr/bin/env python3
"""
Reproducible statistical validation for the Frank-Karthic-Dasha pipeline.

This script is deliberately local-artifact-first:

- Frank stage:
  `legal-workflow-data/frank-packets/frank_1775367155212_48b90d17.json`
- Karthic stage:
  `legal-workflow-data/karthic-rubric-packs/karthic_1775367155213_270af0ba.json`
- Dasha stage:
  `legal-workflow-data/dasha-runs/dasha_1775367155213_70677f12.json`

It evaluates a single benchmark question:
the father-son oral promise / student-loan enforceability hypothetical.

Validation workflow:
1. Load the Frank, Karthic, and Dasha artifacts.
2. Build instruction-tuned and baseline embeddings of the IRAC responses.
3. Run UMAP (n_components=5) followed by HDBSCAN (min_cluster_size=5).
4. Compute Silhouette Score and Davies-Bouldin Index.
5. Run permutation tests for:
   - cluster stability across UMAP random seeds using NMI and ARI
   - cluster/model-family correspondence using NMI and ARI

The script refuses to silently use random embeddings unless the caller
explicitly opts into that behavior with `--allow-random-fallback`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np
from sklearn.cluster import HDBSCAN
from sklearn.metrics import (
    adjusted_rand_score,
    davies_bouldin_score,
    normalized_mutual_info_score,
    silhouette_score,
)

# UMAP import requires a writable numba cache under this Python 3.14 setup.
os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba-cache")
import umap  # noqa: E402

try:
    from sentence_transformers import SentenceTransformer
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "sentence-transformers is required. Install dependencies from "
        "`lsh/requirements.txt` before running this script."
    ) from exc


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FRANK_JSON = (
    PROJECT_ROOT
    / "legal-workflow-data"
    / "frank-packets"
    / "frank_1775367155212_48b90d17.json"
)
DEFAULT_KARTHIC_JSON = (
    PROJECT_ROOT
    / "legal-workflow-data"
    / "karthic-rubric-packs"
    / "karthic_1775367155213_270af0ba.json"
)
DEFAULT_DASHA_JSON = (
    PROJECT_ROOT
    / "legal-workflow-data"
    / "dasha-runs"
    / "dasha_1775367155213_70677f12.json"
)
DEFAULT_EXISTING_RUN_JSON = (
    PROJECT_ROOT / "lsh-IRAC" / "results" / "run_20260224_010918.json"
)
DEFAULT_REPORT_DIR = PROJECT_ROOT / "paper" / "results"
DEFAULT_INSTRUCTION_MODEL = "hkunlp/instructor-large"
DEFAULT_BASELINE_MODEL = "all-MiniLM-L6-v2"
DEFAULT_MODEL_ROSTER = [
    "gpt-4o",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-4.1-nano",
    "claude-4-sonnet",
    "claude-3.5-haiku",
    "gemini-3-pro",
    "gemini-3-flash",
    "deepseek-v3",
    "kimi-k2-thinking",
    "llama-4-maverick-instruct",
    "llama-4-scout-instruct",
]
MODEL_NAME_ALIASES = {
    "anthropic/claude-4-sonnet": "claude-4-sonnet",
    "anthropic/claude-3.5-haiku": "claude-3.5-haiku",
    "google/gemini-3-pro": "gemini-3-pro",
    "google/gemini-3-flash": "gemini-3-flash",
    "deepseek-ai/deepseek-v3": "deepseek-v3",
    "moonshotai/kimi-k2-thinking": "kimi-k2-thinking",
    "meta/llama-4-maverick-instruct": "llama-4-maverick-instruct",
    "meta/llama-4-scout-instruct": "llama-4-scout-instruct",
}

INSTRUCTION_PREFIX = (
    "Represent the legal reasoning components "
    "(Issue, Rule, Application, Conclusion) of this text:"
)

DOCTRINE_PATTERNS = OrderedDict(
    [
        ("marriage_statute_of_frauds", re.compile(r"consideration of marriage", re.I)),
        ("suretyship", re.compile(r"surety|debt of another", re.I)),
        ("main_purpose", re.compile(r"main purpose|leading object", re.I)),
        ("promissory_estoppel", re.compile(r"promissory estoppel|detrimental reliance", re.I)),
        ("one_year_rule", re.compile(r"one[- ]year|within one year", re.I)),
        ("consideration", re.compile(r"bargained[- ]for|consideration", re.I)),
    ]
)

_MODEL_CACHE: Dict[Tuple[str, bool], SentenceTransformer] = {}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def infer_family(model_name: str) -> str:
    name = model_name.lower()
    if "gpt" in name:
        return "GPT"
    if "gemini" in name:
        return "Gemini"
    if "claude" in name:
        return "Claude"
    if "llama" in name:
        return "LLAMA"
    if "deepseek" in name:
        return "DeepSeek"
    if "kimi" in name:
        return "Kimi"
    return "Unknown"


def canonicalize_model_name(model_name: Any) -> str:
    normalized = clean_text(model_name)
    if not normalized:
        return "unknown-model"
    return MODEL_NAME_ALIASES.get(normalized, normalized)


def clean_text(text: Any) -> str:
    if text is None:
        return ""
    normalized = str(text).strip()
    normalized = re.sub(r"^(As an AI|I am an AI)[^.]*\.", "", normalized, flags=re.I)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def format_irac_for_embedding(irac_dict: Dict[str, Any]) -> str:
    sections: List[str] = []
    for key in ("issue", "rule", "application", "conclusion"):
        value = clean_text(irac_dict.get(key, ""))
        if value:
            sections.append(f"{key.capitalize()}: {value}")
    return "\n".join(sections)


def normalize_multiline_text(text: Any) -> str:
    if text is None:
        return ""
    lines = [re.sub(r"\s+", " ", str(line)).strip() for line in str(text).splitlines()]
    return "\n".join(line for line in lines if line).strip()


def parse_irac_response_text(text: str) -> Dict[str, str] | None:
    pattern = re.compile(
        r"(Issue|Rule|Application|Conclusion)\s*:\s*(.*?)(?=(?:Issue|Rule|Application|Conclusion)\s*:|$)",
        flags=re.IGNORECASE | re.DOTALL,
    )
    matches = pattern.findall(text)
    if not matches:
        return None

    parsed = {
        "issue": "",
        "rule": "",
        "application": "",
        "conclusion": "",
    }
    for section, content in matches:
        parsed[section.lower()] = normalize_multiline_text(content)
    if not any(parsed.values()):
        return None
    return parsed


def normalize_response_record(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    normalized = dict(item)
    normalized.setdefault("id", f"response_{index}")
    normalized["model"] = canonicalize_model_name(normalized.get("model", "unknown-model"))
    normalized.setdefault("family", infer_family(normalized["model"]))
    response = normalized.get("response", {})

    if isinstance(response, dict):
        for key in ("issue", "rule", "application", "conclusion"):
            response.setdefault(key, "")
        normalized["response"] = response
        normalized["response_text"] = format_irac_for_embedding(response)
        normalized["full_text"] = "\n".join(
            [
                normalized["response"].get("issue", ""),
                normalized["response"].get("rule", ""),
                normalized["response"].get("application", ""),
                normalized["response"].get("conclusion", ""),
            ]
        ).strip()
        return normalized

    raw_response_text = normalized.get("responseText", "") or normalized.get("raw_text", "")
    response_text = normalize_multiline_text(raw_response_text)
    if not response_text:
        raise ValueError(f"Response payload for {normalized['id']} is not usable.")

    parsed_response = parse_irac_response_text(response_text)
    normalized["response"] = parsed_response or {
        "issue": "",
        "rule": "",
        "application": "",
        "conclusion": "",
    }
    normalized["response_text"] = (
        format_irac_for_embedding(parsed_response)
        if parsed_response
        else response_text
    )
    normalized["full_text"] = response_text
    return normalized


def load_artifacts(
    frank_json: Path,
    karthic_json: Path,
    dasha_json: Path,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]]:
    frank = load_json(frank_json)
    karthic = load_json(karthic_json)
    dasha_raw = load_json(dasha_json)
    if isinstance(dasha_raw, dict) and isinstance(dasha_raw.get("responses"), list):
        dasha_items = dasha_raw["responses"]
    else:
        dasha_items = dasha_raw
    dasha = [normalize_response_record(item, index) for index, item in enumerate(dasha_items)]
    return frank, karthic, dasha


def validate_response_corpus(
    records: List[Dict[str, Any]],
    *,
    expected_total: int,
    expected_per_model: int,
    strict: bool,
) -> Dict[str, Any]:
    counts = Counter(record["model"] for record in records)
    missing_models = sorted(set(DEFAULT_MODEL_ROSTER) - set(counts))
    unexpected_models = sorted(set(counts) - set(DEFAULT_MODEL_ROSTER))
    short_models = {
        model: count
        for model, count in sorted(counts.items())
        if count != expected_per_model
    }

    validation = {
        "expected_total": expected_total,
        "actual_total": len(records),
        "expected_per_model": expected_per_model,
        "expected_model_count": len(DEFAULT_MODEL_ROSTER),
        "actual_model_count": len(counts),
        "missing_models": missing_models,
        "unexpected_models": unexpected_models,
        "models_with_nonstandard_counts": short_models,
    }

    mismatch = (
        len(records) != expected_total
        or missing_models
        or unexpected_models
        or short_models
    )
    validation["matches_target_configuration"] = not mismatch

    if strict and mismatch:
        raise RuntimeError(
            "Response corpus does not match the requested 240-response / 12-model "
            f"design target: {json.dumps(validation, indent=2)}"
        )

    return validation


def get_model(model_name: str, local_files_only: bool) -> SentenceTransformer:
    cache_key = (model_name, local_files_only)
    cached = _MODEL_CACHE.get(cache_key)
    if cached is not None:
        return cached

    if local_files_only:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

    model = SentenceTransformer(
        model_name,
        trust_remote_code=True,
        local_files_only=local_files_only,
    )
    _MODEL_CACHE[cache_key] = model
    return model


def random_fallback_embeddings(texts: Iterable[str], model_name: str, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dim = 768 if "instructor" in model_name.lower() else 384
    return rng.standard_normal((len(list(texts)), dim))


def encode_texts(
    texts: List[str],
    model_name: str,
    *,
    instruction: str | None,
    local_files_only: bool,
    allow_random_fallback: bool,
) -> np.ndarray:
    try:
        model = get_model(model_name, local_files_only=local_files_only)
    except Exception as exc:
        if allow_random_fallback:
            return random_fallback_embeddings(texts, model_name)
        raise RuntimeError(
            f"Unable to load embedding model `{model_name}`. "
            "If the model is not cached locally, rerun with network access or "
            "use `--allow-random-fallback` only for dry-run debugging."
        ) from exc

    try:
        if instruction and "instructor" in model_name.lower():
            inputs = [[instruction, text] for text in texts]
        elif instruction:
            inputs = [f"{instruction}\n{text}" for text in texts]
        else:
            inputs = texts

        embeddings = model.encode(inputs, show_progress_bar=False)
        return np.asarray(embeddings, dtype=float)
    except Exception as exc:
        if allow_random_fallback:
            return random_fallback_embeddings(texts, model_name)
        raise RuntimeError(
            f"Embedding generation failed for `{model_name}`."
        ) from exc


def run_umap_hdbscan(
    embeddings: np.ndarray,
    *,
    random_state: int,
    n_components: int = 5,
    n_neighbors: int = 5,
    min_dist: float = 0.1,
    min_cluster_size: int = 5,
    min_samples: int = 2,
) -> Tuple[np.ndarray, np.ndarray]:
    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric="cosine",
        random_state=random_state,
        transform_seed=random_state,
    )
    reduced = reducer.fit_transform(embeddings)

    clusterer = HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="euclidean",
        cluster_selection_method="eom",
    )
    labels = clusterer.fit_predict(reduced)
    return labels, reduced


def compute_cluster_quality(reduced_embeddings: np.ndarray, labels: np.ndarray) -> Dict[str, Any]:
    mask = labels != -1
    cluster_labels = labels[mask]
    n_clusters = len(set(cluster_labels.tolist()))
    n_noise = int((~mask).sum())

    result: Dict[str, Any] = {
        "n_total": int(labels.shape[0]),
        "n_clusters": int(n_clusters),
        "n_noise": int(n_noise),
        "noise_ratio": round(n_noise / max(len(labels), 1), 4),
    }

    if n_clusters >= 2 and int(mask.sum()) >= 2:
        result["silhouette_score"] = round(
            float(silhouette_score(reduced_embeddings[mask], cluster_labels)),
            4,
        )
        result["davies_bouldin_index"] = round(
            float(davies_bouldin_score(reduced_embeddings[mask], cluster_labels)),
            4,
        )
    else:
        result["silhouette_score"] = None
        result["davies_bouldin_index"] = None

    return result


def permutation_test(
    labels_a: np.ndarray,
    labels_b: np.ndarray,
    *,
    permutations: int,
    seed: int,
) -> Dict[str, Any]:
    rng = np.random.default_rng(seed)

    observed_nmi = float(normalized_mutual_info_score(labels_a, labels_b))
    observed_ari = float(adjusted_rand_score(labels_a, labels_b))

    null_nmi = np.empty(permutations, dtype=float)
    null_ari = np.empty(permutations, dtype=float)

    for index in range(permutations):
        shuffled = rng.permutation(labels_b)
        null_nmi[index] = normalized_mutual_info_score(labels_a, shuffled)
        null_ari[index] = adjusted_rand_score(labels_a, shuffled)

    p_value_nmi = float((1 + np.sum(null_nmi >= observed_nmi)) / (permutations + 1))
    p_value_ari = float((1 + np.sum(null_ari >= observed_ari)) / (permutations + 1))

    return {
        "observed_nmi": round(observed_nmi, 6),
        "observed_ari": round(observed_ari, 6),
        "p_value_nmi": p_value_nmi,
        "p_value_ari": p_value_ari,
        "null_nmi_mean": round(float(null_nmi.mean()), 6),
        "null_nmi_std": round(float(null_nmi.std()), 6),
        "null_ari_mean": round(float(null_ari.mean()), 6),
        "null_ari_std": round(float(null_ari.std()), 6),
        "effect_size_nmi": round(
            float((observed_nmi - null_nmi.mean()) / max(null_nmi.std(), 1e-12)),
            4,
        ),
        "effect_size_ari": round(
            float((observed_ari - null_ari.mean()) / max(null_ari.std(), 1e-12)),
            4,
        ),
        "permutations": permutations,
    }


def infer_outcome(conclusion: str) -> str:
    text = conclusion.lower()
    if "unenforceable" in text or "not enforceable" in text:
        return "unenforceable"
    if "enforceable" in text:
        return "enforceable"
    return "mixed"


def doctrine_profile(texts: Iterable[str]) -> Dict[str, int]:
    joined = "\n".join(texts)
    return {
        name: len(pattern.findall(joined))
        for name, pattern in DOCTRINE_PATTERNS.items()
    }


def summarize_clusters(
    reduced_embeddings: np.ndarray,
    labels: np.ndarray,
    records: List[Dict[str, Any]],
) -> Dict[str, Any]:
    summaries: Dict[str, Any] = {}

    for cluster_id in sorted(set(labels.tolist())):
        cluster_mask = labels == cluster_id
        indices = np.where(cluster_mask)[0]
        members = [records[index] for index in indices.tolist()]

        family_counts = Counter(member["family"] for member in members)
        outcome_counts = Counter(
            infer_outcome(member["response"].get("conclusion", "")) for member in members
        )

        if cluster_id != -1:
            points = reduced_embeddings[cluster_mask]
            centroid = points.mean(axis=0)
            distances = np.linalg.norm(points - centroid, axis=1)
            representative_index = int(indices[int(np.argmin(distances))])
            representative = records[representative_index]
        else:
            representative = members[0]

        summaries[str(cluster_id)] = {
            "size": int(len(members)),
            "family_breakdown": dict(sorted(family_counts.items())),
            "outcome_breakdown": dict(sorted(outcome_counts.items())),
            "representative_id": representative["id"],
            "representative_model": representative["model"],
            "representative_conclusion": representative["response"].get("conclusion", ""),
            "doctrine_profile": doctrine_profile(member["full_text"] for member in members),
        }

    return summaries


def compare_existing_run(existing_run_path: Path) -> Dict[str, Any] | None:
    if not existing_run_path.exists():
        return None

    existing_run = load_json(existing_run_path)
    if "clusters" not in existing_run:
        return None

    archived_labels: List[int] = []
    archived_families: List[str] = []
    for cluster_id, cluster_data in existing_run["clusters"].items():
        for member in cluster_data.get("members", []):
            archived_labels.append(int(cluster_id))
            archived_families.append(infer_family(member.get("model", "")))

    if not archived_labels:
        return None

    return {
        "artifact_path": str(existing_run_path),
        "n_items": len(archived_labels),
        "n_clusters": len(set(archived_labels)),
        "cluster_family_correspondence": permutation_test(
            np.asarray(archived_labels),
            np.asarray(archived_families),
            permutations=5000,
            seed=42,
        ),
    }


def run_experiment(
    name: str,
    embeddings: np.ndarray,
    records: List[Dict[str, Any]],
    *,
    permutations: int,
    seed_a: int,
    seed_b: int,
) -> Dict[str, Any]:
    labels_a, reduced_a = run_umap_hdbscan(embeddings, random_state=seed_a)
    labels_b, _ = run_umap_hdbscan(embeddings, random_state=seed_b)
    families = np.asarray([record["family"] for record in records])

    return {
        "embedding_name": name,
        "run_a_seed": seed_a,
        "run_b_seed": seed_b,
        "cluster_quality": compute_cluster_quality(reduced_a, labels_a),
        "stability_test": permutation_test(
            labels_a,
            labels_b,
            permutations=permutations,
            seed=seed_a,
        ),
        "correspondence_test": permutation_test(
            labels_a,
            families,
            permutations=permutations,
            seed=seed_b,
        ),
        "cluster_summaries": summarize_clusters(reduced_a, labels_a, records),
    }


def report_header(title: str) -> str:
    return f"\n{'=' * 76}\n{title}\n{'=' * 76}"


def format_report(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("Frank-Karthic-Dasha Statistical Validation")
    lines.append(f"Timestamp: {report['timestamp']}")
    lines.append(f"Question: {report['frank_stage']['legal_question']}")
    lines.append(f"Total responses: {report['dasha_stage']['total_responses']}")
    lines.append("")

    lines.append("Frank stage")
    lines.append(f"- Jurisdiction: {report['frank_stage'].get('jurisdiction', 'Unknown')}")
    lines.append(f"- Legal domain: {report['frank_stage'].get('legal_domain', 'Unknown')}")

    lines.append("Karthic stage")
    lines.append(f"- Active rubrics: {report['karthic_stage']['rubric_count']}")
    lines.append(
        f"- Categories: {', '.join(report['karthic_stage']['rubric_categories'])}"
    )

    lines.append("Dasha stage")
    lines.append(
        f"- Models: {', '.join(f'{model} ({count})' for model, count in report['dasha_stage']['responses_per_model'].items())}"
    )
    validation = report["corpus_validation"]
    lines.append(
        f"- Target corpus: {validation['expected_total']} responses across "
        f"{validation['expected_model_count']} models ({validation['expected_per_model']} each)"
    )
    lines.append(
        f"- Actual corpus: {validation['actual_total']} responses across "
        f"{validation['actual_model_count']} models"
    )
    if not validation["matches_target_configuration"]:
        lines.append(
            f"- Corpus mismatch detected: missing={validation['missing_models']}, "
            f"unexpected={validation['unexpected_models']}, "
            f"count deviations={validation['models_with_nonstandard_counts']}"
        )

    if report.get("existing_dasha_run"):
        archived = report["existing_dasha_run"]
        lines.append("Archived Dasha artifact")
        lines.append(
            f"- Cluster-family NMI: {archived['cluster_family_correspondence']['observed_nmi']}"
        )
        lines.append(
            f"- Cluster-family ARI: {archived['cluster_family_correspondence']['observed_ari']}"
        )
        lines.append(
            f"- Correspondence p-values: NMI={archived['cluster_family_correspondence']['p_value_nmi']:.6f}, "
            f"ARI={archived['cluster_family_correspondence']['p_value_ari']:.6f}"
        )

    for key in ("instruction_tuned", "baseline"):
        result = report[key]
        quality = result["cluster_quality"]
        stability = result["stability_test"]
        correspondence = result["correspondence_test"]

        lines.append("")
        lines.append(f"{key.replace('_', ' ').title()}")
        lines.append(
            f"- Clusters: {quality['n_clusters']}, noise: {quality['n_noise']} ({quality['noise_ratio']:.1%})"
        )
        lines.append(f"- Silhouette: {quality['silhouette_score']}")
        lines.append(f"- Davies-Bouldin: {quality['davies_bouldin_index']}")
        lines.append(
            f"- Stability: NMI={stability['observed_nmi']}, ARI={stability['observed_ari']}, "
            f"p_NMI={stability['p_value_nmi']:.6f}, p_ARI={stability['p_value_ari']:.6f}"
        )
        lines.append(
            f"- Family correspondence: NMI={correspondence['observed_nmi']}, "
            f"ARI={correspondence['observed_ari']}, p_NMI={correspondence['p_value_nmi']:.6f}, "
            f"p_ARI={correspondence['p_value_ari']:.6f}"
        )

    return "\n".join(lines)


def build_report(
    frank: Dict[str, Any],
    karthic: List[Dict[str, Any]],
    records: List[Dict[str, Any]],
    corpus_validation: Dict[str, Any],
    instruction_result: Dict[str, Any],
    baseline_result: Dict[str, Any],
    existing_dasha_run: Dict[str, Any] | None,
    frank_path: Path,
    karthic_path: Path,
    dasha_path: Path,
) -> Dict[str, Any]:
    timestamp = time.strftime("%Y%m%d_%H%M%S")

    return {
        "timestamp": timestamp,
        "frank_stage": {
            "artifact_path": str(frank_path),
            "legal_question": frank.get("legal_question", "").replace("\u200b", "").strip(),
            "jurisdiction": frank.get("jurisdiction", ""),
            "legal_domain": frank.get("legal_domain", ""),
        },
        "karthic_stage": {
            "artifact_path": str(karthic_path),
            "rubric_count": len(karthic),
            "rubric_categories": sorted({rubric["category"] for rubric in karthic}),
        },
        "dasha_stage": {
            "artifact_path": str(dasha_path),
            "total_responses": len(records),
            "responses_per_model": dict(sorted(Counter(record["model"] for record in records).items())),
            "responses_per_family": dict(sorted(Counter(record["family"] for record in records).items())),
        },
        "design_target": {
            "total_responses": corpus_validation["expected_total"],
            "responses_per_model": corpus_validation["expected_per_model"],
            "model_roster": DEFAULT_MODEL_ROSTER,
            "instruction_embedding_model": DEFAULT_INSTRUCTION_MODEL,
            "baseline_embedding_model": DEFAULT_BASELINE_MODEL,
            "clustering": {
                "dimensionality_reduction": "UMAP",
                "n_components": 5,
                "n_neighbors": 5,
                "min_dist": 0.1,
                "clustering_algorithm": "HDBSCAN",
                "min_cluster_size": 5,
                "min_samples": 2,
            },
        },
        "corpus_validation": corpus_validation,
        "existing_dasha_run": existing_dasha_run,
        "instruction_tuned": instruction_result,
        "baseline": baseline_result,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Statistical validation for the father-son Frank-Karthic-Dasha benchmark."
    )
    parser.add_argument("--frank-json", type=Path, default=DEFAULT_FRANK_JSON)
    parser.add_argument("--karthic-json", type=Path, default=DEFAULT_KARTHIC_JSON)
    parser.add_argument("--dasha-json", type=Path, default=DEFAULT_DASHA_JSON)
    parser.add_argument(
        "--existing-run-json",
        type=Path,
        default=DEFAULT_EXISTING_RUN_JSON,
        help="Optional archived density-clustering artifact for reference correspondence reporting.",
    )
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--permutations", type=int, default=1000)
    parser.add_argument("--seed-a", type=int, default=42)
    parser.add_argument("--seed-b", type=int, default=123)
    parser.add_argument("--expected-total", type=int, default=240)
    parser.add_argument("--expected-per-model", type=int, default=20)
    parser.add_argument(
        "--local-files-only",
        action="store_true",
        help="Require the embedding models to already be cached locally.",
    )
    parser.add_argument(
        "--allow-random-fallback",
        action="store_true",
        help="Use random embeddings if the requested embedding models cannot be loaded. "
        "Only for dry-run debugging; not valid for research results.",
    )
    parser.add_argument(
        "--strict-corpus-check",
        action="store_true",
        help="Fail if the input corpus does not match the 240-response / 12-model target design.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    frank, karthic, records = load_artifacts(
        args.frank_json,
        args.karthic_json,
        args.dasha_json,
    )
    corpus_validation = validate_response_corpus(
        records,
        expected_total=args.expected_total,
        expected_per_model=args.expected_per_model,
        strict=args.strict_corpus_check,
    )

    texts = [record["response_text"] for record in records]

    print(report_header("Encoding"))
    instruction_embeddings = encode_texts(
        texts,
        DEFAULT_INSTRUCTION_MODEL,
        instruction=INSTRUCTION_PREFIX,
        local_files_only=args.local_files_only,
        allow_random_fallback=args.allow_random_fallback,
    )
    baseline_embeddings = encode_texts(
        texts,
        DEFAULT_BASELINE_MODEL,
        instruction=None,
        local_files_only=args.local_files_only,
        allow_random_fallback=args.allow_random_fallback,
    )

    print(report_header("Instruction-Tuned Evaluation"))
    instruction_result = run_experiment(
        "hkunlp/instructor-large",
        instruction_embeddings,
        records,
        permutations=args.permutations,
        seed_a=args.seed_a,
        seed_b=args.seed_b,
    )
    print(json.dumps(instruction_result["cluster_quality"], indent=2))

    print(report_header("Baseline Evaluation"))
    baseline_result = run_experiment(
        "all-MiniLM-L6-v2",
        baseline_embeddings,
        records,
        permutations=args.permutations,
        seed_a=args.seed_a,
        seed_b=args.seed_b,
    )
    print(json.dumps(baseline_result["cluster_quality"], indent=2))

    existing_dasha_run = compare_existing_run(args.existing_run_json)
    report = build_report(
        frank,
        karthic,
        records,
        corpus_validation,
        instruction_result,
        baseline_result,
        existing_dasha_run,
        args.frank_json,
        args.karthic_json,
        args.dasha_json,
    )

    args.report_dir.mkdir(parents=True, exist_ok=True)
    stamp = report["timestamp"]
    json_path = args.report_dir / f"statistical_validation_{stamp}.json"
    txt_path = args.report_dir / f"statistical_validation_{stamp}.txt"

    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    text_report = format_report(report)
    with txt_path.open("w", encoding="utf-8") as handle:
        handle.write(text_report)

    print(report_header("Saved Report"))
    print(text_report)
    print(f"\nJSON report: {json_path}")
    print(f"Text report: {txt_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
