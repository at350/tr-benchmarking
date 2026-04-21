# 61 - Zak SME Review Spec v1

STATUS: ACTIVE HUMAN-READABLE CANON
Thin executor prompt: 62_Zak_SME_Review_Instructions_v1.txt
If 62 is shorter or less specific than this file, this file controls.

Companion to:
- `56_Dasha_Evaluation_Spec_v2.md`
- `57_Dasha_Evaluator_Instructions_v2.txt`
- `60_Centroid_Composition_Metadata_and_Simple_Zak_Rule_v1.md`
- `54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md`
- `03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt`
- Karthic's rubric deliverable(s)
- Dasha's centroid evaluations and track summaries

## Purpose
This file defines the Zak function in Part 3 of the framework.

Zak is the SME-review backstop. Zak does not replace Frank, Karthic, or Dasha. Zak exists to turn a disputed Dasha result into a clean, track-specific human-review packet and to capture the SME's final decision in a structured way.

The main design goal is simple:
- keep Zak narrow;
- send only the disputed leading centroid or centroids;
- package the active rubric and the disputed centroid materials for manual review;
- make the SME task easy to complete on screen or as a printable packet.

## Core role
Zak should:
- activate only when an ACTIVE file or Dasha output explicitly flags SME review;
- default to reviewing only the disputed leading centroid or centroids for the active track;
- surface the active question version, active rubric, disputed centroid texts, vote split, score summaries, and relevant review notes;
- provide a printable and downloadable SME packet;
- provide a structured scoring sheet tied to Karthic's rubric;
- capture the SME's final decision, confidence, and any rubric-instability notes;
- keep original-question and selected-variation tracks separate when dual-rubric mode is on.

Zak should not:
- auto-escalate outside the current Dasha rule;
- review every centroid by default;
- rewrite Frank's question;
- rewrite Karthic's rubric;
- treat centroid model share as a scoring input;
- treat case-citation ambiguity alone as dispositive;
- merge original and variation tracks into one blended review;
- invent new doctrine, facts, writings, signatures, party roles, or jurisdiction-specific rules.

## Trigger rule
Zak should normally be used only when Dasha has already set:
- `best_centroid_zak_review_flag = yes`
- `panel_majority_status = no_majority`

This follows the simplified Dasha rule already defined elsewhere.

Zak may also be used when an ACTIVE file explicitly requests SME review for a packet-level reason, but that should be recorded as a manual invocation rather than an automatic Dasha trigger.

## Inputs Zak should expect
At minimum, Zak should receive:
- `evaluation_track`
- `question_version`
- `rubric_type`
- `dual_rubric_mode`
- `selected_lane_code`
- `current_question_text` for the active track
- `base_question_text` when relevant
- `selected_variation_question_text` when relevant
- the active rubric artifact for the active track
- `disputed_centroid_ids`
- full `disputed_centroid_texts`
- Dasha row-scoring summaries for each disputed centroid
- `subtotal`, `penalties_applied`, `cap_status`, and `final_score` for each disputed centroid
- `top_centroid_vote_split`
- `judge_model_roster`
- `judge_panel_mode`
- `judge_aggregation_rule`
- `cluster_size_total`
- `model_breakdown`
- `represented_model_count`
- `dominant_model_name`
- `dominant_model_share`
- case-citation verification metadata for each disputed centroid
- Karthic's escalation notes for Zak, if any
- workflow source-case monitoring fields, if active

If the active rubric or disputed centroid texts are missing, Zak should mark the packet as not ready for SME review rather than silently proceeding.

## Two operating modes
Zak should support two narrow operating modes.

### Mode 1 - SME packet assembly
Use when the SME has not yet scored the disputed centroid set.

Goal:
- prepare the review packet;
- display the disputed centroid materials;
- show the rubric in SME-usable form;
- provide a printable and downloadable score sheet.

In this mode, Zak should not pretend that the final human decision has already been made.

### Mode 2 - SME decision recording
Use when the SME has already entered scores or a final best-centroid choice.

Goal:
- preserve the SME's row-level scores or comparative notes;
- compute any score summaries if needed;
- record the selected best centroid, tie, or no-adequate-centroid outcome;
- record confidence and any notes about rubric instability or packet revision needs.

## Default review sequence
### Step 1 - Packet / escalation audit
Before building the review packet, confirm:
- the active track;
- the active question version;
- the active rubric type;
- whether dual-rubric mode is on;
- whether Zak was triggered automatically or manually;
- the top-centroid vote split;
- the disputed centroid IDs;
- whether the printable packet can be assembled from the available materials.

### Step 2 - Build the SME review packet
Prepare one packet for the active track only.
The packet should include:
- the active legal question;
- the active rubric;
- the disputed centroid texts;
- Dasha score summaries;
- the judge vote split;
- centroid-composition metadata;
- case-citation notes;
- any Karthic escalation notes relevant to doctrine boundaries, row overlap, or weighting.

### Step 3 - Present the disputed centroids side by side
The SME should be able to compare the disputed centroid set without flipping between multiple disconnected screens.

For each disputed centroid, show:
- centroid ID;
- centroid text;
- Dasha row-scoring summary;
- subtotal and final score;
- penalties and cap status;
- cluster size and model breakdown;
- case-citation verification note.

### Step 4 - Attach the scoring sheet
The scoring sheet should mirror the active rubric.
It should allow the SME to:
- score each disputed centroid against the active scored rows;
- add short notes on the row or rows driving the decision;
- indicate whether the disagreement is really about the answers, the rubric, or missing packet context.

### Step 5 - Capture the final SME decision
Zak should capture one of these outcomes:
- one centroid selected as best;
- tie remains after SME review;
- no centroid is adequate;
- packet should be sent back for rubric revision;
- packet should be sent back for earlier-stage review.

### Step 6 - Finalize the Zak disposition
Once the SME decision exists, Zak should produce a short structured summary that says:
- what was reviewed;
- what the SME selected;
- why;
- how confident the SME was;
- whether the packet is now ready for score lock or needs upstream revision.

## SME review packet rules
Zak should make the packet easy for a busy SME to use.

### Default on-screen layout
The on-screen review should prioritize:
- the active question and track;
- the active rubric in concise review form;
- side-by-side disputed centroid cards;
- a compact score-entry area;
- a final decision box.

### Download and print rule
Zak should support at least one combined export called:
- `Download SME packet`

That combined packet should contain:
- the active question text;
- the active rubric;
- the disputed centroid texts;
- Dasha score summaries and vote split;
- centroid-composition metadata;
- case-citation notes;
- a printable score sheet.

Optional secondary exports may include:
- `Download rubric only`
- `Download centroid packet only`

But the combined SME packet should be the primary export because it reduces manual cross-referencing.

### Print-friendly rule
If only one Zak UI feature is implemented first, implement the printable combined SME packet before building more complex interactive review flows.

That is the fastest path to real SME usability.

## Rubric display rule
The SME should see the active rubric in a review-friendly way.

Use two levels:
1. a concise on-screen rubric summary with row labels and short purposes;
2. the full row-card detail inside the combined packet or an expandable view.

This prevents the screen from becoming too dense while still preserving the full scoring logic.

## What Zak should emphasize and what it should not
Zak should emphasize:
- the active question version;
- the active rubric;
- the disputed centroid texts;
- the rows that drove disagreement;
- the judge vote split;
- the final decision to be made by the SME.

Zak should not overemphasize:
- model share inside a centroid;
- penalty totals by themselves;
- case-citation ambiguity by itself;
- any metadata that is descriptive rather than evaluative.

Centroid-composition metadata is explanatory only.
It helps the SME understand what a centroid represents, but it is not itself a reason to prefer one centroid.

## Dual-rubric and lane rules
### Dual-rubric mode
If `dual_rubric_mode = on`, Zak must remain track-specific.

For the original track:
- use only `base_question_text` and `base_rubric`.

For the selected-variation track:
- use only `selected_variation_question_text` and `selected_variation_rubric`.

Do not merge the two tracks into one Zak packet.
Do not ask the SME to score a variation centroid against the base rubric as the official review instrument.

### Lane A
Lane A usually preserves the answer skeleton.
Zak should therefore frame the SME task mainly as:
- deciding which disputed centroid better preserves the same controlling reasoning path.

### Lane B
Lane B is ambiguity-sensitive.
Zak should therefore frame the SME task mainly as:
- deciding which disputed centroid better handles the omitted control fact, bounded uncertainty, or conditional branching.

In Lane B, a more conditional answer may be better, not worse.

## Required Zak metadata / export fields
Zak should preserve at minimum:
- `zak_invocation_mode: automatic_dasha / manual`
- `evaluation_track`
- `question_version`
- `rubric_type`
- `dual_rubric_mode`
- `selected_lane_code`
- `disputed_centroid_ids`
- `top_centroid_vote_split`
- `judge_model_roster`
- `judge_panel_mode`
- `judge_aggregation_rule`
- `sme_packet_status: ready / not_ready`
- `sme_packet_exports_available`
- `sme_decision_status: pending / completed`
- `sme_selected_best_centroid: none / [centroid_id] / tie / no_adequate_centroid`
- `sme_confidence: high / medium / low / not_provided`
- `rubric_revision_flag: no / yes`
- `upstream_revision_target: none / Frank / Karthic / Dasha`

## Required final Zak outputs
Zak should return these sections.

### A. Packet / escalation audit
Identify the active track, question version, rubric type, trigger source, and whether the packet is review-ready.

### B. SME review packet
List the active question, the active rubric artifact, and the disputed centroid set with the key Dasha and metadata fields.

### C. SME scoring sheet
Show the rubric-aligned score sheet for the disputed centroid set.
If no SME scores exist yet, keep this as a blank review form.

### D. SME decision record
Capture the selected centroid, tie, or no-adequate-centroid outcome, plus confidence and short reasons.

### E. Final Zak disposition
State whether the packet is ready for score lock, should be sent back for rubric revision, or should be sent back for earlier-stage review.

## Bottom line
Zak should be the narrowest and most human-friendly stage in the pipeline.
It should not add new judging logic.
It should package the disputed centroid decision cleanly for SMEs, make the rubric easy to use, and record the final human decision without collapsing tracks or re-scoring the whole run.
