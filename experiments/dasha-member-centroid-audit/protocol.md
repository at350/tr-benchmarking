# Dasha Member/Centroid Coherence Audit

Status: EXPLORATORY implementation experiment. This adds validation
instrumentation rather than new live evidence.

## Hypothesis

If Dasha stores the normalized key used to place each response into a cluster,
then the validation layer can directly check whether every member still agrees
with the centroid's legal-reasoning key.

## Prediction

A cluster whose members all carry the same normalized key should pass the member
audit. A cluster containing one member with a different key should report the
mismatched response id and fail the member-audit status.

## Measurement

Add a controlled unit test with a two-member cluster: one member matches the
centroid key and one member uses a different trigger key. Expected result:
`needs_member_review`, two checked members, one mismatched member, and the
mismatched response id preserved in the audit artifact.

## Risk

This audit checks agreement with Dasha's own normalized keys. It does not prove
that the LLM-extracted signature is legally correct; that remains a source-text
and artifact-review question.
