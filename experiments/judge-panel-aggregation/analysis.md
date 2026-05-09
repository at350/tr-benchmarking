# Judge Panel Aggregation Analysis

## Result

Status: passed in offline regression tests.

The implementation adds `judge.judge_models` to the research config. When set,
the judge path treats each listed model as part of the panel, makes the
configured number of row-scoring calls, aggregates row scores by mean score, and
records panel composition in `judge_scores.json`.

## Interpretation

This is implementation evidence, not live reliability evidence. The system is
now capable of running repeated or ensemble LLM-as-judge validation, but the
paper should not claim panel reliability until a frozen live run measures
pairwise MAE, weighted kappa, row-score ranges, and Zak escalation frequency
under the actual judge roster.
