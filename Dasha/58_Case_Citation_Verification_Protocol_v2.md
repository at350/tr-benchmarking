# 58 - Case Citation Verification Protocol v2

Companion to:
- `56_Dasha_Evaluation_Spec_v2.md`
- `09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md`
- `60_Centroid_Composition_Metadata_and_Simple_Zak_Rule_v1.md`
- Frank's locked controller card
- Dasha's final score lock step

## Purpose
This file keeps the case-citation verification pass, but aligns it with the current simplified Dasha rule.

The design rule is still:
- visibility through metadata,
- verification through a separate pass,
- penalty only for hallucinated or materially fabricated authority.

This file does not make case citation mandatory.

## Core rules
### Rule 1 - No case citation is not a scoring defect
If no case is mentioned, record metadata only and apply no penalty.

### Rule 2 - Real but informal citations are still visible
If a real case is cited in informal or incomplete form but remains substantially identifiable, record that fact and apply no penalty by default.

### Rule 3 - Verification is a factual pass, not a doctrinal reward
The verification pass checks whether the cited case exists and whether the citation is substantially correct. It does not create an ordinary reward for naming cases.

### Rule 4 - Hallucinated cases are penalized only when Dasha can verify the hallucination
If Dasha can verify that a cited case does not exist or is materially fabricated, apply the hallucinated-case overlay.

### Rule 5 - Ambiguous verification is flagged, not guessed
If verification is ambiguous, record the uncertainty and do not guess.

### Rule 6 - Source-case reference is surfaced, not automatically penalized
If a cited case matches the workflow source case used to create the benchmark, Dasha must say so explicitly.
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
3. Perform an authority-check pass to determine whether each case exists.
4. If a match is found, compare the supplied citation details to the matched authority.
5. Compare each verified match to the workflow source case fields.
6. Return structured metadata before Dasha finalizes the score.

## Default metadata outputs
When `case_citation_verification_mode = on`, preserve these fields:
- `case_mention_status: none / mentioned`
- `extracted_case_mentions`
- `verified_case_mentions`
- `hallucinated_case_mentions`
- `citation_accuracy_status: not_applicable / verified_correct / verified_partly_correct / hallucinated_or_unverifiable`
- `source_case_reference_status: not_applicable / source_case_cited / other_case_only / source_case_and_other_cases`
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

### Hallucinated case mentioned and verified as hallucinated
- record metadata;
- apply `P_HallucinatedCaseCitation`.
- if the fake authority materially drives the conclusion, consider `CAP_75_HallucinatedCoreAuthority`.

### Ambiguous verification
- record metadata;
- set `case_verification_review_flag = yes`;
- use the note `Case mentioned; could not be verified.`;
- do not apply the hallucinated-case overlay unless the hallucination is verified.

## Suggested Dasha note language
Use one of the following where appropriate:
- `Case mentioned and verified.`
- `Case mentioned; citation informal but substantially identifiable.`
- `Case mentioned; could not be verified.`
- `Response cites the workflow source case used to build this benchmark.`

## Karthic rule
Karthic should not create an ordinary scored rubric row that rewards mere case citation by default.

Instead:
- reserve case-citation monitoring fields inside Module 0;
- keep case-citation visibility as metadata;
- leave hallucinated-authority deductions to the overlay layer.

## Dasha rule under the current simplified implementation
Before final score lock, Dasha must:
- inspect each centroid for case mentions;
- run the verification pass when needed;
- record case-citation metadata;
- say explicitly if the centroid cites the workflow source case;
- apply the hallucinated-case overlay only when hallucination is verified;
- flag ambiguous verification results without guessing.

### Important simplification
Under the current simplified Dasha rule, ambiguous case verification does **not** trigger Zak review by itself.
Only panel non-majority on the best centroid triggers Zak review during the Dasha phase.

## What should NOT change
This file does not:
- make case citation mandatory;
- turn ordinary clean benchmark answers into authority-grounded answers;
- change doctrine-pack routing;
- add a doctrinal reward for naming cases.

## Bottom line
Use this protocol to surface authority use, verify it where possible, and penalize only hallucinated authority that Dasha can actually verify.
