# Statute of Frauds Research Protocol Notes

This branch is scoped to Statute of Frauds benchmarking. The near-term target is
not arbitrary legal doctrine coverage; it is robust source-to-score automation
for Statute of Frauds cases and variations.

## Engineering Calibration vs. Research Validation

During development, the team may repeatedly adjust prompts, rubric generation,
clustering configuration, and judge settings on calibration cases. That loop is
engineering work. It should not be reported as the paper's validation method.

Before JD review, freeze:

- Frank prompts and output schema
- question-variation policy
- Karthic rubric generation and quality gates
- Dasha clustering method and parameters
- judge model roster and aggregation rule
- Zak escalation threshold

The paper should report only results from the frozen pipeline on held-out JD
reviewed examples.

## Internal Acceptance Gates Before JD Review

The pipeline is ready for JD review only when:

- Frank packets detect the correct Statute of Frauds gate, preserve source traceability, generate a neutral question, and create boundary variations that test legally meaningful fact changes.
- Karthic rubrics are fresh per source case, source-grounded, non-duplicative, category-complete, and focused on gate, rule, facts, writing/compliance, exceptions, counterargument, conclusion, variation sensitivity, and source support.
- Dasha clusters group responses by similar Statute of Frauds legal reasoning, including gate, outcome, exception/substitute, and core reasoning path.
- Judge scoring is row-level, explainable, stable under the frozen config, and projects centroid scores to all responses in each Dasha cluster.
- Zak packets are produced only for disputed or low-confidence cases.
- A complete run bundle can be regenerated from config.

## Future Live Validation

The first publishable run should use fresh model outputs generated from newly
created Frank questions, not historical response dumps tied to older hand-authored
questions. Historical artifacts were removed from the active branch for that
reason.

Use `"mode": "live_openai"` in a research config to generate fresh Dasha
responses from the locked Frank question. The API key is read from process env
or ignored local env files; it should never be committed.

Set `"judge": {"mode": "llm", "model": "gpt-4o-mini", ...}` to use the
LLM-as-judge path for centroid scoring. The offline fixture uses deterministic
judging only so tests remain reproducible.
