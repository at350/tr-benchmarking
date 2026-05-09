# Protocol Freeze Manifest Analysis

## Result

Status: passed in offline regression.

The new `freeze` command emits a `research.protocol_freeze.v1` JSON artifact.
It hashes the config, source case, loaded instruction streams, and full protocol
metadata. A regression verifies that a live multi-provider config produces a
freeze manifest with Frank instruction-context hashes and a judge panel, while
excluding obvious secret strings such as API-key names and `sk-` key material.

## Interpretation

This improves reproducibility but does not add live validation evidence. Its
role is methodological: any future live batch that supports a manuscript claim
should first create and preserve a freeze manifest so the results can be audited
against the exact config and instruction streams used for the run.
