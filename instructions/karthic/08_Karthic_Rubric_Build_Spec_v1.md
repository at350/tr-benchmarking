# Karthic Rubric Build Spec v1

Shared non-substantive guardrails live in CORE_GUARDRAILS.md. This file adds rubric-build-specific rules only.

STATUS: ACTIVE HUMAN-READABLE CANON
Thin executor prompt: 50_Karthic_PreFill_Instructions.rtf
If 50 is shorter or less specific than this file, this file controls.

## Purpose
This file is the first reusable bridge between the benchmark packet and any case-specific rubric. It tells Karthic how to turn a prefilled benchmark packet into a modular, weighted, legally grounded rubric that can be used for centroid review, LLM-as-a-judge scoring, and SME validation.

Use this file with:
- `Karthic_PreFill_Instructions.rtf`
- `07_SHARED_MODULE_SKELETON.txt`
- `03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt`
- the selected doctrine pack
- the selected failure bank
- the gold / model answer
- clustered centroids or archetypes

This file is structural only. It does not supply black-letter law. Doctrine stays in the pack and source files.

## Why this file exists
The prefill instructions already say what Karthic receives and what sections he must return. What is still missing is a stable human-facing operating spec that answers:
- what gets locked before rubric drafting begins,
- how rows are created from the packet,
- how modules are populated,
- how weighting should work,
- how centroid-derived criteria should be added,
- how failure labels should be mapped,
- and what must be escalated to Zak.

This file fills that gap.

## Scope
Use this file across the current writing-based doctrine packs:
- Pack 10 — Common-law oral promises
- Pack 20 — Land contracts
- Pack 30 — Executor / administrator personal promise
- Pack 40 — Sale of goods under UCC section 2-201

Do not use a case-specific rubric as the global default. Hyper-specific rubrics may be mined for row mechanics, labels, and scoring style, but not for cross-pack doctrine content.

## Core rule
Karthic is not creating a free-form grading sheet. He is creating a modular scoring instrument from:
1. the gold answer,
2. the selected doctrine pack,
3. the failure bank,
4. the clustered centroids,
while preserving comparability across runs and avoiding double-counting.

## Fixed architecture
Keep these parent modules exactly:
- Module 0 — Metadata tags (not scored)
- Module 1 — Structural gatekeeping
- Module 2 — Primary doctrine gates
- Module 3 — Fallback doctrines and defenses
- Module 4 — Cross-cutting answer discipline

Do not rename these modules.
Do not merge metadata into scored rows.
Do not move fallback analysis ahead of the main gates.
If extra detail is needed, add it inside an existing module.

## What is fixed before drafting
Before Karthic writes a single row, he must lock these packet items as fixed unless expressly marked uncertain:
- selected_pack
- doctrine_family
- jurisdiction_assumption
- benchmark_posture
- current_question_text
- gold_answer
- likely_controlling_doctrine
- correct_trigger_test
- trigger_facts
- non_triggered_sibling_gates
- required_gate_order
- writing_status
- strongest_counterargument
- allowed_fallbacks
- fallback_limits
- omitted_control_fact
- output_shell
- doctrine_guide_or_pack
- failure_bank
- variation_lane
- human_weight_overrides, if any
- selected_lane_code
- variation_menu_options
- selected_variation_summary
- selected_variation_fact_deltas
- rubric_patch_scope

If one of these is missing, contradictory, or unstable, Karthic should flag it instead of silently guessing.

## What Karthic is allowed to infer
Karthic may infer the following from the centroids and failure patterns:
- exact row wording
- whether a broad row should be split into sub-rows
- examples of strong versus weak answers
- row-level calibration examples
- pack-local weight adjustments
- proposed new failure labels where the current bank is not enough

He may not infer new facts, new writings, new jurisdiction rules, or a different controlling doctrine unless the packet itself supports a genuine ambiguity and he flags it.

## Default build sequence
Karthic should follow this order every time.

### Step 1 — Prefill audit
List all prefilled fields received.
Mark each one as:
- Fixed
- Fixed but jurisdiction-sensitive
- Needs human confirmation

This step prevents hidden drift later.

### Step 1A — Packet validation
Before row drafting begins, confirm:
- the rubric is being built against the current Frank packet only;
- current_question_text, likely_controlling_doctrine, correct_trigger_test, and trigger_facts are mutually consistent;
- Lane B omission logic is active only if omitted_control_fact is not none;
- no proposed row merely restates a shell label without case-specific controller and trigger content.
- if Frank presented a variation menu, exactly one selected_lane_code is marked as adopted for this run;
- current_question_text matches the selected option, not the full menu;
- no row or patch is drafted for an unselected option;
- variation_lane and selected_lane_code are coherent;
- if selected_lane_code is B1 or B2, omitted_control_fact is not none.

If any of these checks fail, flag the packet for human review instead of silently proceeding.

### Step 2 — Lock the doctrinal path
Before building rows, Karthic should write down:
- the likely controlling doctrine,
- the required gate order,
- the benchmark posture,
- and the strongest expected counterargument.

If he cannot do that in one short paragraph, the packet is not ready for stable rubric drafting.

### Step 3 — Instantiate the module shell
Populate the five parent modules first.
Do not start by writing doctrine rows at random.
Module structure comes first, row content second.

### Step 4 — Draft coarse rows
Write the first-pass rows inside the fixed modules.
At this stage, rows may still be broad.
The goal is coverage of the legally meaningful path, not perfect granularity.

### Step 4A — Build a row card for every scored row
For every scored row, Karthic must create a fully populated row card, not just a label plus anchor notes.

Each row card must include:
- row code
- row label
- module
- weight
- description
- NA guidance
- golden target summary
- golden contains
- allowed omissions
- contradiction flags
- comparison guidance
- 0 / 1 / 2 / 3 / 4 scoring anchors
- primary failure labels
- row status: anchor / provisional

Row-card content rules:
- `golden target summary` must be row-specific and evaluative, not a restatement of the row label.
- `golden contains` must list 2 to 5 concrete, observable answer features.
- `allowed omissions` must say what may be left unstated without material penalty. If none, write exactly: `None beyond ordinary concision.`
- `contradiction flags` must list the clearest answer moves that materially conflict with the row. If none are distinctive, write exactly: `No row-specific contradiction beyond the 0-1 anchors.`
- `comparison guidance` must say what the evaluator should compare against for this row.
- Do not leave `allowed omissions`, `contradiction flags`, or `comparison guidance` blank in the final rubric artifact.
- Do not use formulaic placeholder text such as `Assess whether the answer correctly handles [row label]` or `The answer should directly address [row label]` as final row-card language.

### Step 5 — Decompose broad rows
Split rows only when the split improves legal discrimination.
Good reasons to split a row:
- the row combines two distinct doctrinal gates,
- the row combines a controlling issue and a secondary issue,
- the row merges trigger analysis with exception analysis,
- the row is so broad that two materially different answer types would receive the same score.

### Step 6 — Prune and de-duplicate
Reject or merge rows that are:
- stylistic rather than legal,
- duplicative of an existing row,
- strongly correlated with no added interpretive value,
- or better handled as a failure-label modifier instead of a scored row.

### Step 6A — Overlap audit / anti-double-count check
Before weights are finalized, Karthic must run an overlap audit across all scored rows.

For any two rows that touch the same doctrine cluster, record:
- which row is earlier-gate or controlling
- which row is narrower or secondary
- why the later row is not merely re-scoring the same legal mistake

Required rule:
- The same underlying legal error should not be scored twice unless the rubric explicitly states why the two rows are observing different answer behaviors.
- If two rows remain close in doctrine space, add a distinctness note in the later row using this format:
  `Distinct from row [X]: [one-sentence reason].`

If Karthic cannot state a clean distinctness reason, he should merge the rows, lower one row's weight, or move the extra signal into failure-label mapping rather than keep both rows scored at full force.

### Step 7 — Assign weights
Apply module weights first.
Then assign row weights within each module.
Weight legal importance, not prose length.

### Step 8 — Map failure labels
Each scored row should map to existing failure-bank labels where possible.
New labels should be proposed only when the current bank cannot cleanly capture a recurring, legally distinct error.

### Step 9 — Add variation notes
Patch only the user-selected variation reflected in current_question_text and selected_lane_code.

Do not generate patch notes for unselected menu options.
Do not treat a menu as if every listed variation has been adopted.

- If dual_rubric_mode = on, Karthic must output both a base_rubric and a selected_variation_rubric.
- The selected_variation_rubric is not an in-place overwrite of the base_rubric.
- The base_rubric remains tied to the original legal question.
- The selected_variation_rubric remains tied only to the user-selected variation.
- In Lane A, the selected_variation_rubric will usually differ only in localized fact references.
- In Lane B, the selected_variation_rubric may revise rows that assumed an omitted control fact or a fixed outcome.
- Karthic must output a delta log comparing the selected_variation_rubric against the base_rubric.

For selected_lane_code A1 or A3:
- preserve the same controller, likely outcome, strongest counterargument, gate order, doctrinal criteria, and weights
- patch only localized names, labels, or fact-specific phrases
- if no patch is needed, record: Rubric patch notes: None

For selected_lane_code A2 or A4:
- preserve doctrinal criteria unless the selected variation truly changes what the rubric must observe
- patch only the localized fact references created by the selected variation

For selected_lane_code B1 or B2:
- patch rows that assumed the omitted control fact or a fixed outcome
- add a bounded-uncertainty / missing-fact row only if the current rubric does not already capture that behavior

Karthic must mirror selected_lane_code exactly in all downstream outputs.

### Step 10 — Escalate to Zak
Anything that could materially change outcome ranking, score caps, or doctrine boundaries should be flagged for SME review before lock.

## Module-by-module drafting rules

### Module 0 — Metadata tags (not scored)
Use Module 0 for routing and benchmarking only.

Required tags:
- bottom-line outcome
- outcome correctness
- reasoning alignment
- jurisdiction assumption
- controlling doctrine named by model

Conditional tags when `case_citation_verification_mode = on`:
- `case_mention_status`
- `citation_accuracy_status`
- `source_case_reference_status`

Optional tags:
- `verified_case_mentions`
- `hallucinated_case_mentions`
- `source_case_reference_note`
- `case_verification_review_flag`
- controller-fit check
- benchmark posture check
- source-grounded versus generalized tag
- cluster confidence / escalation flag
- `cited_case_count_total`
- `verified_case_count`
- `hallucinated_case_count`
- `case_existence_summary`

Rules:
Do not score Module 0.
Do not place doctrinal penalties here.
If `case_citation_verification_mode = on`, Karthic must include these case-citation fields in Module 0 but must not create a scored row merely for mentioning a case.

### Module 1 — Structural gatekeeping
This module asks whether the answer follows the right legal path.
Typical row families:
- identifies the controlling issue early,
- follows the required gate order,
- keeps independent barriers separate,
- avoids fallback-first analysis,
- gives a clear bottom line tied to the controlling doctrine,
- states bounded uncertainty specifically.

This module should stay relatively shared across packs.
It is about path discipline, not pack-specific doctrine.

### Module 2 — Primary doctrine gates
This is the main doctrinal module.
Rows here should come from:
- the controlling trigger,
- the must-separate subissues,
- threshold role distinctions,
- direct compliance requirements,
- and only the most important secondary gate(s).

This is where pack-specific substance belongs.
Module 2 should usually carry the largest total weight.

### Module 3 — Fallback doctrines and defenses
This module scores what happens after the main gates.
Rows here should ask:
- whether fallback theories appear only after the main gates,
- whether each substitute or exception is mapped to the barrier it can actually cure,
- whether reliance / causation rigor is analyzed where relevant,
- whether secondary defenses stay secondary unless the source makes them central.

Do not let this module swallow Module 2.
If an answer leads with equity, that is mainly a Module 1 problem, not a reason to inflate Module 3.

### Module 4 — Cross-cutting answer discipline
This module should stay lean.
Typical rows:
- factual fidelity,
- internal consistency,
- scope calibration,
- relevance / prompt adherence.

Do not turn Module 4 into a writing-quality bucket.
No scoring for elegance, polish, or comprehensiveness by itself.

## Row design rules
For every scored row, Karthic should define:
- row code,
- row label,
- one-sentence purpose,
- what earns 0 / 1 / 2 / 3 / 4,
- what failure mode the row is meant to catch,
- whether the row is controlling, secondary, or fallback.

### Row-level anchors
Use these anchors by default:
- 0 = absent or materially wrong; would mislead the outcome
- 1 = mentioned but incorrect or superficial
- 2 = partly correct but missing a key element, exception, or application step
- 3 = mostly correct; minor gaps but still usable
- 4 = strong; correct rule, prioritized path, fact-specific application, and key counterpoints addressed

## Weighting rules
### Module defaults
Start from:
- Module 1 — 28
- Module 2 — 40
- Module 3 — 19
- Module 4 — 13

Do not change module weights unless the packet gives a real reason.
If the controlling doctrine is unusually dominant, Module 2 may grow.
If the benchmark is ambiguity-sensitive, Module 1 may grow modestly to reflect bounded-uncertainty and path-discipline demands.
Any change must be justified in one short note.

### Row-weight rules inside modules
Use these rules unless the packet supports a different distribution:
1. The controlling row in Module 2 should usually be the heaviest row in the rubric.
2. No two rows should separately score the same doctrinal mistake unless one is a true sub-issue split and the overlap is documented.
3. Module 4 rows should stay relatively light.
4. Secondary gates should not outweigh the controller.
5. Fallback rows should not collectively outweigh the main doctrinal gate unless the source itself makes fallback doctrine central.

### Anchor rows versus emergent rows
Every row should be tagged internally as one of the following:
- Anchor row: directly supported by the gold answer, doctrine pack, or failure bank.
- Emergent row: created from recurring centroid differences.

Anchor rows may receive ordinary weight immediately.
Emergent rows should begin as provisional until validated.

### Provisional-weight rule for emergent rows
A centroid-derived row may be added before SME review, but:
- it should begin with modest weight,
- it should not exceed half the weight of the largest anchor row in that module without Zak’s signoff,
- and it should be removed or merged if later centroid review shows that it is redundant or unstable.

## Failure-label mapping rules
1. Map each scored row to the existing failure bank wherever possible.
2. Prefer earliest-gate labels over later-gate labels.
3. Do not assign several labels for the same underlying defect unless one is primary and the others are true modifiers.
4. Use proposed new labels only for recurring, legally distinct centroid behavior not captured by the current bank.
5. Keep labels export-friendly and cluster-friendly.

## Centroid-derived signal rules
Centroid comparison should not automatically create new scored rows.
A new criterion should become a scored row only if it is:
- legally meaningful,
- discriminative across centroids,
- non-redundant with existing rows,
- and likely to recur.
- recurring case-citation behavior is usually a **metadata signal**, not a scored doctrinal row, unless the packet expressly requires authority-grounded answers.
- hallucinated case citations should normally be handled through the overlay layer rather than through an ordinary doctrinal row.

If a centroid-derived pattern is real but too narrow for a scored row, keep it as:
- a failure-label modifier,
- a reviewer note,
- or a Zak escalation item.

Good reasons to create a new row from centroids:
- recurring wrong controller with otherwise plausible reasoning,
- repeated collapse of two distinct doctrinal gates,
- recurring misuse of a legally decisive threshold fact,
- recurring Lane B failure to recognize missing-fact uncertainty.

Bad reasons:
- one odd phrasing style,
- verbosity or polish differences,
- a one-off factual hallucination already captured by factual-fidelity scoring,
- a narrow error already fully captured by an existing row and failure label.

## Lane rules

### selected_lane_code = none
For the base question:
- preserve the base rubric with no variation-specific doctrinal changes
- do not patch against menu options that were presented but not selected
- patch scope should remain: base rubric only

### selected_lane_code = A1 or A3
For cosmetic answer-invariant variations:
- preserve the same controlling doctrine
- preserve the same likely outcome
- preserve the same strongest counterargument
- preserve the same gate order
- preserve doctrinal criteria, weights, and row structure
- apply only localized cosmetic patching to names, labels, or fact-specific phrases
- if no patch is needed, record: Rubric patch notes: None

### selected_lane_code = A2 or A4
For light but still answer-invariant variations:
- preserve the same controlling doctrine unless the packet expressly says otherwise
- preserve the same likely outcome, strongest counterargument, and gate order unless the packet expressly says otherwise
- preserve doctrinal criteria and weights unless the selected variation truly changes what the rubric must observe
- patch only the localized fact references created by the selected variation

### selected_lane_code = B1 or B2
For ambiguity / missing-fact variations:
- allow rows about missing facts, conditional branching, and bounded uncertainty to become more prominent only when omitted_control_fact is not none
- patch any row that assumed the omitted control fact or a fixed outcome
- add a bounded-uncertainty / missing-fact row only if the current rubric does not already capture that behavior
- do not require false definiteness

### Cross-lane consistency rules
- Karthic must mirror Frank’s selected_lane_code exactly in all downstream outputs
- do not generate rubric patches for unselected menu options
- do not treat a variation menu as if every listed option has been adopted
- variation_lane must remain consistent with selected_lane_code:
  - A1 / A2 / A3 / A4 -> A
  - B1 / B2 -> B
  - none -> none

## Zak escalation triggers
Flag for Zak whenever any of the following is true:
- the controlling doctrine is genuinely debatable,
- a proposed weight change would materially alter ranking,
- a new centroid-derived row touches the controller,
- a new row duplicates an existing row but the duplication cannot be cleanly resolved,
- a doctrine boundary between packs is unstable,
- a jurisdiction-specific limit might change the rubric,
- or Lane B ambiguity handling changes what counts as a good answer.
- the case-verification pass is ambiguous;
- a cited authority may be real but the citation details are materially unstable;
- the centroid appears to cite the workflow source case and memorization risk needs SME review.

## Required final deliverable from Karthic
Every finished rubric draft should be returned in these sections:

A. Prefill audit
B. Rubric skeleton
C. Row-level scoring design
D. Failure-label mapping
E. Decomposition / pruning log
F. Dual-rubric / variation notes
  F1. Base rubric preservation notes
  F2. Selected-variation rubric notes
  F3. Delta summary
G. Escalation notes for Zak

Section C must include the full row card for every scored row using the fields required in Step 4A.
Section E must include any distinctness notes created under Step 6A.

## Final quality check before lock
A rubric is not ready for Zak unless all of the following are true:
- the controlling doctrine appears first in the scoring logic,
- parent modules are unchanged,
- row weights do not double-count the same defect,
- fallback rows remain after the main gates,
- metadata is separated from scoring,
- centroid-derived rows are marked as anchor or provisional,
- failure labels are mapped,
- and all major doctrine-boundary questions are explicitly flagged,
- no final row card contains blank `allowed omissions`, `contradiction flags`, or `comparison guidance` fields
- any surviving overlap between rows is explained with a distinctness note or reflected in reweighting.

## Short version
The first reusable deliverable Karthic needs is not another case-specific rubric.
It is a cross-pack rubric build spec that tells him how to turn a prefilled benchmark packet into a stable modular rubric.
Once this file exists, you can build case-specific rubrics much faster and with far less drift.
