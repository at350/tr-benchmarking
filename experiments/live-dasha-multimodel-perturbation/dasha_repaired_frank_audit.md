# Dasha Audit After Frank Scenario Repair

Date: 2026-05-09

## Question Being Tested

The prior live Dasha input was invalid because Frank generated an abstract
doctrinal prompt rather than a complete legal scenario. The repaired Frank path
now enforces scenario-quality gates and repairs scenario-poor questions before
downstream stages run.

## Run Summary

- Local run bundle: `research/runs/live_replicate_roster`
- Config: `research/fixtures/live_replicate_roster_config.example.json`
- Frank neutral question: 180 words, self-contained Illinois fraternal-benefit
  Statute of Frauds scenario
- Frank material variation: 199 words, same scenario with a signed handwritten
  writing memorializing the marriage-consideration promise
- Frank quality errors: 0
- Natural responses: 60
- Signed Dasha reasoning signatures: 60
- Actual model identifiers: 10
- Question tracks: original, surface-invariant, material signed-writing
  variation
- Dasha clusters: 41 total
- Member-coherence audit: passed, 1.0 coherence
- Mixed-reasoning clusters detected: 0

## Perturbation Results

| Track | Perturbation | Dominant Answer Bucket | Result |
|---|---:|---|---|
| original | base | later beneficiaries control | baseline |
| surface_invariant | invariant party-label edit | later beneficiaries control | passed |
| A1 | material signed-writing edit | wife certificate controls | passed |

The invariant track preserved the dominant answer bucket. The material track
changed the dominant answer bucket, which is the expected behavior because the
variation supplies a signed writing that materially strengthens the spouse's
Statute of Frauds position.

## Interpretation

This run supports Dasha on the repaired Frank questions for the current
Statute-of-Frauds case: Dasha did not visibly mix divergent reasoning paths in
clusters, and the perturbation audit detected the expected invariant/material
behavior. It does not by itself complete the whole source-to-score research
claim because judge scoring was intentionally stopped after Dasha artifacts were
checkpointed.

## Next Required Step

Promote this as Dasha-only evidence or rerun the same repaired Frank protocol
end-to-end through repeated or ensemble judge scoring before updating the paper
to stronger source-to-score claims.
