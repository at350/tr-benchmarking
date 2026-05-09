# Protocol: Live Dasha Multimodel Perturbation Validation

## Question

Can Dasha recover materially different legal-reasoning paths from natural model
answers in a larger multimodel, multi-sample, perturbation-aware live run?

## Confirmatory Prediction

If the pipeline is ready to support a robust Dasha claim, then a live run using
natural question-only responses across OpenAI, Anthropic, and Replicate-hosted
models should:

- run the original Frank question plus at least one invariant and one material
  perturbation track;
- collect at least 30 natural model answers before Dasha clustering;
- produce at least three observed Dasha clusters across all tracks or at least
  two non-base-track reasoning shifts;
- pass member/centroid coherence with no normalized-signature mismatches;
- avoid one giant mixed cluster when responses use visibly different legal
  theories such as certificate-writing, equitable/promissory-estoppel,
  association-rule replacement, or Statute-of-Frauds-bar reasoning;
- produce row-level judge scores and model rankings with repeated or panel
  judge stability recorded.

## Exploratory Checks

- Compare cluster composition by model family to see whether particular model
  families concentrate in specific legal-reasoning clusters.
- Compare invariant and material perturbation tracks: invariant edits should
  preserve dominant reasoning; material edits should change outcome or reasoning
  when the doctrine requires it.
- Inspect whether Dasha's reasoning-path bucket captures differences that are
  not visible from doctrine, trigger, outcome, and exception buckets alone.

## Success Criteria

The run is claim-supporting only if `internal_validation_summary.json`,
`natural_response_audit.json`, `perturbation_report.json`, `judge_scores.json`,
and the method-readiness report all pass or identify only declared nonblocking
limitations. If the run collapses to one cluster or shows mixed-reasoning
clusters, the result is a Dasha failure that should drive another method
iteration rather than be paper evidence.

## Cost Control

The first live attempt should use only locally available provider credentials.
Current local preflight shows OpenAI, Anthropic, and Replicate credentials are
available, while Gemini is not configured. The full publication target should
add Gemini once a key is present, but the next executable run should not block
on missing Gemini credentials.
