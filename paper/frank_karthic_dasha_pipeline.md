# Evaluating Legal-Reasoning Diversity with the Frank-Karthic-Dasha Pipeline: Density Clustering, Instruction-Tuned Embeddings, and Permutation-Based Robustness Tests

**Authors**: Alan Tai, Frank Hanlon, Karthic Subramanian, Dasha Veraksa  
**Date**: April 2026

## Abstract
This paper evaluates the Frank-Karthic-Dasha legal benchmarking pipeline on a single hard contracts hypothetical: whether a father's oral promise to assume his son's student loans is enforceable when the promise is tied to the son's marriage to a politician's daughter, the father hoped for a tax deduction, no writing exists, and the son already intended to marry. Frank constructs the benchmark packet and benchmark answer; Karthic decomposes that packet into weighted doctrinal rubrics; Dasha generates repeated model outputs, embeds them, clusters them, and statistically validates the resulting structure.

The final workflow lineage analyzed here is a newer app-backed FKD chain with artifact identifiers `frank_1775367155212_48b90d17`, `karthic_1775367155213_270af0ba`, and `dasha_1775367155213_70677f12`. The Dasha run contains 240 responses, exactly 20 from each of 12 models across six model families. We separately verified that the stored `responseText` payloads are byte-identical to the frozen 240-response benchmark export used for standalone validation; accordingly, the clustering and statistical validation reported here apply to the FKD artifact itself rather than to a different downstream copy. For this test-run question, the Frank packet uses the newer frontend schema but was seeded from a legacy benchmark question and golden answer rather than from a live anchor-case intake plus web search; the Karthic and Dasha stages then run in the newer artifact format. Clustering uses UMAP (`n_components = 5`) followed by HDBSCAN (`min_cluster_size = 5`). Cluster representatives are judged against Karthic’s structured golden targets by a three-model ensemble consisting of OpenAI, Claude, and DeepSeek. Applicability is aggregated by majority vote and the stored domain score is the median applicable-judge score, which is more robust than a simple mean under small-panel disagreement. On the final artifact, instruction-tuned embeddings outperform baseline embeddings on internal cluster quality (`Silhouette = 0.5668` vs. `0.4768`; `Davies-Bouldin = 0.5899` vs. `0.7240`) and on external cluster-family correspondence (`NMI = 0.6303` vs. `0.5459`; `ARI = 0.2814` vs. `0.2005`). Seed-to-seed cluster stability is also high for both representations, with instruction-tuned embeddings again stronger (`NMI = 0.9215`, `ARI = 0.8122`). A full all-cluster ensemble rejudge across 22 cluster representatives and six rubric domains (`132` cluster-domain evaluations) yields a mean agreement ratio of `0.95`, `111` fully unanimous evaluations, and unanimous agreement on all six winning centroids; the resulting Dasha weighted score is `89.0 / 100`. For bottom-line accuracy, `140/240` responses (`58.3%`) explicitly concluded that the promise was unenforceable, which is the benchmark-correct outcome. Robustness is established with permutation tests for NMI and ARI rather than bootstrap confidence intervals, because resampling-with-replacement distorts the local density geometry that HDBSCAN depends on. The result is an end-to-end benchmark showing that legal-reasoning diversity is both measurable and statistically stable at the cluster level.

## 1. Introduction
Legal benchmarking should not collapse model behavior to a single correctness score. In open-ended legal analysis, two responses can reach the same outcome for different doctrinal reasons, and two responses can discuss the same doctrine while assigning it very different weights. For this father-son hypothetical, a serious answer must sort through at least five overlapping issues: unilateral contract formation, whether marriage is consideration or only a gift condition, whether the marriage-consideration branch of the Statute of Frauds is independently dispositive, whether suretyship or the main-purpose doctrine matters, and whether promissory estoppel survives the son's preexisting intent to marry.

The Frank-Karthic-Dasha pipeline was built to preserve that structure. Frank defines the benchmark packet and the benchmark answer. Karthic turns the benchmark answer into inspectable rubric targets. Dasha samples a large pool of model outputs and studies the geometry of the response space itself. This paper focuses on whether that full workflow produces a stable and defensible empirical object.

This paper makes four methodological claims.

1. Stage separation matters: Frank, Karthic, and Dasha produce distinct but compatible artifacts.
2. Instruction-tuned embeddings are better than baseline point embeddings for organizing legal reasoning.
3. UMAP followed by HDBSCAN is an appropriate clustering architecture for heterogeneous legal responses with unknown cluster count.
4. Permutation tests appear more appropriate than bootstrap confidence intervals for NMI and ARI in this density-clustering setting.

This study asks whether legal-reasoning diversity among LLM responses can be measured reliably using density clustering and rubric-aligned evaluation within the FKD pipeline. This paper should therefore be read primarily as a methodology demonstration rather than as a leaderboard benchmark. The father-son hypothetical serves as a controlled test case for validating the FKD evaluation architecture.

A compact overview of the pipeline is:

```text
Frank
  -> benchmark packet + golden answer
Karthic
  -> weighted domains + criteria + domain-specific golden targets
Dasha
  -> 240 responses from 12 models
  -> instruction-tuned and baseline embeddings
  -> UMAP + HDBSCAN clustering
  -> representative-centroid selection
  -> OpenAI + Claude + DeepSeek ensemble judging
Outputs
  -> cluster-quality metrics
  -> permutation-based robustness tests
  -> model, family, and doctrinal benchmarking insights
```

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
The final Dasha artifact for this paper is run `dasha_1775367155213_70677f12`. It is linked to the approved Karthic pack by `rubricPackId`, contains 240 valid IRAC-structured responses, and stores 22 archived clusters plus a workflow-level weighted score of `89.0` after the full ensemble rejudge. Because the app-backed Dasha run persists responses as `responseText` rather than as a nested IRAC object, the analysis pipeline normalizes those payloads back into the canonical four-field IRAC form before embedding.

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

After clustering, Dasha judges each cluster representative against each Karthic domain by using a three-provider ensemble:

1. OpenAI `gpt-4.1-mini`
2. Claude `claude-4-sonnet`
3. DeepSeek `deepseek-v3`

Each judge returns applicability, a 0-100 score, confidence, and structured difference fields (`matched`, `missing`, `extra`, and `contradiction`). The ensemble uses majority vote for applicability and the median score across applicable judges as the stored domain score. The frontend also records agreement ratio, score spread, and score standard deviation so disagreement itself becomes analyzable. In this paper's final run, Dasha evaluates all 22 cluster representatives against all six Karthic domains, yielding `22 x 6 = 132` cluster-domain ensemble judgments rather than only auditing the eventual winners. Some judged clusters contain outputs from model families that also appear in the judge panel, but judges score cluster representatives rather than isolated self-generated responses, and the final stored score is the ensemble median rather than any single judge's self-assessment.

### 4.4 Additional Benchmarking Analyses
To make the paper informative as an AI-benchmarking study rather than only a clustering study, we report two additional derived analyses from the finalized FKD artifact.

First, we code bottom-line correctness at the response level. A response is marked correct if its explicit conclusion states that the father's promise is `unenforceable` or `not enforceable`, which is the golden-answer outcome. A response is marked incorrect if its conclusion states `enforceable`. No response in the 240-response corpus lacked an explicit bottom-line conclusion under this rule.

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
5. Ensemble finalized rejudge report `ensemble_judge_retry_missing_20260405064608`

The supporting analysis code performs three transformations that are important for reproducibility: it materializes the father-son hypothetical into the newer frontend-backed artifact chain, canonicalizes stored `responseText` records back into IRAC form before embedding, and reruns incomplete judge-panel evaluations until the stored Dasha artifact contains no missing judge data.

Two provenance facts matter. First, the Frank packet in this run is a schema-faithful frontend artifact but not a fully native Frank retrieval run: it backfills the father-son hypothetical into the new workflow from a legacy benchmark question and golden answer. Second, the 240 `responseText` entries stored in the new Dasha run are exactly identical to the accepted 240-response export previously used for standalone statistical validation. The reported clustering and permutation metrics therefore attach to the newer Frank -> Karthic -> Dasha chain, even though the Frank intake step for this particular test question was modified.

### 5.2 Frank Output
Frank resolves the doctrinal center of gravity of the benchmark and decomposes it into six inspectable analysis domains. The benchmark answer takes the marriage-consideration branch of the Statute of Frauds as dispositive, treats the one-year rule as inapplicable because the agreement could have been performed within one year, treats suretyship as secondary because the promise was made to the debtor rather than the lender, and treats promissory estoppel as weak because the son already planned to propose. This is exactly the kind of benchmark packet a clustering study needs: one strong target answer plus clearly articulated alternate paths that may still appear in the model population.

### 5.3 Karthic Output
Karthic turns that benchmark answer into a weighted rubric pack aligned to the six Frank domains. The resulting 13 active criteria and six golden targets preserve both core and peripheral doctrinal structure. The heaviest weights are assigned not just to the final conclusion, but also to secondary failure modes that distinguish sophisticated from shallow answers: whether the model overreads suretyship, whether it mishandles the main-purpose doctrine, whether it notices the son's prior intent, and whether it treats the father's tax-deduction mistake as legally irrelevant unless explicitly made a condition.

This is important for the pipeline as a whole. Frank supplies the canonical legal theory. Karthic makes that theory machine-readable at the proposition level.

### 5.4 Dasha Output
The final Dasha run contains 240 valid responses, with exact per-model balance and the following family totals: GPT 80, Claude 40, Gemini 40, LLAMA 40, DeepSeek 20, and Kimi 20. After the full all-cluster ensemble rejudge, the app-backed run stores 22 clusters and a weighted summary of `89.0 / 100` across all six applicable domains. At the domain level, Dasha selected cluster `17` as the winning centroid for bottom-line enforceability, cluster `2` for formation/consideration, cluster `21` for the marriage-consideration Statute of Frauds domain, cluster `12` for suretyship/main-purpose, cluster `15` for promissory estoppel, and cluster `2` again for mistake/one-year/counterarguments.

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

### 5.5 Ensemble Judge Results
The paper results now use a full Dasha rejudge rather than a winner-only audit. Every one of the 22 cluster representatives was scored against every one of the six Karthic domains by the OpenAI-Claude-DeepSeek panel, yielding `132` cluster-domain evaluations. The finalized source-of-record report is `ensemble_judge_retry_missing_20260405064608`, which includes a successful retry of the only initially incomplete comparison and restores full three-judge coverage to all `132` evaluations. Across the completed grid, the mean agreement ratio is `0.95`, `111/132` evaluations are fully unanimous, and only `21/132` show any disagreement. The six winning centroids are stronger still: all six have unanimous applicability agreement (`agreement ratio = 1.00`) and the resulting workflow-level weighted score is `89.0`.

| Domain | Winning cluster | Ensemble median score | Score spread | Main observation |
|---|---|---:|---:|---|
| Issue and Bottom-Line Enforceability | `cluster_17` | 95 | 5 | All three judges agree that this centroid states the enforceability issue cleanly and reaches the correct bottom-line answer |
| Formation and Consideration | `cluster_2` | 85 | 5 | Strong consensus that the centroid handles bargain-versus-gift structure and formation analysis well |
| Marriage-Consideration Statute of Frauds | `cluster_21` | 95 | 10 | This remains the strongest doctrinal win; the benchmark's dispositive theory is captured directly and confidently |
| Suretyship and Main-Purpose Doctrine | `cluster_12` | 85 | 10 | The panel treats this centroid as the best secondary-doctrine answer without the extreme spread seen in weaker clusters |
| Promissory Estoppel and Reliance | `cluster_15` | 85 | 5 | The winning centroid is unusually stable even though the domain as a whole produces the most disagreement across non-winning clusters |
| Mistake, One-Year Rule, and Counterarguments | `cluster_2` | 85 | 25 | The panel agrees on applicability and score strength, but there is wider variation in how fully the counterarguments are developed |

Two substantive patterns emerge. First, the ensemble is most confident on the benchmark's core legal theory: both the bottom-line domain and the marriage-consideration Statute of Frauds domain produce winning scores of `95`, with unanimous applicability and low score spread. Second, disagreement is concentrated in promissory estoppel rather than in the dispositive doctrines. The promissory-estoppel domain accounts for `18` of the `21` non-unanimous evaluations and has a domain-level mean agreement ratio of `0.73`, while issue spotting, formation, and the mistake/one-year-rule domain are fully unanimous across all 22 clusters. That is a useful result rather than a defect: it shows that the ensemble is sensitive to exactly the rescue-theory territory where legal models often diverge in theory selection and evidentiary caution.

Operationally, the finalized artifact is complete: all `132` cluster-domain evaluations now retain all three judges. The retry pass changed no winning centroid, no winning score, and no workflow-level conclusion; it only eliminated the single initially incomplete record so that the stored Dasha artifact contains no missing judge data.

### 5.6 Benchmarking Insights from Judging
As a benchmark, the father-son question is informative precisely because outcome correctness and rubric-level quality do not collapse to the same ranking. At the response-conclusion level, `140/240` responses (`58.3%`) state the benchmark-correct bottom line that the father's oral promise is unenforceable, while `100/240` (`41.7%`) conclude that the promise is enforceable. No response is uncodable under the conclusion-based rule, because every response states an explicit bottom line.

At the model-family level, the bottom-line split is highly uneven:

| Family | Correct (`unenforceable`) | Incorrect (`enforceable`) | Correct rate |
|---|---:|---:|---:|
| Gemini | 40 | 0 | 100.0% |
| DeepSeek | 18 | 2 | 90.0% |
| GPT | 48 | 32 | 60.0% |
| Claude | 17 | 23 | 42.5% |
| LLAMA | 12 | 28 | 30.0% |
| Kimi | 5 | 15 | 25.0% |

That table is useful but incomplete. FKD's main contribution is that it does not stop at whether a model said "unenforceable"; it evaluates how the model got there. When responses are scored through their judged cluster assignments, the ranking changes:

| Model | Correct responses | Mean FKD cluster-mediated score |
|---|---:|---:|
| `gpt-5.4` | 16 / 20 | 80.81 |
| `google/gemini-3-flash` | 20 / 20 | 68.40 |
| `google/gemini-3-pro` | 20 / 20 | 68.40 |
| `deepseek-ai/deepseek-v3` | 18 / 20 | 61.48 |
| `gpt-4o` | 12 / 20 | 59.62 |
| `gpt-4.1-nano` | 10 / 20 | 59.24 |
| `meta/llama-4-scout-instruct` | 12 / 20 | 57.04 |
| `anthropic/claude-4-sonnet` | 13 / 20 | 54.45 |
| `gpt-5.4-mini` | 10 / 20 | 52.82 |
| `anthropic/claude-3.5-haiku` | 4 / 20 | 51.09 |
| `moonshotai/kimi-k2-thinking` | 5 / 20 | 48.56 |
| `meta/llama-4-maverick-instruct` | 0 / 20 | 39.87 |

Three benchmarking insights follow.

First, correctness and quality are distinct. Both Gemini models achieve perfect bottom-line accuracy, but `gpt-5.4` has the strongest overall FKD score because its responses more consistently align with the full rubric, especially on issue framing (`mean issue score = 91.25`) and the marriage-consideration Statute of Frauds theory (`mean marriage-SoF score = 92.25`). This is exactly the distinction an AI benchmark should surface: getting the answer right is not the same as giving the best legal analysis.

Second, the benchmark reveals specialization rather than only a single leaderboard. The winning issue and suretyship centroids are dominated by `gpt-5.4`, the winning marriage-consideration centroid is entirely populated by Kimi responses, and the winning formation-plus-counterarguments centroid is dominated by `gpt-5.4-mini`. Those models are not equally strong overall, but they each capture a distinct doctrinal niche. FKD therefore measures theory selection and doctrinal specialization, not just aggregate win rate.

Third, the judge ensemble is consistent enough to support these distinctions. Across all `132` evaluations, the panel is either unanimous or split `2-1`; there are no more fragmented outcomes. Agreement is perfect for issue spotting, formation, and the mistake/one-year-rule domain, and almost perfect for marriage-consideration (`0.97`) and suretyship (`0.99`). The main instability lies in promissory estoppel, where mean agreement falls to `0.73` and `18` of the `21` non-unanimous evaluations occur. That is a substantively plausible pattern: the benchmark's dispositive rule is stable, while the fallback rescue theory is where both generating models and judge models diverge.

### 5.7 Final Clustering Metrics
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

### 5.8 Permutation-Based Robustness
Both robustness tests are decisively significant. In the stored report, the permutation p-values are rendered as `0.0`; with `B = 1000`, this should be read as no null draw matching the observed statistic, i.e., `p < 0.001`.

| Test | Statistic | Instruction-tuned | Baseline |
|---|---|---:|---:|
| Seed stability | NMI | 0.9215 (`p < 0.001`) | 0.8801 (`p < 0.001`) |
| Seed stability | ARI | 0.8122 (`p < 0.001`) | 0.6066 (`p < 0.001`) |
| Cluster-family correspondence | NMI | 0.6303 (`p < 0.001`) | 0.5459 (`p < 0.001`) |
| Cluster-family correspondence | ARI | 0.2814 (`p < 0.001`) | 0.2005 (`p < 0.001`) |

The null distributions are not close to the observed values. For instruction-tuned embeddings, the cluster-family null NMI mean is `0.1210` and the observed value is `0.6303`; the cluster-family null ARI mean is effectively zero and the observed value is `0.2814`. For seed stability, the instruction-tuned null NMI mean is `0.3103` and the observed value is `0.9215`. Those gaps are too large to describe as accidental partitioning.

### 5.9 Interpreting the Cluster Structure
The discovered clusters are also intelligible at the family level. Under instruction-tuned embeddings, several clusters are nearly pure by family: cluster `7` is all GPT with 24 responses; cluster `16` is all Kimi with 17 responses; cluster `12` is all DeepSeek with 11 responses; cluster `3` is all Claude with 14 responses; cluster `2` and cluster `5` are all-Gemini clusters with 14 and 15 responses; cluster `0` and cluster `11` are all-LLAMA clusters with 7 responses each. Mixed clusters still exist, especially where GPT, Claude, and Kimi overlap, but the overall structure is far from random.

That result matters because it shows that Dasha is not merely grouping stylistic quirks. The clusters align with persistent model-family reasoning tendencies on a single hard legal question.

## 6. Discussion
The final artifact shows that the Frank-Karthic-Dasha pipeline is functioning as an integrated research instrument rather than as three disconnected utilities.

Frank succeeded at benchmark design, with one qualification. The father-son question is hard enough to induce multiple coherent reasoning paths without being so open-ended that every answer becomes incomparable, but the Frank packet for this paper was backfilled from legacy benchmark materials rather than freshly generated from live anchor-case search. Karthic succeeded at doctrinal decomposition. The rubric pack exposes exactly which propositions matter and how heavily they matter. Dasha succeeded at large-sample response analysis. The 240-response corpus produces stable clusters, those clusters remain family-structured under a valid null test, and the full all-cluster ensemble rejudge shows that the winning centroids are not arbitrary artifacts of a single judge's preferences.

From an AI-benchmarking perspective, the most important result is that FKD separates at least four things that standard benchmarks often collapse: bottom-line accuracy, doctrinal completeness, subdomain specialization, and evaluator agreement. In this corpus, Gemini is strongest on raw outcome accuracy, `gpt-5.4` is strongest on full-rubric quality, Kimi contributes the strongest marriage-consideration cluster despite weak aggregate accuracy, and promissory-estoppel judgments are meaningfully less stable than core-doctrine judgments. A benchmark that only recorded "right" or "wrong" would miss most of that structure.

The embedding comparison is also substantively important. Legal reasoning is not just topic similarity. The instruction-tuned model appears to preserve doctrinal organization better than the baseline embedding model. That is the central methodological result of the paper.

## 7. Limitations
This paper studies one benchmark question. That was an intentional design choice because it lets us inspect the full pipeline in a controlled setting, but it limits cross-domain generalization. The next step is not to change the methodology; it is to repeat the same Frank-Karthic-Dasha workflow on additional questions from torts, property, civil procedure, and statutory interpretation.

A second limitation is that cluster-family correspondence should not be confused with legal correctness. A family-pure cluster may still be doctrinally weak. That is why the pipeline needs Frank and Karthic upstream: clustering shows structure, while the benchmark packet and rubric pack explain whether that structure reflects good law, bad law, or merely different theory selection.

A third limitation is provenance symmetry across stages. For this father-son run, Karthic and Dasha operate in the newer frontend-backed artifact chain, but Frank is a controlled import into that chain rather than a native live-retrieval Frank run. The paper therefore evaluates the newer workflow faithfully from the rubric stage forward and faithfully at the artifact-schema level throughout, but it does not yet show a full anchor-case-to-golden-answer Frank generation pass for this specific question.

A fourth limitation is operational rather than conceptual. The full ensemble rejudge required 132 cross-provider evaluations and therefore needs explicit timeout handling, participation logging, and retry support. The final artifact is complete, but the workflow cost of maintaining that completeness is real and should be treated as part of the benchmark design.

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
