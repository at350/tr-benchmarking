"""Frank source-case packet generation for research runs."""

from __future__ import annotations

import re
from pathlib import Path

from .utils import display_path, stable_hash


BENCHMARK_HEADINGS = [
    "Jurisdiction assumption",
    "Bottom-line outcome",
    "Controlling doctrine",
    "Transaction / formation characterization",
    "Writing requirement and trigger",
    "Compliance / substitute / exception analysis",
    "Other defenses or competing doctrines",
    "Strongest counterargument",
]

SOF_GATE_DEFINITIONS = {
    "one_year": {
        "label": "One-year Statute of Frauds provision",
        "keywords": ("year", "months", "employment", "performance", "term"),
        "rule": "A contract is within the one-year provision only when it cannot possibly be fully performed within one year from making.",
    },
    "marriage": {
        "label": "Marriage-consideration provision",
        "keywords": ("marriage", "marry", "fiancee", "premarital", "spouse"),
        "rule": "A promise made in consideration of marriage usually requires a signed writing or source-recognized substitute.",
    },
    "suretyship": {
        "label": "Suretyship / collateral promise provision",
        "keywords": ("debt", "default", "guarantee", "guaranty", "surety", "vendor", "corporation"),
        "rule": "A collateral promise to answer for another's debt is within the Statute of Frauds unless the main-purpose exception or another source rule applies.",
    },
    "land": {
        "label": "Land-interest provision",
        "keywords": ("land", "real estate", "lease", "deed", "mortgage", "farm", "parcel"),
        "rule": "Transfers or qualifying leases of interests in land generally require a signed writing, subject to source-recognized part-performance or reliance doctrines.",
    },
    "goods": {
        "label": "Goods / UCC 2-201 provision",
        "keywords": ("goods", "merchant", "quantity", "ucc", "$500", "500 dollars"),
        "rule": "A sale of goods at or above the statutory threshold generally requires a signed writing sufficient to show a contract and quantity.",
    },
}

CONTRACT_INTERPRETATION_GATES = {
    "plain_meaning": {
        "label": "Plain-meaning interpretation",
        "keywords": ("plain meaning", "ordinary meaning", "unambiguous", "text", "clause", "covenant"),
        "rule": "If the contractual text is unambiguous, apply its ordinary meaning before turning to ambiguity-resolving doctrines.",
    },
    "contra_proferentem": {
        "label": "Contra proferentem",
        "keywords": ("ambiguity", "ambiguous", "drafter", "against the drafter", "contra proferentem"),
        "rule": "If ambiguity remains after ordinary interpretive tools, construe the term against the drafter when the source law supports that canon.",
    },
}

NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
}


def _sentences(source_text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", source_text.strip())
    return [part.strip() for part in parts if part.strip()]


def _source_excerpt(source_text: str, limit: int = 1200) -> str:
    return source_text.strip()[:limit]


def _extract_month_values(text: str) -> list[int]:
    values = [int(match) for match in re.findall(r"\b(\d{1,2})\s+months?\b", text.lower())]
    for word, value in NUMBER_WORDS.items():
        if re.search(rf"\b{word}\s+months?\b", text.lower()):
            values.append(value)
    return values


def detect_sof_gates(source_text: str) -> list[dict]:
    """Detect Statute of Frauds gates that should be tested from a source case."""

    lower = source_text.lower()
    detected: list[dict] = []
    month_values = _extract_month_values(source_text)

    for gate_id, definition in SOF_GATE_DEFINITIONS.items():
        if gate_id == "one_year":
            evidence = []
            duration_patterns = (
                r"\bfor\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+months?\b",
                r"\bfor\s+(\d+|one|two|three|four|five)\s+years?\b",
                r"\bwithin\s+one\s+year\b",
                r"\bcannot\s+.*\bwithin\s+one\s+year\b",
                r"\bperformance\s+.*\b(one\s+year|months?|years?)\b",
                r"\bterm\s+.*\b(one\s+year|months?|years?)\b",
            )
            if month_values or any(re.search(pattern, lower) for pattern in duration_patterns):
                evidence.append("duration/performance timing")
            if month_values:
                evidence.extend([f"{value} months" for value in month_values])
        else:
            evidence = [keyword for keyword in definition["keywords"] if keyword in lower]
        if gate_id == "goods" and re.search(r"\$\s?([5-9]\d\d|\d{4,})", lower):
            evidence.append("goods price threshold")
        if evidence:
            detected.append({
                "id": gate_id,
                "label": definition["label"],
                "rule": definition["rule"],
                "source_evidence": sorted(set(evidence)),
            })

    if not detected:
        detected.append({
            "id": "general_sof",
            "label": "General Statute of Frauds enforceability issue",
            "rule": "Identify the alleged promise, determine whether a Statute of Frauds category applies, then test writing, compliance, exceptions, and counterarguments.",
            "source_evidence": ["No canonical gate keyword dominated the source."],
        })
    return detected


def detect_contract_interpretation_gates(source_text: str) -> list[dict]:
    lower = source_text.lower()
    detected = []
    for gate_id, definition in CONTRACT_INTERPRETATION_GATES.items():
        evidence = [keyword for keyword in definition["keywords"] if keyword in lower]
        if evidence:
            detected.append({
                "id": gate_id,
                "label": definition["label"],
                "rule": definition["rule"],
                "source_evidence": sorted(set(evidence)),
            })
    if not detected and any(term in lower for term in ("contract", "agreement", "clause", "covenant")):
        detected.append({
            "id": "contract_text",
            "label": "Contract text and source-supported interpretation",
            "rule": "Identify the relevant contractual text and apply the source-supported interpretation rule.",
            "source_evidence": ["contract text"],
        })
    return detected


def detect_doctrine_profile(source_text: str) -> dict:
    contract_gates = detect_contract_interpretation_gates(source_text)
    lower = source_text.lower()
    if contract_gates and any(term in lower for term in ("interpret", "interpretation", "ambiguous", "plain meaning", "covenant", "clause")):
        return {
            "selected_pack": "contract_interpretation",
            "doctrine_family": "Contract interpretation",
            "gates": contract_gates,
            "focus_key": "doctrine_gates",
            "source_limit": "The answer must stay within the source-supported contract text, interpretation rules, ambiguity facts, and counterarguments.",
        }
    sof_gates = detect_sof_gates(source_text)
    return {
        "selected_pack": "pack10",
        "doctrine_family": sof_gates[0]["label"],
        "gates": sof_gates,
        "focus_key": "statute_of_frauds",
        "source_limit": "The answer must stay within source-supported Statute of Frauds facts, writing evidence, exceptions, and counterarguments.",
    }


def infer_pack(source_text: str) -> tuple[str, str]:
    profile = detect_doctrine_profile(source_text)
    return profile["selected_pack"], profile["doctrine_family"]


def _jurisdiction(source_text: str) -> str:
    lower = source_text.lower()
    if "illinois" in lower:
        return "Illinois / source-grounded"
    if "new york" in lower:
        return "New York / source-grounded"
    if "california" in lower:
        return "California / source-grounded"
    return "Source-grounded jurisdiction from case materials"


def _key_facts(source_text: str, gates: list[dict]) -> list[str]:
    selected = []
    gate_terms = {term for gate in gates for term in gate["source_evidence"]}
    for sentence in _sentences(source_text):
        lower = sentence.lower()
        if any(term.lower() in lower for term in gate_terms) or any(
            marker in lower for marker in ("oral", "writing", "signed", "promise", "performed", "default")
        ):
            selected.append(sentence)
    return selected[:8] or _sentences(source_text)[:5]


def _clean_issue(gates: list[dict]) -> str:
    gate_labels = ", ".join(gate["label"] for gate in gates[:3])
    return f"Whether the alleged oral promise is enforceable under the Statute of Frauds, focusing on {gate_labels}."


def _clean_generic_issue(doctrine_family: str, gates: list[dict]) -> str:
    gate_labels = ", ".join(gate["label"] for gate in gates[:3])
    return f"How the source-supported {doctrine_family} rules apply, focusing on {gate_labels}."


def build_benchmark_answer(source_text: str, doctrine_family: str, gates: list[dict] | None = None) -> str:
    gates = gates or detect_sof_gates(source_text)
    primary = gates[0]
    lower = source_text.lower()
    writing_status = "no signed writing appears in the source" if "no signed writing" in lower or "no writing" in lower else "the answer must verify whether a signed writing or substitute exists"

    if primary["id"] == "marriage":
        bottom_line = (
            "The promisee-beneficiary likely has the better claim if the premarital promise and certificate are treated as creating enforceable beneficiary rights."
        )
        formation = "The promise was made before marriage and allegedly induced marriage, so it is not merely a later gratuitous gift."
        compliance = "A later certificate or written designation is the key compliance/substitute fact; replacement mechanics must be tested against rights already created."
        counter = "Later-named beneficiaries can argue the final association record controls if the replacement was valid."
    elif primary["id"] == "one_year":
        bottom_line = "The oral promise is likely barred if the source facts make full performance within one year impossible and no signed writing or source-recognized substitute applies."
        formation = "The transaction must be characterized by duration measured from contract formation, not merely by how long performance actually lasted."
        compliance = f"The key compliance question is that {writing_status}; reliance or partial performance must be treated as an exception argument, not automatic satisfaction."
        counter = "The claimant's strongest counterargument is that the promise could have been completed within a year, or that reliance/estoppel should prevent a Statute of Frauds defense."
    elif primary["id"] == "suretyship":
        bottom_line = "The oral promise is likely barred if it is collateral to another obligor's debt, but may survive if the promisor's main purpose was self-interested and original rather than collateral."
        formation = "The response must distinguish an original promise from a promise to answer for another person's default."
        compliance = f"The key compliance question is that {writing_status}; the main-purpose exception is the main source-sensitive escape valve."
        counter = "The claimant's strongest counterargument is that the promisor acted primarily to protect an ownership or business interest."
    elif primary["id"] == "land":
        bottom_line = "The oral agreement is likely barred if it transfers a covered land interest without writing, unless part performance or another source-recognized substitute is strong enough."
        formation = "The response must characterize the land interest and lease or transfer term before applying the writing rule."
        compliance = f"The key compliance question is that {writing_status}; possession, payment, improvements, or comparable source facts may matter as substitutes."
        counter = "The claimant's strongest counterargument is part performance or reliance that makes nonenforcement inequitable."
    elif primary["id"] == "goods":
        bottom_line = "The oral sale is likely barred if goods meet the statutory price threshold and no sufficient writing, admission, payment, delivery, or merchant confirmation exception applies."
        formation = "The response must identify the transaction as a sale of goods and address price and quantity."
        compliance = f"The key compliance question is that {writing_status}; quantity and UCC exceptions control the analysis."
        counter = "The claimant's strongest counterargument is an admission, part payment/delivery, specially manufactured goods, or merchant-confirmation rule."
    else:
        bottom_line = "The answer depends on whether the source facts place the promise inside a Statute of Frauds gate and whether compliance or exceptions are source-supported."
        formation = "The response must identify the transaction before applying the writing rule."
        compliance = f"The key compliance question is that {writing_status}; exceptions must be source-grounded."
        counter = "The strongest opposing argument must be tied to a concrete source ambiguity or missing fact."

    return "\n".join([
        f"Jurisdiction assumption: {_jurisdiction(source_text)}.",
        f"Bottom-line outcome: {bottom_line}",
        f"Controlling doctrine: {primary['label']}.",
        f"Transaction / formation characterization: {formation}",
        f"Writing requirement and trigger: {primary['rule']}",
        f"Compliance / substitute / exception analysis: {compliance}",
        "Other defenses or competing doctrines: Secondary doctrines remain subordinate to the controlling Statute of Frauds gate and source-supported exceptions.",
        f"Strongest counterargument: {counter}",
    ])


def build_generic_benchmark_answer(source_text: str, doctrine_family: str, gates: list[dict]) -> str:
    primary = gates[0]
    lower = source_text.lower()
    if primary["id"] == "plain_meaning":
        bottom_line = "The text-based interpretation likely controls if the disputed covenant is unambiguous under the supplied source facts."
        characterization = "The response must start with the contractual words and identify whether they preserve or limit the claimed remedy."
        compliance = "Ambiguity-resolving canons should not displace clear text unless the source facts show genuine ambiguity."
        counter = "The strongest counterargument is that contextual facts or drafting history make the clause ambiguous enough to trigger a secondary canon."
    elif primary["id"] == "contra_proferentem" or "ambiguous" in lower:
        bottom_line = "If the source-supported text remains ambiguous, construing the term against the drafter may support the non-drafting party's interpretation."
        characterization = "The response must identify the disputed clause, the competing readings, and why ambiguity remains after ordinary interpretation."
        compliance = "Contra proferentem is a fallback canon, not the first step when the text is clear."
        counter = "The strongest counterargument is that the text has a single ordinary meaning, making the ambiguity canon unnecessary."
    else:
        bottom_line = "The answer depends on the source-supported interpretation rule and the material contractual text."
        characterization = "The response must identify the relevant contractual language and the competing interpretations."
        compliance = "The analysis should separate text, context, ambiguity, and remedy consequences."
        counter = "The strongest counterargument is the plausible alternative reading preserved by the source."

    return "\n".join([
        f"Jurisdiction assumption: {_jurisdiction(source_text)}.",
        f"Bottom-line outcome: {bottom_line}",
        f"Controlling doctrine: {primary['label']}.",
        f"Transaction / formation characterization: {characterization}",
        f"Writing requirement and trigger: Not applicable as a Statute of Frauds writing issue; the controlling trigger is {primary['rule']}",
        f"Compliance / substitute / exception analysis: {compliance}",
        "Other defenses or competing doctrines: Secondary doctrines remain subordinate to the source-supported interpretation sequence.",
        f"Strongest counterargument: {counter}",
    ])


def _neutral_question(source_text: str, gates: list[dict]) -> str:
    primary = gates[0]
    facts = " ".join(_key_facts(source_text, gates)[:3])
    if primary["id"] == "marriage" and "certificate" in source_text.lower():
        return (
            "In Illinois, a member of a fraternal benefit association told his fiancee before their "
            "wedding, \"If you marry me, I will change my benefit certificate so that you are the "
            "beneficiary.\" She agreed, they married, and he later obtained a new certificate naming "
            "her as beneficiary. The wife kept possession of that certificate. About a year later, "
            "the marriage deteriorated, and the member told the association he could not produce the "
            "certificate because his wife had it. Under the association rules, he obtained a replacement "
            "certificate naming his children and sister as beneficiaries. After the member died, the wife "
            "and the later-named beneficiaries each claimed the death benefit. Who has the better claim "
            "to the death benefit under Illinois Statute of Frauds law and the association rules?"
        )
    return (
        f"The parties are litigating whether an alleged oral promise is enforceable under source-grounded "
        f"Statute of Frauds rules. The likely controlling gate is {primary['label']}. The source facts are: "
        f"{facts} The claimant argues the oral promise should be enforced despite the writing problem, while "
        "the opposing party argues the Statute of Frauds bars enforcement or leaves only a fallback remedy. "
        "On these facts, is the oral promise enforceable?"
    )


def _neutral_generic_question(source_text: str, doctrine_family: str, gates: list[dict]) -> str:
    primary = gates[0]
    facts = " ".join(_key_facts(source_text, gates)[:3])
    return (
        f"The parties are disputing a {doctrine_family} issue in a source-grounded legal benchmark. "
        f"The likely controlling path is {primary['label']}. The source facts are: {facts} "
        "The claimant argues those facts preserve the asserted legal right, while the opposing party "
        "argues the text, rule, or procedural posture defeats it. On these facts, which interpretation "
        "is stronger and why?"
    )


def _variations(gates: list[dict], source_text: str) -> list[dict]:
    variations: list[dict] = []
    base_question = _neutral_question(source_text, gates)
    variations.append({
        "id": "surface_party_name_swap",
        "lane": "A",
        "perturbation_type": "invariant",
        "changed_fact": "Change only party or organization names, such as changing the association name from Alpha Mutual to Beta Mutual.",
        "question": (
            f"{base_question} Assume the same facts, except the organization is called Beta Mutual "
            "rather than Alpha Mutual. Do not treat the name change as legally relevant."
        ),
        "expected_behavior": "answer_invariant",
    })
    for gate in gates:
        gate_id = gate["id"]
        if gate_id == "one_year":
            variations.extend([
                {
                    "id": "one_year_boundary_less_than_year",
                    "lane": "A",
                    "perturbation_type": "material",
                    "changed_fact": "Change the promised duration to nine months beginning immediately.",
                    "question": (
                        "A company orally promised employment for nine months beginning immediately, "
                        "with no signed writing. Using the source-grounded one-year Statute of Frauds rule, "
                        "is the oral promise enforceable?"
                    ),
                    "expected_behavior": "gate_not_triggered_or_less_likely",
                },
                {
                    "id": "one_year_boundary_more_than_year",
                    "lane": "B",
                    "perturbation_type": "material",
                    "changed_fact": "Change the promised duration to thirteen months or performance beginning after a delay that makes completion within one year impossible.",
                    "question": (
                        "A company orally promised employment for thirteen months, with no signed writing. "
                        "Using the source-grounded one-year Statute of Frauds rule, is the oral promise enforceable?"
                    ),
                    "expected_behavior": "gate_triggered",
                },
            ])
        elif gate_id == "suretyship":
            variations.extend([
                {
                    "id": "surety_main_purpose",
                    "lane": "A",
                    "perturbation_type": "material",
                    "changed_fact": "Make the promisor's dominant purpose protecting his own ownership or business interest.",
                    "question": "A founder orally promised to pay a company debt mainly to protect his own ownership interest. Does the main-purpose exception affect enforceability despite no signed writing?",
                    "expected_behavior": "exception_may_apply",
                },
                {
                    "id": "surety_pure_collateral",
                    "lane": "B",
                    "perturbation_type": "material",
                    "changed_fact": "Make the promise purely collateral and triggered only if the original debtor defaults.",
                    "question": "A founder orally promised only to pay if the corporation defaulted, with no signed writing and no self-interested main purpose. Does the suretyship gate bar enforcement?",
                    "expected_behavior": "gate_triggered",
                },
            ])
        elif gate_id == "marriage":
            variations.extend([
                {
                    "id": "marriage_no_writing",
                    "lane": "A",
                    "perturbation_type": "material",
                    "changed_fact": "Remove any later certificate or signed designation supporting the premarital promise.",
                    "question": (
                        "In Illinois, a member of a fraternal benefit association told his fiancee before their "
                        "wedding, \"If you marry me, I will change my benefit certificate so that you are the "
                        "beneficiary.\" She agreed, and they married. Unlike the original source case, however, "
                        "the member never obtained a new certificate, never signed a beneficiary designation naming "
                        "her, and never gave her any writing that referred to the promise. He later died with either "
                        "the old designation or no completed post-marriage change in place, and the spouse claimed "
                        "the death benefit based only on the oral premarital promise. Can the spouse enforce the "
                        "promise to obtain the death benefit under Illinois's marriage provision of the Statute of Frauds?"
                    ),
                    "expected_behavior": "bar_more_likely",
                },
                {
                    "id": "marriage_written_designation",
                    "lane": "B",
                    "perturbation_type": "material",
                    "changed_fact": "Add a clear signed designation made after the marriage naming the spouse.",
                    "question": (
                        "In Illinois, a member of a fraternal benefit association promised his fiancee before their "
                        "wedding that, if she married him, he would make her the beneficiary of his death-benefit "
                        "certificate. She agreed, they married, and soon afterward he signed a clear beneficiary "
                        "designation naming her and identifying the benefit certificate. The spouse kept the signed "
                        "designation. About a year later, the member attempted to replace the certificate and name "
                        "his children and sister instead. After the member died, both sides claimed the death benefit. "
                        "Does the signed post-marriage designation satisfy or substitute for the writing required by "
                        "Illinois's marriage provision of the Statute of Frauds?"
                    ),
                    "expected_behavior": "compliance_stronger",
                },
            ])
        elif gate_id == "land":
            variations.extend([
                {
                    "id": "land_part_performance",
                    "lane": "A",
                    "perturbation_type": "material",
                    "changed_fact": "Add possession, payment, and substantial improvements by the claimant.",
                    "question": "A buyer orally agreed to buy land, took possession, paid part of the price, and made substantial improvements. Does part performance support enforcement despite no signed writing?",
                    "expected_behavior": "exception_may_apply",
                },
                {
                    "id": "land_no_possession",
                    "lane": "B",
                    "perturbation_type": "material",
                    "changed_fact": "Remove possession and improvements, leaving only an oral land-transfer promise.",
                    "question": "A buyer alleges only an oral land-transfer promise, with no possession, payment, improvements, or signed writing. Is the land-interest gate dispositive?",
                    "expected_behavior": "bar_more_likely",
                },
            ])
        elif gate_id == "goods":
            variations.extend([
                {
                    "id": "goods_under_threshold",
                    "lane": "A",
                    "perturbation_type": "material",
                    "changed_fact": "Change the goods price below the statutory threshold.",
                    "question": "A seller orally agreed to sell goods below the statutory price threshold. Does UCC 2-201 still require a signed writing?",
                    "expected_behavior": "gate_not_triggered_or_less_likely",
                },
                {
                    "id": "goods_admission_or_delivery",
                    "lane": "B",
                    "perturbation_type": "material",
                    "changed_fact": "Add an admission in pleadings or part delivery/payment.",
                    "question": "A seller orally agreed to sell covered goods, and the buyer later admits the contract or accepts part delivery. Does a UCC exception permit enforcement despite no signed writing?",
                    "expected_behavior": "exception_may_apply",
                },
            ])

    if not variations:
        variations.append({
            "id": "general_writing_toggle",
            "lane": "A",
            "changed_fact": "Add or remove a signed writing containing the essential terms.",
            "question": "How does the writing toggle change the Statute of Frauds outcome?",
            "expected_behavior": "tests_compliance",
        })
    return variations


def _generic_variations(gates: list[dict], source_text: str, doctrine_family: str) -> list[dict]:
    base_question = _neutral_generic_question(source_text, doctrine_family, gates)
    variations = [{
        "id": "surface_party_name_swap",
        "lane": "A",
        "perturbation_type": "invariant",
        "changed_fact": "Change only party names while preserving the clause and drafting facts.",
        "question": f"{base_question} Assume the same facts, except the seller is called Northstar rather than Apex. Does that name change affect the legal interpretation?",
        "expected_behavior": "answer_invariant",
    }]
    if any(gate["id"] == "plain_meaning" for gate in gates):
        variations.append({
            "id": "text_adds_ambiguity",
            "lane": "B",
            "perturbation_type": "material",
            "changed_fact": "Add a second clause that creates a plausible ambiguity about the remedy.",
            "question": (
                f"{base_question} Assume the same facts, except the later schedule adds a second sentence stating "
                "\"service credits are the buyer's sole remedy for all outage-related losses,\" while the main covenant "
                "still says the buyer may pursue all legal and equitable remedies for uncured service failures. The buyer "
                "argues the main covenant preserves damages for severe failures, and the seller argues the schedule now "
                "unambiguously limits all remedies to service credits. How does the added ambiguity affect interpretation?"
            ),
            "expected_behavior": "reasoning_should_shift_to_ambiguity",
        })
    if any(gate["id"] == "contra_proferentem" for gate in gates):
        variations.append({
            "id": "drafter_identity_swap",
            "lane": "B",
            "perturbation_type": "material",
            "changed_fact": "Change which party drafted the ambiguous clause.",
            "question": (
                f"{base_question} Assume the same facts, including the tension between the remedy covenant and the service-credit "
                "schedule, but the buyer rather than the seller drafted the disputed remedial language. The seller argues any "
                "ambiguity should now be construed against the buyer as drafter, while the buyer argues the ordinary meaning "
                "still preserves broader remedies. How does the change in drafting responsibility affect the contra proferentem analysis?"
            ),
            "expected_behavior": "reasoning_should_shift_with_drafter",
        })
    return variations


def build_frank_packet(source_path: Path, run_id: str, repo_root: str | Path = ".") -> dict:
    source_text = source_path.read_text(encoding="utf-8")
    profile = detect_doctrine_profile(source_text)
    gates = profile["gates"]
    pack = profile["selected_pack"]
    doctrine_family = profile["doctrine_family"]
    is_sof = profile["focus_key"] == "statute_of_frauds"
    benchmark_answer = (
        build_benchmark_answer(source_text, doctrine_family, gates)
        if is_sof
        else build_generic_benchmark_answer(source_text, doctrine_family, gates)
    )
    facts = _key_facts(source_text, gates)
    packet = {
        "schema_version": "research.frank.v2",
        "id": f"frank_{run_id}",
        "source": {
            "path": display_path(source_path, repo_root),
            "sha256_16": stable_hash(source_text),
            "excerpt": _source_excerpt(source_text),
        },
        "selected_pack": pack,
        "doctrine_family": doctrine_family,
        "doctrine_gates": gates,
        "doctrine_profile": {
            "primary_gate_id": gates[0]["id"],
            "calibration_domain": "statute_of_frauds" if is_sof else "doctrine_transfer_fixture",
        },
        "source_extraction": {
            "jurisdiction": _jurisdiction(source_text),
            "clean_legal_issue": _clean_issue(gates) if is_sof else _clean_generic_issue(doctrine_family, gates),
            "trigger_facts": facts,
            "source_limits": [
                "Frank is generating a research benchmark, not deciding the case conclusively.",
                profile["source_limit"],
            ],
        },
        "gold_answer": benchmark_answer,
        "neutral_question": _neutral_question(source_text, gates) if is_sof else _neutral_generic_question(source_text, doctrine_family, gates),
        "variations": _variations(gates, source_text) if is_sof else _generic_variations(gates, source_text, doctrine_family),
        "controller_card": {
            "packet_status": "ready_for_karthic",
            "rubric_status": "not_started",
            "evaluation_status": "not_ready",
            "selected_lane_code": "none",
            "primary_gate_id": gates[0]["id"],
            "strongest_counterargument": (
                "The opposing party can argue either that no Statute of Frauds gate is triggered or that a source-recognized writing/substitute/exception changes the result."
                if is_sof
                else "The opposing party can argue for a competing source-supported interpretation of the disputed contractual text."
            ),
        },
        "prompt_hashes": {
            "frank_source_to_packet": stable_hash({"source": source_text, "headings": BENCHMARK_HEADINGS, "gates": gates}),
        },
    }
    if is_sof:
        packet["statute_of_frauds"] = {
            "focus": True,
            "gates": gates,
            "primary_gate_id": gates[0]["id"],
        }
    return packet
