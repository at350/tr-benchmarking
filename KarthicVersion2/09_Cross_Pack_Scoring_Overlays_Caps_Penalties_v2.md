# 09 — Cross-Pack Scoring Overlays, Penalties, and Caps v2

## Purpose
This file standardizes the answer-level scoring layer that sits after row-level scoring and before final score lock. It is designed to work with the locked row weights in `53_Karthic_Row_Weighting_Worksheet_v2.xlsx`.

## Core scoring sequence
1. Lock packet fields.
2. Lock row weights.
3. Score included rows on the 0–4 anchor and compute the subtotal out of 100.
4. Apply answer-level overlays only for distortions large enough to affect whole-answer evaluation.
5. Apply at most one cap.
6. Export the required final fields.

## Default penalty set
- `P_ControllingDoctrineOmitted` = -15
- `P_WrongPackDriver` = -15
- `P_MaterialRuleMisstatement` = -10
- `P_MaterialFactOrRoleOrTimelineError` = -10
- `P_InventedComplianceFact` = -10
- `P_ExceptionBleedOver` = -10
- `P_IrrelevantDoctrine` = -5
- `P_ExcessiveHedging` = -5
- `P_RelianceByPerformance` = -5
- `P_JurisdictionDrift` = -5
- `P_FalseDefinitenessOnDesignedAmbiguity` = -10 (Lane B only)

## Optional caps
- `CAP_60_ControllingDoctrineOmitted`
- `CAP_60_WrongPackDriver`
- `CAP_70_NoClearConclusion`
- `CAP_75_InventedCoreCompliance`
- `CAP_75_FalseDefinitenessOnDesignedAmbiguity` (Lane B only)

## Final score formula
`FINAL = max(0, min(100, subtotal + penalties))`; then apply the selected cap, if any.

## Required export fields
- `penalties_applied`
- `cap_status`
- `subtotal`
- `post_penalty_score`
- `final_score`
- `zak_review_flag`

## Zak review triggers
- total penalty load greater than 20 points
- two or more major overlays stacking
- any active cap that materially affects the result
- pack fit or controller identification remains unstable
- Lane B cases where good-answer status turns on how the missing fact is characterized

## Implementation note
The v2 workbook now carries this layer directly: `Row_Scoring` computes the subtotal, `Overlay_Scoring` applies penalties and caps, and `Final_Export` mirrors the required fields.
