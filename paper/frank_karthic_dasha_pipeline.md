# Evaluating Legal-Reasoning Diversity with the Frank-Karthic-Dasha Pipeline: Density Clustering, Instruction-Tuned Embeddings, and Permutation-Based Robustness Tests

**Authors**: Alan Tai, Frank Hanlon, Karthic Subramanian, Dasha Veraksa  
**Date**: April 2026

## Abstract
This paper evaluates the Frank-Karthic-Dasha legal benchmarking pipeline on a single hard contracts hypothetical: whether a father's oral promise to assume his son's student loans is enforceable when the promise is tied to the son's marriage to a politician's daughter, the father hoped for a tax deduction, no writing exists, and the son already intended to marry. Frank constructs the benchmark packet and benchmark answer; Karthic decomposes that packet into weighted doctrinal rubrics; Dasha generates repeated model outputs, embeds them, clusters them, and statistically validates the resulting structure.

The final artifact analyzed here is a 240-response corpus containing 20 responses from each of 12 models across six model families, stored at [father_son_responses_20260404_230517.json](/Users/alantai/Documents/GitHub/tr-benchmarking/paper/data/father_son_responses_20260404_230517.json). Clustering uses UMAP (`n_components = 5`) followed by HDBSCAN (`min_cluster_size = 5`). We compare instruction-tuned embeddings from `hkunlp/instructor-large` against baseline point embeddings from `all-MiniLM-L6-v2`. On the final artifact, instruction-tuned embeddings outperform baseline embeddings on internal cluster quality (`Silhouette = 0.5960` vs. `0.5254`; `Davies-Bouldin = 0.5426` vs. `0.6304`) and on external cluster-family correspondence (`NMI = 0.6328` vs. `0.5375`; `ARI = 0.3061` vs. `0.2021`). Seed-to-seed cluster stability is also high for both representations, with instruction-tuned embeddings again stronger (`NMI = 0.9106`, `ARI = 0.7820`). Robustness is established with permutation tests for NMI and ARI rather than bootstrap confidence intervals, because resampling-with-replacement distorts the local density geometry that HDBSCAN depends on. The result is an end-to-end benchmark showing that legal-reasoning diversity is both measurable and statistically stable at the cluster level.

## 1. Introduction
Legal benchmarking should not collapse model behavior to a single correctness score. In open-ended legal analysis, two responses can reach the same outcome for different doctrinal reasons, and two responses can discuss the same doctrine while assigning it very different weights. For this father-son hypothetical, a serious answer must sort through at least five overlapping issues: unilateral contract formation, whether marriage is consideration or only a gift condition, whether the marriage-consideration branch of the Statute of Frauds is independently dispositive, whether suretyship or the main-purpose doctrine matters, and whether promissory estoppel survives the son's preexisting intent to marry.

The Frank-Karthic-Dasha pipeline was built to preserve that structure. Frank defines the benchmark packet and the benchmark answer. Karthic turns the benchmark answer into inspectable rubric targets. Dasha samples a large pool of model outputs and studies the geometry of the response space itself. This paper focuses on whether that full workflow produces a stable and defensible empirical object.

This paper makes four claims.

1. Stage separation matters: Frank, Karthic, and Dasha produce distinct but compatible artifacts.
2. Instruction-tuned embeddings are better than baseline point embeddings for organizing legal reasoning.
3. UMAP followed by HDBSCAN is an appropriate clustering architecture for heterogeneous legal responses with unknown cluster count.
4. Permutation tests, not bootstrap confidence intervals, are the correct inferential tool for NMI and ARI in this density-clustering setting.

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
The Frank-stage artifact for this study is [question_golden_input.json](/Users/alantai/Documents/GitHub/tr-benchmarking/rubric-automation/question_golden_input.json). Frank fixes the legal domain as Contracts, the jurisdiction as the United States, and stores both the benchmark question and a benchmark answer. The benchmark answer concludes that the father's promise is likely unenforceable because the promise is made in consideration of marriage, which independently triggers the Statute of Frauds writing requirement. Frank also records the secondary doctrinal paths that later stages must distinguish: unilateral contract formation, suretyship as a nuanced secondary issue, the one-year rule as inapplicable, promissory estoppel as weak because of the son's prior intent, and the father's tax-deduction mistake as non-dispositive unless the promise was expressly conditioned on the deduction.

### 4.2 Karthic: Rubric Decomposition
The Karthic-stage artifact is [final_rubrics.json](/Users/alantai/Documents/GitHub/tr-benchmarking/rubric-automation/outputs/openai_question_golden/question_golden_input/final_rubrics.json). For this question, Karthic produced 13 active rubrics with normalized weights summing to 1.0. The rubric set covers contract formation, consideration, Statute of Frauds, doctrinal accuracy, promissory estoppel, mistake, counterarguments, and bottom-line conclusion. Six rubrics are explicitly marked as core, four as secondary, and the remainder retain neutral metadata while remaining active in scoring.

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

### 4.3 Dasha: Response Generation
The final Dasha corpus for this paper is [father_son_responses_20260404_230517.json](/Users/alantai/Documents/GitHub/tr-benchmarking/paper/data/father_son_responses_20260404_230517.json). It contains 240 valid IRAC-structured responses: 20 from each of 12 models.

| Family | Model |
|---|---|
| GPT | `gpt-4o` |
| GPT | `gpt-5.4` |
| GPT | `gpt-5.4-mini` |
| GPT | `gpt-4.1-nano` |
| Claude | `claude-4-sonnet` |
| Claude | `claude-3.5-haiku` |
| Gemini | `gemini-3-pro` |
| Gemini | `gemini-3-flash` |
| DeepSeek | `deepseek-v3` |
| Kimi | `kimi-k2-thinking` |
| LLAMA | `llama-4-maverick-instruct` |
| LLAMA | `llama-4-scout-instruct` |

Every response is normalized to the same four-field IRAC representation before embedding:

```text
Issue: ...
Rule: ...
Application: ...
Conclusion: ...
```

### 4.4 Embeddings and Clustering
We compare two embedding pipelines:

1. Instruction-tuned embeddings using `hkunlp/instructor-large` with the prompt: `Represent the legal reasoning components (Issue, Rule, Application, Conclusion) of this text:`
2. Baseline point embeddings using `all-MiniLM-L6-v2`

The clustering stack is:

1. UMAP with `n_components = 5`, `n_neighbors = 5`, `min_dist = 0.1`
2. HDBSCAN with `min_cluster_size = 5`, `min_samples = 2`

We evaluate cluster quality with Silhouette Score and Davies-Bouldin Index after removing HDBSCAN noise points.

### 4.5 Permutation Tests for Robustness
We run two permutation-test families.

1. Seed stability: compare cluster labels obtained from the same embedding matrix under two UMAP seeds using NMI and ARI.
2. Cluster-family correspondence: compare discovered cluster labels to external model-family labels using NMI and ARI.

The null is generated by permuting one label vector while holding the observed geometry fixed. This is preferable to bootstrap confidence intervals because bootstrapping perturbs the density manifold that HDBSCAN is operating on.

## 5. Results

### 5.1 Artifact Lineage
The final artifact chain used in this paper is:

1. Frank packet: [question_golden_input.json](/Users/alantai/Documents/GitHub/tr-benchmarking/rubric-automation/question_golden_input.json)
2. Karthic rubrics: [final_rubrics.json](/Users/alantai/Documents/GitHub/tr-benchmarking/rubric-automation/outputs/openai_question_golden/question_golden_input/final_rubrics.json)
3. Dasha corpus: [father_son_responses_20260404_230517.json](/Users/alantai/Documents/GitHub/tr-benchmarking/paper/data/father_son_responses_20260404_230517.json)
4. Validation report: [validation_report_20260404_230517.json](/Users/alantai/Documents/GitHub/tr-benchmarking/paper/results/validation_report_20260404_230517.json)

The companion script [run_statistical_validation.py](/Users/alantai/Documents/GitHub/tr-benchmarking/paper/run_statistical_validation.py) now defaults to the 240-response father-son artifact and enforces the 12-model, 20-samples-per-model design target.

### 5.2 Frank Output
Frank resolves the doctrinal center of gravity of the benchmark. The benchmark answer takes the marriage-consideration branch of the Statute of Frauds as dispositive, treats the one-year rule as inapplicable because the agreement could have been performed within one year, treats suretyship as secondary because the promise was made to the debtor rather than the lender, and treats promissory estoppel as weak because the son already planned to propose. This is exactly the kind of benchmark packet a clustering study needs: one strong target answer plus clearly articulated alternate paths that may still appear in the model population.

### 5.3 Karthic Output
Karthic turns that benchmark answer into a weighted rubric pack. The resulting 13 active rubrics preserve both core and peripheral doctrinal structure. The heaviest weights are assigned not just to the final conclusion, but also to secondary failure modes that distinguish sophisticated from shallow answers: whether the model overreads suretyship, whether it mishandles the main-purpose doctrine, whether it notices the son's prior intent, and whether it treats the father's tax-deduction mistake as legally irrelevant unless explicitly made a condition.

This is important for the pipeline as a whole. Frank supplies the canonical legal theory. Karthic makes that theory machine-readable at the proposition level.

### 5.4 Dasha Output
The final Dasha corpus contains 240 valid responses, with exact per-model balance and the following family totals: GPT 80, Claude 40, Gemini 40, LLAMA 40, DeepSeek 20, and Kimi 20. The raw response space already shows doctrinal spread before clustering. Across the 240 responses:

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

### 5.5 Final Clustering Metrics
The final validation report shows that instruction-tuned embeddings dominate baseline embeddings on both internal quality and external correspondence.

| Metric | Instruction-tuned | Baseline | Better direction |
|---|---:|---:|---|
| Clusters found | 20 | 22 | Context dependent |
| Noise points | 7 | 0 | Lower |
| Noise ratio | 0.0292 | 0.0000 | Lower |
| Silhouette Score | 0.5960 | 0.5254 | Higher |
| Davies-Bouldin Index | 0.5426 | 0.6304 | Lower |
| Stability NMI | 0.9106 | 0.8815 | Higher |
| Stability ARI | 0.7820 | 0.7633 | Higher |
| Cluster-family NMI | 0.6328 | 0.5375 | Higher |
| Cluster-family ARI | 0.3061 | 0.2021 | Higher |

The practical interpretation is straightforward. The instruction-tuned representation yields tighter clusters, better inter-cluster separation, stronger correspondence with model-family labels, and slightly better seed-to-seed reproducibility. The baseline representation still finds structure, but it finds a noisier and less family-aligned structure.

### 5.6 Permutation-Based Robustness
Both robustness tests are decisively significant. In the stored report, the permutation p-values are rendered as `0.0`; with `B = 1000`, this should be read as no null draw matching the observed statistic, i.e., `p < 0.001`.

| Test | Statistic | Instruction-tuned | Baseline |
|---|---|---:|---:|
| Seed stability | NMI | 0.9106 (`p < 0.001`) | 0.8815 (`p < 0.001`) |
| Seed stability | ARI | 0.7820 (`p < 0.001`) | 0.7633 (`p < 0.001`) |
| Cluster-family correspondence | NMI | 0.6328 (`p < 0.001`) | 0.5375 (`p < 0.001`) |
| Cluster-family correspondence | ARI | 0.3061 (`p < 0.001`) | 0.2021 (`p < 0.001`) |

The null distributions are not close to the observed values. For instruction-tuned embeddings, the cluster-family null NMI mean is `0.1045` and the observed value is `0.6328`; the cluster-family null ARI mean is effectively zero and the observed value is `0.3061`. For seed stability, the instruction-tuned null NMI mean is `0.2781` and the observed value is `0.9106`. Those gaps are too large to describe as accidental partitioning.

### 5.7 Interpreting the Cluster Structure
The discovered clusters are also intelligible at the family level. Under instruction-tuned embeddings, several clusters are nearly pure by family: cluster `7` is all GPT with 24 responses; cluster `16` is all Kimi with 17 responses; cluster `12` is all DeepSeek with 11 responses; cluster `3` is all Claude with 14 responses; cluster `2` and cluster `5` are all-Gemini clusters with 14 and 15 responses; cluster `0` and cluster `11` are all-LLAMA clusters with 7 responses each. Mixed clusters still exist, especially where GPT, Claude, and Kimi overlap, but the overall structure is far from random.

That result matters because it shows that Dasha is not merely grouping stylistic quirks. The clusters align with persistent model-family reasoning tendencies on a single hard legal question.

## 6. Discussion
The final artifact shows that the Frank-Karthic-Dasha pipeline is functioning as an integrated research instrument rather than as three disconnected utilities.

Frank succeeded at benchmark design. The father-son question is hard enough to induce multiple coherent reasoning paths without being so open-ended that every answer becomes incomparable. Karthic succeeded at doctrinal decomposition. The rubric pack exposes exactly which propositions matter and how heavily they matter. Dasha succeeded at large-sample response analysis. The 240-response corpus produces stable clusters, and those clusters remain family-structured under a valid null test.

The embedding comparison is also substantively important. Legal reasoning is not just topic similarity. The instruction-tuned model appears to preserve doctrinal organization better than the baseline embedding model. That is the central methodological result of the paper.

## 7. Limitations
This paper studies one benchmark question. That was an intentional design choice because it lets us inspect the full pipeline in a controlled setting, but it limits cross-domain generalization. The next step is not to change the methodology; it is to repeat the same Frank-Karthic-Dasha workflow on additional questions from torts, property, civil procedure, and statutory interpretation.

A second limitation is that cluster-family correspondence should not be confused with legal correctness. A family-pure cluster may still be doctrinally weak. That is why the pipeline needs Frank and Karthic upstream: clustering shows structure, while the benchmark packet and rubric pack explain whether that structure reflects good law, bad law, or merely different theory selection.

## 8. Conclusion
On the father-son oral-promise benchmark, the final 240-response artifact demonstrates that the Frank-Karthic-Dasha pipeline works end to end. Frank constructs a legally diagnostic benchmark packet. Karthic converts that packet into a weighted doctrinal rubric set. Dasha generates a balanced multi-model corpus, clusters the response space, and validates the resulting structure with permutation tests.

The empirical result is strong: instruction-tuned embeddings produce better legal-reasoning clusters than baseline point embeddings, and the resulting clusters are stable across seeds and strongly associated with model families. The methodological result is equally strong: permutation tests are the right inferential tool for NMI and ARI in density-based legal-response clustering because they preserve the manifold instead of distorting it. For legal AI benchmarking, that is the correct standard of evidence.

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
