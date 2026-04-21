# 54 — Dual Rubric Protocol for Original-vs-Variation Evaluation v1

STATUS: ACTIVE PROCEDURE FILE
Canonical for: dual-rubric handling across original-vs-selected-variation evaluation
Do not use patch-history files as runtime instructions when this file already covers the rule.

Companion to:
- `01_CORE_WORKFLOW_TEMPLATE.txt`
- `08_Karthic_Rubric_Build_Spec_v1.md`
- `09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md`
- `50_Karthic_PreFill_Instructions.rtf`

## Purpose
This file adds one procedural rule to the current framework:
when the user selects a question variation, the system must preserve **two separate rubric tracks** rather than treating the varied-question rubric as a mere in-place patch.

Those two tracks are:
1. **Base rubric** — for outputs answering the original legal question.
2. **Selected-variation rubric** — for outputs answering the user-selected varied legal question.

The two rubrics must remain separate throughout Karthic drafting, Dasha evaluation, score storage, and later comparison.

## Why this file exists
The current system already tells Karthic to patch only the selected variation and not to patch unselected menu options. That is correct and should remain true.

What is still missing is a rule that says:
- the original-question rubric must remain preserved as its own evaluative artifact;
- the selected-variation rubric must be emitted as a second, separate evaluative artifact;
- Dasha must run two evaluation lines, one against each rubric-question pair;
- comparison happens only **after** the two lines are scored separately.

This file supplies that missing orchestration rule.

## Core rule
If `selected_lane_code = none`, keep a single-rubric workflow.

If `selected_lane_code != none`, switch to **dual-rubric mode**.
In dual-rubric mode, Karthic must output:
- one rubric for the original question; and
- one separate rubric for the selected variation.

Do not overwrite the original-question rubric with variation edits.
Do not treat the variation rubric as merely a note on top of the original rubric.
Do not collapse both evaluation lines into one combined score.

## Naming rule
Use these exact concepts across downstream files and exports:
- `base_question_text`
- `base_rubric`
- `selected_variation_question_text`
- `selected_variation_rubric`
- `dual_rubric_mode`
- `evaluation_track_original`
- `evaluation_track_selected_variation`

If the user stayed with the original question, then:
- `dual_rubric_mode = off`
- `evaluation_track_original = on`
- `evaluation_track_selected_variation = off`

If the user selected a variation, then:
- `dual_rubric_mode = on`
- `evaluation_track_original = on`
- `evaluation_track_selected_variation = on`

## Karthic build rule
### When `selected_lane_code = none`
Karthic should:
- build only the base rubric;
- return `Rubric patch notes: None`;
- not generate a second rubric.

### When `selected_lane_code` is in Lane A
Karthic should:
- preserve the original-question rubric as `base_rubric`;
- create a second rubric called `selected_variation_rubric`;
- keep doctrinal criteria, module weights, row weights, likely outcome, strongest counterargument, and gate order unchanged unless the packet expressly says otherwise;
- localize only the variable-level fact references created by the selected variation;
- keep both rubrics separately visible in the output.

**Lane A design rule:**
The selected-variation rubric is usually a near-copy of the base rubric with localized fact-reference edits only. But it is still a separate rubric artifact because Dasha must score a different question against it.

### When `selected_lane_code` is in Lane B
Karthic should:
- preserve the base rubric for the original question unchanged as `base_rubric`;
- create a second rubric called `selected_variation_rubric` for the selected variation;
- patch any row that assumed a now-omitted control fact or a fixed definitive outcome;
- strengthen or add missing-fact, bounded-uncertainty, or conditional-branching criteria only where the selected variation requires them;
- never weaken the base rubric merely because the selected variation is ambiguous.

**Lane B design rule:**
The selected-variation rubric may materially differ from the base rubric, but only because the selected variation changed what a good answer must do.
The base rubric remains the scoring instrument for the original question and must not be rewritten to match the variation.

## Rubric-separation rule
In dual-rubric mode:
- the base rubric and the selected-variation rubric must be stored as two distinct rubric objects;
- each rubric must retain its own row set, row wording, and notes;
- each rubric must identify which question it belongs to;
- Karthic must provide a delta log that compares the selected-variation rubric against the base rubric;
- Dasha must never score selected-variation outputs against the base rubric as the official primary score;
- Dasha must never score original-question outputs against the selected-variation rubric as the official primary score.

Cross-scoring may be run later only as an explicitly labeled experimental stress test, never as the default evaluation line.

## Dasha evaluation rule
When dual-rubric mode is on, Dasha must run two separate evaluation tracks.

### Track 1 — Original question track
Inputs:
- `base_question_text`
- outputs generated in response to the original question
- centroids/clusters derived from original-question outputs
- `base_rubric`

Task:
Evaluate how models answer the original legal question under the original rubric.

### Track 2 — Selected variation track
Inputs:
- `selected_variation_question_text`
- outputs generated in response to the selected variation
- centroids/clusters derived from selected-variation outputs
- `selected_variation_rubric`

Task:
Evaluate how models answer the selected variation under the selected-variation rubric.

### Comparison step
Only after both tracks are scored separately may Dasha or later analysis compare:
- score shifts,
- rank shifts,
- cluster-pattern shifts,
- doctrine-path changes,
- false-definiteness increases,
- sensitivity to irrelevant or omitted facts.

## Comparison rule
The purpose of dual-rubric mode is comparative evaluation, not blended scoring.

Therefore:
- keep the two score series separate;
- keep cluster summaries separate unless a later comparison layer explicitly aligns them;
- keep judge notes and disagreement flags track-specific;
- compare performance across tracks only after each track is internally scored and locked.

## Required new packet fields
To support dual-rubric mode, Frank’s packet should add these fields to the locked controller card whenever a variation is selected:

24. `base_question_text`
25. `base_gold_answer`
26. `selected_variation_question_text`
27. `selected_variation_answer_posture: same_as_base / localized_edit / ambiguity_rewrite`
28. `dual_rubric_mode: off / on`
29. `rubric_separation_rule: strict`
30. `evaluation_tracks: original_only / original_and_selected_variation`

### Field interpretation
- `base_question_text` = the original legal question before the selected variation.
- `base_gold_answer` = the benchmark answer tied to the original legal question.
- `selected_variation_question_text` = the exact varied legal question selected for this run.
- `selected_variation_answer_posture` = whether the variation keeps the same answer skeleton or requires ambiguity-aware rewriting.
- `dual_rubric_mode` = whether Karthic and Dasha should operate in paired-rubric mode.
- `rubric_separation_rule` = must be `strict` whenever dual-rubric mode is on.
- `evaluation_tracks` = tells Dasha whether to run one or two evaluation lines.

## Required Karthic output change
When `dual_rubric_mode = on`, Karthic’s deliverable must include both of these subparts inside the variation section:

### F1. Base rubric preservation notes
- confirm the base rubric belongs to `base_question_text`;
- confirm whether the base rubric stayed unchanged;
- identify any base-rubric clarification edits that do **not** alter scoring substance.

### F2. Selected-variation rubric notes
- confirm the selected variation mirrored from Frank's `selected_variation_question_text`;
- identify which rows stayed unchanged from the base rubric;
- identify which rows were localized, expanded, narrowed, or rewritten;
- explain why those changes were necessary for the selected variation.

### F3. Delta summary
- list the exact row-level differences between `base_rubric` and `selected_variation_rubric`;
- mark each difference as `cosmetic`, `localized factual`, `ambiguity-sensitive`, or `doctrinally material`.

If `dual_rubric_mode = off`, Karthic may keep the existing single variation-notes section and write `Rubric patch notes: None` where appropriate.

## Required Dasha output fields
When dual-rubric mode is on, Dasha’s export should include:
- `evaluation_track`
- `question_version`
- `rubric_version`
- `rubric_type: base / selected_variation`
- `score_series_id`
- `comparison_ready: yes / no`

The export should also preserve:
- track-specific centroid IDs,
- track-specific score summaries,
- track-specific disagreement flags,
- track-specific Zak escalation flags.

## What should NOT change
This file does **not** change:
- the doctrine packs;
- the shared module skeleton;
- the cross-pack scoring anchors;
- the rule that unselected menu options must not be patched;
- the rule that Lane A usually preserves doctrine and Lane B may require ambiguity handling.

## Implementation recommendation
Use this file as a new companion file rather than trying to bury the whole protocol inside one existing Karthic file.

Then make small integration edits to:
- `01_CORE_WORKFLOW_TEMPLATE.txt`
- `08_Karthic_Rubric_Build_Spec_v1.md`
- `50_Karthic_PreFill_Instructions.rtf`
- and, when created, any Dasha evaluation instructions file.

That approach keeps the current Karthic logic intact while adding the missing dual-track comparison layer cleanly.
