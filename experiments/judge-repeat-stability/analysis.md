# H3 Analysis: Repeat-Aware Judge Stability

## Result

Supported at the method-regression level. The judge path now accepts
`judge.repeats`, performs repeated row-level scoring for LLM judges, aggregates
scores by row, computes stability metrics, and escalates unstable rows through
Zak.

## Interpretation

This closes a methodological gap in the previous pipeline. Before this change,
the paper could describe judge outputs as row-level and explainable, but it had
no artifact surface for repeated-judge stability. The pipeline can now produce
that evidence when a live repeated run is executed.

## Remaining Work

- Run the live natural-response batch with `judge.repeats >= 2`.
- Add a model-separated judge ensemble if cost permits.
- Report stability metrics in paper tables once live repeated judge evidence is
  available.
