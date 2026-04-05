# Evaluating Legal-Reasoning Diversity with the Frank-Karthic-Dasha Pipeline: Density Clustering, Instruction-Tuned Embeddings, and Permutation-Based Robustness Tests

**Authors**: CS+Law Innovation Lab  
**Date**: April 2026

## Abstract
This paper evaluates the Frank-Karthic-Dasha legal benchmarking pipeline on a single hard contracts hypothetical: whether a father's oral promise to assume his son's student loans is enforceable when the promise is tied to the son's marriage to a politician's daughter, the father hoped for a tax deduction, no writing exists, and the son already intended to marry. Frank constructs the benchmark packet and benchmark answer; Karthic decomposes that packet into weighted doctrinal rubrics; Dasha generates repeated model outputs, embeds them, clusters them, and statistically validates the resulting structure.

The final FKD artifact contains 240 responses, exactly 20 from each of 12 models across six model families. For this controlled test question, the Frank packet uses the newer frontend schema but is seeded from a legacy benchmark question and golden answer rather than from a live anchor-case intake plus web search; the Karthic and Dasha stages then run in the newer artifact format. Clustering uses UMAP (`n_components = 5`) followed by HDBSCAN (`min_cluster_size = 5`). Cluster representatives are judged against Karthic’s structured golden targets by a three-model ensemble consisting of OpenAI, Claude, and DeepSeek. Applicability is aggregated by majority vote and the stored domain score is the median applicable-judge score, which is more robust than a simple mean under small-panel disagreement. On the final artifact, instruction-tuned embeddings outperform baseline embeddings on internal cluster quality (`Silhouette = 0.5668` vs. `0.4768`; `Davies-Bouldin = 0.5899` vs. `0.7240`) and on external cluster-family correspondence (`NMI = 0.6303` vs. `0.5459`; `ARI = 0.2814` vs. `0.2005`). Seed-to-seed cluster stability is also high for both representations, with instruction-tuned embeddings again stronger (`NMI = 0.9215`, `ARI = 0.8122`). A full all-cluster ensemble judgment across 22 cluster representatives and six rubric domains (`132` cluster-domain evaluations) yields a mean agreement ratio of `0.95`, `111` fully unanimous evaluations, and unanimous agreement on all six winning centroids; the resulting workflow-level weighted score is `89.0 / 100`. Under a reviewed three-way conclusion-coding protocol, `140/240` responses (`58.3%`) reached the benchmark-correct outcome that the promise is unenforceable, `97/240` (`40.4%`) concluded enforceable, and `3/240` (`1.3%`) remained ambiguous or conditionally dual. Robustness is established with permutation tests for NMI and ARI rather than bootstrap confidence intervals, because resampling-with-replacement distorts the local density geometry that HDBSCAN depends on. The result is a methodology demonstration showing that legal-reasoning diversity is both measurable and statistically stable at the cluster level.

## 1. Introduction
Legal benchmarking should not collapse model behavior to a single correctness score. In open-ended legal analysis, two responses can reach the same outcome for different doctrinal reasons, and two responses can discuss the same doctrine while assigning it very different weights. For this father-son hypothetical, a serious answer must sort through at least five overlapping issues: unilateral contract formation, whether marriage is consideration or only a gift condition, whether the marriage-consideration branch of the Statute of Frauds is independently dispositive, whether suretyship or the main-purpose doctrine matters, and whether promissory estoppel survives the son's preexisting intent to marry.

The Frank-Karthic-Dasha pipeline was built to preserve that structure. Frank defines the benchmark packet and the benchmark answer. Karthic turns the benchmark answer into inspectable rubric targets. Dasha samples a large pool of model outputs and studies the geometry of the response space itself. This paper focuses on whether that full workflow produces a stable and defensible empirical object.

This paper makes four methodological claims.

1. Stage separation matters: Frank, Karthic, and Dasha produce distinct but compatible artifacts.
2. Instruction-tuned embeddings are better than baseline point embeddings for organizing legal reasoning.
3. UMAP followed by HDBSCAN is an appropriate clustering architecture for heterogeneous legal responses with unknown cluster count.
4. Permutation tests appear more appropriate than bootstrap confidence intervals for NMI and ARI in this density-clustering setting.

This study asks whether legal-reasoning diversity among LLM responses can be measured reliably using density clustering and rubric-aligned evaluation within the FKD pipeline. This paper should therefore be read primarily as a methodology demonstration rather than as a leaderboard benchmark. The father-son hypothetical serves as a controlled test case for validating the FKD evaluation architecture.

![Figure 1. FKD pipeline schematic.](figures/fkd_pipeline_schematic.svg)

*Figure 1. Frank emits the benchmark packet and golden answer, Karthic emits weighted domains, criteria, and golden targets, and Dasha emits clustered response-space measurements plus rubric-aligned ensemble judgments.*

## 2. Literature Review

### 2.1 From Reference Metrics to Legal-Reasoning Evaluation
Classical overlap metrics such as BLEU and ROUGE are poorly suited to legal analysis because they reward lexical proximity rather than doctrinal adequacy. Semantic metrics such as BERTScore improve on token overlap, but they still score responses one at a time. More recent judge-model frameworks such as G-Eval and task suites such as LegalBench moved evaluation toward open-ended reasoning and legal-task diversity. What remains less developed is distributional evaluation: not just whether a model can answer a question, but what families of legal theories it systematically produces.

### 2.2 Instruction-Tuned Embeddings
Instruction-tuned embedding models are particularly relevant when the representation target is not generic semantic similarity but task-specific structure. INSTRUCTOR showed that embeddings improve when the representation problem is explicitly conditioned on the task. MTEB reinforced the same lesson at scale: embedding performance is domain- and objective-dependent. In legal benchmarking, that distinction is material because responses may share topic words while differing sharply in doctrinal hierarchy.

### 2.3 Density-Based Clustering for Open-Ended Text
Open-ended legal responses create three recurring clustering problems: the number of clusters is unknown, cluster sizes are uneven, and some outputs should remain outliers rather than be forced into a partition. HDBSCAN is appropriate under those conditions because it does not require a pre-specified `k`, supports irregular cluster shapes, and explicitly labels noise. UMAP is a practical precursor because density separation is more tractable in a lower-dimensional neighborhood-preserving manifold than in the original embedding space.

### 2.4 Statistical Validation of Clusters
Silhouette Score and Davies-Bouldin Index evaluate compactness and separation for a single clustering. They do not establish whether the discovered labels are stable or non-random. NMI and ARI are more appropriate for comparing clusterings and for comparing clusterings to external labels, but they still require a null procedure. Bootstrap confidence intervals are a poor choice for density clustering because the bootstrap changes neighborhood density itself. Permutation tests preserve the manifold and randomize only the labels, which is the right null for both seed-to-seed stability and cluster-family correspondence.

## 3. Case Study

### 3.1 Benchmark Question
The benchmark question is:

> A father promised his son that if the son married the daughter of a politician within 18 months, the father would assume responsibility for the son's student loans. The father was primarily motivated to make this promise by a tax deduction that he thought would be available to him if he paid the son's student loans, although he was also glad to help his son and hoped the son would marry the politician's daughter. The son agreed because he already planned to propose to the politician's daughter, but the father and son never signed a written contract. Fourteen months later, the son married the politician's daughter. The father refused to make any payments on the son's loans, however, because the father had learned that he would not in fact qualify for any tax deductions. Is the father's oral promise to pay off the son's student loans enforceable?

### 3.2 Why This Question Is Diagnostic
The question is useful because the strongest answer is not a one-rule answer. It requires the model to distinguish formation from enforceability, separate the marriage-consideration Statute of Frauds issue from the one-year rule, recognize that suretyship may be weakened because the promise was made to the debtor rather than the creditor, and treat promissory estoppel cautiously because the son already intended to marry. That structure makes the problem well-suited to cluster analysis: there are several plausible but non-equivalent reasoning paths.

## 4. Methodology

### 4.1 Frank: Benchmark Construction
The Frank-stage artifact for this study is packet `frank_1775367155212_48b90d17`. In the native newer workflow, Frank would start from an anchor case, collect case metadata and supporting context, optionally use web search, and then generate the benchmark packet and golden answer in the approved frontend schema. For this father-son test run, however, we used a controlled variant of that process: the packet was written into the same frontend schema, but its benchmark question and benchmark answer were imported from the legacy father-son benchmark materials, with a synthetic internal `selectedCase` record and manually specified source-intake metadata. This modification preserves the downstream FKD interfaces while avoiding the fiction that the father-son hypothetical was derived from a live anchor-case retrieval step.

Within that modified Frank packet, the legal domain is Contracts, the jurisdictional posture is a United States/common-law contracts hypothetical, and the benchmark answer concludes that the father's promise is likely unenforceable because the promise is made in consideration of marriage, which independently triggers the Statute of Frauds writing requirement.

Frank's six analysis domains are:

1. Issue and Bottom-Line Enforceability
2. Formation and Consideration
3. Marriage-Consideration Statute of Frauds
4. Suretyship and Main-Purpose Doctrine
5. Promissory Estoppel and Reliance
6. Mistake, One-Year Rule, and Counterarguments

This domain structure is important because later Karthic and Dasha artifacts are keyed directly to these domain identifiers rather than to an unstructured answer blob.

### 4.2 Karthic: Rubric Decomposition
The Karthic-stage artifact is rubric pack `karthic_1775367155213_270af0ba`. For this question, Karthic produced an approved rubric pack with six weighted domains, 13 active criteria, and six domain-specific golden targets. The domain weights are `5, 4, 5, 4, 4, 3`, summing to 25 total weight units. The criteria cover contract formation, consideration, the marriage branch of the Statute of Frauds, suretyship, the main-purpose doctrine, promissory estoppel, mistake, and counterarguments.

The full Karthic rubric is reproduced in Appendix A. That appendix includes the six domains, all 13 active criteria, and the six domain-specific golden targets with their comparison guidance and contradiction flags.

The highest-weighted rubrics capture the legal center of the problem:

| Rubric ID | Weight | Content |
|---|---:|---|
| `R011` | 0.0863 | Conclude that the promise is unenforceable because the marriage-consideration Statute of Frauds requires a writing |
| `R025` | 0.0845 | Address the main-purpose doctrine as a distinct element |
| `R006` | 0.0786 | Analyze why suretyship likely does not apply because the promise was made to the son, not the creditor |
| `R008` | 0.0778 | Evaluate promissory estoppel as a possible but weak exception |
| `R009` | 0.0778 | Note that the son's prior intent to marry weakens inducement and reliance |
| `R010` | 0.0776 | Explain that the father's tax-deduction mistake does not itself excuse performance |

This matters methodologically because Dasha's later cluster structure can be interpreted relative to a concrete doctrinal target rather than a single opaque gold answer.

### 4.3 Dasha: Response Generation and Ensemble Judging
The final Dasha artifact for this paper is run `dasha_1775367155213_70677f12`. It is linked to the approved Karthic pack by `rubricPackId`, contains 240 valid IRAC-structured responses, and stores 22 archived clusters plus a workflow-level weighted score of `89.0` after full ensemble judgment. Because the app-backed Dasha run persists responses as `responseText` rather than as a nested IRAC object, the analysis pipeline normalizes those payloads back into the canonical four-field IRAC form before embedding.

| Model family | Models |
|---|---|
| GPT | `gpt-4o`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-4.1-nano` |
| Claude | `claude-4-sonnet`, `claude-3.5-haiku` |
| Gemini | `gemini-3-pro`, `gemini-3-flash` |
| DeepSeek | `deepseek-v3` |
| Kimi | `kimi-k2-thinking` |
| LLAMA | `llama-4-maverick-instruct`, `llama-4-scout-instruct` |

Every response is normalized to the same four-field IRAC representation before embedding:

```text
Issue: ...
Rule: ...
Application: ...
Conclusion: ...
```

Normalization is deterministic. The analysis pipeline scans each stored `responseText` for labeled `Issue:`, `Rule:`, `Application:`, and `Conclusion:` headers, whitespace-normalizes the extracted blocks, and rebuilds a canonical IRAC string for embedding. If the parser cannot recover labeled sections, the raw `responseText` is retained for embedding rather than dropping the observation.

After clustering, Dasha judges each cluster representative against each Karthic domain by using a three-provider ensemble:

1. OpenAI `gpt-4.1-mini`
2. Claude `claude-4-sonnet`
3. DeepSeek `deepseek-v3`

Each judge returns applicability, a 0-100 score, confidence, and structured difference fields (`matched`, `missing`, `extra`, and `contradiction`). Here `applicability` is domain-local relevance rather than overall answer correctness: a centroid is `applicable` when it meaningfully engages the Karthic domain being scored, and `not_applicable` otherwise. The ensemble uses majority vote for applicability and the median score across applicable judges as the stored domain score. Agreement ratio is defined as the majority size divided by the number of participating judges, so with a three-judge panel the observed values are `1.00` and `0.67`. The frontend also records score spread and score standard deviation so disagreement itself becomes analyzable. In this run, Dasha evaluates all 22 cluster representatives against all six Karthic domains, yielding `22 x 6 = 132` cluster-domain ensemble judgments. Some judged clusters contain outputs from model families that also appear in the judge panel, but judges score cluster representatives rather than isolated self-generated responses, and the final stored score is the ensemble median rather than any single judge's self-assessment.

The workflow-level weighted score is computed from domain winners rather than raw responses:

`weightedScore = sum_d (w_d * s_d) / sum_d w_d`

where `w_d` is the Karthic weight for domain `d` and `s_d` is the winning applicable centroid score for that domain. In this run all six domains were applicable, so the denominator is the full 25 weight units.

### 4.4 Additional Benchmarking Analyses
To make the paper informative as an AI-benchmarking study rather than only a clustering study, we report two additional derived analyses from the finalized FKD artifact.

First, we code bottom-line outcome at the response level. The protocol is two-stage. Stage 1 extracts the `Conclusion:` section when present, or else the final bottom-line sentence span. Stage 2 classifies the extracted text into `unenforceable`, `enforceable`, or `ambiguous/dual`. The rules explicitly handle negation variants such as `not enforceable`, `cannot be enforced`, and `cannot be considered enforceable`, and they flag uncertainty or dual-polarity conclusions such as conditional statements that present both outcomes. Because the corpus contains only 240 responses, every rule-flagged ambiguous or dual-polarity conclusion was manually reviewed. Bottom-line outcome is therefore a descriptive secondary measure; the primary benchmark measure remains rubric-aligned FKD scoring.

Second, we compute a model-level FKD quality score by assigning each response the weighted Dasha score of its cluster. This is appropriate because Dasha evaluates cluster representatives rather than every raw response individually; cluster assignment is therefore the mechanism by which rubric-level judgment is propagated back to the full response population. These cluster-mediated scores are then averaged by model and by model family. This lets us distinguish simple outcome accuracy from broader doctrinal adequacy.

### 4.5 Embeddings and Clustering
We compare two embedding pipelines:

1. Instruction-tuned embeddings using `hkunlp/instructor-large` with the prompt: `Represent the legal reasoning components (Issue, Rule, Application, Conclusion) of this text:`
2. Baseline point embeddings using `all-MiniLM-L6-v2`

The clustering stack is:

1. UMAP with `n_components = 5`, `n_neighbors = 5`, `min_dist = 0.1`
2. HDBSCAN with `min_cluster_size = 5`, `min_samples = 2`

We evaluate cluster quality with Silhouette Score and Davies-Bouldin Index after removing HDBSCAN noise points.

### 4.6 Permutation Tests for Robustness
We run two permutation-test families.

1. Seed stability: compare cluster labels obtained from the same embedding matrix under two UMAP seeds using NMI and ARI.
2. Cluster-family correspondence: compare discovered cluster labels to external model-family labels using NMI and ARI.

The null is generated by permuting one label vector while holding the observed geometry fixed. This appears preferable to bootstrap confidence intervals because bootstrapping perturbs the density manifold that HDBSCAN is operating on.

### 4.7 Reproducibility
The finalized analyses used the following fixed configuration details.

1. Embedding checkpoints:
   `hkunlp/instructor-large` for instruction-tuned embeddings and `all-MiniLM-L6-v2` for the baseline comparison.
2. Python and platform:
   Python `3.14.0` on `macOS 15.7.3` running on `arm64` hardware.
3. Core libraries:
   NumPy `2.3.5`, pandas `3.0.0`, scikit-learn `1.8.0`, umap-learn `0.5.11`, sentence-transformers `5.2.3`, and PyTorch `2.10.0`.
4. Dimensionality reduction and clustering implementations:
   `umap-learn` for UMAP and `sklearn.cluster.HDBSCAN` for HDBSCAN.
5. Random seeds:
   paired UMAP runs used seeds `42` and `123`; in each run `transform_seed = random_state`.
6. Permutation settings:
   main robustness tables used `B = 1000` permutations.
7. Runtime note:
   under Python `3.14`, UMAP required `NUMBA_CACHE_DIR` to be set to a writable temporary directory for stable execution.

## 5. Results

### 5.1 Artifact Lineage
The final artifact chain used in this paper is:

1. Frank packet `frank_1775367155212_48b90d17`
2. Karthic rubric pack `karthic_1775367155213_270af0ba`
3. Dasha run `dasha_1775367155213_70677f12`
4. Statistical validation report `statistical_validation_20260405_002105`
5. Ensemble judgment report `ensemble_judge_retry_missing_20260405064608`

The paper's appendix and figure exports are generated directly from these finalized artifacts. Two provenance facts matter. First, the Frank packet in this run is a schema-faithful frontend artifact but not a fully native Frank retrieval run: it backfills the father-son hypothetical into the new workflow from a legacy benchmark question and golden answer. Second, the 240 stored `responseText` entries in the Dasha artifact are byte-identical to the frozen 240-response benchmark export used for standalone statistical validation. The reported clustering and permutation metrics therefore attach to the FKD artifact itself, even though the Frank intake step for this particular test question was modified. Appendix C provides the reproducibility manifest.

### 5.2 Frank Output
Frank resolves the doctrinal center of gravity of the benchmark and decomposes it into six inspectable analysis domains. The benchmark answer takes the marriage-consideration branch of the Statute of Frauds as dispositive, treats the one-year rule as inapplicable because the agreement could have been performed within one year, treats suretyship as secondary because the promise was made to the debtor rather than the lender, and treats promissory estoppel as weak because the son already planned to propose. This is exactly the kind of benchmark packet a clustering study needs: one strong target answer plus clearly articulated alternate paths that may still appear in the model population.

### 5.3 Karthic Output
Karthic turns that benchmark answer into a weighted rubric pack aligned to the six Frank domains. The resulting 13 active criteria and six golden targets preserve both core and peripheral doctrinal structure. The heaviest weights are assigned not just to the final conclusion, but also to secondary failure modes that distinguish sophisticated from shallow answers: whether the model overreads suretyship, whether it mishandles the main-purpose doctrine, whether it notices the son's prior intent, and whether it treats the father's tax-deduction mistake as legally irrelevant unless explicitly made a condition.

This is important for the pipeline as a whole. Frank supplies the canonical legal theory. Karthic makes that theory machine-readable at the proposition level.

### 5.4 Dasha Output
The final Dasha run contains 240 valid responses, with exact per-model balance and the following family totals: GPT 80, Claude 40, Gemini 40, LLAMA 40, DeepSeek 20, and Kimi 20. After full all-cluster ensemble judgment, the app-backed run stores 22 clusters and a weighted summary of `89.0 / 100` across all six applicable domains. At the domain level, Dasha selected cluster `17` as the winning centroid for bottom-line enforceability, cluster `2` for formation/consideration, cluster `21` for the marriage-consideration Statute of Frauds domain, cluster `12` for suretyship/main-purpose, cluster `15` for promissory estoppel, and cluster `2` again for mistake/one-year/counterarguments.

The raw response space already shows doctrinal spread before clustering. Across the 240 responses:

| Doctrinal signal | Responses mentioning it |
|---|---:|
| `consideration` | 202 |
| `debt of another` | 143 |
| `consideration of marriage` | 107 |
| `main purpose` | 90 |
| `one year` | 68 |
| `mistake` | 54 |
| `promissory estoppel` | 48 |
| `surety` | 45 |
| `leading object` | 22 |

These counts are descriptive, not inferential, but they confirm that the corpus did not collapse onto a single stock answer. The models repeatedly surface overlapping but non-identical theories: marriage-based unenforceability, suretyship/debt-assumption analysis, main-purpose arguments, promissory-estoppel rescue theories, and the one-year-rule branch.

![Figure 2. Instruction-tuned embedding projection of the Dasha partition.](figures/fkd_instruction_cluster_projection.png)

*Figure 2. A two-dimensional UMAP projection is used here only for visualization. Points are colored by Dasha cluster and marked by model family, with family coherence visible but not treated as the primary validation target.*

### 5.5 Ensemble Judge Results
Every one of the 22 cluster representatives was scored against every one of the six Karthic domains by the OpenAI-Claude-DeepSeek panel, yielding `132` cluster-domain evaluations. Across the completed grid, the mean agreement ratio is `0.95`, `111/132` evaluations are fully unanimous, and `21/132` show a `2-1` split. The six winning centroids are stronger still: all six have unanimous applicability agreement (`agreement ratio = 1.00`) and the resulting workflow-level weighted score is `89.0`. The final ensemble artifact contains three judges for all `132` evaluations.

| Domain | Winning cluster | Ensemble median score | Score spread | Main observation |
|---|---|---:|---:|---|
| Issue and Bottom-Line Enforceability | `cluster_17` | 95 | 5 | All three judges agree that this centroid states the enforceability issue cleanly and reaches the correct bottom-line answer |
| Formation and Consideration | `cluster_2` | 85 | 5 | Strong consensus that the centroid handles bargain-versus-gift structure and formation analysis well |
| Marriage-Consideration Statute of Frauds | `cluster_21` | 95 | 10 | This remains the strongest doctrinal win; the benchmark's dispositive theory is captured directly and confidently |
| Suretyship and Main-Purpose Doctrine | `cluster_12` | 85 | 10 | The panel treats this centroid as the best secondary-doctrine answer without the extreme spread seen in weaker clusters |
| Promissory Estoppel and Reliance | `cluster_15` | 85 | 5 | The winning centroid is unusually stable even though the domain as a whole produces the most disagreement across non-winning clusters |
| Mistake, One-Year Rule, and Counterarguments | `cluster_2` | 85 | 25 | The panel agrees on applicability and score strength, but there is wider variation in how fully the counterarguments are developed |

Three concrete examples show how the ensemble behaves. First, the winning issue-domain centroid, `cluster_17`, received scores of `95`, `95`, and `100`; the judges independently described it as fully aligned with the golden target and noted that its extra discussion of consideration and tax motive added context without contradiction. Second, `cluster_2` in the mistake/one-year-rule domain shows how the panel can agree on the same winner while disagreeing on score magnitude: OpenAI scored it `85`, Claude `65`, and DeepSeek `90`, producing a spread of `25` because the judges differed on how much counterargument detail was missing even though all treated the centroid as strong and applicable. Third, disagreement localizes sharply in promissory estoppel. For `cluster_14`, OpenAI marked the centroid applicable and scored it `40`, Claude marked it `not_applicable`, and DeepSeek marked it applicable with score `0`. All three judges nonetheless converged on the same substantive criticism: the centroid leans on full performance and strong reliance while omitting the golden target's key point that the son's preexisting intent to marry weakens inducement and reliance.

At the domain level, agreement is perfect for issue spotting, formation, and mistake/one-year refinement, nearly perfect for marriage-consideration (`0.97`) and suretyship (`0.99`), and lowest for promissory estoppel (`0.73`). That distribution is methodologically desirable. The benchmark's dispositive doctrine is stable, while the fallback rescue theory is exactly where generating models and judge models diverge in a way that remains legally interpretable.

### 5.6 Do the Clusters Capture Legal Theories?
The stronger validation target is not family grouping by itself, but whether clusters correspond to distinct lines of legal reasoning. Figure 3 and Appendix B show that they do.

![Figure 3. Cluster-by-domain ensemble median score heatmap.](figures/fkd_cluster_domain_heatmap.png)

*Figure 3. Rows are Dasha clusters, columns are Karthic domains, cell values are ensemble median scores, and black borders mark the winning cluster for each domain. The heatmap is useful because it makes doctrinal specialization visible at the cluster level.*

`cluster_17` is the clearest benchmark-aligned issue cluster. It contains seven responses, six from `gpt-5.4` and one from Kimi, and its representative response opens by asking whether the promise is enforceable "despite the absence of a signed writing." It scores `95` on both the issue and marriage-consideration domains and `82.2` overall. In the issue domain, the judges found no missing or contradictory points and described the representative answer as fully aligned with the golden target.

`cluster_2` is a different legal theory rather than a noisy mixed bag. It is dominated by `gpt-5.4-mini` (`19/23` responses), and its representative conclusion is that the promise is "likely enforceable because the son gave bargained-for consideration." That centroid scores `85` on formation and `85` on the mistake/counterarguments domain, but only `20` on issue framing and `40` on marriage-consideration Statute of Frauds. The judges' difference summaries explain why: the cluster handles bargain-versus-gift structure well, yet it underweights the dispositive writing requirement and therefore reaches the wrong bottom line. This is precisely the kind of coherent but legally inferior reasoning path that a methodology paper should be able to isolate.

`cluster_21` shows a third, clearly interpretable theory. It is a pure Kimi cluster (`5/5` responses) centered on the marriage-consideration branch of the Statute of Frauds. Its representative answer treats the lack of a signed writing as dispositive, scores `95` on both issue and marriage-consideration, and reaches `74.2` overall. The judges noted extra discussion of suretyship and main-purpose doctrine, but they did not treat those additions as contradictory because the cluster still keeps the marriage-consideration rule as the controlling ground of decision.

`cluster_14` illustrates why the promissory-estoppel domain drives most disagreement. It is a pure `claude-4-sonnet` cluster (`9/9` responses) whose representative response emphasizes full performance and the son's detriment from narrowing his marriage choice. That centroid scores `70` on formation but only `20` on promissory estoppel and `45.2` overall. The judges agreed that it misstates the benchmark's reliance logic: it treats reliance as strong, whereas the golden target treats reliance as weak because the son already intended to marry. The disagreement is therefore doctrinally meaningful rather than random.

These examples matter more than family purity alone. Family coherence is supportive evidence, but the central methodological result is that the clusters themselves have interpretable doctrinal profiles: benchmark-aligned Statute-of-Frauds clusters, formation-heavy enforceability clusters, strong secondary-doctrine clusters, and fallback-theory clusters where judge disagreement is concentrated.

### 5.7 Benchmarking Insights from Judging
As a benchmark, the father-son question is informative precisely because outcome correctness and rubric-level quality do not collapse to the same ranking. Under the reviewed conclusion-coding protocol, `140/240` responses (`58.3%`) state the benchmark-correct bottom line that the father's oral promise is unenforceable, `97/240` (`40.4%`) conclude that the promise is enforceable, and `3/240` (`1.3%`) remain ambiguous or conditionally dual.

At the model-family level, the bottom-line split is highly uneven:

| Family | Unenforceable | Enforceable | Ambiguous/dual | Correct rate |
|---|---:|---:|---:|---:|
| Gemini | 40 | 0 | 0 | 100.0% |
| DeepSeek | 20 | 0 | 0 | 100.0% |
| GPT | 46 | 32 | 2 | 57.5% |
| Claude | 17 | 22 | 1 | 42.5% |
| LLAMA | 12 | 28 | 0 | 30.0% |
| Kimi | 5 | 15 | 0 | 25.0% |

That table is useful but incomplete. FKD's main contribution is that it does not stop at whether a model said "unenforceable"; it evaluates how the model got there. When responses are scored through their judged cluster assignments, the ranking changes:

| Model | Unenforceable | Enforceable | Ambiguous/dual | Mean FKD cluster-mediated score |
|---|---:|---:|---:|---:|
| `gpt-5.4` | 16 | 4 | 0 | 80.81 |
| `google/gemini-3-flash` | 20 | 0 | 0 | 68.40 |
| `google/gemini-3-pro` | 20 | 0 | 0 | 68.40 |
| `deepseek-ai/deepseek-v3` | 20 | 0 | 0 | 61.48 |
| `gpt-4o` | 10 | 8 | 2 | 59.62 |
| `gpt-4.1-nano` | 11 | 9 | 0 | 59.24 |
| `meta/llama-4-scout-instruct` | 12 | 8 | 0 | 57.04 |
| `anthropic/claude-4-sonnet` | 13 | 7 | 0 | 54.45 |
| `gpt-5.4-mini` | 9 | 11 | 0 | 52.82 |
| `anthropic/claude-3.5-haiku` | 4 | 15 | 1 | 51.09 |
| `moonshotai/kimi-k2-thinking` | 5 | 15 | 0 | 48.56 |
| `meta/llama-4-maverick-instruct` | 0 | 20 | 0 | 39.87 |

Three benchmarking insights follow.

First, correctness and quality are distinct. Both Gemini models and DeepSeek achieve perfect bottom-line accuracy under the reviewed coding protocol, but `gpt-5.4` has the strongest overall FKD score because its responses more consistently align with the full rubric, especially on issue framing and the marriage-consideration Statute of Frauds theory. This is exactly the distinction an AI benchmark should surface: getting the answer right is not the same as giving the best legal analysis.

Second, the benchmark reveals specialization rather than only a single leaderboard. The winning issue and suretyship centroids are dominated by `gpt-5.4`, the winning marriage-consideration centroid is entirely populated by Kimi responses, and the winning formation-plus-counterarguments centroid is dominated by `gpt-5.4-mini`. Those models are not equally strong overall, but they each capture a distinct doctrinal niche. FKD therefore measures theory selection and doctrinal specialization, not just aggregate win rate.

Third, the judge ensemble is consistent enough to support these distinctions. Across all `132` evaluations, the panel is either unanimous or split `2-1`; there are no more fragmented outcomes. Agreement is perfect for issue spotting, formation, and the mistake/one-year-rule domain, and almost perfect for marriage-consideration (`0.97`) and suretyship (`0.99`). The main instability lies in promissory estoppel, where mean agreement falls to `0.73` and `18` of the `21` non-unanimous evaluations occur. That is a substantively plausible pattern: the benchmark's dispositive rule is stable, while the fallback rescue theory is where both generating models and judge models diverge.

### 5.8 Final Clustering Metrics
The final validation report shows that instruction-tuned embeddings dominate baseline embeddings on both internal quality and external correspondence.

| Metric | Instruction-tuned | Baseline | Better direction |
|---|---:|---:|---|
| Clusters found | 24 | 23 | Context dependent |
| Noise points | 7 | 11 | Lower |
| Noise ratio | 0.0292 | 0.0458 | Lower |
| Silhouette Score | 0.5668 | 0.4768 | Higher |
| Davies-Bouldin Index | 0.5899 | 0.7240 | Lower |
| Stability NMI | 0.9215 | 0.8801 | Higher |
| Stability ARI | 0.8122 | 0.6066 | Higher |
| Cluster-family NMI | 0.6303 | 0.5459 | Higher |
| Cluster-family ARI | 0.2814 | 0.2005 | Higher |

The practical interpretation is straightforward. The instruction-tuned representation yields tighter clusters, better inter-cluster separation, stronger correspondence with model-family labels, and slightly better seed-to-seed reproducibility. The baseline representation still finds structure, but it finds a noisier and less family-aligned structure.

### 5.9 Permutation-Based Robustness and Family Coherence
Both robustness tests are decisively significant. In the stored report, the permutation p-values are rendered as `0.0`; with `B = 1000`, this should be read as no null draw matching the observed statistic, i.e., `p < 0.001`.

| Test | Statistic | Instruction-tuned | Baseline |
|---|---|---:|---:|
| Seed stability | NMI | 0.9215 (`p < 0.001`) | 0.8801 (`p < 0.001`) |
| Seed stability | ARI | 0.8122 (`p < 0.001`) | 0.6066 (`p < 0.001`) |
| Cluster-family correspondence | NMI | 0.6303 (`p < 0.001`) | 0.5459 (`p < 0.001`) |
| Cluster-family correspondence | ARI | 0.2814 (`p < 0.001`) | 0.2005 (`p < 0.001`) |

The null distributions are not close to the observed values. For instruction-tuned embeddings, the cluster-family null NMI mean is `0.1210` and the observed value is `0.6303`; the cluster-family null ARI mean is effectively zero and the observed value is `0.2814`. For seed stability, the instruction-tuned null NMI mean is `0.3103` and the observed value is `0.9215`. Those gaps are too large to describe as accidental partitioning.

Family coherence remains visible as secondary evidence in the Dasha partition. Cluster `1` and cluster `4` are Gemini-dominated marriage-Statute-of-Frauds clusters, cluster `9` is entirely DeepSeek, cluster `14` and cluster `22` are pure `claude-4-sonnet`, cluster `10` and cluster `21` are pure Kimi, and cluster `20` is pure `gpt-5.4`. Mixed clusters still occur where models share legal theories, especially clusters `11`, `12`, and `18`. This pattern supports the family-correspondence statistics, but it does not replace the more important result that the clusters have interpretable doctrinal profiles.

## 6. Discussion
The final artifact shows that the Frank-Karthic-Dasha pipeline is functioning as an integrated research instrument rather than as three disconnected utilities.

Frank succeeded at benchmark design, with one qualification. The father-son question is hard enough to induce multiple coherent reasoning paths without being so open-ended that every answer becomes incomparable, but the Frank packet for this paper was backfilled from legacy benchmark materials rather than freshly generated from live anchor-case search. Karthic succeeded at doctrinal decomposition. The rubric pack exposes exactly which propositions matter and how heavily they matter. Dasha succeeded at large-sample response analysis. The 240-response corpus produces stable clusters, those clusters remain family-structured under a valid null test, and the full all-cluster ensemble judgment shows that the winning centroids are not arbitrary artifacts of a single judge's preferences.

From an AI-benchmarking perspective, the most important result is that FKD separates at least four things that standard benchmarks often collapse: bottom-line accuracy, doctrinal completeness, subdomain specialization, and evaluator agreement. In this corpus, Gemini and DeepSeek are strongest on raw outcome accuracy, `gpt-5.4` is strongest on full-rubric quality, Kimi contributes the strongest marriage-consideration cluster despite weak aggregate accuracy, and promissory-estoppel judgments are meaningfully less stable than core-doctrine judgments. A benchmark that only recorded "right" or "wrong" would miss most of that structure.

The embedding comparison is also substantively important. Legal reasoning is not just topic similarity. The instruction-tuned model appears to preserve doctrinal organization better than the baseline embedding model. That is the central methodological result of the paper.

## 7. Limitations
This paper studies one benchmark question. That was an intentional design choice because it lets us inspect the full pipeline in a controlled setting, but it limits cross-domain generalization. The next step is not to change the methodology; it is to repeat the same Frank-Karthic-Dasha workflow on additional questions from torts, property, civil procedure, and statutory interpretation.

A second limitation is that cluster-family correspondence should not be confused with legal correctness. A family-pure cluster may still be doctrinally weak. That is why the pipeline needs Frank and Karthic upstream: clustering shows structure, while the benchmark packet and rubric pack explain whether that structure reflects good law, bad law, or merely different theory selection.

A third limitation is provenance symmetry across stages. For this father-son run, Karthic and Dasha operate in the newer frontend-backed artifact chain, but Frank is a controlled import into that chain rather than a native live-retrieval Frank run. The paper therefore evaluates the newer workflow faithfully from the rubric stage forward and faithfully at the artifact-schema level throughout, but it does not yet show a full anchor-case-to-golden-answer Frank generation pass for this specific question.

A fourth limitation is operational rather than conceptual. The full ensemble evaluation required 132 cross-provider judgments and therefore needs explicit participation logging, completion checks, and cost management. The final artifact is complete, but the workflow overhead of maintaining that completeness is real and should be treated as part of the benchmark design.

## 8. Conclusion
On the father-son oral-promise benchmark, the final 240-response artifact demonstrates that the Frank-Karthic-Dasha pipeline works end to end in its newer artifact form, with a modified Frank intake step for this test run. Frank constructs a legally diagnostic benchmark packet, here by importing a legacy benchmark question and golden answer into the frontend schema. Karthic converts that packet into a weighted doctrinal rubric set. Dasha generates a balanced multi-model corpus, clusters the response space, judges all cluster representatives against all rubric domains with a three-model ensemble, and validates the resulting structure with permutation tests.

The empirical result is strong: instruction-tuned embeddings produce better legal-reasoning clusters than baseline point embeddings, the resulting clusters are stable across seeds and strongly associated with model families, and the winning domain centroids survive a full all-cluster cross-provider judge pass with unanimous applicability agreement. The benchmarking result is equally important: the corpus shows that bottom-line accuracy, doctrinal adequacy, and subdomain specialization are not the same thing. Some models often reach the right answer without being the strongest rubric performers, while other models dominate particular doctrinal niches despite weaker aggregate outcomes. The methodological result is therefore broader than this single question: permutation tests appear more appropriate than bootstrap confidence intervals for NMI and ARI in density-based legal-response clustering, and median-score ensemble judging offers a stronger safeguard against model-specific adjudication bias than relying on a single judge. For legal AI benchmarking, that is a more appropriate standard of evidence in this setting.

## References
Campello, R. J. G. B., Moulavi, D., & Sander, J. (2013). Density-based clustering based on hierarchical density estimates. *PAKDD*.

Davies, D. L., & Bouldin, D. W. (1979). A cluster separation measure. *IEEE Transactions on Pattern Analysis and Machine Intelligence*, 1(2), 224-227.

Good, P. I. (2005). *Permutation, Parametric, and Bootstrap Tests of Hypotheses*. Springer.

Guha, N., et al. (2023). LegalBench: A collaboratively built benchmark for measuring legal reasoning in large language models. *arXiv*.

Hubert, L., & Arabie, P. (1985). Comparing partitions. *Journal of Classification*, 2(1), 193-218.

Lin, C.-Y. (2004). ROUGE: A package for automatic evaluation of summaries. *Workshop on Text Summarization Branches Out*.

Liu, Y., et al. (2023). G-Eval: NLG evaluation using GPT-4 with better human alignment. *arXiv*.

McInnes, L., Healy, J., & Astels, S. (2017). hdbscan: Hierarchical density based clustering. *Journal of Open Source Software*, 2(11), 205.

McInnes, L., Healy, J., & Melville, J. (2018). UMAP: Uniform manifold approximation and projection for dimension reduction. *arXiv*.

Muennighoff, N., et al. (2023). MTEB: Massive text embedding benchmark. *EACL*.

Papineni, K., Roukos, S., Ward, T., & Zhu, W.-J. (2002). BLEU: A method for automatic evaluation of machine translation. *ACL*.

Rousseeuw, P. J. (1987). Silhouettes: A graphical aid to the interpretation and validation of cluster analysis. *Journal of Computational and Applied Mathematics*, 20, 53-65.

Strehl, A., & Ghosh, J. (2002). Cluster ensembles: A knowledge reuse framework for combining multiple partitions. *Journal of Machine Learning Research*, 3, 583-617.

Su, H., et al. (2023). One embedder, any task: Instruction-finetuned text embeddings. *Findings of ACL*.

Zhang, T., et al. (2020). BERTScore: Evaluating text generation with BERT. *ICLR*.
## Appendix A. Full Karthic Rubric

### Table A1. Domain Definitions

| Domain ID | Domain | Description | Weight | NA Guidance |
|---|---|---|---:|---|
| `analysis_domain_1` | Issue and Bottom-Line Enforceability | Identify the controlling legal issue and give the clearest enforceability conclusion. | 5 | Mark not applicable only if the response never reaches a bottom-line enforceability position. |
| `analysis_domain_2` | Formation and Consideration | Address unilateral contract structure and whether marriage is bargained-for consideration or only a conditional gift term. | 4 | Mark not applicable only if the response does not discuss formation or consideration at all. |
| `analysis_domain_3` | Marriage-Consideration Statute of Frauds | Identify the marriage-consideration branch of the Statute of Frauds as the central writing requirement and explain why no writing defeats enforcement. | 5 | Mark not applicable only if the response never discusses the marriage-consideration writing requirement. |
| `analysis_domain_4` | Suretyship and Main-Purpose Doctrine | Analyze the debt-assumption issue, explain why suretyship is weakened because the promise was made to the son rather than the creditor, and treat main-purpose doctrine as secondary. | 4 | Mark not applicable only if the response omits debt-assumption analysis entirely. |
| `analysis_domain_5` | Promissory Estoppel and Reliance | Evaluate promissory estoppel as a possible fallback while recognizing that the son's prior intent to marry weakens inducement and reliance. | 4 | Mark not applicable only if the response never discusses estoppel or reliance. |
| `analysis_domain_6` | Mistake, One-Year Rule, and Counterarguments | Handle secondary doctrinal clean-up: the one-year rule does not apply, the father's tax-deduction mistake is not a defense absent an express condition, and the best counterarguments should still be acknowledged. | 3 | Mark not applicable only if the response omits all secondary doctrinal refinement and counterargument handling. |

### Table A2. Active Criteria

| Criterion ID | Domain | Text |
|---|---|---|
| `criterion_r001` | Formation and Consideration | Identifies the father's conditional promise and the son's marriage within 18 months as offer and acceptance forming a unilateral contract. |
| `criterion_r002` | Formation and Consideration | Recognizes the issue whether the son's marriage constitutes bargained-for consideration or is merely a condition on a gratuitous promise. |
| `criterion_r004` | Marriage-Consideration Statute of Frauds | Explains that no signed writing exists between father and son, making the oral promise unenforceable under the marriage-consideration Statute of Frauds. |
| `criterion_r006` | Suretyship and Main-Purpose Doctrine | Analyzes the suretyship Statute of Frauds provision and concludes it likely does not apply because the promise was made to the son (debtor), not the creditor. |
| `criterion_r008` | Promissory Estoppel and Reliance | Evaluates promissory estoppel as a possible but weak exception to the Statute of Frauds due to weak inducement and reliance by the son. |
| `criterion_r009` | Promissory Estoppel and Reliance | Notes that the son's prior intent to marry the politician's daughter weakens inducement and reliance for consideration and promissory estoppel. |
| `criterion_r010` | Mistake, One-Year Rule, and Counterarguments | States that the father's unilateral mistake about the availability of a tax deduction does not excuse performance or affect enforceability absent express condition. |
| `criterion_r011` | Issue and Bottom-Line Enforceability | Concludes that the father's oral promise is unenforceable due to the marriage-consideration Statute of Frauds writing requirement and absence of writing. |
| `criterion_r012` | Mistake, One-Year Rule, and Counterarguments | Avoids material doctrinal error by not conflating the one-year provision with the marriage-consideration Statute of Frauds requirement. |
| `criterion_r014` | Mistake, One-Year Rule, and Counterarguments | Includes counterarguments such as the son's prior intent negating inducement and the possibility of promissory estoppel. |
| `criterion_r016` | Issue and Bottom-Line Enforceability | The response identifies the controlling legal issue raised by the facts. |
| `criterion_r018` | Mistake, One-Year Rule, and Counterarguments | The response addresses the principal counterargument or defense when relevant. |
| `criterion_r025` | Suretyship and Main-Purpose Doctrine | The response addresses the element of Main purpose of promisor. |

### Table A3. Golden Targets

| Domain | Summary | Golden Contains | Allowed Omissions | Contradiction Flags | Comparison Guidance |
|---|---|---|---|---|---|
| Issue and Bottom-Line Enforceability | The benchmark answer treats the controlling issue as whether the father's oral promise is enforceable despite the lack of a writing, and concludes the promise is not enforceable. | The controlling issue is whether the father's oral promise to pay the son's student loans is enforceable.<br>The best bottom-line answer is that the oral promise is unenforceable. | A response need not use the exact phrase bottom-line if the ultimate legal conclusion is clear. | The response concludes that the promise is enforceable without squarely overcoming the marriage-consideration Statute of Frauds problem. | Prioritize whether the centroid identifies the right issue and reaches the benchmark conclusion. |
| Formation and Consideration | The benchmark answer recognizes a unilateral-contract structure but treats consideration as contestable because the son already intended to marry. | The father's promise can be analyzed as an offer accepted by performance in a unilateral contract structure.<br>A strong answer distinguishes bargained-for consideration from a mere conditional gift.<br>The son's prior intent to marry weakens, but does not automatically defeat, a consideration analysis. | A response may omit the label unilateral contract if it still explains acceptance by performance. | The response treats the promise as enforceable solely because marriage occurred without analyzing bargain or inducement. | Look for correct treatment of offer-by-promise, acceptance-by-performance, and the consideration-versus-gift distinction. |
| Marriage-Consideration Statute of Frauds | The strongest doctrinal route is that the promise is made in consideration of marriage and is therefore unenforceable absent a signed writing. | The promise falls within the Statute of Frauds as a contract in consideration of marriage.<br>No signed writing exists between father and son.<br>That writing failure is the dispositive reason the promise is unenforceable. | A response need not discuss every Statute of Frauds category if it correctly treats marriage consideration as independently sufficient. | The response says the marriage-consideration Statute of Frauds does not apply.<br>The response treats completion of the marriage as automatically satisfying the writing requirement. | This is the core domain. Favor centroids that clearly identify marriage consideration as the benchmark rule of decision. |
| Suretyship and Main-Purpose Doctrine | A strong answer explains that classic suretyship is not a perfect fit on these facts and that main-purpose analysis matters only if suretyship is first triggered. | Suretyship is a possible but secondary issue because the promise was made to the son rather than directly to the lender.<br>The main-purpose or leading-object doctrine matters only if suretyship is otherwise in play.<br>Even a main-purpose argument would not cure the independent marriage-consideration Statute of Frauds problem. | A response may omit the label leading object if it still addresses the promisor's personal-benefit theory. | The response treats main-purpose doctrine as sufficient to make the promise enforceable without addressing the separate marriage-consideration bar. | Favor centroids that keep suretyship and main-purpose analysis subordinate to the marriage-consideration issue. |
| Promissory Estoppel and Reliance | Promissory estoppel is a plausible fallback theory but weak here because the son already intended to propose. | Promissory estoppel is a possible fallback theory.<br>The son's preexisting intent to marry weakens inducement and reliance.<br>Courts may be reluctant to use estoppel to override the Statute of Frauds in this setting. | A response may discuss reliance without using the exact phrase promissory estoppel if the doctrine is clear. | The response treats reliance as obviously strong despite the son's prior intent to marry. | Look for nuanced treatment of weak reliance rather than categorical acceptance or rejection. |
| Mistake, One-Year Rule, and Counterarguments | A careful answer avoids conflating the one-year rule with the marriage-consideration bar and treats the father's tax-deduction mistake as legally non-dispositive. | The one-year provision does not apply because the promise could have been performed within one year.<br>The father's tax-deduction mistake does not excuse performance unless the promise was expressly conditioned on receiving the deduction.<br>The response acknowledges meaningful counterarguments rather than presenting a one-sided conclusion. | A response need not discuss every counterargument if it addresses the strongest secondary objections. | The response treats the one-year rule as the dispositive Statute of Frauds category.<br>The response says the father's mistake alone voids the promise. | This domain separates careful doctrinal answers from shallow ones that mishandle secondary rules. |

## Appendix B. Full Cluster Appendix

Each profile reports cluster composition, bottom-line outcome mix under the revised coding protocol, the representative model, the full representative response text, and per-domain ensemble results.

### Cluster 1

| Field | Value |
|---|---|
| Size | 24 |
| Model composition | gemini-3-flash (20)<br>gemini-3-pro (4) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | unenforceable=24 |
| Representative model | gemini-3-flash |
| Cluster-mediated weighted score | 68.4 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father's oral promise to pay the student loans of the son in consideration of the son's marriage is enforceable under the Statute of Frauds.
Rule: The Statute of Frauds requires that certain contracts be evidenced by a writing and signed by the party to be charged to be legally enforceable. This includes any contract made in consideration of marriage. Under the marriage provision, any promise for which the consideration is marriage or a promise to marry falls within the Statute of Frauds. Generally, the marriage itself does not constitute sufficient part performance to remove an oral contract from the requirements of the Statute of Frauds.
Application: In this case, the father's promise to assume responsibility for the student loans of the son was conditioned upon the son marrying the daughter of a politician within eighteen months. Because the marriage was the consideration for the promise, the agreement falls under the marriage provision of the Statute of Frauds. Although the father was motivated by a potential tax deduction, which might relate to the main purpose exception of the suretyship provision, the marriage provision independently requires a writing and does not contain a similar exception for pecuniary interests. Since the father and son never signed a written contract, the oral agreement is unenforceable despite the son marrying the daughter fourteen months later.
Conclusion: The father's oral promise is not enforceable because it fails to satisfy the writing requirement of the Statute of Frauds for contracts made in consideration of marriage.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 40 | 1 |
| Marriage-Consideration Statute of Frauds | 95 | 1 |
| Suretyship and Main-Purpose Doctrine | 65 | 1 |
| Promissory Estoppel and Reliance | 55 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 2

| Field | Value |
|---|---|
| Size | 23 |
| Model composition | gpt-5.4-mini (19)<br>claude-4-sonnet (2)<br>gpt-4o (1)<br>gpt-5.4 (1) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=11, unenforceable=12 |
| Representative model | gpt-5.4-mini |
| Cluster-mediated weighted score | 52.6 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father's oral promise to pay the son's student loans in exchange for the son marrying the politician's daughter is enforceable despite the lack of a written contract and the father's mistaken belief about a tax deduction.
Rule: A promise is generally unenforceable if the Statute of Frauds requires a writing and no sufficient writing exists. However, a contract supported by consideration is not invalid merely because one party was also motivated by an expected tax benefit or other personal advantage. A promise is enforceable when the other party gives bargained-for consideration, even if the promisor had multiple motives. A promise to answer for the debt of another may fall within the Statute of Frauds, but an original promise made as part of a bargain for the promisor's own benefit may be enforceable without a writing depending on the jurisdiction. In addition, if the promise is unilateral and the requested act is fully performed, the promise becomes enforceable upon performance unless a writing is required by the Statute of Frauds and no exception applies.
Application: Here, the father promised to assume the son's student loans if the son married the politician's daughter within eighteen months. The son's marriage was the requested performance, and he completed that performance within fourteen months. The fact that the son already intended to propose does not eliminate consideration if the marriage was still bargained for in exchange for the father's promise. The father's subjective tax motivation does not make the promise unenforceable because enforceability depends on the bargain and performance, not on whether the father was also hoping for a tax deduction. The main issue is whether the oral promise falls within the Statute of Frauds as a promise to pay another person's debt. Because the father's promise appears to have been made to induce the son's marriage and to serve the father's own purposes, it can be characterized as an original promise rather than a collateral suretyship promise. On these facts, the son fully performed the requested condition, and the father's refusal based on later discovering that he would not receive the tax deduction does not undo the bargain. There is no indication of any applicable exception that would require a writing to defeat enforcement in this setting.
Conclusion: Yes. The father's oral promise is likely enforceable because the son gave bargained-for consideration by marrying the politician's daughter within the promised time, and the father's mistaken expectation of a tax deduction does not negate the contract.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 20 | 1 |
| Formation and Consideration | 85 | 1 |
| Marriage-Consideration Statute of Frauds | 40 | 1 |
| Suretyship and Main-Purpose Doctrine | 55 | 1 |
| Promissory Estoppel and Reliance | 50 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 85 | 1 |

### Cluster 3

| Field | Value |
|---|---|
| Size | 20 |
| Model composition | gpt-4.1-nano (18)<br>gpt-4o (2) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=9, unenforceable=11 |
| Representative model | gpt-4.1-nano |
| Cluster-mediated weighted score | 58.2 |
| Mean agreement ratio across domains | 1.0 |

Full representative response:

```text
Issue: Is the father's oral promise to pay the son's student loans enforceable despite the absence of a written contract, given the circumstances surrounding the promise?
Rule: Under the Statute of Frauds, certain contracts, including those that cannot be performed within one year, must be in writing to be enforceable unless an exception applies, such as part performance or promissory estoppel. An oral promise made in consideration of marriage may be enforceable if it is distinct and not merely a gratuitous promise, and if there is evidence of reliance or partial performance.
Application: In this case, the father made an oral promise to pay the son's student loans conditioned on the marriage within 18 months. The son did marry the daughter within the specified period, and some reliance occurred, as the son planned to marry the daughter, and the father expressed a willingness to help. However, the primary motivation for the promise was to obtain a tax deduction, which the father later discovered he would not qualify for, and the promise was not documented in writing. The promise appears to be contingent upon marriage, and although there was some action (marriage) following the promise, there is no evidence of partial performance or estoppel that would override the Statute of Frauds.
Conclusion: Therefore, the father's oral promise is likely unenforceable under the Statute of Frauds, as it was not in writing and does not fall within any recognized exception such as part performance or promissory estoppel.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 90 | 1 |
| Formation and Consideration | 40 | 1 |
| Marriage-Consideration Statute of Frauds | 65 | 1 |
| Suretyship and Main-Purpose Doctrine | 40 | 1 |
| Promissory Estoppel and Reliance | 60 | 1 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 4

| Field | Value |
|---|---|
| Size | 16 |
| Model composition | gemini-3-pro (16) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | unenforceable=16 |
| Representative model | gemini-3-pro |
| Cluster-mediated weighted score | 68.4 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether an oral promise to pay the debt of another is enforceable when the consideration for the promise is marriage, even if the primary motivation of the promisor was to obtain a personal economic benefit.
Rule: The Statute of Frauds requires certain types of contracts to be in writing and signed by the party against whom enforcement is sought. Contracts that fall within the Statute of Frauds include promises to answer for the debt of another person and agreements made upon consideration of marriage. Although the main purpose doctrine provides an exception to the debt provision of the Statute of Frauds when the primary objective of the promisor is to obtain a direct economic benefit, this exception does not apply to the marriage provision of the Statute of Frauds. Therefore, any contract where marriage is the consideration must be in writing to be legally enforceable.
Application: The father made an oral promise to assume responsibility for the student loans of his son on the condition that the son marry the daughter of a politician. While the primary motivation of the father was to secure a tax deduction for himself, which could potentially satisfy the main purpose exception for the debt provision of the Statute of Frauds, the promise was explicitly made in consideration of marriage. Because the consideration for the agreement was marriage, the contract is governed by the marriage provision of the Statute of Frauds. Since the father and the son never signed a written contract, the oral agreement violates the Statute of Frauds and cannot be enforced.
Conclusion: No, the oral promise of the father to pay off the student loans of the son is not enforceable because it was made in consideration of marriage and lacks a written agreement as required by the Statute of Frauds.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 40 | 1 |
| Marriage-Consideration Statute of Frauds | 95 | 1 |
| Suretyship and Main-Purpose Doctrine | 75 | 1 |
| Promissory Estoppel and Reliance | 45 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 5

| Field | Value |
|---|---|
| Size | 15 |
| Model composition | claude-3.5-haiku (15) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | ambiguous/dual=1, enforceable=14 |
| Representative model | claude-3.5-haiku |
| Cluster-mediated weighted score | 50.0 |
| Mean agreement ratio across domains | 1.0 |

Full representative response:

```text
Issue: Whether an oral promise to pay the son's student loans is legally enforceable under the Statute of Frauds and contract law principles
Rule: The Statute of Frauds requires certain types of contracts to be in writing to be enforceable, including promises made in consideration of marriage and promises to pay the debt of another. Promissory estoppel may provide an alternative basis for enforcing an oral promise if the promise was reasonably relied upon and injustice can only be avoided by enforcing the promise.
Application: The oral promise involves multiple complex elements: the promise was made in contemplation of marriage, was not in writing, and the promisor (father) had a personal motivation of potential tax benefits. The son had already planned to marry the politician's daughter, suggesting the promise did not significantly alter his actions. The father's primary motivation was a tax deduction that did not materialize, which might indicate a lack of serious intent. However, the son reasonably relied on the promise by marrying the specified person within the promised timeframe.
Conclusion: The oral promise is likely enforceable under the doctrine of promissory estoppel. Despite not meeting traditional contract formation requirements, the son's reasonable reliance and the specific performance of the marriage condition create a strong argument for enforcing the father's promise to pay the student loans.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 40 | 1 |
| Formation and Consideration | 50 | 1 |
| Marriage-Consideration Statute of Frauds | 40 | 1 |
| Suretyship and Main-Purpose Doctrine | 40 | 1 |
| Promissory Estoppel and Reliance | 70 | 1 |
| Mistake, One-Year Rule, and Counterarguments | 70 | 1 |

### Cluster 6

| Field | Value |
|---|---|
| Size | 14 |
| Model composition | llama-4-scout-instruct (11)<br>llama-4-maverick-instruct (2)<br>deepseek-v3 (1) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | enforceable=8, unenforceable=6 |
| Representative model | llama-4-scout-instruct |
| Cluster-mediated weighted score | 55.6 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Is the father's oral promise to pay off the son's student loans enforceable?
Rule: The Statute of Frauds requires that certain contracts, including those for the assumption of another's debt, be in writing and signed by the party to be charged. However, the main purpose exception to the Statute of Frauds may apply if the promise is made primarily for the benefit of the promisor.
Application: The father's promise to assume responsibility for the son's student loans was made in consideration of the son's marriage to the politician's daughter. Although the father was motivated by a tax deduction, he also stood to benefit from helping his son and potentially gaining a familial connection with the politician. The main purpose exception could potentially apply if it is found that the father's primary motivation was to benefit himself, but the presence of multiple motivations complicates this analysis. Nevertheless, the promise to assume another's debt generally falls under the Statute of Frauds and must be in writing to be enforceable.
Conclusion: The father's oral promise to pay off the son's student loans is not enforceable under the Statute of Frauds because it was not in writing and signed by the father.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 90 | 1 |
| Formation and Consideration | 40 | 1 |
| Marriage-Consideration Statute of Frauds | 40 | 1 |
| Suretyship and Main-Purpose Doctrine | 65 | 1 |
| Promissory Estoppel and Reliance | 50 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 7

| Field | Value |
|---|---|
| Size | 12 |
| Model composition | llama-4-maverick-instruct (10)<br>gpt-4o (1)<br>kimi-k2-thinking (1) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | enforceable=11, unenforceable=1 |
| Representative model | llama-4-maverick-instruct |
| Cluster-mediated weighted score | 33.9 |
| Mean agreement ratio across domains | 0.89 |

Full representative response:

```text
Issue: Whether the father's oral promise to pay off the son's student loans is enforceable despite the absence of a written contract.
Rule: The Statute of Frauds requires that certain types of contracts, including those where one party promises to pay the debt of another, be in writing to be enforceable. However, a promise to pay the debt of another is not within the Statute of Frauds if the promisor's main purpose is to benefit themselves. The promisor's motivation must be primarily for their own benefit, rather than to benefit the other party.
Application: The father's promise to pay the son's student loans is a promise to pay the debt of another. Although the father was motivated by a desire to help his son and hoped the son would marry the politician's daughter, his primary motivation was to benefit himself through a tax deduction. The fact that the father's motivation was primarily for his own benefit means that the promise is not within the Statute of Frauds and does not require a written contract to be enforceable. The son's marriage to the politician's daughter within the specified timeframe constitutes sufficient consideration for the father's promise.
Conclusion: The father's oral promise to pay off the son's student loans is enforceable.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 15 | 1 |
| Formation and Consideration | 40 | 1 |
| Marriage-Consideration Statute of Frauds | 22.5 | 0.67 |
| Suretyship and Main-Purpose Doctrine | 50 | 1 |
| Promissory Estoppel and Reliance | 45 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 8

| Field | Value |
|---|---|
| Size | 11 |
| Model composition | llama-4-scout-instruct (9)<br>gpt-4o (1)<br>llama-4-maverick-instruct (1) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=3, unenforceable=8 |
| Representative model | llama-4-scout-instruct |
| Cluster-mediated weighted score | 58.8 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Is the father's oral promise to pay off the son's student loans enforceable?
Rule: The Statute of Frauds requires that certain contracts be in writing and signed by the party to be charged. One of the categories of contracts that must meet this requirement is a promise to answer for the debt of another. Additionally, under the doctrine of consideration, a promise must be supported by bargained-for consideration to be enforceable.
Application: In this case, the father's promise to pay off the son's student loans is a promise to answer for the debt of another (the son). As such, it falls within the Statute of Frauds and must be in writing to be enforceable. Although the father's primary motivation was a tax deduction, and he also hoped to help his son, the promise was supported by consideration because the son agreed to marry the politician's daughter within 18 months, which he would not have done but for the father's promise. However, because the promise was oral and not in writing, it does not meet the requirements of the Statute of Frauds.
Conclusion: The father's oral promise to pay off the son's student loans is not enforceable.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 90 | 1 |
| Formation and Consideration | 60 | 1 |
| Marriage-Consideration Statute of Frauds | 40 | 1 |
| Suretyship and Main-Purpose Doctrine | 60 | 1 |
| Promissory Estoppel and Reliance | 55 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 9

| Field | Value |
|---|---|
| Size | 11 |
| Model composition | deepseek-v3 (11) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | unenforceable=11 |
| Representative model | deepseek-v3 |
| Cluster-mediated weighted score | 60.0 |
| Mean agreement ratio across domains | 0.89 |

Full representative response:

```text
Issue: Whether the father's oral promise to pay off the son's student loans is enforceable despite the lack of a written contract.
Rule: The enforceability of oral promises is generally governed by contract law principles, including the requirement of mutual assent, consideration, and the Statute of Frauds. The Statute of Frauds requires certain types of agreements, such as those that cannot be performed within one year, to be in writing to be enforceable.
Application: The father's promise was oral and involved a condition that could not be performed within one year (the son had to marry within 18 months). This falls under the Statute of Frauds, which mandates that such agreements must be in writing to be enforceable. Additionally, the father's primary motivation was a tax deduction, which he later discovered was unavailable, further undermining the claim of valid consideration. The son's pre-existing intention to marry the politician's daughter also suggests a lack of bargained-for exchange, a key element of consideration.
Conclusion: The father's oral promise is not enforceable because it violates the Statute of Frauds and lacks valid consideration.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 90 | 1 |
| Formation and Consideration | 60 | 1 |
| Marriage-Consideration Statute of Frauds | 50 | 1 |
| Suretyship and Main-Purpose Doctrine | 50 | 0.67 |
| Promissory Estoppel and Reliance | 60 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 10

| Field | Value |
|---|---|
| Size | 11 |
| Model composition | kimi-k2-thinking (11) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | enforceable=11 |
| Representative model | kimi-k2-thinking |
| Cluster-mediated weighted score | 31.7 |
| Mean agreement ratio across domains | 0.89 |

Full representative response:

```text
Issue: Is a father's oral promise to pay his son's student loans, conditioned on the son marrying a politician's daughter within 18 months, enforceable despite the lack of a written agreement?
Rule: Under the Statute of Frauds, a promise to answer for the debt of another must be in writing to be enforceable. However, the main purpose rule (also called the leading object rule) provides an exception: if the promisor’s primary purpose in making the promise is to secure a benefit for himself, rather than to benefit the debtor, the promise is not within the Statute of Frauds and may be oral. Additionally, a contract requires consideration, which is a bargained-for exchange of legal value that may consist of a detriment to the promisee or a benefit to the promisor.
Application: Here, the father promised to assume the son’s student loan obligation if the son married the politician’s daughter within 18 months. The father’s primary motivation was to obtain a tax deduction, which is a direct financial benefit to him. This benefit places the promise within the main purpose rule exception to the Statute of Frauds. The son’s marriage, a change in his legal status, constitutes a detriment to the son and a benefit to the father, providing valid consideration. The son performed the condition by marrying within the time frame. Therefore, the oral promise is not barred by the Statute of Frauds and is supported by consideration.
Conclusion: The father’s oral promise to pay the son’s student loans is enforceable.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 20 | 1 |
| Formation and Consideration | 65 | 1 |
| Marriage-Consideration Statute of Frauds | 22.5 | 0.67 |
| Suretyship and Main-Purpose Doctrine | 40 | 1 |
| Promissory Estoppel and Reliance | 10 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 11

| Field | Value |
|---|---|
| Size | 9 |
| Model composition | gpt-4o (4)<br>claude-3.5-haiku (4)<br>kimi-k2-thinking (1) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | ambiguous/dual=1, enforceable=5, unenforceable=3 |
| Representative model | gpt-4o |
| Cluster-mediated weighted score | 49.6 |
| Mean agreement ratio across domains | 1.0 |

Full representative response:

```text
Issue: Is the father's oral promise to pay off the son's student loans enforceable under contract law, considering the Statute of Frauds and the absence of a written agreement?
Rule: Under the Statute of Frauds, certain contracts must be in writing to be enforceable, including contracts in consideration of marriage and contracts that cannot be performed within one year. An oral promise may be enforceable if it does not fall within these categories or if an exception applies, such as promissory estoppel.
Application: The father's promise was made in consideration of the son's marriage, which typically requires a written contract under the Statute of Frauds. However, since the marriage occurred within 18 months, the agreement could be performed within one year, potentially exempting it from the Statute of Frauds. Additionally, the son relied on the promise and fulfilled his part by marrying the politician's daughter, which may invoke the doctrine of promissory estoppel if the son can prove reasonable reliance and detriment.
Conclusion: The father's oral promise may be enforceable if the son can establish that the agreement was capable of being performed within one year and that promissory estoppel applies due to the son's reliance on the promise. Otherwise, the Statute of Frauds could render the promise unenforceable due to the lack of a written contract.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 40 | 1 |
| Formation and Consideration | 40 | 1 |
| Marriage-Consideration Statute of Frauds | 50 | 1 |
| Suretyship and Main-Purpose Doctrine | 40 | 1 |
| Promissory Estoppel and Reliance | 65 | 1 |
| Mistake, One-Year Rule, and Counterarguments | 70 | 1 |

### Cluster 12

| Field | Value |
|---|---|
| Size | 9 |
| Model composition | gpt-5.4 (8)<br>kimi-k2-thinking (1) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=4, unenforceable=5 |
| Representative model | gpt-5.4 |
| Cluster-mediated weighted score | 85.8 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father's oral promise to assume responsibility for the son's student loans is an enforceable contract despite the absence of a writing.
Rule: A contract requires mutual assent and consideration. Consideration exists when a promise is exchanged for a bargained for performance or return promise, and the promisor's motive does not defeat consideration so long as the requested act was sought as the price of the promise. A promise may be supported by consideration even if the promisee was already inclined or planned to perform the requested act, so long as the promisee was not already legally obligated to do it. Under the Statute of Frauds, a promise made upon consideration of marriage must generally be in writing, but this provision does not apply to mutual promises to marry. It does apply to other promises in which marriage is the bargained for consideration. Full performance by one party does not remove an agreement from the marriage provision of the Statute of Frauds. A collateral promise to answer for the debt of another ordinarily must also be in writing, but when the promisor's main purpose is to serve the promisor's own pecuniary or business interest, the promise may fall outside that suretyship provision.
Application: The father promised to pay the son's student loans if the son married the politician's daughter within eighteen months. The son then married her within fourteen months. There was consideration because the son's marriage was the act requested by the father in exchange for the father's promise, and the son's prior intention to propose does not negate consideration since he was under no preexisting legal duty to marry her. The father's mistaken belief that he would receive a tax deduction does not invalidate the bargain; his motive for making the promise is generally irrelevant once valid consideration exists. However, the agreement was never reduced to writing. The promise was expressly conditioned on the son marrying a particular person, so marriage was the bargained for consideration rather than merely the subject of a mutual promise to marry. That places the agreement within the Statute of Frauds provision governing promises made upon consideration of marriage. Because that provision requires a writing, the oral promise is unenforceable. Although the promise also concerns payment of the son's debt, and the father's tax motive might support an argument that the main purpose exception applies to the suretyship rule, that does not avoid the separate marriage writing requirement. The son's completion of the marriage within the stated time likewise does not cure the lack of a writing for this type of agreement.
Conclusion: No. The father's oral promise is not enforceable because it was a promise made in exchange for the son's marriage and therefore falls within the Statute of Frauds marriage provision, which requires a written agreement.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 85 | 1 |
| Marriage-Consideration Statute of Frauds | 95 | 1 |
| Suretyship and Main-Purpose Doctrine | 85 | 1 |
| Promissory Estoppel and Reliance | 72.5 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 75 | 1 |

### Cluster 13

| Field | Value |
|---|---|
| Size | 9 |
| Model composition | deepseek-v3 (6)<br>gpt-4o (3) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=1, unenforceable=8 |
| Representative model | deepseek-v3 |
| Cluster-mediated weighted score | 61.2 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father's oral promise to pay off the son's student loans is legally enforceable despite the lack of a written contract.
Rule: The Statute of Frauds requires certain types of agreements to be in writing to be enforceable, including promises to answer for the debt of another. Additionally, contract formation requires offer, acceptance, consideration, mutual assent, and a legal purpose. Promises made without consideration or with a conditional benefit may not be enforceable.
Application: The father's promise was oral and lacked a written agreement, which may implicate the Statute of Frauds if the promise is construed as a guarantee for the son's debt. However, the primary issue here is whether there was valid consideration. The son's agreement to marry the politician's daughter does not constitute consideration for the father's promise because the son already planned to propose, meaning his action was not bargained for or induced by the father's promise. The father's motivation (tax deduction) also failed, further undermining the enforceability of the promise. Additionally, the father's promise was conditional on his own benefit (tax deduction), which did not materialize.
Conclusion: The father's oral promise is not legally enforceable due to lack of consideration and the failure of the condition (tax deduction) that motivated the promise.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 85 | 1 |
| Formation and Consideration | 60 | 1 |
| Marriage-Consideration Statute of Frauds | 40 | 1 |
| Suretyship and Main-Purpose Doctrine | 60 | 1 |
| Promissory Estoppel and Reliance | 65 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 55 | 1 |

### Cluster 14

| Field | Value |
|---|---|
| Size | 9 |
| Model composition | claude-4-sonnet (9) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | enforceable=5, unenforceable=4 |
| Representative model | claude-4-sonnet |
| Cluster-mediated weighted score | 45.2 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether a father's oral promise to pay his son's student loans in exchange for the son marrying a specific person within eighteen months is enforceable when the father refuses to perform due to discovering he will not receive expected tax benefits.
Rule: Under the Statute of Frauds, certain contracts must be in writing to be enforceable, including promises to pay the debt of another and contracts that cannot be performed within one year. However, a contract may still be enforceable if it has been fully performed by one party. For contract formation, there must be offer, acceptance, and consideration. Consideration exists when each party receives a legal benefit or incurs a legal detriment. A party's subjective motivation for entering a contract does not affect the validity of the contract once formed, and performance cannot be excused merely because expected collateral benefits do not materialize.
Application: The father's promise falls under the Statute of Frauds as both a promise to pay another's debt and a contract that could not be performed within one year from its making. Since no written contract exists, the promise would normally be unenforceable. However, the son fully performed his side of the agreement by marrying the politician's daughter within the specified timeframe. The contract had valid consideration because the son incurred the legal detriment of limiting his choice of marriage partner and timing, while the father received the benefit of his son marrying his preferred candidate within the specified period. Although the father's primary motivation was tax benefits that did not materialize, his subjective reasons for entering the contract do not invalidate the agreement or excuse his performance.
Conclusion: The father's oral promise is enforceable because the son fully performed his obligations under the agreement, and the father's discovery that he will not receive expected tax benefits does not excuse his contractual duty to pay the student loans.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 40 | 1 |
| Formation and Consideration | 70 | 1 |
| Marriage-Consideration Statute of Frauds | 40 | 1 |
| Suretyship and Main-Purpose Doctrine | 40 | 1 |
| Promissory Estoppel and Reliance | 20 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 70 | 1 |

### Cluster 15

| Field | Value |
|---|---|
| Size | 8 |
| Model composition | gpt-4o (4)<br>deepseek-v3 (2)<br>gpt-4.1-nano (1)<br>claude-3.5-haiku (1) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | ambiguous/dual=1, enforceable=1, unenforceable=6 |
| Representative model | gpt-4o |
| Cluster-mediated weighted score | 73.4 |
| Mean agreement ratio across domains | 1.0 |

Full representative response:

```text
Issue: Is the father's oral promise to pay off the son's student loans enforceable given the circumstances and lack of a written contract?
Rule: The Statute of Frauds requires that certain contracts, including those in consideration of marriage and those guaranteeing another's debt, be in writing to be enforceable. Additionally, promissory estoppel may enforce a promise if there is reasonable and detrimental reliance on the promise.
Application: The father's promise was made in consideration of marriage, which typically requires a written agreement under the Statute of Frauds to be enforceable. The son did marry the politician's daughter within the specified time frame, but there is no written agreement. The father's primary motivation was a potential tax deduction, which does not affect the requirement for a written contract. However, promissory estoppel might apply if the son reasonably relied on the father's promise to his detriment. In this case, the son already intended to marry the politician’s daughter and therefore likely did not rely on the father's promise to his detriment.
Conclusion: The father's oral promise to pay off the son's student loans is likely not enforceable due to the Statute of Frauds requiring a written agreement for promises made in consideration of marriage. Additionally, promissory estoppel is unlikely to apply as the son did not change his position based on the father's promise.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 90 | 1 |
| Formation and Consideration | 50 | 1 |
| Marriage-Consideration Statute of Frauds | 85 | 1 |
| Suretyship and Main-Purpose Doctrine | 60 | 1 |
| Promissory Estoppel and Reliance | 85 | 1 |
| Mistake, One-Year Rule, and Counterarguments | 60 | 1 |

### Cluster 16

| Field | Value |
|---|---|
| Size | 7 |
| Model composition | llama-4-maverick-instruct (7) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | enforceable=7 |
| Representative model | llama-4-maverick-instruct |
| Cluster-mediated weighted score | 41.2 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Is the father's oral promise to pay off the son's student loans enforceable despite the absence of a written contract and the father's change of heart due to not qualifying for a tax deduction?
Rule: Under the Statute of Frauds, certain types of contracts must be in writing and signed by the party to be charged to be enforceable. However, a promise to pay the debt of another is not within the Statute of Frauds if the promisor's main purpose is to benefit themselves. The enforceability of a contract also requires consideration, which is something of value given in exchange for a promise.
Application: The father's promise to pay the son's student loans is not within the Statute of Frauds because his main purpose was to benefit himself through a tax deduction, even though he also had a secondary motivation to help his son. The son provided consideration by marrying the politician's daughter within the specified timeframe, thus fulfilling the condition of the father's promise. The father's motivation for making the promise, primarily to gain a tax benefit, indicates that his promise is not a collateral promise to pay the debt of another but rather a primary obligation to benefit himself.
Conclusion: The father's oral promise to pay off the son's student loans is enforceable.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 20 | 1 |
| Formation and Consideration | 60 | 1 |
| Marriage-Consideration Statute of Frauds | 30 | 1 |
| Suretyship and Main-Purpose Doctrine | 60 | 1 |
| Promissory Estoppel and Reliance | 45 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 40 | 1 |

### Cluster 17

| Field | Value |
|---|---|
| Size | 7 |
| Model composition | gpt-5.4 (6)<br>kimi-k2-thinking (1) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=1, unenforceable=6 |
| Representative model | gpt-5.4 |
| Cluster-mediated weighted score | 82.2 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father’s oral promise to assume responsibility for the son’s student loans in exchange for the son marrying within eighteen months is an enforceable contract despite the absence of a signed writing and the father’s mistaken belief about tax consequences.
Rule: A contract requires mutual assent and consideration. Consideration exists when a promise is exchanged for a bargained for legal detriment or performance, even if the promisee was already inclined to take the action, so long as the action was sought by the promisor as the price of the promise. A promisor’s subjective motive, including a mistaken belief about tax benefits, does not defeat consideration if an objective bargain exists. Under the Statute of Frauds, a promise made upon consideration of marriage must generally be in writing to be enforceable, except for mutual promises to marry each other. An agreement in which one person promises to pay money or confer a benefit if another marries a third person is within the Statute of Frauds. Full performance by one party does not remove an agreement from the marriage provision of the Statute of Frauds in the same way it may for other categories, so the lack of a writing remains a bar to enforcement.
Application: Here, the father promised to pay the son’s student loans if the son married the politician’s daughter within eighteen months. The son then married her within fourteen months. The son’s marriage to the politician’s daughter was the requested performance and therefore would ordinarily supply consideration, even though the son already intended to propose, because he actually undertook the marriage as the bargained for condition of the father’s promise. The father’s mistaken assumption that he would receive a tax deduction does not by itself invalidate the bargain, because his promise was still objectively conditioned on the son’s marriage. However, this agreement was expressly conditioned on the son marrying a third party, so it was a promise made upon consideration of marriage. That type of agreement falls within the Statute of Frauds and must be evidenced by a signed writing to be enforceable. Since the father and son never signed a written contract, the Statute of Frauds prevents enforcement of the father’s oral promise. The father’s later refusal based on the absence of tax benefits does not change the result, because the dispositive defect is the lack of the required writing.
Conclusion: No. The father’s oral promise is not enforceable because it is a promise made upon consideration of the son’s marriage to a third person and therefore falls within the Statute of Frauds, which requires a signed writing.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 85 | 1 |
| Marriage-Consideration Statute of Frauds | 95 | 1 |
| Suretyship and Main-Purpose Doctrine | 70 | 1 |
| Promissory Estoppel and Reliance | 65 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 75 | 1 |

### Cluster 18

| Field | Value |
|---|---|
| Size | 5 |
| Model composition | claude-4-sonnet (4)<br>gpt-5.4-mini (1) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=2, unenforceable=3 |
| Representative model | claude-4-sonnet |
| Cluster-mediated weighted score | 57.0 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father's oral promise to assume responsibility for his son's student loans is enforceable when the promise was conditioned on the son's marriage and no written contract was executed.
Rule: Under the Statute of Frauds, certain contracts must be in writing to be enforceable, including promises to answer for the debt of another and contracts that cannot be performed within one year. However, a contract may still be enforceable if the promisor receives consideration in the form of a bargained-for exchange, and the promise was not made primarily for the promisor's own economic benefit. Additionally, the main purpose doctrine provides an exception to the Statute of Frauds when the promisor's main purpose in making the promise is to secure a pecuniary advantage for himself.
Application: The father's promise falls under the Statute of Frauds as a promise to answer for another's debt and a contract extending beyond one year, requiring a writing. However, the son provided consideration by marrying the politician's daughter as requested. The main purpose doctrine may apply since the father was primarily motivated by his own tax benefit rather than helping his son. The father's subsequent discovery that no tax deduction was available and his refusal to pay does not invalidate the original agreement, as his mistake about the tax consequences does not affect the validity of the contract formation.
Conclusion: The father's oral promise is likely unenforceable due to the Statute of Frauds requirement for written contracts when promising to pay another's debt, and no applicable exception clearly applies to overcome this writing requirement.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 85 | 1 |
| Formation and Consideration | 40 | 1 |
| Marriage-Consideration Statute of Frauds | 40 | 1 |
| Suretyship and Main-Purpose Doctrine | 60 | 1 |
| Promissory Estoppel and Reliance | 55 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 60 | 1 |

### Cluster 19

| Field | Value |
|---|---|
| Size | 5 |
| Model composition | gpt-4o (4)<br>gpt-4.1-nano (1) |
| Dominant bottom-line outcome | enforceable |
| Outcome breakdown | enforceable=3, unenforceable=2 |
| Representative model | gpt-4o |
| Cluster-mediated weighted score | 63.8 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Is the father's oral promise to pay off the son's student loans enforceable despite the lack of a written contract?
Rule: The Statute of Frauds requires certain types of contracts to be in writing to be enforceable, including contracts in consideration of marriage and contracts that cannot be performed within one year. Additionally, a contract requires consideration to be enforceable, which means there must be a bargained-for exchange between the parties.
Application: The father's promise was made in consideration of the son marrying within 18 months, which falls within the Statute of Frauds since it is a contract made in consideration of marriage. However, the marriage occurred within the 18-month timeframe, so the one-year provision does not apply. The promise lacks a written contract, which the Statute of Frauds typically requires for marriage consideration contracts, making it unenforceable. Also, while the son's agreement to marry the politician's daughter might be seen as consideration, the father's primary motivation was a hoped-for tax deduction, which did not materialize, possibly affecting the mutuality of obligation.
Conclusion: The father's oral promise to pay the son's student loans is not enforceable due to the Statute of Frauds' requirement for a written contract in consideration of marriage, and the lack of a written agreement makes the promise unenforceable.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 50 | 1 |
| Marriage-Consideration Statute of Frauds | 85 | 1 |
| Suretyship and Main-Purpose Doctrine | 40 | 1 |
| Promissory Estoppel and Reliance | 50 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 45 | 1 |

### Cluster 20

| Field | Value |
|---|---|
| Size | 5 |
| Model composition | gpt-5.4 (5) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | unenforceable=5 |
| Representative model | gpt-5.4 |
| Cluster-mediated weighted score | 76.8 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether a father's oral promise to assume responsibility for his son's student loans in exchange for the son's marriage to a particular person is enforceable despite the absence of a written contract and despite the father's mistake about a tax deduction.
Rule: A promise is enforceable as a contract when it is supported by consideration, meaning a bargained-for exchange in which each party gives or promises something of legal value. Marriage or a promise to marry can constitute valid consideration. However, under the Statute of Frauds, a contract made upon consideration of marriage, other than a mutual promise to marry, must be in writing and signed by the party to be charged in order to be enforceable. A promise by one person to confer a financial benefit in return for another person's marriage to a third party falls within this marriage provision of the Statute of Frauds. A promisor's mistaken motive for entering the agreement, such as expecting a tax advantage, does not by itself negate consideration or excuse performance if a valid contract otherwise exists.
Application: Here, the father promised to pay the son's student loans if the son married the politician's daughter within eighteen months. The son's marriage to that specific person was the requested performance and therefore would ordinarily supply consideration. The father's tax motivation does not destroy the bargain, because he also sought the son's marriage and the son's performance was the condition of the father's promise. The son in fact married the politician's daughter within fourteen months, satisfying the requested condition. Nevertheless, the agreement was never reduced to a signed writing. This was not a mutual promise between the two marrying parties; rather, it was a third party promise to provide a financial benefit in exchange for marriage. That type of agreement is within the Statute of Frauds and must be in writing to be enforceable. Because there was no signed writing, the father's oral promise cannot be enforced as a contract.
Conclusion: No. The father's oral promise is not enforceable because it was a contract made upon consideration of marriage and therefore required a signed writing under the Statute of Frauds.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 70 | 1 |
| Marriage-Consideration Statute of Frauds | 95 | 1 |
| Suretyship and Main-Purpose Doctrine | 70 | 1 |
| Promissory Estoppel and Reliance | 50 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 70 | 1 |

### Cluster 21

| Field | Value |
|---|---|
| Size | 5 |
| Model composition | kimi-k2-thinking (5) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | enforceable=1, unenforceable=4 |
| Representative model | kimi-k2-thinking |
| Cluster-mediated weighted score | 74.2 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father's oral promise to assume his son's student loan debt, conditioned on the son's marriage to a politician's daughter, is enforceable under the Statute of Frauds.
Rule: The Statute of Frauds requires that certain types of contracts be in writing to be enforceable. These include contracts to answer for the debt of another (suretyship) and contracts made in consideration of marriage. The main purpose exception (or leading object rule) exempts a suretyship contract from the writing requirement when the promisor’s primary purpose is to obtain a benefit for themselves. However, the main purpose exception does not apply to the marriage consideration provision of the Statute of Frauds. Additionally, enforceable contracts require consideration, which consists of a bargained-for exchange; a promise to perform an act that one is not legally obligated to undertake can constitute valid consideration. The pre-existing duty rule bars consideration when a party promises to do something they are already legally bound to do, but it does not apply to a party’s existing intention that is not a legal duty to the promisor.
Application: The father’s promise to pay the son’s student loans is a classic suretyship arrangement because it involves a promise to answer for the son’s debt. The promise was oral, so it is unenforceable under the suretyship provision unless the main purpose exception applies. The father was primarily motivated by a tax deduction, which is a direct personal benefit, so the main purpose exception would render the suretyship enforceable. Nevertheless, the promise was expressly conditioned on the son’s marriage, making it also a contract in consideration of marriage. The Statute of Frauds requires such contracts to be in writing, and the main purpose exception does not excuse this requirement. The son’s performance of marrying the politician’s daughter constitutes consideration because he was not legally obligated to the father to do so, and his prior intention to propose does not amount to a pre-existing duty that would bar consideration. However, the absence of a writing for a contract in consideration of marriage is fatal to enforceability. No partial performance or other exception applies because the father has not made any payments.
Conclusion: The father’s oral promise is unenforceable because it falls within the marriage consideration provision of the Statute of Frauds, which requires a writing and is not subject to the main purpose exception.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 65 | 1 |
| Marriage-Consideration Statute of Frauds | 95 | 1 |
| Suretyship and Main-Purpose Doctrine | 60 | 1 |
| Promissory Estoppel and Reliance | 45 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 75 | 1 |

### Cluster 22

| Field | Value |
|---|---|
| Size | 5 |
| Model composition | claude-4-sonnet (5) |
| Dominant bottom-line outcome | unenforceable |
| Outcome breakdown | unenforceable=5 |
| Representative model | claude-4-sonnet |
| Cluster-mediated weighted score | 69.8 |
| Mean agreement ratio across domains | 0.94 |

Full representative response:

```text
Issue: Whether the father's oral promise to assume responsibility for his son's student loans in exchange for the son's marriage to a specific person within eighteen months is legally enforceable.
Rule: Under the Statute of Frauds, certain contracts must be in writing to be enforceable, including promises to answer for the debt of another and contracts that cannot be performed within one year. Additionally, a valid contract requires offer, acceptance, and consideration, where consideration must be a bargained-for exchange of legal detriment or benefit. Past consideration or actions already intended to be performed regardless of the promise generally do not constitute valid consideration.
Application: The father's promise falls under the Statute of Frauds as both a suretyship agreement to pay another's debt and a contract that could not be performed within one year due to the eighteen-month timeframe. Since the agreement was oral and not written, it violates the Statute of Frauds writing requirement. Furthermore, the consideration is questionable because the son stated he already planned to propose to the politician's daughter regardless of his father's promise, suggesting the marriage was not truly bargained-for consideration but rather past or pre-existing intent. The father's changed motivation regarding tax benefits does not affect the contract formation analysis, as his subjective reasons for making the promise are irrelevant to enforceability.
Conclusion: The father's oral promise is not enforceable because it violates the Statute of Frauds writing requirement and lacks valid consideration, since the son's marriage was not a bargained-for exchange but rather an action he already intended to perform.
```

| Domain | Ensemble median score | Agreement ratio |
|---|---:|---:|
| Issue and Bottom-Line Enforceability | 95 | 1 |
| Formation and Consideration | 70 | 1 |
| Marriage-Consideration Statute of Frauds | 60 | 1 |
| Suretyship and Main-Purpose Doctrine | 65 | 1 |
| Promissory Estoppel and Reliance | 62.5 | 0.67 |
| Mistake, One-Year Rule, and Counterarguments | 60 | 1 |

## Appendix C. Reproducibility Manifest

| Item | Value |
|---|---|
| Frank packet | `frank_1775367155212_48b90d17` |
| Karthic rubric pack | `karthic_1775367155213_270af0ba` |
| Dasha run | `dasha_1775367155213_70677f12` |
| Ensemble report | `ensemble_judge_retry_missing_20260405064608` |
| Statistical validation report | `statistical_validation_20260405_002105` |
| Corpus design target | `240 = 20 x 12` |
| Model roster | gpt-4o, gpt-5.4, gpt-5.4-mini, gpt-4.1-nano, claude-4-sonnet, claude-3.5-haiku, gemini-3-pro, gemini-3-flash, deepseek-v3, kimi-k2-thinking, llama-4-maverick-instruct, llama-4-scout-instruct |
| Instruction embedding model | `hkunlp/instructor-large` |
| Baseline embedding model | `all-MiniLM-L6-v2` |
| UMAP settings | `n_components=5`, `n_neighbors=5`, `min_dist=0.1`, seeds `42` and `123` |
| HDBSCAN settings | `min_cluster_size=5`, `min_samples=2`, `cluster_selection_method=eom` |
| Permutation-test settings | `B = 1000` |
| Judge panel | OpenAI `gpt-4.1-mini`, Claude `claude-4-sonnet`, DeepSeek `deepseek-v3` |
| Judge aggregation | majority vote for applicability; median score across applicable judges |
| Python / platform | `3.14.0` on `macOS 15.7.3 arm64` |
| Library versions | NumPy `2.3.5`, pandas `3.0.0`, scikit-learn `1.8.0`, umap-learn `0.5.11`, sentence-transformers `5.2.3`, PyTorch `2.10.0` |
