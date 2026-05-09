# Autoresearch Progress Report

Date: 2026-05-09

## What Changed

The research branch now has explicit autoresearch state files:

- `research-state.yaml`
- `findings.md`
- `research-log.md`
- `literature/survey.md`
- `experiments/dasha-source-gate-aliasing/`

I also improved Dasha's clustering implementation. The prior LLM-signature path
was structurally doctrine-general, but the trigger bucket could fall back too
quickly to Statute-of-Frauds-specific labels or exact strings. Dasha now uses
Frank's detected source gates as aliases when normalizing reasoning signatures.

## Why It Matters

The vision requires a pipeline that is calibrated on Statute of Frauds but not
hard-coded to Statute of Frauds. Source-derived gate aliasing makes the Dasha
clustering step better aligned with that goal: the clustering ontology comes
from Frank's source-grounded packet when possible.

## Evidence Added

New regression coverage verifies that non-SOF contract-interpretation signatures
cluster by `plain_meaning` versus `contra_proferentem` source gates.

## Current Readiness

The pipeline is presentable as an internal pre-expert-review system, not as a
final publication-ready system. The manuscript can now explain the method more
accurately, but the next evidence gap is clear: run a larger live natural batch,
then run live perturbation tracks and repeated/ensemble judging.

## Heartbeat Update

The judge path now supports repeated LLM-as-judge calls. It aggregates row
scores, records pairwise MAE and weighted kappa, and sends unstable rows to Zak
when repeats differ too much. This gives the next live run a concrete way to
measure judge stability instead of merely asserting it.

Dasha now also records member/centroid coherence. Each LLM-signature cluster
preserves the normalized key used for grouping, and validation checks whether
members still agree with the centroid key. This makes cluster-coherence review
more concrete for the manuscript.
