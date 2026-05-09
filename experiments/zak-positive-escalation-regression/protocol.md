# Zak Positive Escalation Regression Protocol

## Purpose

Zak is only useful if it records both no-escalation states and positive failure
states. This regression checks two non-live escalation paths:

- low-margin centroid judge scores;
- unstable repeated judge rows.

The goal is not to prove that the final live thresholds are calibrated. The goal
is to prevent a silent failure mode where uncertain judge output is accepted
without a packet.

## Acceptance Checks

- A low top-vs-runner-up weighted-score margin produces `needs_zak=true`.
- The resulting Zak packet lists the disputed clusters and rubric rows.
- Repeated judge rows with a score range of at least two points produce an
  unstable-row Zak packet.

## Command

```bash
PYTHONPATH=. python3 -m unittest \
  research.validation.tests.test_research_pipeline.ResearchPipelineTests.test_low_margin_judge_scores_create_zak_packet \
  research.validation.tests.test_research_pipeline.ResearchPipelineTests.test_repeated_llm_judge_scores_are_aggregated_and_unstable_rows_escalate
```
