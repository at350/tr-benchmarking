# TR Pipeline GroupMe Extract

Source: GroupMe `Innovation Lab` chat, exported read-only on 2026-05-08.
Scope reviewed: 1,847 messages from 2026-01-20 through 2026-05-07.

This document is historical context. Some repo anchors below name older
prototype paths that were removed from the research branch cleanup. The active
implementation lives in `research/validation/`; the active instructions live in
`instructions/`; the active manuscript lives in `paper/`; and the only UI is the
minimal workbench in `frontend/`.

## High-Level Takeaway

The project is not primarily a web app. The intended deliverable is a research pipeline for evaluating open-ended legal reasoning from LLMs. The app is only a demonstration surface for the methodology.

The strongest GroupMe signal is from 2026-04-21, where the team explicitly says:

- "we are creating a pipeline not an app"
- "we are not an app we are a pipeline, that is a research"
- "the demo in the app" is confusing because it compresses "phase 1 2 3 4 + frank dasha karthic zak + packets + instruction + embeddings + clusters + rubric editing"
- the site is "just to show how it might play out"; the framework is the important part
- the project needs "research paper + flow chart" because the web app does not explain the methodology clearly enough

This matches the user's concern: the current pipeline surface may not be representative of the theoretical pipeline.

## Intended Pipeline

### 1. Start From a Real Legal Source

The pipeline begins with a real case, judicial opinion, or doctrine source, not a random benchmark question. The target user is an AI evaluator at a legal AI company who needs a way to generate source-grounded benchmarks for a specific doctrine and jurisdiction.

GroupMe evidence:

- 2026-04-21 presentation script: the evaluator should be able to "start from a real judicial opinion tied to the legal issue of interest, generate a benchmark for the exact doctrine and jurisdiction at issue, compare models at scale, and reserve SME review for only the hardest cases."
- 2026-04-14 demo script: "we start with a real legal source" because the pipeline needs a stable, legally grounded benchmark.

Repo anchors:

- `cases/`
- `instructions/frank/`
- `instructions/question-variance/`
- `legal-workflow-data/frank-v2-packets/`
- `legal-workflow-data/artifacts-v2/`
- `frontend/src/app/api/frank-packets/`
- `frontend/src/lib/legal-workflow-v2-prompts.ts`
- `frontend/src/lib/legal-workflow-v2-server.ts`

### 2. Frank: Source Intake, Legal Framing, Gold Answer, Neutral Question

Frank should produce a locked benchmark packet from the source. The packet should fix the legal framing before downstream scoring starts: jurisdiction, bottom-line outcome, controlling doctrine, formation/transaction characterization, writing/formality triggers, exception analysis, competing doctrines, and strongest counterargument.

Important GroupMe details:

- Frank must focus on the relevant Statute of Frauds issue when a case discusses SoF, rather than drifting into unrelated case content.
- The law-side team repeatedly revised Frank to prevent confusion and to remove the old standalone "Bounded uncertainty" heading.
- Authoritative late instruction: model answers should not use a separate `Bounded uncertainty:` heading; uncertainty should be folded into `Strongest counterargument:`.

Repo anchors:

- `instructions/frank/00_MAIN_GPT_INSTRUCTIONS.txt`
- `instructions/frank/01_CORE_WORKFLOW_TEMPLATE.txt`
- `instructions/frank/03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt`
- `instructions/frank/54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md`
- `frontend/src/app/api/frank-packets/question-variation/`
- `legal-workflow-data/frank-v2-packets/`

### 3. Controlled Question Variations

The variation component is important, not incidental. TR reportedly liked it, and the team framed it as a way to test whether models are reasoning or merely recognizing cases.

Intended variation goals:

- Keep the legal answer structure the same while changing surface facts such as names, amounts, or locations.
- Remove or generalize key facts to test whether a model recognizes uncertainty rather than forcing a confident answer.
- Test whether models are over-sensitive to legally irrelevant fact salience, such as treating a larger dollar amount as more enforceable when doctrine should not change.
- Compare original questions against Lane A / Lane B variations.

Repo anchors:

- `instructions/question-variance/`
- `instructions/frank/54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md`
- `frontend/src/app/api/frank-packets/question-variation/menu/route.ts`
- `frontend/src/app/api/frank-packets/question-variation/package/route.ts`
- `frontend/src/app/api/frank-packets/question-variation/clear/route.ts`

### 4. Run Many Model Outputs

The benchmark question set is run across many model outputs. The chat mentions running a full clustering process with 12 models through Replicate, and earlier work compared OpenAI models, model providers, temperature, prompt templates, adversarial text, label noise, legal subfields, and difficulty strata.

Repo anchors:

- `datasets/supergpqa/SuperGPQA Law Data.csv`
- `datasets/prbench/legal-data.csv`
- `datasets/prbench/legal-data-hard.csv`
- `lsh/`
- `lsh-IRAC/`
- `frontend/src/app/api/lsh-runs/`

### 5. Dasha: Cluster By Reasoning, Not Just Wording

Dasha should cluster model answers by functional legal conclusion and reasoning pattern. The goal is to reduce hundreds or thousands of raw answers into representative reasoning types.

Intended Dasha behavior:

- Embed responses using instruction-tuned embeddings.
- Apply density-based clustering.
- Identify a representative answer or centroid for each cluster.
- Treat a cluster as a reasoning archetype: if many answers make the same legal move or same legal mistake, score the representative rather than every raw answer.
- Preserve cluster-level metadata, outliers, and representative examples.

Important caveats from chat:

- There was concern that Dasha clustering was "messed up" because signals were being misidentified and unlike answers were clustered together.
- Karthic had suggested cluster summaries as a possible alternative to centroids.
- Cluster validation was described as still labor-intensive.
- Citation verification was called out as needing a dedicated layer.
- Verifying whether centroid scoring is representative of the whole cluster was expected to be expensive.

Repo anchors:

- `instructions/dasha/56_Dasha_Evaluation_Spec_v2.md`
- `instructions/dasha/57_Dasha_Evaluator_Instructions_v2.txt`
- `instructions/dasha/58_Case_Citation_Verification_Protocol_v2.md`
- `instructions/dasha/60_Centroid_Composition_Metadata_and_Simple_Zak_Rule_v1.md`
- `lsh/cluster_legal_workflow.py`
- `lsh/pipeline.py`
- `lsh/density_clustering.py`
- `lsh-IRAC/irac_pipeline.py`
- `legal-workflow-data/dasha-v2-runs/`
- `legal-workflow-data/dasha-v2-comparisons/`
- `frontend/src/app/api/dasha-runs/`
- `frontend/src/lib/dasha-results-explorer.ts`
- `frontend/src/lib/dasha-comparison.ts`

### 6. Karthic: Build Modular Rubrics From the Locked Packet and Clusters

Karthic should decompose the approved Frank packet into fixed scoring rows. The rubric should be modular, legally meaningful, and useful for both automated judges and human reviewers.

Intended rubric behavior:

- Use the source, benchmark answer, neutral question, and representative answer groups.
- Ask whether the answer identifies the controlling doctrine, follows the right legal path, handles fallback doctrines correctly, stays faithful to the facts, and avoids overclaiming.
- Break broad criteria into useful scoring rows.
- Filter redundant criteria.
- Avoid double-counting the same mistake.
- Preserve which parts were prefilled vs generated if possible.

Repo anchors:

- `instructions/karthic/08_Karthic_Rubric_Build_Spec_v1.md`
- `instructions/karthic/09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md`
- `instructions/karthic/50_Karthic_PreFill_Instructions.rtf`
- `rubric-automation/`
- `legal-workflow-data/karthic-v2-rubric-packs/`
- `legal-workflow-data/karthic-v2-pre-cluster-runs/`
- `frontend/src/app/api/karthic-rubric-packs/`
- `frontend/src/app/api/karthic-pre-cluster-runs/`

### 7. Judge Panel: Score Cluster Representatives Against the Rubric

The automated judge can be a single model or a panel of models. The intended scoring target is the cluster representative, not every raw answer by default.

Expected outputs:

- Row-level rubric scores.
- Preserved judge votes.
- Explanation of which rubric rows drive score differences.
- Side-by-side comparison of original vs variation outputs.
- Visibility into judge disagreement.

Repo anchors:

- `legal-workflow-data/dasha-v2-runs/`
- `legal-workflow-data/dasha-v2-comparisons/`
- `frontend/src/app/api/dasha-runs/[id]/judge/route.ts`
- `frontend/src/lib/dasha-results-explorer.ts`
- `frontend/src/lib/dasha-comparison.ts`

### 8. Zak: Targeted SME Escalation

Zak is the human expert backstop. The pipeline should escalate only when automated judges cannot reach a clear majority or when ambiguity is narrow and legally meaningful.

The SME packet should include:

- the question
- the rubric
- the cluster or centroid
- the score breakdown
- where judges disagreed
- a place for the SME final call and reasoning

Repo anchors:

- `instructions/zak/61_Zak_SME_Review_Spec_v1.md`
- `instructions/zak/62_Zak_SME_Review_Instructions_v1.txt`
- `legal-workflow-data/zak-v1-reviews/`
- `frontend/src/app/api/zak-reviews/`

## Project Purpose

The project addresses a legal AI evaluation bottleneck:

- Classification benchmarks are scalable but too shallow for open-ended legal reasoning.
- LLM-as-judge is flexible but inconsistent.
- SME review is most reliable but too slow and expensive to apply to every output.

The intended contribution is a case-grounded, scalable, human-calibrated workflow that lets evaluators compare legal LLMs meaningfully without sending every answer to an expert.

## Current Repo Structure Most Relevant To The Pipeline

- `README.md`: current public project overview.
- `instructions/README.md`: says `instructions/` is the single source of truth for canonical instruction sets.
- `instructions/frank/`: source intake, benchmark packet, doctrine packs, question variation protocol.
- `instructions/question-variance/`: controlled variation generation.
- `instructions/karthic/`: rubric decomposition and scoring overlays.
- `instructions/dasha/`: centroid evaluation, citation verification, escalation rules.
- `instructions/zak/`: SME packet and review record.
- `legal-workflow-data/`: saved Frank/Karthic/Dasha/Zak run artifacts.
- `cases/`: source case PDFs used in the workflow.
- `lsh/`: baseline response generation, embeddings, clustering, visualization, and workflow clustering bridge.
- `lsh-IRAC/`: structured IRAC response pipeline and adversarial robustness checks.
- `rubric-automation/`: standalone Recursive Rubric Decomposition implementation.
- `frontend/`: Next.js UI and API routes for demoing and inspecting the workflow.

## Likely Mismatches To Fix Next

1. The app/UI should not be treated as the product. It should explain and visualize the research methodology.
2. The theoretical pipeline needs a clear flow chart or narrative layer. The chat repeatedly says the web app alone does not convey the methodology.
3. Frank/Karthic/Dasha/Zak should be presented as research stages with artifacts and invariants, not just UI tabs or buttons.
4. `Bounded uncertainty:` should not remain as a standalone model-answer heading if late April instructions are authoritative.
5. The Dasha clustering stage needs validation language: centroid scoring is an efficiency hypothesis, not something the chat treats as conclusively proven.
6. Citation verification and cluster validation should be shown as limitations/future work or dedicated layers.
7. Controlled question variation should be elevated because the chat treats it as a core way to test reasoning vs memorization and fact-salience brittleness.
8. The final TR-facing explanation should emphasize "case-to-score workflow for evaluating LLM legal reasoning," not "app demo."
