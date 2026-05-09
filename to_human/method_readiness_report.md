# Method Readiness Report

Date: 2026-05-09

## Current Status

The current branch is ready for internal technical review as a pre-expert-review
research system. It is not yet ready for a final publication claim because the
live evidence remains one Statute-of-Frauds case, one small natural-response
batch, no live perturbation-track run, and no repeated live judge run.

## Evidence From Current Artifacts

- Live source-to-score run: `research/runs/live_natural_response_batch`
- Natural model responses: 9
- Response model identifiers: `gpt-5.2`, `claude-sonnet-4-20250514`,
  `meta/meta-llama-3-70b-instruct`
- Observed Dasha clusters: 3
- Dasha member/centroid audit: 9 checked members, 0 mismatches,
  coherence = 1.0
- Karthic rubric rows: 10
- Judge row scores: 30
- Model rankings: 3
- Zak packets: 0
- Current research-pipeline tests: 43 passing

## What This Supports

The current evidence supports the claim that the pipeline can run from a source
case to Frank, Karthic, natural responses, Dasha clusters, Judge scores, Zak
state, model rankings, and paper tables without manual patching.

The Dasha evidence is stronger after the latest revalidation because the
natural-response audit now reports member/centroid coherence. This gives the
paper a concrete answer to the question of whether cluster members agree with
their centroid under the same normalization rule used by Dasha.

## What It Does Not Yet Support

The current evidence does not yet support broad publication-strength claims
about legal-domain generality, judge reliability, or perturbation sensitivity.
Those claims require:

- a live perturbation-track run,
- repeated or ensemble judge scoring on live centroids,
- at least one held-out non-SOF source case,
- and a larger live natural-response roster.

## Recommended Next Run

Run the existing live natural-response config with `judge.repeats >= 2`, then
rerun validation so the paper can report actual judge stability metrics instead
of only method support. After that, run a live perturbation config so invariant
and material Frank variations are tested on natural model responses.
