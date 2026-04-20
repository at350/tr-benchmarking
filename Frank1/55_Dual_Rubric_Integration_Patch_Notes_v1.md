# 55 — Integration Patch Notes for Dual Rubric Protocol v1

## Recommendation
Create **one new companion file** and make **small edits** to existing files.

Do **not** try to solve this only by editing the existing Lane A / Lane B patch language inside Karthic.
The current Karthic files already handle selected-variation patching. What they do **not** yet do is preserve the original rubric and selected-variation rubric as two separate downstream scoring instruments.

That is why the cleanest structure is:
- **new file:** `54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md`
- **small edits:** `01`, `08`, `50`, and later Dasha instructions

## Why this structure is best
### What already exists
The current framework already does all of the following correctly:
- Frank carries `selected_lane_code`, `variation_lane`, and `rubric_patch_scope` in the locked controller card.
- Karthic is already told to patch only the selected variation.
- Lane A already preserves doctrine and usually changes only localized fact references.
- Lane B already allows missing-fact / bounded-uncertainty handling.

### What is missing
What is missing is a clear statement that:
- the base rubric must still exist after a variation is selected;
- the selected-variation rubric must be emitted as a separate artifact;
- Dasha must score original outputs against the base rubric and varied outputs against the selected-variation rubric;
- only then should the framework compare whether model performance changed.

That is a new orchestration rule, not just a Karthic drafting detail.

## Exact edits to make

### 1. Edit `01_CORE_WORKFLOW_TEMPLATE.txt`
Inside **Step 2A — Locked Controller Card**, add these fields after current item 23:

24. `base_question_text`
25. `base_gold_answer`
26. `selected_variation_question_text`
27. `selected_variation_answer_posture: same_as_base / localized_edit / ambiguity_rewrite`
28. `dual_rubric_mode: off / on`
29. `rubric_separation_rule: strict`
30. `evaluation_tracks: original_only / original_and_selected_variation`

Add these rules under Step 2A:
- If `selected_lane_code = none`, set `dual_rubric_mode = off` and `evaluation_tracks = original_only`.
- If `selected_lane_code != none`, set `dual_rubric_mode = on` and `evaluation_tracks = original_and_selected_variation`.
- In dual-rubric mode, `current_question_text` may remain the live selected-variation question, but `base_question_text` and `base_gold_answer` must still be preserved for Karthic and Dasha.
- `rubric_patch_scope` must still mirror only the selected variation, but downstream evaluation must preserve both rubric artifacts separately.

### 2. Edit `08_Karthic_Rubric_Build_Spec_v1.md`
In **Step 9 — Add variation notes**, add this rule before the lane-specific bullets:
- If `dual_rubric_mode = on`, Karthic must output both a `base_rubric` and a `selected_variation_rubric`. The selected-variation rubric is not an in-place overwrite of the base rubric.

Then add these bullets:
- preserve the original-question rubric as a separate base artifact;
- build the selected-variation rubric as a second artifact tied only to the selected variation;
- in Lane A, the selected-variation rubric will usually differ only in localized fact references;
- in Lane B, the selected-variation rubric may revise rows that assumed an omitted control fact or a fixed outcome;
- output a delta log comparing the selected-variation rubric against the base rubric.

In **Required final deliverable from Karthic**, revise section F from a single patch-notes section to:
- `F. Dual-rubric / variation notes`
  - `F1. Base rubric preservation notes`
  - `F2. Selected-variation rubric notes`
  - `F3. Delta summary`

### 3. Edit `50_Karthic_PreFill_Instructions.rtf`
Replace the current section F instructions with:
- if `dual_rubric_mode = off`, keep single-rubric variation notes;
- if `dual_rubric_mode = on`, return:
  - `F1. Base rubric preservation notes`
  - `F2. Selected-variation rubric notes`
  - `F3. Delta summary`

Add output requirements:
- confirm that the base rubric remains tied to the original question;
- confirm that the selected-variation rubric remains tied only to the selected variation;
- confirm that no unselected menu option was patched;
- state whether the selected-variation rubric differs cosmetically, locally, ambiguity-sensitively, or doctrinally from the base rubric.

### 4. Edit `09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md`
Do not change the penalty logic much.
Just add a short subsection after Lane handling:

#### Dual-track evaluation handling
- If `dual_rubric_mode = on`, evaluate original-question outputs only against `base_rubric` and selected-variation outputs only against `selected_variation_rubric`.
- Do not merge the two score series before comparison.
- Any cross-scoring must be labeled experimental and must not replace the official track score.

### 5. Future Dasha file
When you create a Dasha-specific instruction file, include this as a core rule:
- Dasha runs `evaluation_track_original` and `evaluation_track_selected_variation` separately whenever `dual_rubric_mode = on`.
- Dasha compares results only after both tracks are scored independently.

## Short answer to your structure question
Use **both**:
- a **new file** for the dual-rubric protocol; and
- **small edits** to the current Karthic / workflow files.

That is much cleaner than trying to hide this whole behavior inside the existing Lane patch language.
