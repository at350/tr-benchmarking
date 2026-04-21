# 60 - Centroid Composition Metadata and Simple Zak Rule v1

STATUS: ACTIVE ADD-ON PROTOCOL
Controls: centroid-composition display and the only automatic Dasha-phase Zak trigger
If a broader Dasha file conflicts with this file on Zak escalation during Dasha, this file controls.

Companion to:
- `56_Dasha_Evaluation_Spec_v2.md`
- `57_Dasha_Evaluator_Instructions_v2.txt`
- `54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md`

## Purpose
This file adds one simple visibility feature and one simple SME-escalation rule for the Dasha phase.

### Feature 1 - Centroid composition visibility
For each centroid, preserve and display how many raw answers in that cluster came from each evaluated model.

### Feature 2 - Simple Zak rule
During the Dasha phase, use Zak only when the LLM-as-a-judge panel cannot agree on which centroid is best.

## Core design rule
Keep centroid composition descriptive, not scored.

Do not turn model share inside a centroid into a grading input.
Use it only as explanatory metadata so the team can see what each centroid represents.

## Required upstream metadata per centroid
After clustering and centroid extraction, attach this block to each centroid:

- `centroid_id`
- `cluster_size_total`
- `model_breakdown`
- `represented_model_count`
- `dominant_model_name`
- `dominant_model_count`
- `dominant_model_share`

Important:
- `model_breakdown` describes the evaluated answer models represented inside the centroid.
- It does not describe the judge models used in Dasha's panel.
- Judge-panel composition must be stored separately at the run or track level.

### Required `model_breakdown` format
Use a simple list of model entries:
- `model_name`
- `answer_count`
- `answer_share`

Example:
- `gpt-4o: 30, 0.30`
- `claude-3-7-sonnet-20250219: 25, 0.25`
- `gemini-2.0-flash: 20, 0.20`

If percentages are easier for display, Dasha may show:
- `gpt-4o: 30 (30%)`
- `claude-3-7-sonnet-20250219: 25 (25%)`
- `gemini-2.0-flash: 20 (20%)`

## Dasha display rule
For each centroid, Dasha should show:
- total cluster size;
- count and share by model;
- number of distinct models represented;
- which model is the largest contributor.

This should appear in the centroid evaluation block, not only in a hidden export.

## Recommended simple extra breakdowns
Keep this short.

If you add anything beyond per-model counts and shares, the two most useful extras are:
1. `represented_model_count`
   - tells you whether the centroid is broad or mostly coming from one model family;
2. `dominant_model_share`
   - tells you whether one model is heavily concentrated in that centroid.

## Do not add for now
To keep implementation light, do not add any of these unless they are already easy to compute:
- token-length breakdowns;
- temperature or sampling-parameter breakdowns;
- judge-by-judge narrative explanations for every raw answer;
- per-centroid error histograms for every rubric row;
- pairwise model-vs-model centroid transition maps.

## Simple Zak escalation rule
This file replaces broader Dasha-phase Zak triggers with one temporary rule.

### Rule
Zak review during the Dasha phase should happen only when the LLM-as-a-judge panel cannot agree on which centroid is best for an active track.

### Operational definition
For each active track:
1. each judge scores the centroids;
2. each judge identifies that judge's first-place centroid for the track;
3. count first-place votes by centroid.

If one centroid receives a strict majority of first-place votes, do not escalate.

If no centroid receives a strict majority of first-place votes, escalate the disputed top-centroid decision to Zak.

### Majority rule
Use:
- `strict majority = more than half of judges`

Examples:
- 3 judges -> 2 or more first-place votes = majority
- 5 judges -> 3 or more first-place votes = majority
- 2 judges with a 1-1 split -> no majority -> escalate

## Scope of escalation
When escalation is triggered, Zak should review only:
- the disputed leading centroid or centroids for that track;
- the panel vote split;
- the centroid texts;
- the tied or disputed score summaries.

Do not send every centroid to Zak.

## What does NOT trigger Zak for now
Under this simplified temporary rule, none of the following alone should trigger Zak review during the Dasha phase:
- penalties above a threshold;
- case-citation ambiguity by itself;
- packet oddities by themselves;
- low-confidence notes by themselves;
- Lane B ambiguity by itself.

These may still be flagged in Dasha notes, but they should not trigger SME review unless the panel also lacks a majority on the best centroid.

Important:
Judge-panel configuration is track-level metadata, not centroid-composition metadata.
Do not place judge-panel fields inside each centroid block.

## Required Dasha output additions
Add these fields to each centroid block:
- `cluster_size_total`
- `model_breakdown`
- `represented_model_count`
- `dominant_model_name`
- `dominant_model_share`

Add these fields to each active track summary:
- `judge_panel_mode`
- `judge_model_roster`
- `judge_panel_homogeneity_status`
- `judge_aggregation_rule`
- `top_centroid_vote_split`
- `panel_majority_status: majority / no_majority / not_applicable`
- `best_centroid_zak_review_flag: yes / no`

## Bottom line
If you are short on time, implement just this:
- attach per-centroid model counts and shares;
- display them in Dasha's centroid output;
- escalate to Zak only when no centroid wins a strict majority of first-place panel votes.
