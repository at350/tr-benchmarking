# Legal Reasoning Research Protocol Notes

This branch is building a general legal-reasoning evaluation pipeline. Statute
of Frauds is the first calibration domain because that is the data currently in
hand, but the live path should infer doctrine from the source case rather than
hard-code SOF assumptions.

The live LLM path loads the active instruction tree at runtime. The deterministic
SOF code paths are retained for offline regression fixtures and controlled stress
tests only.

## Engineering Calibration vs. Internal Research Validation

During development, the team may repeatedly adjust prompts, rubric generation,
clustering configuration, and judge settings on calibration cases. That loop is
engineering work. It should not be reported as the paper's validation method.

Before reporting internal validation results, freeze:

- Frank prompts and output schema
- question-variation policy
- Karthic rubric generation and quality gates
- Dasha clustering method and parameters
- judge model roster and aggregation rule
- Zak escalation threshold

The manuscript should report only results from frozen pipeline runs. Expert
legal review remains a future publication step, not a dependency for the current
internal validation manuscript.

## Internal Acceptance Gates

The pipeline is internally acceptable only when:

- Frank packets detect the correct legal doctrine/gate, preserve source traceability, generate a neutral question, and create boundary variations that test legally meaningful fact changes.
- Karthic rubrics are fresh per source case, source-grounded, non-duplicative, category-complete, and focused on gate, rule, facts, writing/compliance, exceptions, counterargument, conclusion, variation sensitivity, and source support.
- Dasha clusters group responses by similar legal reasoning, including doctrine/gate, outcome, exception/substitute or defense, and core reasoning path.
- Judge scoring is row-level, explainable, stable under the frozen config, and projects centroid scores to all responses in each Dasha cluster.
- Zak packets are produced only for disputed or low-confidence cases.
- A complete run bundle can be regenerated from config.

## Live Validation

Internal validation runs should use fresh model outputs generated from newly
created Frank questions, not historical response dumps tied to older
hand-authored questions. Historical artifacts were removed from the active
branch for that reason.

Use `"mode": "live_openai"` in a research config to generate fresh Dasha
responses from the locked Frank question. The API key is read from process env
or ignored local env files; it should never be committed.

Set `"judge": {"mode": "llm", "provider": "openai", "model": "gpt-5.2", ...}`
to use the LLM-as-judge path for centroid scoring. In config, `provider` is only
call-routing metadata; the research object is the actual `model` identifier and
its generated output. The offline fixture uses deterministic judging only so
tests remain reproducible.

Run the internal 500-response stress suite with:

```bash
python3 -m research.validation stress --output-dir research/runs/internal_stress --sample-count 500 --seed 2026 --table paper/tables/internal_stress_summary.tex
```

The stress suite is controlled fixture evidence. It validates Dasha clustering
and reporting mechanics at the target scale, but it is not counted as live model
performance.
