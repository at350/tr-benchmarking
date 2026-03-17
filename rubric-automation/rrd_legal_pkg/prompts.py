"""Default prompt templates for the legal RRD pipeline."""

from __future__ import annotations

from textwrap import dedent


LEGAL_STRUCTURE_EXTRACTION_PROMPT = dedent(
    """
    You are extracting the legal structure needed to evaluate a candidate answer.
    Return JSON only. Do not include markdown, prose, or explanations outside JSON.

    Task context:
    - Jurisdiction: {jurisdiction}
    - Legal domain: {legal_domain}

    Legal question:
    {legal_question}

    Golden answer:
    {golden_answer}

    Produce JSON with exactly these top-level keys:
    {{
      "issues": [{{"name": str, "support": str}}],
      "sub_issues": [{{"name": str, "support": str}}],
      "rules": [{{"name": str, "support": str}}],
      "elements": [{{"name": str, "parent_rule": str | null, "support": str}}],
      "factors": [{{"name": str, "parent_rule": str | null, "support": str}}],
      "exceptions": [{{"name": str, "support": str}}],
      "applications": [{{"name": str, "support": str}}],
      "counterarguments": [{{"name": str, "support": str}}],
      "conclusions": [{{"name": str, "support": str}}],
      "omitted_but_implied": [{{"name": str, "support": str}}]
    }}

    Requirements:
    - Ground every item in the legal question or golden answer.
    - Identify governing doctrine, doctrinal tests, elements, factors, burdens, and exceptions where present.
    - Include factual application points that a legally adequate answer must address.
    - Prefer specific doctrinal content over generic writing advice.
    - If a category has no grounded content, return an empty array for that category.
    """
).strip()


INITIAL_LEGAL_RUBRIC_PROMPT = dedent(
    """
    You are generating legally material rubric criteria for evaluating candidate answers.
    Return JSON only. Do not include markdown or explanatory prose.

    Legal question:
    {legal_question}

    Golden answer:
    {golden_answer}

    Extracted legal structure:
    {legal_structure_json}

    Optional sample responses:
    {sample_responses_json}

    Produce JSON with this schema:
    {{
      "rubrics": [
        {{
          "text": str,
          "category": str,
          "layer": "core" | "secondary",
          "legal_basis": str,
          "binary_evaluable": bool
        }}
      ]
    }}

    Requirements:
    - Generate rubrics that capture doctrinal correctness, issue spotting, rule statement accuracy, element or factor coverage, exceptions or defenses, factual application, reasoning quality, counterarguments, and conclusion support.
    - Each rubric must be binary or near-binary evaluable against a candidate answer.
    - Avoid vague omnibus rubrics when narrower legal dimensions exist.
    - Avoid redundant paraphrases.
    - Favor legal substance over surface style. Style rubrics are allowed only if they are legally useful.
    - Include rubrics that test whether a response avoids material doctrinal errors.
    - Tie rubrics to the legal question and golden answer instead of generic legal-writing advice.
    """
).strip()


LEGAL_RUBRIC_DECOMPOSITION_PROMPT = dedent(
    """
    You are refining a legal rubric that is too broad, too omnibus, or insufficiently discriminative.
    Return JSON only.

    Legal question:
    {legal_question}

    Golden answer:
    {golden_answer}

    Parent rubric:
    {{
      "text": "{rubric_text}",
      "category": "{rubric_category}"
    }}

    Sample responses:
    {sample_responses_json}

    Produce JSON with this schema:
    {{
      "children": [
        {{
          "text": str,
          "category": str,
          "why_more_specific": str
        }}
      ]
    }}

    Requirements:
    - Preserve the parent rubric's doctrinal area.
    - Split issue identification, rule statement, element coverage, factor analysis, application, exceptions, defenses, and counterarguments when legally distinct.
    - Generate independently evaluable legal criteria, not paraphrases.
    - Avoid stylistic or cosmetic children unless legally material.
    - Favor children that can discriminate between partially correct and fully correct legal answers.
    """
).strip()


BINARY_RUBRIC_EVALUATION_PROMPT = dedent(
    """
    You are evaluating whether a legal response satisfies a rubric criterion.
    Return JSON only.

    Legal question:
    {legal_question}

    Rubric criterion:
    {rubric_text}

    Candidate response:
    {response}

    Golden answer:
    {golden_answer}

    Produce JSON with this schema:
    {{
      "satisfied": bool,
      "confidence": float,
      "rationale": str
    }}

    Requirements:
    - Judge based on legal materiality, doctrinal consistency, and fidelity to the legal question.
    - Mark the rubric unsatisfied when the omission or error is legally substantial.
    - Prioritize substantive legal correctness over tone or writing polish.
    - Keep the rationale short and specific.
    """
).strip()


REDUNDANCY_ADJUDICATION_PROMPT = dedent(
    """
    You are deciding whether two legal rubrics are genuinely distinct.
    Return JSON only.

    Rubric A:
    {rubric_a}

    Rubric B:
    {rubric_b}

    Produce JSON with this schema:
    {{
      "redundant": bool,
      "reason": str,
      "preferred_rubric": "A" | "B" | "either"
    }}

    Requirements:
    - Treat rubrics as non-redundant when they test different legal dimensions, such as rule statement versus factual application.
    - Treat rubrics as redundant when they are substantively duplicative or only stylistic paraphrases.
    - Prefer the rubric that is more legally specific, more doctrinally central, and less stylistic.
    """
).strip()


LEGAL_WEIGHT_ASSIGNMENT_PROMPT = dedent(
    """
    You are assigning relative weights to legal rubrics.
    Return JSON only.

    Legal question:
    {legal_question}

    Golden answer:
    {golden_answer}

    Rubrics:
    {rubrics_json}

    Produce JSON with this schema:
    {{
      "weights": {{
        "<rubric_id>": float
      }},
      "rationale": {{
        "<rubric_id>": str
      }}
    }}

    Requirements:
    - Weight doctrinally central issues, governing rules, material elements or factors, factual application, exceptions or defenses, and supported conclusions more heavily than secondary presentation concerns.
    - Consider legal materiality and effect on the overall legal correctness of the answer.
    - Use positive scores only; the caller will normalize them.
    """
).strip()


COVERAGE_AUDIT_PROMPT = dedent(
    """
    You are auditing the coverage of a final legal rubric set.
    Return JSON only.

    Legal question:
    {legal_question}

    Golden answer:
    {golden_answer}

    Extracted legal structure:
    {legal_structure_json}

    Final rubrics:
    {rubrics_json}

    Produce JSON with this schema:
    {{
      "covered_categories": [str],
      "underrepresented_categories": [str],
      "missing_points": [{{"category": str, "point": str, "reason": str}}],
      "rubric_mapping": {{
        "<rubric_id>": [str]
      }}
    }}

    Requirements:
    - Check coverage of major issues, rules, elements or factors, exceptions or defenses, factual application, conclusions, and counterarguments where relevant.
    - Flag doctrinal omissions, not stylistic omissions.
    - Map each rubric to the legal issue, rule, element, or application point it covers where possible.
    """
).strip()
