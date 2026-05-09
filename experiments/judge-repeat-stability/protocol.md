# H3: Repeat-Aware Judge Stability

Status: EXPLORATORY implementation experiment. This is method infrastructure,
not final live evidence.

## Hypothesis

If LLM-as-judge scores are repeated at the rubric-row level, the pipeline can
distinguish stable centroid scores from unstable rows that should be escalated
before model rankings are trusted.

## Prediction

Given two repeated judge outputs for the same centroid, the pipeline should:

- aggregate row scores when repeats are close,
- record pairwise MAE and weighted kappa,
- flag rows with a score range of two or more points,
- create a Zak packet for unstable rows.

## Measurement

Patch the judge client with two controlled outputs. One rubric row varies from
4 to 1 and one remains at 4. The expected result is a `needs_review` stability
status and a Zak packet naming only the unstable row.

## Risk

This test proves the stability mechanism exists. It does not measure live judge
reliability until repeated calls are run against actual Dasha centroids.
