# Vision: Published Legal Reasoning Benchmark Pipeline

## End Goal

The final product is a publishable research system that demonstrates an
automated, reproducible pipeline for evaluating legal reasoning in LLM outputs.
Statute of Frauds is the first validation domain because it is the data-rich
calibration area, but the pipeline itself must be doctrine-general: given a new
legal source case, it should infer the relevant doctrine, generate a benchmark,
run model responses, cluster legal reasoning, score clusters against a
source-grounded rubric, and produce model-level rankings with auditable evidence.

Claim-supporting runs must begin from real, citable legal source materials,
such as court opinions or official statutory materials. Curated summaries and
tiny fixtures are allowed for software regression tests, but they cannot serve
as the source input for the paper's main pipeline-validity claims.

The current manuscript should not be about the engineering iteration loop. It
should describe the frozen pipeline, the internal validation protocol, and the
evidence that each automated stage works well enough to justify the pipeline as
a research method. Expert legal review remains a future publication-hardening
step, not the dependency for the present internal manuscript.

The manuscript must validate the pipeline stage by stage. It should not merely
say that the pipeline ran. For each stage, it should ask whether the generated
artifact is legally and methodologically good enough for the next stage:

- Frank: Is the doctrine framing legally solid, source-grounded, and consistent
  with the examples and instruction context? Is the benchmark question neutral?
  Is the gold answer the answer we expected from the source? Are the generated
  perturbation questions executable, with clear invariant versus material
  expectations?
- Karthic: Is the rubric derived from Frank's gold packet, comprehensive,
  non-generic, non-duplicative, weighted, source-supported, and useful for
  judging real model answers?
- Model responses: Did the benchmarked models answer the same Frank question
  and the selected perturbation questions naturally, without hidden labels, gold
  answers, or forced answer sections?
- Dasha: Do the clusters represent genuinely similar legal reasoning rather
  than surface phrasing, and do sampled members belong with their centroids?
- Judge: Does the LLM-as-judge apply every rubric row to the centroid in an
  explainable way, project scores correctly to members, and produce rankings
  that follow from the rubric rather than from model identity?
- Zak: Are failures, disagreement, low confidence, or mixed clusters surfaced
  as escalation packets instead of being silently accepted?

"Good" for the present internal manuscript means that automated gates pass and
the artifacts survive a research-team review against those questions. It does
not mean final publication truth; it means the pipeline has produced coherent,
auditable artifacts on a real case and has shown a plausible transfer mechanism
for other cases and doctrines.

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

Frank questions must be self-contained legal hypotheticals, not abstract
doctrinal prompts. A valid neutral question or variation should lay out the
operative scenario from the source case: party roles, the promise or
transaction, timing, writing or certificate facts, later dispute, competing
claims, and the call question. Variations must restate the relevant scenario
with the changed fact integrated, so benchmarked models can answer naturally
without hidden context.

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
identifiers, including GPT, Claude, Gemini, Llama, DeepSeek, and any other model
families added later. Each model should answer the same Frank-generated question
in its natural response style. The default response prompt should be the
question only: no system prompt, no hidden gold answer, no source excerpt
outside the question, and no required jurisdiction/outcome/doctrine heading
template. Infrastructure used to reach those models is implementation detail,
not the research object.

Provider routing must be separated from model identity. Replicate, direct
OpenAI, direct Anthropic, direct Google/Gemini, or any later broker is only a
transport route. If Gemini, Claude, GPT, Llama, DeepSeek, or another model is
called through Replicate, the pipeline should still treat the actual model
identifier as the benchmarked model and treat `replicate` as routing metadata.
Preflight and manuscript evidence should count model-family diversity from
actual model identifiers, not from provider names.

Structured legal fields belong to Frank, Karthic, Dasha, and Judge artifacts,
not to the benchmarked model responses. Dasha should recover jurisdiction,
outcome, doctrine, trigger, exception, counterargument, and reasoning path after
the fact from whatever answer the model naturally gives.

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
- primary reasoning path
- secondary-path audit profile for other gates, exceptions, and theories the
  answer considered, accepted, rejected, or treated as uncertain
- secondary cluster profile that affects grouping only when a non-primary path
  is accepted or uncertain enough to be legally material
- representative centroid response
- member response ids
- centroid/member consistency metrics
- mixed-cluster flags when members do not genuinely share reasoning

At scale, Dasha should reduce large response sets, such as 500 answers, into a
small number of interpretable centroids without hiding materially different
legal reasoning in the same cluster.

Real legal answers are often multi-path. Dasha should not force an answer into
a single flat label when the answer discusses the marriage gate, signed-writing
compliance, later beneficiary designation, promissory estoppel, part
performance, and constructive trust before choosing a controlling route. The
target behavior is to preserve that full path profile for audit while keeping
centroid grouping tied to controlling reasoning and material accepted or
uncertain secondary theories. Rejected background theories should be visible to
reviewers, but they should not automatically split an otherwise coherent
cluster.

Dasha is internally complete for the current pre-expert Statute-of-Frauds case
study only after a larger live, multi-model, multi-sample, perturbation-aware
run completes through judge scoring. That milestone has now been reached for
the Anglemire calibration case: the claim-supporting run uses natural
question-only responses across ten actual model identifiers, repeated samples,
the base Frank question, an invariant party-name perturbation, and a material
signed-writing perturbation. Dasha separates legal theories such as
certificate-as-writing, equitable or promissory estoppel, association-rule
replacement, Statute-of-Frauds bar, and signed-writing compliance when those
theories appear in model answers. This supports the internal manuscript claim
for the reported case. Broader publication claims still require held-out cases
and expert review.

A later multi-path Dasha audit regenerated signatures for the saved 60
Anglemire responses. The naive full-secondary-profile key overfragmented into
49 clusters; the tuned method records all secondary paths but clusters only on
material accepted or uncertain non-primary paths, yielding 26 track-aware
clusters. Before replacing the reported model rankings, the full source-to-score
bundle should be rerun through Judge on these multi-path clusters.

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

For the current pre-expert-review manuscript, the evidence should be organized
as a source-to-score case study plus robustness checks:

- Source-to-score case study: one real source case is carried through Frank,
  Karthic, model response generation, Dasha, Judge, Zak, and paper export.
- Stage artifact review: each generated artifact is evaluated against the
  stage-specific quality question above, not merely against a JSON schema.
- Natural-response clustering check: response models answer naturally, then
  Dasha clusters only after generation.
- Perturbation check: invariant edits, such as party-name changes, should
  preserve the dominant legal answer path; material edits, such as changing a
  legally operative duration or writing fact, should change the dominant answer
  path or reasoning signature.
- Controlled scale check: a 500-response fixture tests clustering bookkeeping,
  centroid projection, and metrics at target scale without being mistaken for
  natural-response discovery evidence.
- Doctrine-transfer argument: the paper must explain exactly which components
  are doctrine-general, which SOF-specific contexts were used for calibration,
  and what evidence remains necessary before claiming broad legal-domain
  validity.

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
- stage-by-stage artifact assessment: Frank packet quality, Karthic rubric
  quality, Dasha cluster coherence, Judge row scoring, and Zak escalation
- discussion: why clustering by reasoning gives more insight than scoring every
  answer independently
- transfer discussion: why the architecture is designed to work beyond SOF and
  what validation would be required to prove that claim
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
- Dasha has passed a larger live natural-response run with multiple model
  families, repeated samples, and perturbation tracks for the reported
  Anglemire case; broader robustness remains a held-out-case validation target

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
