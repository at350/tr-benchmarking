# 56 - Dasha Evaluation Spec v1

Companion to:
- `54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md`
- `58_Case_Citation_Verification_Protocol_v1.md`
- `09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md`
- Frank's locked controller card
- Karthic's rubric deliverable(s)

## Purpose
This file defines the Dasha function in Part 2 of the framework.

Dasha is the evaluation component. Dasha does not create the benchmark answer, does not build the rubric, and does not replace SME review. Dasha evaluates clustered outputs at scale, usually at the centroid or archetype level, using the validated rubric and the current Frank packet.

This file adds three things that were previously only implied:
1. a stable Dasha-side evaluation sequence;
2. a clear original-vs-variation comparison rule;
3. a case-citation verification pass before final score lock.

## Core role
Dasha should:
- evaluate centroids or archetypes rather than every raw response by default;
- apply the rubric through an LLM-as-a-judge panel or equivalent rubric-aware judging process;
- score rows first, then overlays, then one optional cap;
- preserve track-specific judgments when dual-rubric mode is on;
- compare original-question and selected-variation performance only after both tracks are separately scored and locked;
- escalate ambiguous or split cases to Zak rather than smoothing them over.

Dasha should not:
- rewrite the legal question;
- rewrite the gold answer;
- rewrite Karthic's rubric;
- collapse original and variation scoring into one blended line;
- guess about ambiguous case citations;
- punish case-citation omission by default.

## Judge-panel composition and model-agnostic policy

Dasha's rubric-based judge layer is model-agnostic.

For any evaluation run, the judge may be either:
- a single selected judge model; or
- a multi-model judge panel composed of two or more selected judge models.

The selected judge models may come from different model families.
Judge-panel composition is a run-level configuration, not a fixed property of Dasha.

Dasha must record the exact judge roster used for the run and preserve judge-specific votes before aggregation.

## Inputs Dasha should expect
At minimum, Dasha should receive:
- `current_question_text`
- `selected_lane_code`
- `variation_lane`
- `dual_rubric_mode`
- `evaluation_tracks`
- `base_question_text` when dual-rubric mode is on
- `selected_variation_question_text` when dual-rubric mode is on
- `base_rubric`
- `selected_variation_rubric` when dual-rubric mode is on
- centroid or archetype texts for each active track
- overlay and cap rules
- `case_citation_verification_mode`
- `workflow_source_case_name`
- `workflow_source_case_citation`
- `source_case_monitoring`
- `judge_panel_mode: single_model / multi_model_panel`
- `selected_judge_models`
- `judge_panel_size`
- `judge_panel_homogeneity_status: homogeneous / heterogeneous`
- `judge_aggregation_rule`
- `judge_prompt_version`

If any of these are missing in a way that would distort the evaluation, Dasha should flag the packet for Zak review rather than silently repairing it.

## Default evaluation sequence
### Step 1 - Packet and track audit
Before scoring, Dasha should confirm:
- which question version is being evaluated;
- which rubric belongs to that question version;
- whether the run is single-track or dual-track;
- whether case-citation verification mode is on;
- whether a workflow source case is being monitored;
- which selected judge models are active;
- whether the judge panel is homogeneous or heterogeneous;
- which aggregation rule is being used;
- whether the judge panel is distinct from the evaluated answer-model pool.

### Step 2 - Centroid-level evaluation
Score centroids or archetypes as the primary unit of judgment unless the packet expressly calls for raw-answer drilldown.

### Step 3 - Row scoring
Apply the rubric row by row under Modules 1-4 and compute the weighted subtotal out of 100.

### Step 4 - Case-citation verification pass
If the centroid cites one or more cases and case-citation verification mode is on, run the verification pass before final score lock.

### Step 5 - Overlay and cap layer
After row scoring and case-citation metadata capture, apply overlays and at most one cap.

### Step 6 - Final score lock
Lock the score only after:
- rubric scoring is complete;
- case-citation metadata is recorded;
- overlays and caps are applied;
- ambiguous verification outcomes are either resolved or escalated.

### Step 7 - Comparison layer
If dual-rubric mode is on, compare the original track and the selected-variation track only after both tracks are independently scored and locked.

## Single-track rule
If `dual_rubric_mode = off`:
- evaluate only the active question version;
- use only the rubric tied to that question version;
- do not generate an original-vs-variation comparison section.

## Dual-rubric rule
If `dual_rubric_mode = on`:
- run `evaluation_track_original` and `evaluation_track_selected_variation` separately;
- evaluate original-question outputs only against `base_rubric`;
- evaluate selected-variation outputs only against `selected_variation_rubric`;
- keep score series, centroid summaries, disagreement flags, and Zak escalation flags track-specific;
- compare the two tracks only after both are internally complete.

Do not:
- score original-question outputs against the selected-variation rubric as the official score;
- score selected-variation outputs against the base rubric as the official score;
- merge the two tracks into one combined score.

## What Dasha compares across original and variation
Dasha is always comparing two separately scored evaluation lines:
1. how models performed on the original legal question under the base rubric; and
2. how models performed on the selected variation under the variation-specific rubric.

But what that comparison means changes by lane.

### Lane A - answer-invariant comparison
Lane A is a robustness and invariance test.

Expected packet behavior:
- controlling doctrine stays the same;
- likely outcome stays the same;
- strongest counterargument stays the same;
- gate order stays the same;
- rubric changes are usually only localized factual edits.

Therefore Dasha should compare:
- score shifts;
- rank shifts;
- cluster-pattern stability;
- controller stability;
- outcome stability;
- whether the same reasoning path survived the shell change.

Interpretation rule:
Because Lane A usually preserves the answer skeleton, raw score deltas and rank deltas are normally meaningful direct comparisons.

### Lane B - ambiguity / missing-fact comparison
Lane B is a sensitivity and calibration test.

Expected packet behavior:
- a control fact has been omitted or generalized;
- the selected-variation rubric may materially differ from the base rubric;
- a good answer may now identify the missing fact, state bounded uncertainty, or branch conditionally rather than force a definitive answer.

Therefore Dasha should compare:
- whether the model recognized the omitted control fact;
- whether the model shifted from false definiteness to appropriate conditional reasoning;
- whether bounded uncertainty is specific rather than vague;
- whether conditional branches are legally disciplined;
- whether false definiteness increased;
- whether the doctrine path changed for the right reason.

Interpretation rule:
In Lane B, raw score deltas are not by themselves a clean degradation signal, because the rubric may have changed to reward ambiguity recognition and penalize unjustified certainty. Dasha should interpret score change together with:
- the variation rubric delta;
- the selected-variation answer posture;
- the presence or absence of false definiteness.

## Case Citation Verification Pass
### Purpose
This pass is for visibility and factual checking, not for making case citation mandatory.

### Trigger rule
Before final score lock, inspect each centroid for case citations.

If no case is mentioned:
- record `case_mention_status = none`;
- apply no penalty.

If one or more cases are mentioned:
- run the verification pass;
- record whether the cited case exists;
- record whether the citation is substantially correct;
- record whether the cited case matches the workflow source case used to build the benchmark.

If verification is ambiguous:
- set `case_verification_review_flag = yes`;
- escalate to Zak rather than guessing.

### Suggested Dasha note language
Use one of the following where appropriate:
- `Case mentioned and verified.`
- `Case mentioned; citation informal but substantially identifiable.`
- `Case mentioned; could not be verified.`
- `Response cites the workflow source case used to build this benchmark.`

## Case-citation scoring rule
No penalty for omitting case citations.

Apply a penalty only when authority is hallucinated or materially fabricated.

Default handling:
- real case cited and substantially identifiable -> metadata only;
- real case cited but informal or partly incomplete -> metadata only unless the authority is effectively fabricated;
- hallucinated case cited -> apply `P_HallucinatedCaseCitation`;
- hallucinated case materially drives the conclusion -> consider `CAP_75_HallucinatedCoreAuthority`.

## Required Dasha metadata / export fields
At minimum, Dasha should preserve:
- `evaluation_track`
- `question_version`
- `rubric_type`
- `subtotal`
- `penalties_applied`
- `cap_status`
- `final_score`
- `zak_review_flag`

When case-citation verification mode is on, also preserve:
- `case_mention_status`
- `verified_case_mentions`
- `hallucinated_case_mentions`
- `citation_accuracy_status`
- `source_case_reference_status`
- `source_case_reference_note`
- `case_verification_review_flag`

When dual-rubric mode is on, also preserve:
- track-specific centroid IDs;
- track-specific score summaries;
- track-specific disagreement flags;
- `comparison_ready: yes / no`.

## Recommended comparison outputs
When dual-rubric mode is on, Dasha should return:
- `original_track_summary`
- `selected_variation_track_summary`
- `score_shift_summary`
- `rank_shift_summary`
- `cluster_shift_summary`
- `comparison_interpretation`

Recommended `comparison_interpretation` values:
- `stable_under_lane_A_change`
- `unexpected_lane_A_drop`
- `appropriate_lane_B_adaptation`
- `false_definiteness_under_lane_B`
- `overreaction_to_lane_B`
- `needs_zak_review`

## Zak escalation triggers
Dasha should escalate when:
- judge-panel disagreement is material;
- a centroid is low-confidence, legally unusual, or split-dependent;
- penalties exceed 20 points;
- more than one major cap seems plausible;
- case-citation verification is ambiguous;
- good-answer status in Lane B turns on how the missing fact is characterized.

## What should NOT change
This file does not:
- make case citation mandatory;
- add a doctrinal reward for naming cases by default;
- replace Karthic's rubric;
- replace the dual-rubric protocol;
- replace Zak when authority matching or lane interpretation is ambiguous.

## Bottom line
Use Dasha for scalable, rubric-aware centroid evaluation.
Use dual-rubric mode when a variation is selected.
Treat Lane A as an invariance comparison.
Treat Lane B as an ambiguity-sensitivity comparison.
Run the case-citation verification pass before final score lock.
Escalate uncertainty rather than guessing.
