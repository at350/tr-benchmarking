#!/usr/bin/env python3
"""Import the father-son benchmark into the newer legal-workflow-data chain.

This script creates:
- an approved Frank packet
- an approved Karthic rubric pack linked to that Frank packet
- a completed Dasha run linked to that Karthic pack

The Dasha stage reuses the accepted 240-response corpus from paper/data,
normalizes it into the newer frontend artifact schema, clusters it with the
same density bridge used by the frontend, and writes the result to
legal-workflow-data/.
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
LEGAL_WORKFLOW_ROOT = ROOT / "legal-workflow-data"
FRANK_DIR = LEGAL_WORKFLOW_ROOT / "frank-packets"
KARTHIC_DIR = LEGAL_WORKFLOW_ROOT / "karthic-rubric-packs"
DASHA_DIR = LEGAL_WORKFLOW_ROOT / "dasha-runs"
TMP_DIR = LEGAL_WORKFLOW_ROOT / "tmp"

SOURCE_FRANK = ROOT / "rubric-automation" / "question_golden_input.json"
SOURCE_KARTHIC = (
    ROOT
    / "rubric-automation"
    / "outputs"
    / "openai_question_golden"
    / "question_golden_input"
    / "final_rubrics.json"
)
SOURCE_CORPUS = ROOT / "paper" / "data" / "father_son_responses_20260404_230517.json"
CLUSTER_SCRIPT = ROOT / "lsh" / "cluster_legal_workflow.py"
PYTHON = ROOT / ".venv" / "bin" / "python3"

MODEL_NAME_MAP = {
    "gpt-4o": ("openai", "gpt-4o"),
    "gpt-5.4": ("openai", "gpt-5.4"),
    "gpt-5.4-mini": ("openai", "gpt-5.4-mini"),
    "gpt-4.1-nano": ("openai", "gpt-4.1-nano"),
    "claude-4-sonnet": ("replicate", "anthropic/claude-4-sonnet"),
    "claude-3.5-haiku": ("replicate", "anthropic/claude-3.5-haiku"),
    "gemini-3-pro": ("replicate", "google/gemini-3-pro"),
    "gemini-3-flash": ("replicate", "google/gemini-3-flash"),
    "deepseek-v3": ("replicate", "deepseek-ai/deepseek-v3"),
    "kimi-k2-thinking": ("replicate", "moonshotai/kimi-k2-thinking"),
    "llama-4-maverick-instruct": ("replicate", "meta/llama-4-maverick-instruct"),
    "llama-4-scout-instruct": ("replicate", "meta/llama-4-scout-instruct"),
}

DOMAINS = [
    {
        "id": "analysis_domain_1",
        "name": "Issue and Bottom-Line Enforceability",
        "description": "Identify the controlling legal issue and give the clearest enforceability conclusion.",
        "weight": 5,
        "naGuidance": "Mark not applicable only if the response never reaches a bottom-line enforceability position.",
        "summary": "The benchmark answer treats the controlling issue as whether the father's oral promise is enforceable despite the lack of a writing, and concludes the promise is not enforceable.",
        "goldenContains": [
            "The controlling issue is whether the father's oral promise to pay the son's student loans is enforceable.",
            "The best bottom-line answer is that the oral promise is unenforceable.",
        ],
        "allowedOmissions": [
            "A response need not use the exact phrase bottom-line if the ultimate legal conclusion is clear.",
        ],
        "contradictionFlags": [
            "The response concludes that the promise is enforceable without squarely overcoming the marriage-consideration Statute of Frauds problem.",
        ],
        "comparisonGuidance": "Prioritize whether the centroid identifies the right issue and reaches the benchmark conclusion.",
    },
    {
        "id": "analysis_domain_2",
        "name": "Formation and Consideration",
        "description": "Address unilateral contract structure and whether marriage is bargained-for consideration or only a conditional gift term.",
        "weight": 4,
        "naGuidance": "Mark not applicable only if the response does not discuss formation or consideration at all.",
        "summary": "The benchmark answer recognizes a unilateral-contract structure but treats consideration as contestable because the son already intended to marry.",
        "goldenContains": [
            "The father's promise can be analyzed as an offer accepted by performance in a unilateral contract structure.",
            "A strong answer distinguishes bargained-for consideration from a mere conditional gift.",
            "The son's prior intent to marry weakens, but does not automatically defeat, a consideration analysis.",
        ],
        "allowedOmissions": [
            "A response may omit the label unilateral contract if it still explains acceptance by performance.",
        ],
        "contradictionFlags": [
            "The response treats the promise as enforceable solely because marriage occurred without analyzing bargain or inducement.",
        ],
        "comparisonGuidance": "Look for correct treatment of offer-by-promise, acceptance-by-performance, and the consideration-versus-gift distinction.",
    },
    {
        "id": "analysis_domain_3",
        "name": "Marriage-Consideration Statute of Frauds",
        "description": "Identify the marriage-consideration branch of the Statute of Frauds as the central writing requirement and explain why no writing defeats enforcement.",
        "weight": 5,
        "naGuidance": "Mark not applicable only if the response never discusses the marriage-consideration writing requirement.",
        "summary": "The strongest doctrinal route is that the promise is made in consideration of marriage and is therefore unenforceable absent a signed writing.",
        "goldenContains": [
            "The promise falls within the Statute of Frauds as a contract in consideration of marriage.",
            "No signed writing exists between father and son.",
            "That writing failure is the dispositive reason the promise is unenforceable.",
        ],
        "allowedOmissions": [
            "A response need not discuss every Statute of Frauds category if it correctly treats marriage consideration as independently sufficient.",
        ],
        "contradictionFlags": [
            "The response says the marriage-consideration Statute of Frauds does not apply.",
            "The response treats completion of the marriage as automatically satisfying the writing requirement.",
        ],
        "comparisonGuidance": "This is the core domain. Favor centroids that clearly identify marriage consideration as the benchmark rule of decision.",
    },
    {
        "id": "analysis_domain_4",
        "name": "Suretyship and Main-Purpose Doctrine",
        "description": "Analyze the debt-assumption issue, explain why suretyship is weakened because the promise was made to the son rather than the creditor, and treat main-purpose doctrine as secondary.",
        "weight": 4,
        "naGuidance": "Mark not applicable only if the response omits debt-assumption analysis entirely.",
        "summary": "A strong answer explains that classic suretyship is not a perfect fit on these facts and that main-purpose analysis matters only if suretyship is first triggered.",
        "goldenContains": [
            "Suretyship is a possible but secondary issue because the promise was made to the son rather than directly to the lender.",
            "The main-purpose or leading-object doctrine matters only if suretyship is otherwise in play.",
            "Even a main-purpose argument would not cure the independent marriage-consideration Statute of Frauds problem.",
        ],
        "allowedOmissions": [
            "A response may omit the label leading object if it still addresses the promisor's personal-benefit theory.",
        ],
        "contradictionFlags": [
            "The response treats main-purpose doctrine as sufficient to make the promise enforceable without addressing the separate marriage-consideration bar.",
        ],
        "comparisonGuidance": "Favor centroids that keep suretyship and main-purpose analysis subordinate to the marriage-consideration issue.",
    },
    {
        "id": "analysis_domain_5",
        "name": "Promissory Estoppel and Reliance",
        "description": "Evaluate promissory estoppel as a possible fallback while recognizing that the son's prior intent to marry weakens inducement and reliance.",
        "weight": 4,
        "naGuidance": "Mark not applicable only if the response never discusses estoppel or reliance.",
        "summary": "Promissory estoppel is a plausible fallback theory but weak here because the son already intended to propose.",
        "goldenContains": [
            "Promissory estoppel is a possible fallback theory.",
            "The son's preexisting intent to marry weakens inducement and reliance.",
            "Courts may be reluctant to use estoppel to override the Statute of Frauds in this setting.",
        ],
        "allowedOmissions": [
            "A response may discuss reliance without using the exact phrase promissory estoppel if the doctrine is clear.",
        ],
        "contradictionFlags": [
            "The response treats reliance as obviously strong despite the son's prior intent to marry.",
        ],
        "comparisonGuidance": "Look for nuanced treatment of weak reliance rather than categorical acceptance or rejection.",
    },
    {
        "id": "analysis_domain_6",
        "name": "Mistake, One-Year Rule, and Counterarguments",
        "description": "Handle secondary doctrinal clean-up: the one-year rule does not apply, the father's tax-deduction mistake is not a defense absent an express condition, and the best counterarguments should still be acknowledged.",
        "weight": 3,
        "naGuidance": "Mark not applicable only if the response omits all secondary doctrinal refinement and counterargument handling.",
        "summary": "A careful answer avoids conflating the one-year rule with the marriage-consideration bar and treats the father's tax-deduction mistake as legally non-dispositive.",
        "goldenContains": [
            "The one-year provision does not apply because the promise could have been performed within one year.",
            "The father's tax-deduction mistake does not excuse performance unless the promise was expressly conditioned on receiving the deduction.",
            "The response acknowledges meaningful counterarguments rather than presenting a one-sided conclusion.",
        ],
        "allowedOmissions": [
            "A response need not discuss every counterargument if it addresses the strongest secondary objections.",
        ],
        "contradictionFlags": [
            "The response treats the one-year rule as the dispositive Statute of Frauds category.",
            "The response says the father's mistake alone voids the promise.",
        ],
        "comparisonGuidance": "This domain separates careful doctrinal answers from shallow ones that mishandle secondary rules.",
    },
]

RUBRIC_DOMAIN_MAP = {
    "R016": "analysis_domain_1",
    "R011": "analysis_domain_1",
    "R001": "analysis_domain_2",
    "R002": "analysis_domain_2",
    "R004": "analysis_domain_3",
    "R006": "analysis_domain_4",
    "R025": "analysis_domain_4",
    "R008": "analysis_domain_5",
    "R009": "analysis_domain_5",
    "R010": "analysis_domain_6",
    "R012": "analysis_domain_6",
    "R014": "analysis_domain_6",
    "R018": "analysis_domain_6",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slug_id(prefix: str) -> str:
    stamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    return f"{prefix}_{stamp}_{uuid4().hex[:8]}"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def format_irac(response: Dict[str, Any]) -> str:
    return "\n".join(
        [
            f"Issue: {str(response.get('issue', '')).strip()}",
            f"Rule: {str(response.get('rule', '')).strip()}",
            f"Application: {str(response.get('application', '')).strip()}",
            f"Conclusion: {str(response.get('conclusion', '')).strip()}",
        ]
    ).strip()


def normalize_model(model_name: str) -> Tuple[str, str]:
    provider, full_name = MODEL_NAME_MAP[model_name]
    return provider, full_name


def infer_family(model_name: str) -> str:
    name = model_name.lower()
    if "gpt" in name:
        return "GPT"
    if "claude" in name:
        return "Claude"
    if "gemini" in name:
        return "Gemini"
    if "llama" in name:
        return "LLAMA"
    if "deepseek" in name:
        return "DeepSeek"
    if "kimi" in name:
        return "Kimi"
    return "Unknown"


def normalize_for_similarity(text: str) -> str:
    lowered = text.lower()
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def token_set(text: str) -> set[str]:
    normalized = normalize_for_similarity(text)
    return {token for token in normalized.split(" ") if token}


def jaccard_similarity(left: str, right: str) -> float:
    left_tokens = token_set(left)
    right_tokens = token_set(right)
    if not left_tokens or not right_tokens:
        return 0.0
    union = left_tokens | right_tokens
    if not union:
        return 0.0
    return len(left_tokens & right_tokens) / len(union)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def summarize_model_breakdown(members: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    counts: Dict[str, Dict[str, Any]] = {}
    for member in members:
        current = counts.get(member["modelKey"])
        if current:
            current["count"] += 1
        else:
            counts[member["modelKey"]] = {
                "modelKey": member["modelKey"],
                "provider": member["provider"],
                "model": member["model"],
                "count": 1,
            }
    return sorted(counts.values(), key=lambda item: (-item["count"], item["modelKey"]))


def choose_winning_centroid(evaluations: List[Dict[str, Any]], cluster_by_id: Dict[str, Dict[str, Any]]) -> Dict[str, Any] | None:
    applicable = [
        evaluation
        for evaluation in evaluations
        if evaluation["applicabilityStatus"] == "applicable" and isinstance(evaluation["score"], (int, float))
    ]
    pool = applicable or evaluations
    if not pool:
        return None
    return sorted(
        pool,
        key=lambda item: (
            -(item["score"] if item["score"] is not None else -1),
            -(item["confidence"] if item["confidence"] is not None else -1),
            -(cluster_by_id.get(item["clusterId"], {}).get("size", 0)),
            item["clusterId"],
        ),
    )[0]


def build_domain_results(
    question_text: str,
    domains: List[Dict[str, Any]],
    golden_targets: List[Dict[str, Any]],
    criteria: List[Dict[str, Any]],
    clusters: List[Dict[str, Any]],
    response_by_id: Dict[str, Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    cluster_by_id = {cluster["id"]: cluster for cluster in clusters}
    results: List[Dict[str, Any]] = []
    applicable_weight_total = 0.0
    weighted_total = 0.0
    not_applicable_ids: List[str] = []

    for domain in domains:
        target = next(target for target in golden_targets if target["domainId"] == domain["id"])
        domain_criteria = [criterion["text"] for criterion in criteria if criterion["domainId"] == domain["id"]]
        domain_text = " ".join(
            [
                domain["name"],
                domain["description"],
                target["summary"],
                *target["goldenContains"],
                *target["contradictionFlags"],
                *domain_criteria,
            ]
        )

        evaluations: List[Dict[str, Any]] = []
        for cluster in clusters:
            representative = response_by_id[cluster["representativeResponseId"]]
            response_text = representative["responseText"]
            overlap = jaccard_similarity(domain_text, response_text)
            question_overlap = jaccard_similarity(question_text, domain_text)
            applicable = question_overlap > 0.06 or overlap > 0.05
            matched_points = [
                point for point in target["goldenContains"]
                if jaccard_similarity(point, response_text) > 0.08
            ]
            contradiction_points = [
                point for point in target["contradictionFlags"]
                if jaccard_similarity(point, response_text) > 0.08
            ]
            score = round(clamp(overlap * 240, 15, 96)) if applicable else None
            evaluations.append(
                {
                    "clusterId": cluster["id"],
                    "applicabilityStatus": "applicable" if applicable else "not_applicable",
                    "applicabilityExplanation": (
                        f"The representative answer engages with the {domain['name']} domain."
                        if applicable
                        else domain["naGuidance"]
                    ),
                    "score": score,
                    "confidence": round(max(overlap, 0.35 if applicable else 0.4), 2),
                    "rationale": (
                        f"Score derived from overlap between the representative answer and the {domain['name']} target."
                        if applicable
                        else f"Marked not applicable under the stored NA guidance for {domain['name']}."
                    ),
                    "difference": {
                        "matchedGoldenPoints": matched_points,
                        "missingGoldenPoints": [point for point in target["goldenContains"] if point not in matched_points],
                        "extraCentroidPoints": [],
                        "contradictionPoints": contradiction_points,
                        "differenceSummary": (
                            f"Matched {len(matched_points)} of {len(target['goldenContains'])} expected points for {domain['name']}."
                            if applicable
                            else f"No meaningful coverage of {domain['name']} was detected."
                        ),
                    },
                }
            )

        winning = choose_winning_centroid(evaluations, cluster_by_id)
        if winning and winning["applicabilityStatus"] == "applicable" and winning["score"] is not None:
            applicable_weight_total += float(domain["weight"])
            weighted_total += float(domain["weight"]) * float(winning["score"])
        else:
            not_applicable_ids.append(domain["id"])

        results.append(
            {
                "domainId": domain["id"],
                "domainName": domain["name"],
                "weight": domain["weight"],
                "applicabilityStatus": winning["applicabilityStatus"] if winning else "not_applicable",
                "applicabilityExplanation": winning["applicabilityExplanation"] if winning else domain["naGuidance"],
                "centroidEvaluations": evaluations,
                "winningCentroidId": winning["clusterId"] if winning else None,
                "winningScore": winning["score"] if winning else None,
                "rationale": winning["rationale"] if winning else f"No applicable centroid satisfied {domain['name']}.",
                "winningModelMix": cluster_by_id.get(winning["clusterId"], {}).get("modelBreakdown", []) if winning else [],
            }
        )

    weighted_score = round(weighted_total / applicable_weight_total, 2) if applicable_weight_total > 0 else None
    summary = {
        "applicableWeightTotal": applicable_weight_total,
        "weightedScore": weighted_score,
        "notApplicableDomainIds": not_applicable_ids,
    }
    return results, summary


def build_frank_packet(source_frank: Dict[str, Any]) -> Dict[str, Any]:
    now = now_iso()
    packet_id = slug_id("frank")
    analysis_domains = [
        {
            "id": domain["id"],
            "name": domain["name"],
            "description": domain["description"],
        }
        for domain in DOMAINS
    ]
    return {
        "id": packet_id,
        "status": "approved",
        "legalDomain": "Contracts",
        "domainScope": "Oral Promise to Pay Student Loans in Consideration of Marriage",
        "sourceFamily": "imported_benchmark_hypothetical",
        "selectedCase": {
            "id": "case_father_son_benchmark",
            "title": "Father-Son Oral Promise Benchmark Hypothetical",
            "citation": "Internal benchmark hypothetical",
            "court": "Internal benchmark packet",
            "year": "2026",
            "url": "https://example.invalid/father-son-benchmark",
            "summary": "Contracts benchmark testing unilateral contract structure, marriage-consideration Statute of Frauds, suretyship, main-purpose doctrine, promissory estoppel, and mistake.",
            "relevance": "Strong benchmark for separating legally similar but doctrinally distinct theories of enforceability.",
        },
        "analysisDomains": analysis_domains,
        "sourceArtifacts": [],
        "sourceIntake": {
            "sourceQualityRating": "Benchmark hypothetical derived from internal legal-analysis workflow and structured golden answer.",
            "benchmarkPosture": "portable_common_law_benchmark",
            "recommendation": "Use this packet to stress-test how models prioritize overlapping contracts doctrines rather than merely whether they know one black-letter rule.",
            "jdReviewBurden": [
                "Confirm that the marriage-consideration Statute of Frauds framing matches the intended jurisdictional assumptions.",
                "Confirm the treatment of suretyship and main-purpose doctrine under the chosen common-law baseline.",
            ],
            "reverseEngineeringSuitability": "strong",
        },
        "sourceExtraction": {
            "legalIssue": "Whether the father's oral promise to assume the son's student loans is enforceable when the promise is tied to the son's marriage and no signed writing exists.",
            "blackLetterRule": "A promise made in consideration of marriage, other than mutual promises to marry, ordinarily falls within the Statute of Frauds and requires a signed writing.",
            "triggerFacts": [
                "The father promised to assume the son's student loans if the son married a specific person within 18 months.",
                "The son married within 14 months but no written contract was signed.",
                "The father later refused to pay after learning the hoped-for tax deduction was unavailable.",
            ],
            "holding": "Under the benchmark answer, the oral promise is unenforceable because the marriage-consideration Statute of Frauds independently requires a writing.",
            "limits": [
                "Suretyship and main-purpose doctrine remain relevant but secondary.",
                "Promissory estoppel is weakened because the son already intended to marry.",
                "The father's unilateral mistake about tax treatment does not by itself excuse performance.",
            ],
            "uncertainty": [
                "Jurisdictions vary in how aggressively they use estoppel against Statute of Frauds defenses.",
                "Some formulations treat debt-assumption and suretyship differently depending on creditor assent and promisee identity.",
            ],
        },
        "benchmarkAnswer": source_frank["golden_answer"].strip(),
        "benchmarkQuestion": source_frank["legal_question"].strip(),
        "failureModeSeeds": [
            "Treating the one-year rule as the dispositive Statute of Frauds issue.",
            "Treating suretyship or main-purpose doctrine as enough to overcome the separate marriage-consideration writing requirement.",
            "Assuming promissory estoppel is strong even though the son already intended to marry.",
            "Treating the father's tax-deduction mistake as an automatic excuse.",
        ],
        "masterIssueStatement": "Whether the father's oral promise to assume the son's student loans is enforceable despite the absence of a writing and the overlap between marriage-consideration, suretyship, reliance, and mistake doctrines.",
        "approvedAt": now,
        "createdAt": now,
        "updatedAt": now,
    }


def build_karthic_pack(frank_packet_id: str, legacy_rubrics: List[Dict[str, Any]]) -> Dict[str, Any]:
    now = now_iso()
    pack_id = slug_id("karthic")
    criteria = []
    refinement_log = []
    for rubric in legacy_rubrics:
        domain_id = RUBRIC_DOMAIN_MAP[rubric["id"]]
        criteria.append(
            {
                "id": f"criterion_{rubric['id'].lower()}",
                "domainId": domain_id,
                "text": rubric["text"],
                "parentId": None,
                "depth": 0,
                "status": "active",
                "source": "seed",
            }
        )
        refinement_log.append(
            {
                "id": f"log_{rubric['id'].lower()}",
                "timestamp": now,
                "domainId": domain_id,
                "criterionId": f"criterion_{rubric['id'].lower()}",
                "action": "created_seed",
                "note": "Imported criterion from the father-son legacy Karthic rubric artifact.",
            }
        )

    domains = [
        {
            "id": domain["id"],
            "name": domain["name"],
            "description": domain["description"],
            "weight": domain["weight"],
            "naGuidance": domain["naGuidance"],
        }
        for domain in DOMAINS
    ]
    golden_targets = [
        {
            "id": f"golden_target_{index + 1}",
            "domainId": domain["id"],
            "domainName": domain["name"],
            "summary": domain["summary"],
            "goldenContains": domain["goldenContains"],
            "allowedOmissions": domain["allowedOmissions"],
            "contradictionFlags": domain["contradictionFlags"],
            "comparisonGuidance": domain["comparisonGuidance"],
        }
        for index, domain in enumerate(DOMAINS)
    ]

    return {
        "id": pack_id,
        "frankPacketId": frank_packet_id,
        "status": "approved",
        "domains": domains,
        "goldenTargets": golden_targets,
        "criteria": criteria,
        "refinementLog": refinement_log,
        "smeNotes": "Imported from the approved father-son benchmark answer and legacy rubric decomposition so the paper can use the newer frontend artifact lineage.",
        "comparisonMethodNote": "Each Dasha cluster representative is compared against structured golden-answer targets imported from the father-son benchmark answer rather than against raw prose overlap alone.",
        "approvedAt": now,
        "createdAt": now,
        "updatedAt": now,
    }


def build_dasha_run(
    rubric_pack_id: str,
    question_text: str,
    source_corpus: List[Dict[str, Any]],
    domains: List[Dict[str, Any]],
    golden_targets: List[Dict[str, Any]],
    criteria: List[Dict[str, Any]],
) -> Dict[str, Any]:
    now = now_iso()
    run_id = slug_id("dasha")
    selected_models = [
        {"provider": provider, "model": model, "reasoningEffort": "medium" if provider == "openai" and "gpt-5" in model else "none", "temperature": 0.7}
        for provider, model in [
            ("openai", "gpt-4o"),
            ("openai", "gpt-5.4"),
            ("openai", "gpt-5.4-mini"),
            ("openai", "gpt-4.1-nano"),
            ("replicate", "anthropic/claude-4-sonnet"),
            ("replicate", "anthropic/claude-3.5-haiku"),
            ("replicate", "google/gemini-3-pro"),
            ("replicate", "google/gemini-3-flash"),
            ("replicate", "deepseek-ai/deepseek-v3"),
            ("replicate", "moonshotai/kimi-k2-thinking"),
            ("replicate", "meta/llama-4-maverick-instruct"),
            ("replicate", "meta/llama-4-scout-instruct"),
        ]
    ]

    responses: List[Dict[str, Any]] = []
    cluster_input = {"responses": []}
    for item in source_corpus:
        canonical_model = str(item["model"]).strip()
        provider, full_model_name = normalize_model(canonical_model)
        sample_index = int(str(item["id"]).rsplit("_", 1)[-1])
        response_text = format_irac(item["response"])
        response_id = f"response_{uuid4().hex[:8]}"
        record = {
            "id": response_id,
            "modelKey": f"{provider}::{full_model_name}",
            "provider": provider,
            "model": full_model_name,
            "sampleIndex": sample_index,
            "responseText": response_text,
            "clusterId": "",
        }
        responses.append(record)
        cluster_input["responses"].append({"id": response_id, "response": response_text})

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    cluster_input_path = TMP_DIR / f"{run_id}_cluster_input.json"
    dump_json(cluster_input_path, cluster_input)
    cluster_stdout = subprocess.check_output(
        [str(PYTHON), str(CLUSTER_SCRIPT), "--input", str(cluster_input_path)],
        cwd=ROOT,
        text=True,
        env={
            **os.environ,
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
        },
    )
    cluster_payload = json.loads(cluster_stdout)
    cluster_input_path.unlink(missing_ok=True)

    response_by_id = {response["id"]: response for response in responses}
    clusters: List[Dict[str, Any]] = []
    for cluster in cluster_payload["clusters"]:
        member_ids = [member_id for member_id in cluster["memberResponseIds"] if member_id in response_by_id]
        members = [response_by_id[member_id] for member_id in member_ids]
        if not members:
            continue
        cluster_id = cluster["id"]
        representative = response_by_id.get(cluster["representativeResponseId"], members[0])
        for member in members:
            member["clusterId"] = cluster_id
        clusters.append(
            {
                "id": cluster_id,
                "sourceClusterId": cluster.get("sourceClusterId", cluster_id),
                "representativeResponseId": representative["id"],
                "representativeText": representative["responseText"],
                "memberResponseIds": member_ids,
                "size": len(member_ids),
                "modelBreakdown": summarize_model_breakdown(members),
            }
        )

    domain_results, weighted_summary = build_domain_results(
        question_text=question_text,
        domains=domains,
        golden_targets=golden_targets,
        criteria=criteria,
        clusters=clusters,
        response_by_id=response_by_id,
    )

    return {
        "id": run_id,
        "rubricPackId": rubric_pack_id,
        "status": "completed",
        "inputArtifacts": [],
        "questionText": question_text,
        "selectedModels": selected_models,
        "requestedResponseCount": len(responses),
        "validResponseCount": len(responses),
        "responses": responses,
        "clusters": clusters,
        "domainResults": domain_results,
        "weightedSummary": weighted_summary,
        "clusteringMethod": cluster_payload.get("method", "density_umap_hdbscan"),
        "clusteringNotes": cluster_payload.get("notes", "Imported 240-response corpus and clustered with the frontend density pipeline."),
        "createdAt": now,
        "completedAt": now,
    }


def main() -> int:
    source_frank = load_json(SOURCE_FRANK)
    legacy_rubrics = load_json(SOURCE_KARTHIC)
    source_corpus = load_json(SOURCE_CORPUS)

    frank_packet = build_frank_packet(source_frank)
    dump_json(FRANK_DIR / f"{frank_packet['id']}.json", frank_packet)

    karthic_pack = build_karthic_pack(frank_packet["id"], legacy_rubrics)
    dump_json(KARTHIC_DIR / f"{karthic_pack['id']}.json", karthic_pack)

    dasha_run = build_dasha_run(
        rubric_pack_id=karthic_pack["id"],
        question_text=frank_packet["benchmarkQuestion"],
        source_corpus=source_corpus,
        domains=karthic_pack["domains"],
        golden_targets=karthic_pack["goldenTargets"],
        criteria=karthic_pack["criteria"],
    )
    frank_path = FRANK_DIR / f"{frank_packet['id']}.json"
    karthic_path = KARTHIC_DIR / f"{karthic_pack['id']}.json"
    dasha_path = DASHA_DIR / f"{dasha_run['id']}.json"
    dump_json(dasha_path, dasha_run)

    print("Created frontend-backed father-son chain:")
    print(f"  Frank:   {frank_path}")
    print(f"  Karthic: {karthic_path}")
    print(f"  Dasha:   {dasha_path}")
    print(f"  Clusters: {len(dasha_run['clusters'])}")
    print(f"  Responses: {len(dasha_run['responses'])}")
    print(f"  Weighted score: {dasha_run['weightedSummary']['weightedScore']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
