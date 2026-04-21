# 09 — Cross-Pack Scoring Overlays, Penalties, and Caps v1

Companion to `08_Karthic_Rubric_Build_Spec_v1` and `Karthic_PreFill_Instructions`

## Purpose
This sheet standardizes the answer-level scoring layer that sits after row-level scoring and before final score lock. Use it across Pack 10, Pack 20, Pack 30, and Pack 40 so subtotal-to-final-score conversion stays stable even when the doctrine rows change.

**Design rule:** score rows first, then apply overlays, then apply one optional cap. Do not use penalties as a substitute for row scoring.

## 1. Core scoring sequence
1. Score all rubric rows under Modules 1–4 and compute the weighted subtotal out of 100.
2. Apply cross-pack penalties only for answer-level distortions that materially affect the overall evaluation.
3. Apply at most one cap. If multiple caps appear plausible, use the lowest cap and record the cap conflict in notes.
4. Record every penalty code applied, the cap status, the subtotal, the post-penalty score, and the final capped score.

## 2. Overlay rules
- Overlays are separate from row-level deductions. Use them only when the failure is strong enough to distort the whole answer, not just one row.
- Do not double count. If a problem is fully captured by one material overlay, do not stack a second overlay for the same defect.
- Prefer the earliest material failure. A wrong controller is usually more important than a later weak fallback discussion.
- If total penalties exceed 20 points, or if two major overlays stack, record the answer as a high-review candidate in notes. In the Dasha phase, this does not by itself trigger Zak review.

## 3. Default cross-pack penalties

| Code | Points | Use when | Notes |
|---|---:|---|---|
| `P_ControllingDoctrineOmitted` | -15 | The answer never identifies the likely dispositive doctrine or controlling gate. | Use for a real controller miss, not a minor wording issue. |
| `P_WrongPackDriver` | -15 | The answer is materially driven by a doctrine from the wrong pack. | Examples: treating a Pack 40 problem as generic suretyship, or a Pack 30 problem as ordinary land-writing analysis. |
| `P_MaterialRuleMisstatement` | -10 | The answer states a black-letter rule or test incorrectly in a way that could flip the result. | Examples: wrong one-year test, wrong quantity rule, wrong land-writing trigger. |
| `P_MaterialFactOrRoleOrTimelineError` | -10 | The answer misstates a key fact, timeline, quantity, party role, capacity, or promise direction. | Fold party-role confusion into this overlay when the error is outcome-relevant. |
| `P_InventedComplianceFact` | -10 | The answer invents a writing, signature, quantity term, land description, admission, payment/acceptance, creditor assent, or similar compliance fact. | Use when the invented fact is doing real doctrinal work. |
| `P_ExceptionBleedOver` | -10 | The answer uses one exception or workaround to cure a separate independent barrier. | Classic example: one doctrine is treated as a universal cure. |
| `P_IrrelevantDoctrine` | -5 | The answer relies on an obviously inapplicable doctrine that distracts from the real path. | Do not use for a brief mention of a non-triggered issue that is quickly dismissed. |
| `P_ExcessiveHedging` | -5 | The answer substitutes vague “it depends” language for actual analysis. | Use only when the hedging meaningfully weakens evaluation; do not punish honest, specific uncertainty. |
| `P_RelianceByPerformance` | -5 | The answer treats the requested performance alone as reliance or detriment, without inducement plus concrete detriment. | Most common in estoppel analysis; use only where reliance doctrine is actually in play. |
| `P_JurisdictionDrift` | -5 | The answer imports a jurisdiction-specific rule or requirement without stating the jurisdictional assumption. | Do not use when the answer clearly labels the jurisdiction and scopes the rule correctly. |
| Code | Points | Use when | Notes |
|---|---:|---|---|
| `P_HallucinatedCaseCitation` | -10 | The answer cites a case that cannot be verified as a real case or gives a materially fabricated case citation. | Do not use when the answer simply omits authority. Do not use for an informal but still substantially identifiable real case citation. |

## 4. Optional caps

| Code | Cap | Use when | Notes |
|---|---:|---|---|
| `CAP_60_ControllingDoctrineOmitted` | 60 | Use if the answer misses the most dispositive doctrine or controlling gate. | This is the default controller-miss cap. |
| `CAP_60_WrongPackDriver` | 60 | Use if the answer is fundamentally driven by the wrong doctrine family or pack. | Apply even if some row scores remain partially creditable. |
| `CAP_70_NoClearConclusion` | 70 | Use if the answer mentions key doctrines but never gives a bottom-line outcome. | Do not use when the answer gives a qualified but still usable conclusion. |
| `CAP_75_InventedCoreCompliance` | 75 | Use if the answer’s conclusion materially depends on a hallucinated compliance fact. | Examples: invented signed memo, invented merchant status, invented possession or payment fact. |
| Code | Cap | Use when | Notes |
|---|---:|---|---|
| `CAP_75_HallucinatedCoreAuthority` | 75 | Use if the answer’s conclusion materially depends on a hallucinated case citation. | Use only when the fake authority is doing real doctrinal work rather than appearing in passing. |

**Final score formula:** `FINAL = max(0, min(100, subtotal - penalties))`; then apply the selected cap, if any.

## 5. Lane handling

- Evaluate only against the selected_lane_code reflected in the current Frank packet; do not score against unselected menu options.

### Lane A — answer-invariant variation
- Use the standard overlays above with no extra penalty logic unless the variation packet expressly changes the doctrine path.
- Do not penalize harmless cosmetic drift if the controlling doctrine, likely outcome, and gate order remain stable.

### Lane B — ambiguity / missing-fact variation
- Do not punish an answer merely because it is conditional. Conditional branching can be the correct behavior in Lane B.
- Add `P_FalseDefinitenessOnDesignedAmbiguity = -10` when the packet deliberately omits a control fact and the answer forces an unjustified definitive result.
- Optional cap: `CAP_75_FalseDefinitenessOnDesignedAmbiguity` when the answer ignores the missing fact and that failure distorts the whole evaluation.

#### Dual-track evaluation handling
- If `dual_rubric_mode = on`, evaluate original-question outputs only against `base_rubric` and selected-variation outputs only against `selected_variation_rubric`.
- Do not merge the two score series before comparison.
- Any cross-scoring must be labeled experimental and must not replace the official track score.
- For Dasha-phase automatic SME escalation, 60_Centroid_Composition_Metadata_and_Simple_Zak_Rule_v1.md controls.

## 6. What not to penalize
- Do not penalize a merely concise answer for omitting a non-triggered secondary issue that should have stayed brief.
- Do not penalize metadata placement by itself if the legal path is otherwise clear and extractable.
- Do not use excessive-hedging penalties against specific, bounded uncertainty statements.
- Do not stack an overlay on top of a row-level deduction unless the failure is broad enough to distort the whole answer.
- Do not penalize an answer merely because it cites no case or no authority, unless the packet explicitly requires authority-grounded answering.
- Do not penalize a real case citation that is informal but still substantially identifiable, unless the citation defect is so severe that the authority is effectively fabricated.

## 7. Pack-local extension rule
- Start with the cross-pack overlay set above. Do not add pack-local penalties or caps by default.
- A pack-local overlay may be added only if the failure is recurring, outcome-distorting, legally distinct, and not already captured by a row score or existing overlay.
- Any new pack-local overlay or cap must be documented in the pack file and reviewed by Zak before routine use.

## 8. Required export fields

| Field | Allowed values / notes |
|---|---|
| `penalties_applied` | Multi-select list of `P_` codes; blank if none. |
| `cap_status` | Single-select: `No cap` \| one `CAP_` code. |
| `subtotal` | Weighted score before overlays. |
| `post_penalty_score` | Subtotal minus penalties, bounded to 0–100. |
| `final_score` | Post-penalty score after cap. |
| `zak_review_flag` | Yes / No. In the Dasha phase, use Yes only when no centroid receives a strict majority of first-place panel votes for the active track, as defined in 60_Centroid_Composition_Metadata_and_Simple_Zak_Rule_v1.md. |

### 8A. Conditional case-citation export fields
Include these only when `case_citation_verification_mode = on`.

| Field | Allowed values / notes |
|---|---|
| `case_mention_status` | `none` \| `mentioned` |
| `verified_case_mentions` | List of cited cases verified as real; blank if none. |
| `hallucinated_case_mentions` | List of cited cases not verified; blank if none. |
| `citation_accuracy_status` | `not_applicable` \| `verified_correct` \| `verified_partly_correct` \| `hallucinated_or_unverifiable` |
| `source_case_reference_status` | `not_applicable` \| `source_case_cited` \| `other_case_only` \| `source_case_and_other_cases` |
| `source_case_reference_note` | Short note when the response cites the workflow source case or appears to rely on it. |
| `case_verification_review_flag` | Yes / No. Use Yes when case verification is ambiguous or partial. This flag records follow-up status only and does not itself trigger Zak review. |

## 9. Zak review note
During the Dasha phase, this file does not create independent SME-escalation triggers.
For Dasha-phase automatic escalation, 60_Centroid_Composition_Metadata_and_Simple_Zak_Rule_v1.md controls.
Use Zak only when no centroid receives a strict majority of first-place panel votes for an active track.
Penalty totals, cap uncertainty, Lane B ambiguity, and case-verification ambiguity may be recorded in notes, but they do not by themselves trigger Zak review during the Dasha phase.

**Implementation note:** this sheet is meant to sit on top of the modular rubric and the prefill audit. It should make Karthic’s draft rubrics easier to score consistently before Zak makes final SME adjustments.
