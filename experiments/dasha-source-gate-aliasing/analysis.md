# H1 Analysis: Source-Derived Gate Aliasing For Dasha

## Result

Supported at the unit-regression level. Dasha now builds a gate-alias map from
Frank's detected gates and uses that map when normalizing LLM reasoning
signatures. The regression test verifies that paraphrased `plain_meaning`
signatures cluster together while `contra_proferentem` reasoning remains in a
separate cluster.

## Interpretation

This improves doctrine generality because Dasha no longer needs every live
signature to use the same exact `rule_trigger` wording, and it no longer has to
fall back immediately to Statute-of-Frauds-specific trigger labels. The method is
still conservative: if source-derived aliases do not match, Dasha falls back to
the existing normalized trigger text and SOF calibration fallbacks.

## Remaining Work

- Run a live non-SOF source case to test whether LLM-extracted signatures
  naturally match Frank's gate aliases.
- Add a centroid/member audit that samples cluster members and records whether
  the response text supports the normalized source gate.
- Compare exact source-gate bucketing against an embedding-assisted variant once
  enough live natural responses exist.
