# Non-SOF Contract Transfer Smoke Analysis

## Result

Status: passed in the focused offline unit test.

The fixture previously exposed a useful Dasha defect: a seller-limitation answer
and a contra-proferentem answer were both normalized as generic
plain-meaning/uncertain/contra reasoning, which caused an invalid mixed cluster.
The fix adds doctrine-general outcome normalization for buyer-remedy-preserved
and seller-limited-remedy reasoning, so opposing contract interpretations no
longer collapse into the same cluster merely because both discuss ambiguity.

## Interpretation

This supports only a limited claim:

- the pipeline can execute a non-SOF source case through the same artifact
  lifecycle;
- Frank and Karthic no longer require SOF-specific packet fields for this
  fixture;
- Dasha's source-gate normalization can catch a real mixed-cluster failure and
  can be corrected through general legal-outcome features.

It does not establish broad doctrine transfer. The next step is a live
multi-model held-out doctrine run using natural model responses.
