# Vision: Published Legal Reasoning Benchmark Pipeline

## End Goal

The final product is a publishable research system that demonstrates an
automated, reproducible pipeline for evaluating legal reasoning in LLM outputs.
Statute of Frauds is the first validation domain because it is the data-rich
calibration area, but the pipeline itself must be doctrine-general: given a new
legal source case, it should infer the relevant doctrine, generate a benchmark,
run model responses, cluster legal reasoning, score clusters against a
source-grounded rubric, and produce model-level rankings with auditable evidence.

The current manuscript should not be about the engineering iteration loop. It
should describe the frozen pipeline, the internal validation protocol, and the
evidence that each automated stage works well enough to justify the pipeline as
a research method. Expert legal review remains a future publication-hardening
step, not the dependency for the present internal manuscript.

## Final User Experience

A research team member should be able to provide a legal source case and run the
pipeline end to end. The system should output a complete run bundle containing:

- the source case and provenance hash
- Frank packet with doctrine/gate detection, source extraction, neutral question,
  gold answer, controlled variations, and handoff card
- Karthic rubric with source-grounded row criteria and scoring policy
- generated responses from a configured roster of LLMs
- Dasha clusters that compress many responses into legal-reasoning centroids
- judge scores for each centroid, projected scores for every response, and model
  rankings
- Zak escalation packets when uncertainty or disagreement crosses thresholds
- manifest with config, model settings, prompt hashes, artifact hashes, and
  quality-gate results
- paper-ready tables and figures generated from frozen outputs

The UI should remain a bare research workbench, not a demo dashboard. It should
let the team select or upload a source case, choose a frozen config, run stages,
inspect artifacts, and export a run bundle. The CLI remains the source of truth.

## Frank Target Behavior

Frank should work from the source case, not from a prewritten question. It should:

- infer the legal doctrine and controlling gates from the source
- extract jurisdiction, material facts, issue framing, source limits, and
  counterarguments
- generate a neutral benchmark question
- generate a gold answer in a consistent structured format
- generate boundary variations that change legally meaningful facts
- identify what each variation is supposed to test
- produce a locked handoff packet for Karthic

For Statute of Frauds, Frank must correctly handle marriage, suretyship, one-year,
land, UCC goods, executor, and cross-gate confusion scenarios. For other
doctrines, Frank should use the same general packet schema and infer the
appropriate gate/element structure from source materials and doctrine
instructions.

## Karthic Target Behavior

Karthic should generate a fresh rubric for every locked Frank packet. It should:

- build row-level criteria from the source case, gold answer, and variations
- cover doctrine/gate, rule/element, facts, compliance, exceptions/defenses,
  counterarguments, conclusion, variation sensitivity, and source support
- avoid generic, duplicated, or unsupported rows
- include row weights and a stable scoring policy
- validate that every row is source-grounded and useful for judging model answers

The final rubric should be strong enough that a legal researcher can inspect it
and understand exactly what legal reasoning the model is being judged on.

## Model Response Generation Target Behavior

The response generation stage should run a configurable roster of actual model
identifiers, including GPT, Claude, Gemini, Llama, and any other model families
added later. Each model should answer the same Frank-generated question under
the same controlled format; infrastructure used to reach those models is
implementation detail, not the research object.

Responses should use a structured format aligned with the gold answer:

- Jurisdiction assumption
- Bottom-line outcome
- Controlling doctrine
- Transaction / formation characterization
- Writing requirement and trigger, or doctrine-specific equivalent
- Compliance / substitute / exception analysis, or doctrine-specific equivalent
- Other defenses or competing doctrines
- Strongest counterargument

The system should support large batches, including hundreds of responses across
models, samples, and temperatures. Every generation must record the actual model
identifier, settings, prompt hash, timestamp, source packet id, and the
non-research routing metadata needed to reproduce the call.

## Dasha Target Behavior

Dasha should cluster responses by similar legal reasoning, not by surface
phrasing. The final method may use LLM-extracted reasoning signatures,
embeddings, hybrid clustering, or another empirically stronger method, but it
must produce coherent clusters that a reviewer would recognize as sharing the
same legal reasoning path.

Each cluster should include:

- normalized doctrine/gate/issue signal
- outcome
- exception or defense posture
- reasoning path
- representative centroid response
- member response ids
- centroid/member consistency metrics
- mixed-cluster flags when members do not genuinely share reasoning

At scale, Dasha should reduce large response sets, such as 500 answers, into a
small number of interpretable centroids without hiding materially different
legal reasoning in the same cluster.

## Judge Target Behavior

The judge should apply the Karthic rubric to Dasha centroids. It should:

- score every rubric row for each centroid
- provide rationales tied to the response and rubric
- project centroid scores to every response in the cluster
- aggregate scores by model, variation, and question
- flag uncertainty, instability, or disagreement
- produce rankings of strongest and weakest models

The judge may be LLM-based, but it must be evaluated and calibrated. The final
paper should report evidence that judge scores are stable, explainable, and
sensitive to legally meaningful differences. Future expert review can add
external agreement metrics and error analysis.

## Zak Target Behavior

Zak should not review everything. Zak should create targeted escalation packets
only when the pipeline has reason to escalate:

- low judge agreement
- low centroid/member consistency
- mixed-reasoning clusters
- unstable scores across judge repeats
- source-support uncertainty
- high-impact disagreement between top clusters

Zak packets should make review efficient by showing the source issue, relevant
rubric rows, disputed clusters, representative answers, and the precise question
that needs internal or future expert adjudication.

## Validation Evidence Required For Publication

The final research product should include evidence for:

- Frank packet validity: doctrine detection, question quality, variation quality,
  and source-grounding accuracy
- Karthic rubric validity: row relevance, source support, non-duplication,
  coverage, and internal legal usefulness
- Dasha clustering validity: cluster purity, centroid/member consistency,
  mixed-cluster detection, and robustness at scale
- Judge validity: row-level coverage, calibration, disagreement analysis, score
  stability, and explainability
- Model ranking validity: confidence intervals, sensitivity analyses, and
  robustness across cases and variations

Expected metrics include, where appropriate:

- Cohen's kappa or weighted kappa
- macro-F1 for categorical labels
- mean absolute error for rubric scores
- bootstrap confidence intervals
- cluster purity / silhouette or comparable centroid consistency metrics
- inter-rater agreement between judge repeats and, later, expert reviewers
- ablations comparing clustering and judging methods

## Research Paper Target

The paper should present the frozen pipeline, not the development process. It
should contain:

- problem statement: existing legal LLM benchmarks under-measure reasoning paths
- method: source-to-question, dynamic rubric, response generation, clustering,
  centroid judging, escalation
- validation design: held-out internal cases, metrics, confidence intervals,
  and later expert review
- results: accuracy, reliability, cluster quality, model rankings, error modes
- discussion: why clustering by reasoning gives more insight than scoring every
  answer independently
- limitations: domain coverage, judge bias, source-case dependence, model
  version drift, and need for broader doctrine validation
- reproducibility appendix: configs, prompts, hashes, model settings, and run
  manifests

## Definition Of Done For Internal Validation

For the current milestone, the internal pipeline should satisfy these gates:

- the full live pipeline runs from a new source case without manual patching
- Frank artifacts have no obvious legal framing errors
- Karthic rubrics are source-grounded and legally useful
- Dasha clusters do not visibly mix different reasoning paths in sampled review
- judge outputs are row-level, explainable, and stable enough for calibration
- model rankings are generated from projected cluster scores
- all generated outputs are reproducible from config and captured in manifests
- failure cases create Zak packets instead of silently passing

## Definition Of Done For Publication

The project is publication-ready only when:

- prompts, model settings, clustering method, judge settings, and escalation rules
  are frozen
- held-out source cases are run without engineering changes
- expert reviewers evaluate the relevant Frank/Karthic/Dasha/Judge outputs
- quantitative validation meets the target reliability thresholds
- qualitative error analysis is complete
- paper tables and figures are generated from frozen run outputs
- all claims in the paper are supported by run manifests, artifacts, and review
  evidence

The core claim should be modest but strong: an automated source-grounded legal
benchmarking pipeline can generate questions, rubrics, reasoning clusters, and
rubric-based model rankings with enough internal validity and reliability to
support research use, starting with Statute of Frauds and designed for broader
doctrine coverage. The later publication claim can become stronger once expert
review evidence is added.
