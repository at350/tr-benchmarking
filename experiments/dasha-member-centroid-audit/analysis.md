# Dasha Member/Centroid Coherence Audit Analysis

## Result

Supported at the validation-regression level. LLM-signature clusters now store a
`normalized_cluster_key`, members preserve `_dasha_normalized_signature`, and the
internal validation layer emits a `dasha_member_audit` with checked-member count,
mismatch count, overall coherence, and per-cluster mismatches.

## Interpretation

This makes the Dasha evidence more inspectable. Previously, the pipeline could
report cluster count, purity, and centroid similarity, but it did not preserve a
direct per-member audit trail for the normalized legal-reasoning key used to
place each response. The new artifact gives researchers a concrete way to see
whether a cluster is coherent under the same normalization rule that built it.

## Remaining Work

- Regenerate the live natural-response batch so the stored live artifact
  contains normalized member keys.
- Promote member/centroid coherence into the paper tables after that live run.
- Add a separate source-grounding audit that checks whether the extracted
  signature accurately reflects the raw response text.
