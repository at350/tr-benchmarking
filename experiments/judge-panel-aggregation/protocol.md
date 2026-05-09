# Judge Panel Aggregation Protocol

## Purpose

The paper's LLM-as-judge method should not depend on a single judge model as the
only possible reliability check. This offline regression verifies that the
pipeline can configure a judge panel, call each judge model, record panel
composition, aggregate row scores, and compute stability metrics before any
paid live panel run is executed.

## Acceptance Checks

- Research config accepts `judge.judge_models`.
- Each judge model entry includes provider, model identifier, and repeat count.
- The LLM judge path calls each configured judge model.
- Row scores from the panel are aggregated by rubric row.
- The run records `judge_panel` and `judge_stability`.

## Command

```bash
PYTHONPATH=. python3 -m unittest \
  research.validation.tests.test_research_pipeline.ResearchPipelineTests.test_live_config_can_define_judge_panel \
  research.validation.tests.test_research_pipeline.ResearchPipelineTests.test_llm_judge_panel_records_models_and_aggregates_scores
```
