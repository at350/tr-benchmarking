# Multipath Dasha Signature Refinement

## Question

Can Dasha account for legal answers that discuss multiple doctrinal gates or
equitable theories before settling on one controlling path, without fragmenting
the response set into one cluster per answer?

## Prediction

A usable Dasha representation should separate:

- the primary reasoning path that controls the answer;
- the full secondary-path audit profile, including rejected, uncertain,
  mentioned, and accepted gates or theories; and
- a smaller secondary cluster profile that affects grouping only when a
  non-primary path is accepted or uncertain enough to be legally material.

If every rejected or merely mentioned path is included in the grouping key, the
method should overfragment. If no secondary paths are represented, the method
should hide meaningful multi-gate reasoning.

## Method

Use the saved 60 natural model responses from the real Anglemire
perturbation-aware live roster run. Do not regenerate benchmark model answers.
Regenerate only Dasha reasoning signatures under an updated extraction prompt
that asks for `primary_reasoning_path` and `secondary_paths`. Then recluster
the responses with the revised Dasha normalization.

The first exploratory clustering pass uses the full secondary profile in the
cluster key. The tuned pass records the full profile for audit but clusters only
on accepted or uncertain non-primary secondary paths.

