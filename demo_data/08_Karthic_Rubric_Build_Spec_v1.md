# Karthic Rubric Build Spec v1

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
- likely_controlling_doctrine
- required_gate_order
- output_shell
- gold_answer
- doctrine_guide_or_pack
- failure_bank
- variation_lane
- human_weight_overrides, if any

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

### Step 7 — Assign weights
Apply module weights first.
Then assign row weights within each module.
Weight legal importance, not prose length.

### Step 8 — Map failure labels
Each scored row should map to existing failure-bank labels where possible.
New labels should be proposed only when the current bank cannot cleanly capture a recurring, legally distinct error.

### Step 9 — Add variation notes
For Lane A, preserve the same controller, likely outcome, strongest counterargument, and gate order unless the packet expressly changes them.
For Lane B, increase sensitivity to missing facts, bounded uncertainty, and conditional branching.

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

Optional tags:
- controller-fit check
- benchmark posture check
- source-grounded versus generalized tag
- cluster confidence / escalation flag

Do not score Module 0.
Do not place doctrinal penalties here.

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
### Lane A
For answer-invariant variations:
- preserve the same controlling doctrine,
- preserve the same likely outcome,
- preserve the same strongest counterargument,
- preserve the same gate order,
- and apply only cosmetic or very light rubric patching.

### Lane B
For ambiguity or missing-fact variations:
- allow rows about missing facts, conditional branching, and bounded uncertainty to become more important,
- do not require false definiteness,
- and do not punish an answer merely because it is conditional, if the packet was designed to test uncertainty recognition.

## Zak escalation triggers
Flag for Zak whenever any of the following is true:
- the controlling doctrine is genuinely debatable,
- a proposed weight change would materially alter ranking,
- a new centroid-derived row touches the controller,
- a new row duplicates an existing row but the duplication cannot be cleanly resolved,
- a doctrine boundary between packs is unstable,
- a jurisdiction-specific limit might change the rubric,
- or Lane B ambiguity handling changes what counts as a good answer.

## Required final deliverable from Karthic
Every finished rubric draft should be returned in these sections:

A. Prefill audit
B. Rubric skeleton
C. Row-level scoring design
D. Failure-label mapping
E. Decomposition / pruning log
F. Variation patch notes
G. Escalation notes for Zak

## Final quality check before lock
A rubric is not ready for Zak unless all of the following are true:
- the controlling doctrine appears first in the scoring logic,
- parent modules are unchanged,
- row weights do not double-count the same defect,
- fallback rows remain after the main gates,
- metadata is separated from scoring,
- centroid-derived rows are marked as anchor or provisional,
- failure labels are mapped,
- and all major doctrine-boundary questions are explicitly flagged.

## Short version
The first reusable deliverable Karthic needs is not another case-specific rubric.
It is a cross-pack rubric build spec that tells him how to turn a prefilled benchmark packet into a stable modular rubric.
Once this file exists, you can build case-specific rubrics much faster and with far less drift.
