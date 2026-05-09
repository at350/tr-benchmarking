# Live Config Preflight Analysis

## Result

Status: passed with warnings.

The multi-provider live example passes the blocking structural checks: live
mode, natural prompting, model roster size, provider-route diversity, LLM
Frank/Karthic/Dasha agents, reasoning-signature clustering, multi-cluster
Dasha target, LLM judging, judge panel, source availability, and protocol-freeze
buildability.

The config originally warned that perturbation tracks were not enabled. That
has been fixed by enabling invariant and material perturbation tracks in the
main live multi-provider example.

The current local environment reports one remaining warning:

- no Gemini credential alias is available for the configured Gemini route.
  The accepted aliases are `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and
  `GOOGLE_GENERATIVE_AI_API_KEY`.

The preflight now also emits a no-call execution plan. For the current
multi-provider perturbation config, the planned minimum live budget is:

- 3 question tracks: original, one invariant edit, and one material edit
- 10 natural response calls per track
- 30 total benchmarked response calls
- 30 Dasha reasoning-signature extraction calls
- at least 9 judge calls, because the judge panel has 3 invocations per cluster
  and the perturbation-aware run should produce at least 3 judged clusters
- 69 total LLM calls excluding Frank and Karthic

The config now includes hard budget caps:

- maximum response calls: 30
- maximum judge calls: 12
- maximum total LLM calls excluding Frank and Karthic: 80

The current 69-call plan passes those caps. If a future edit increases response
samples, perturbation tracks, judge repeats, or judge-panel size beyond the
caps, preflight becomes a blocking failure before any model call.

The same cap check is enforced by the pipeline runner itself. Direct `run`
execution with an over-budget live config raises before Frank is invoked, so
preflight is not the only cost-control boundary.

## Interpretation

This is not validation evidence from model outputs. It is a cost-control and
reproducibility gate. A claim-supporting live run should pass preflight before
model calls are made, the call plan should be accepted before spending budget,
and any warnings should be resolved or explicitly accepted as part of the run
design.
