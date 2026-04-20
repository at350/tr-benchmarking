# 58 — Case Citation Verification Protocol v1

Companion to:
- `01_CORE_WORKFLOW_TEMPLATE.txt`
- `07_SHARED_MODULE_SKELETON.txt`
- `08_Karthic_Rubric_Build_Spec_v1.md`
- `09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md`
- `50_Karthic_PreFill_Instructions.rtf`
- future Dasha evaluation instructions

## Purpose
This file adds a cross-pack authority-monitoring layer for case citations in model outputs and centroids.

It is designed to do five things:
1. record whether a response or centroid mentions one or more cases;
2. verify whether each cited case appears to exist;
3. record whether the supplied citation appears exact, substantially correct, materially incorrect, or not assessable;
4. flag whether a cited case is the same case used to build the benchmark workflow;
5. impose penalties only when a cited case is hallucinated or materially fabricated.

## Why this file exists
The current framework is built around provenance-blind clean benchmark answers and non-scored metadata tags, while the scoring overlay layer is reserved for answer-level distortions that are serious enough to affect overall evaluation.

That means case-citation behavior should be split into two layers:
- **metadata visibility** for whether a case was mentioned and what was cited;
- **overlay penalties** only when the cited authority is hallucinated.

## Core rule
### Rule 1 — Case mention is visible by default
If a response or centroid mentions a case, the evaluator should be able to see that fact whether or not the case is real.

### Rule 2 — No penalty for no case citation
Do not reward or punish an answer merely for omitting case authority unless the benchmark packet explicitly says the task is authority-grounded.

### Rule 3 — Verification runs only if a case is cited
If no case is mentioned, record `case_mention_status = none` and stop.
If one or more cases are mentioned, run the verification pass.

### Rule 4 — Hallucinated cases are penalized
If a cited case cannot be verified as a real case, or the citation is materially fabricated, apply the hallucinated-case overlay.

### Rule 5 — Source-case reference is surfaced, not automatically penalized
If a cited case matches the workflow source case used to create the benchmark, Dasha must note that explicitly.
This is a provenance / memorization signal, not an automatic penalty by itself.

## Verification pass
Run the case-citation verification pass after centroid extraction and before final score lock.

### Inputs
- response or centroid text
- `workflow_source_case_name` if any
- `workflow_source_case_citation` if any
- `case_citation_verification_mode`
- `source_case_monitoring`

### Steps
1. Extract case-like references from the text.
2. Normalize case names and any reporter / court / year strings.
3. Perform a web-search / authority-check pass to determine whether each case exists.
4. If a match is found, compare the supplied citation details to the matched authority.
5. Compare each verified match to the workflow source case fields.
6. Return structured metadata before Dasha finalizes the score.

## Default metadata outputs
When `case_citation_verification_mode = on`, preserve these fields:
- `case_mention_status: none / one_or_more`
- `extracted_case_mentions`
- `verified_case_mentions`
- `hallucinated_case_mentions`
- `citation_accuracy_status: not_applicable / exact / substantially_correct / materially_incorrect / cannot_assess`
- `source_case_reference_flag: no / yes`
- `source_case_reference_note`
- `case_verification_review_flag: no / yes`

## Scoring rule
### No case mentioned
- record metadata only;
- apply no penalty.

### Real case mentioned and substantially identifiable
- record metadata only;
- apply no penalty by default.

### Real case mentioned but citation detail is loose or partly incomplete
- record metadata;
- apply no penalty by default unless the citation defect is so severe that the authority is effectively fabricated.

### Hallucinated case mentioned
- record metadata;
- apply `P_HallucinatedCaseCitation`.
- if the fake authority materially drives the conclusion, consider `CAP_75_HallucinatedCoreAuthority`.

## Karthic rule
Karthic should not create an ordinary scored rubric row that rewards mere case citation by default.

Instead:
- reserve case-citation monitoring fields inside Module 0;
- keep case-citation visibility as metadata;
- leave hallucinated-authority deductions to the overlay layer;
- escalate ambiguous verification outcomes to Zak if needed.

## Dasha rule
Before final score lock, Dasha must:
- inspect each centroid for case mentions;
- run the verification pass when needed;
- record case-citation metadata;
- say explicitly if the centroid cites the workflow source case;
- apply the hallucinated-case overlay when appropriate;
- escalate ambiguous verification results rather than guessing.

## What should NOT change
This file does **not**:
- make case citation mandatory;
- turn ordinary clean benchmark answers into authority-grounded answers;
- change doctrine-pack routing;
- add a doctrinal reward for naming cases;
- replace SME review when authority matching is ambiguous.

## Implementation recommendation
Use this file as a new companion protocol, then make small edits to the workflow, shared module skeleton, Karthic files, and scoring overlay file.

That keeps the feature cross-pack, visible to evaluators, and tightly aligned with your current design:
- metadata for visibility,
- verification for factual checking,
- overlay penalties only for hallucinated authority.
