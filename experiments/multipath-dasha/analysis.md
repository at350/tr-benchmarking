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

After fixing a normalization bug that treated substrings inside
``unenforceable'' as positive enforceability signals, the tuned track-aware
clustering produced 22 clusters across 60 responses and completed the full
source-to-score run:

- original track: 6 clusters
- surface-invariant track: 8 clusters
- material signed-writing track: 8 clusters

Judge then scored the 22 centroids with a two-model panel, producing 44 panel
calls, 220 final row-level scores, 11 adjudications, projected scores for all
60 member responses, 10 model rankings, and a Zak packet. Perturbation
validation passed: the surface-invariant edit preserved the dominant answer
family and the material signed-writing edit changed it.

## Interpretation

The refinement fixes the specific flaw that motivated this experiment. Dasha no
longer forces each response into a single-path representation: it records the
controlling path and the material side paths considered along the way. At the
same time, the grouping key is conservative enough to retain centroid
compression. This is now the active Dasha method version for the Anglemire
bundle.
