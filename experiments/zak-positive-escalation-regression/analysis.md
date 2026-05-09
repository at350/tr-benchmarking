# Zak Positive Escalation Regression Analysis

## Result

Status: passed.

The regression exposed and fixed an agreement-score defect. The previous
calculation added the configured threshold to the normalized margin, making
ordinary low-margin disputes nearly impossible to escalate. The implementation
now normalizes the top-vs-runner-up margin by the maximum possible weighted
rubric score and compares that value to the configured agreement threshold.

## Interpretation

The pipeline now has executable evidence for positive Zak packet creation in
offline conditions:

- low-margin centroid comparisons produce disputed-cluster packets;
- unstable repeated judge rows produce unstable-row packets.

This does not finish judge validation. Live runs still need repeated or
ensemble judge calls to calibrate thresholds and measure how often the packets
are substantively useful.
