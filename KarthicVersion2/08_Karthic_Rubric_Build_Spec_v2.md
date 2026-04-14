# Karthic Rubric Build Spec v2

## Purpose
This file is the operating spec for turning a locked benchmark packet into a modular rubric. It is not the packet contract itself and it is not the answer-level scoring sheet.

## File boundaries
- `50_Karthic_PreFill_Instructions` = the runtime instruction contract for Karthic.
- `54_Benchmark_Packet_Handoff_Template` = the concrete handoff artifact and canonical field names.
- `08_Karthic_Rubric_Build_Spec_v2` = the human-facing rubric-build procedure.
- `09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v2` = the post-row-scoring overlay and cap layer.
- `53_Karthic_Row_Weighting_Worksheet_v2.xlsx` = the operational workbook that implements packet audit, weighting, row scoring, overlays, and export fields.

## Core rule
Karthic builds the rubric from:
1. the gold answer,
2. the selected doctrine pack,
3. the failure bank,
4. the clustered centroids or archetypes,
while preserving comparability across runs and avoiding double-counting.

## Fixed architecture
Keep these parent modules exactly:
- Module 0 — Metadata tags (not scored)
- Module 1 — Structural gatekeeping
- Module 2 — Primary doctrine gates
- Module 3 — Fallback doctrines and defenses
- Module 4 — Cross-cutting answer discipline

## What must be locked before drafting
Treat the benchmark packet as the source of truth for:
- selected_pack
- doctrine_family
- jurisdiction_assumption
- benchmark_posture
- likely_controlling_doctrine
- required_gate_order
- output_shell
- strongest_expected_counterargument
- gold_answer
- doctrine_guide_or_pack
- failure_bank
- variation_lane
- human_weight_overrides

If one of these is missing, contradictory, or unstable, stop and flag it instead of silently guessing.

## What Karthic may infer
From centroids, archetypes, and recurring failure patterns, Karthic may infer:
- exact row wording
- broad-row splits or merges
- strong vs weak answer examples
- row-level calibration examples
- pack-local weight adjustments
- proposed new failure labels when the current bank is inadequate

He may not infer new facts, new writings, or a different controller unless the packet itself supports a genuine ambiguity and the ambiguity is flagged.

## Default build sequence
1. Prefill audit
2. Lock the doctrinal path
3. Instantiate the module shell
4. Draft coarse rows
5. Decompose overly broad rows
6. Prune and de-duplicate
7. Assign module and row weights
8. Map failure labels
9. Add Lane A / Lane B patch notes
10. Escalate material boundary questions to Zak

## Weighting defaults
Start from:
- Module 1 — 28
- Module 2 — 40
- Module 3 — 19
- Module 4 — 13

Change them only when the packet gives a real reason, and record the reason.

## Row design rule
For every scored row, define:
- row code
- row label
- one-sentence purpose
- what earns 0 / 1 / 2 / 3 / 4
- the main failure mode it catches
- whether it is controlling, secondary, fallback, or cross-cutting

## Required output sections
A. Prefill audit
B. Rubric skeleton
C. Row-level scoring design
D. Failure-label mapping
E. Decomposition / pruning log
F. Variation patch notes
G. Escalation notes for Zak

## Design guardrails
- No generic writing-quality rows as substitutes for legal reasoning.
- No fallback-first scoring logic.
- No one-exception-cures-all row design.
- No duplicated penalties for the same underlying defect.
- Keep Module 4 lean; do not reward polish for its own sake.
