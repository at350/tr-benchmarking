# Literature Survey

This survey tracks verified sources that shape the pipeline and manuscript. The
project should cite only sources with stable scholarly pages, DOIs, proceedings
entries, or arXiv records.

## Legal LLM Benchmarks

### LegalBench

- Source: <https://arxiv.org/abs/2308.11462>
- Citation key: `guha2023legalbench`
- Core idea: LegalBench is a collaboratively built legal-reasoning benchmark
  with tasks contributed by legal professionals and organized across types of
  legal reasoning.
- Relevance: This project differs by generating a fresh benchmark from a source
  case rather than selecting from static tasks. LegalBench supports the argument
  that legal reasoning benchmarks need law-aware task design and legal
  expert-facing categories.

### LEXam

- Source: <https://arxiv.org/abs/2505.12864>
- Citation key: `lexam2025`
- Core idea: LEXam benchmarks legal reasoning using law exam questions,
  reference answers, reasoning guidance, and LLM-as-judge evaluation with human
  expert validation.
- Relevance: LEXam is the nearest legal-evaluation comparator for decomposed
  legal reasoning. Our current manuscript should be explicit that expert
  validation remains future work.

## LLM-As-Judge And Rubric Evaluation

### MT-Bench / Chatbot Arena Judge Study

- Source: <https://arxiv.org/abs/2306.05685>
- Citation key: `zheng2023judging`
- Core idea: Strong LLM judges can scale evaluation, but judge bias and
  agreement limits must be measured.
- Relevance: Supports using LLM-as-judge while motivating bias controls,
  provenance, and future judge ensembles.

### G-Eval

- Source: <https://aclanthology.org/2023.emnlp-main.153/>
- Citation key: `liu2023geval`
- Core idea: Rubric-like LLM evaluation can correlate better with human
  judgments in NLG settings than older automatic metrics.
- Relevance: Supports row-level rubric-conditioned scoring, but the legal
  pipeline needs source support and doctrine-specific rows.

### Prometheus / Prometheus 2

- Sources: ICLR 2024 Prometheus; <https://arxiv.org/abs/2405.01535>
- Citation keys: `kim2023prometheus`, `kim2024prometheus2`
- Core idea: Fine-grained evaluator models can score outputs against explicit
  criteria and reference material.
- Relevance: Supports Karthic-style rubric construction and Judge-style
  row-level scoring.

### Judge Bias Work

- Position bias source: <https://arxiv.org/abs/2406.07791>
- Self-preference source: <https://arxiv.org/abs/2410.21819>
- Citation keys: `shi2024positionbias`, `wataoka2024selfpreference`
- Core idea: LLM judges can be sensitive to ordering and may favor outputs from
  their own model family.
- Relevance: The paper should avoid overstating judge validity until repeated
  scoring, model-separated judges, and expert comparison are added.

## Perturbation And Metamorphic Testing

### Metamorphic Testing Review

- Source: <https://eprints.nottingham.ac.uk/51607/>
- Citation key: `chen2018metamorphic`
- Core idea: Metamorphic testing checks relationships between multiple inputs
  and outputs when a single definitive oracle is hard to construct.
- Relevance: Frank's invariant/material question variations can be described as
  legal metamorphic relations: legally irrelevant edits should preserve the
  dominant answer path, while legally operative edits should change it.

## Working Gaps From Literature

- Existing legal benchmarks are strong at curated task collections; this project
  should emphasize source-to-question generation and dynamic rubric construction
  as its distinct contribution.
- LLM-as-judge literature supports rubric scoring but repeatedly warns about
  bias. The manuscript needs judge-repeat/ensemble evidence before stronger
  claims.
- Perturbation testing strengthens the validity story, but the current live
  manuscript evidence still needs a live multi-model perturbation run.
