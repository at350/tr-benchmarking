# Multipath Dasha Signature Refinement

## Result

The first multi-path signature pass regenerated Dasha signatures for all 60
saved natural responses from the Anglemire perturbation-aware roster. The
extractor completed without JSON failures, but using every secondary path in
the cluster key produced 49 clusters for 60 responses. That was too fragmented
for centroid-level judging.

The tuned clustering rule preserves the full secondary-path audit profile but
uses a smaller secondary cluster profile: only accepted or uncertain
non-primary paths affect grouping. Rejected and merely mentioned side paths
remain visible in cluster artifacts, but they do not automatically split a
centroid.

The tuned track-aware clustering produced 26 clusters across 60 responses:

- original track: 8 clusters
- surface-invariant track: 10 clusters
- material signed-writing track: 8 clusters

The secondary cluster profile counted 38 responses with no material secondary
path, 11 with uncertain promissory-estoppel or reliance analysis, 7 with
accepted part-performance analysis, 4 with accepted promissory-estoppel or
reliance analysis, 2 with accepted signed-writing analysis, 1 with accepted
land-interest analysis, and 1 with uncertain part-performance analysis.

## Interpretation

The refinement fixes the specific flaw that motivated this experiment. Dasha no
longer forces each response into a single-path representation: it records the
controlling path and the material side paths considered along the way. At the
same time, the grouping key is conservative enough to retain centroid
compression. This is suitable as the next Dasha method version, but the main
source-to-score bundle should be rerun through Judge before the manuscript uses
the 26-cluster output as final scored evidence.

