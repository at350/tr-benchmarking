# TR-Benchmarking

**A research framework for evaluating the *structure, consistency, and robustness* of legal reasoning in large language models — not just whether they get the answer right.**

---

## Table of Contents

1. [Overview](#overview)
2. [The Problem](#the-problem)
3. [Core Insight](#core-insight)
4. [System Architecture](#system-architecture)
5. [Pipeline Modules](#pipeline-modules)
   - [LSH — Baseline Clustering Module](#lsh--baseline-clustering-module)
   - [LSH-IRAC — Structured Reasoning Pipeline](#lsh-irac--structured-reasoning-pipeline)
   - [Rubric Automation (RRD)](#rubric-automation-rrd)
   - [Legal Auto-Eval Pipeline](#legal-auto-eval-pipeline)
   - [Frontend — Benchmarking Portal](#frontend--benchmarking-portal)
6. [Models Evaluated](#models-evaluated)
7. [Datasets](#datasets)
8. [Repository Structure](#repository-structure)
9. [Setup & Installation](#setup--installation)
10. [Running the Benchmark](#running-the-benchmark)
11. [Output Format](#output-format)
12. [Roadmap](#roadmap)
13. [Why This Matters](#why-this-matters)

---

## Overview

TR-Benchmarking is a multi-stage research pipeline for **reasoning-level evaluation** of large language models (LLMs) in legal domains. It goes beyond checking whether a model picks the right answer — it evaluates whether the model reasoned correctly to get there.

The system:

- Forces LLMs to produce **structured legal reasoning** using the IRAC framework (Issue, Rule, Application, Conclusion)
- Embeds those reasoning traces into a high-dimensional vector space using instruction-tuned models
- Clusters the embeddings to discover **distinct reasoning strategies** across model families
- Identifies **outliers, hallucinations, and unstable reasoning paths**
- Validates cluster quality using **adversarial data poisoning tests**
- Generates **automated rubrics** for scoring answers against expert benchmarks
- Provides a **web-based research interface** for exploring all pipeline outputs

This is a research prototype demonstrating a new approach to LLM evaluation in high-stakes domains.

---

## The Problem

Modern LLM benchmarks measure **answer accuracy**. This is insufficient for deployment in legal, medical, and financial applications for three reasons:

### 1. Answer-Only Evaluation Misses the Process
A model can produce the correct conclusion through flawed reasoning. In law, a correct answer reached via wrong doctrine is a fundamentally different failure than an incorrect answer reached via correct doctrine. Existing benchmarks treat both identically.

### 2. Hidden Reasoning Instability
Models frequently produce **different legal arguments** across runs, even on identical prompts. A model may cite the Statute of Frauds in one response and ignore it entirely in another — while returning the same final answer both times. This instability is invisible to answer-accuracy metrics.

### 3. Poor Failure Mode Visibility
When a model is wrong, it is unclear *why*. Existing evaluation tells you a model scored 72% — it does not tell you whether the model:
- Consistently misapplied a specific doctrine
- Hallucinated legal rules
- Identified the right issue but drew a wrong conclusion
- Reasoned correctly in isolation but inconsistently across runs

TR-Benchmarking makes reasoning **observable, comparable, and structured**.

---

## Core Insight

Instead of asking:

> *Did the model get the answer right?*

We ask:

> *What reasoning strategies did the model use — and how consistent, sound, and stable are they across runs and across model families?*

By forcing models into a structured schema and then clustering those structures by semantic similarity, we can map the **reasoning landscape** of any legal question: which models converge on the same argument, which produce outlier logic, and which arguments are most doctrinally sound.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  TR-Benchmarking Pipeline                   │
└─────────────────────────────────────────────────────────────┘

   ┌─────────────────┐     ┌──────────────────┐
   │  Legal Question │────▶│  Multi-Model LLM │
   │  (Plain Text)   │     │  Sampling Layer  │
   └─────────────────┘     └────────┬─────────┘
                                    │ 20 responses × N models
                                    ▼
                          ┌──────────────────────┐
                          │  IRAC Enforced Schema │
                          │  (JSON: Issue / Rule  │
                          │   Application / Conc.)│
                          └──────────┬───────────┘
                                     │
                    ┌────────────────┼─────────────────┐
                    ▼                ▼                  ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
          │  Parsing &   │  │  Instruction │  │  Rubric          │
          │  Normaliz.   │  │  Embedding   │  │  Automation      │
          │  (irac_utils)│  │  (Instructor)│  │  (RRD Pipeline)  │
          └──────────────┘  └──────┬───────┘  └──────────────────┘
                                   │
                          ┌────────▼────────┐
                          │  UMAP + HDBSCAN │
                          │  Density Cluster│
                          └────────┬────────┘
                                   │
                    ┌──────────────┼──────────────────┐
                    ▼              ▼                   ▼
          ┌──────────────┐ ┌──────────────┐  ┌───────────────┐
          │  Cluster     │ │  Topic       │  │  Adversarial  │
          │  Map &       │ │  Confidence  │  │  Poison Test  │
          │  Centroids   │ │  Signals     │  │  Validation   │
          └──────────────┘ └──────────────┘  └───────────────┘
                                   │
                          ┌────────▼────────┐
                          │  Next.js Portal │
                          │  (Visualization)│
                          └─────────────────┘
```

---

## Pipeline Modules

### LSH — Baseline Clustering Module

**Location:** `lsh/`

The foundational module. Implements the core data generation, embedding, and clustering workflow for a set of legal responses.

**How it works:**

1. **Data Generation** — Queries multiple LLMs (OpenAI, Replicate, Gemini) with an identical legal question. Each model produces a free-form text response.
2. **Instruction-Tuned Embedding** — Each response is embedded using [`hkunlp/instructor-large`](https://huggingface.co/hkunlp/instructor-large) with the instruction: *"Represent the legal conclusion and reasoning of this text."* This ensures the embedding captures the *reasoning outcome* rather than superficial stylistic features.
3. **Dimensionality Reduction** — UMAP reduces the high-dimensional embedding space to a lower-dimensional manifold.
4. **Density Clustering** — HDBSCAN identifies dense clusters of semantically similar responses. Outliers are labeled as `noise` (cluster ID `-1`).
5. **Representative Selection** — Each cluster's centroid (closest member to the geometric mean) is selected as the canonical representative of that reasoning strategy.

**Key files:**

| File | Purpose |
|---|---|
| `pipeline.py` | Main `LSHEvaluationPipeline` class orchestrating the workflow |
| `density_clustering.py` | UMAP + HDBSCAN implementation |
| `lsh_index.py` | Baseline Random Hyperplane LSH index |
| `clustering.py` | Graph clustering via Louvain method |
| `utils.py` | Embedding model loading and text preprocessing |
| `generate_data.py` | OpenAI response generation |
| `generate_replicate_data.py` | Replicate (Claude, Llama) response generation |
| `generate_gemini_data.py` | Gemini response generation via Replicate |
| `visualize_pipeline.py` | UMAP and cluster distribution visualizations |

---

### LSH-IRAC — Structured Reasoning Pipeline

**Location:** `lsh-IRAC/`

The primary research contribution. An evolved version of the baseline that enforces **structured IRAC output** from every model, enabling far more precise semantic clustering.

#### Why IRAC?

Free-form text responses embed stylistic variation alongside reasoning variation. By constraining every response to the IRAC schema, we strip conversational formatting away and force models to expose their reasoning structure directly.

```json
{
  "issue": "A concise statement of the core legal question.",
  "rule": "The relevant legal doctrine or rules governing the issue.",
  "application": "How the rule directly applies to the specific facts.",
  "conclusion": "A direct, definitive answer to the legal question."
}
```

Each dimension of this schema can be analyzed independently:

- **Issue** — Did the model identify the correct legal question?
- **Rule** — Did it apply the correct doctrine, or did it hallucinate?
- **Application** — Did it correctly map facts to rules?
- **Conclusion** — What was the model's final verdict?

Clustering on these structured embeddings allows granular analysis of *where* and *how* different models diverge in their legal thinking.

#### Key Components

**`run_irac_benchmark.py`** — The main benchmarking orchestrator.
- Simultaneously queries all configured OpenAI and Replicate models
- Injects a rigorous system prompt requiring strict `{issue, rule, application, conclusion}` JSON output
- Sets temperature to 0.7 (1.0 for experimental models) to encourage diversity without hallucinating structure
- Runs asynchronously with semaphore-limited concurrency for Replicate models
- Supports resuming interrupted runs via `--resume`

**`irac_utils.py`** — Robust parsing and normalization.
- Handles messy LLM output: JSON in markdown blocks, missing code fences, trailing boilerplate
- Falls back to regex-assisted bracket matching when native JSON parsing fails
- Strips persistent artifacts such as "As an AI language model..."
- Flattens parsed IRAC dicts into consistent, embeddable plain text

**`irac_pipeline.py`** — The IRACEvaluationPipeline class.
- Encodes all IRAC-formatted responses with Instructor embeddings using the prefix: *"Represent the legal reasoning components (Issue, Rule, Application, Conclusion) of this text:"*
- Runs UMAP + HDBSCAN clustering
- **Topic Extraction** — For each valid cluster, calls GPT-4o to zero-shot identify the 2–4 core legal doctrines relied upon by cluster members
- **Topic Confidence Scoring** — Embeds those topic labels and computes softmax-normalized cosine similarity against all member embeddings, yielding per-cluster doctrine confidence percentages

**`inject_poison_and_cluster.py`** — Adversarial robustness validation.
- Synthetically injects "poisoned" responses with logically incoherent content (e.g., referencing space alien law or applying criminal statutes to civil transactions)
- Injects 5 copies of each poison type (meeting the HDBSCAN `min_cluster_size` threshold)
- Validates that HDBSCAN correctly isolates poisoned responses into their own distinct clusters, separate from genuine legal reasoning

---

### Rubric Automation (RRD)

**Location:** `rubric-automation/`

A production-style implementation of **Recursive Rubric Decomposition (RRD)** — an automated pipeline for generating, refining, and scoring evaluation rubrics for legal answers.

**What it does:**

Given a legal question, a gold-standard answer, and a set of model responses, the RRD pipeline:

1. **Extracts** the legal structure of the gold answer (key doctrines, sub-issues, relevant rules)
2. **Generates** an initial rubric: a scored list of criteria a correct answer should satisfy
3. **Decomposes** broad criteria into atomic, independently gradeable sub-criteria
4. **Filters** redundant or misaligned rubric items
5. **Weights** criteria by doctrinal importance
6. **Audits** coverage to ensure the rubric spans all legal issues present in the gold answer
7. **Scores** each model response against the final rubric, producing a matrix of scores

**Weighting strategies:**

| Strategy | Description |
|---|---|
| `uniform` | Equal weight for all rubric items |
| `llm` | LLM-assigned importance scores |
| `whitened` | Statistically whitened scores to reduce inter-item correlation |
| `doctrinal` | Weights based on the centrality of each doctrine to the issue |

**Outputs:**

| File | Contents |
|---|---|
| `final_rubrics.json` | Approved, weighted rubric items |
| `rubric_matrix.csv` | Per-response scores against each rubric item |
| `coverage_audit.json` | Audit of which legal issues are covered by the rubric |
| `pipeline_log.json` | Full trace of all pipeline steps |

---

### Legal Auto-Eval Pipeline

**Location:** `legal-workflow-data/`, `instructions/`, `frontend/src/app/legal-autoeval-pipeline/`

The end-to-end evaluation workflow used in live demonstrations. It chains together source ingestion, question generation, rubric creation, and model scoring into a single cohesive interface.

**Workflow stages:**

1. **Source Upload / Packet Selection** — Upload a legal case document (PDF) or select a pre-prepared "Frank packet" (named after one pipeline stage)
2. **Routing / Intake** — Quality gate: classifies the legal problem type and checks whether the source is structured enough to build on
3. **Extraction / Mapping** — Structures the source into: a source extraction sheet, a gold packet mapping, a locked controller card, and a list of likely failure modes
4. **Benchmark Answer** — Establishes a model "gold" answer representing what an expert response should contain
5. **Reverse-Engineered Question** — Works backward from the benchmark answer to produce a fair, unambiguous test question all models will answer
6. **Seed Rubric** — Generates the first draft scoring rubric from the source, benchmark answer, and test question
7. **Refine Rubric** — Sharpens the seed rubric, removing overlap and tightening wording
8. **Approve Rubric** — Freezes the scoring standard (criteria, scoring policy, penalties, caps)
9. **Dasha Pipeline** — Runs all configured models against the frozen question and rubric, collecting and scoring responses

**Case studies implemented:**

- *Westside Wrecker Service, Inc. v. Skafi* — Statute of Frauds / one-year rule
- *Anglemire v. Policemen's Benevolent Association of Chicago* — Marriage Statute of Frauds
- *Demeritt v. Bickford* — Surety contracts

---

### Frontend — Benchmarking Portal

**Location:** `frontend/`

A Next.js research interface for exploring all pipeline outputs interactively. Built with TypeScript and the App Router.

**Pages:**

| Route | Description |
|---|---|
| `/` | Home dashboard — links to all tools |
| `/demos` | Workflow overview and demo scripts |
| `/database-view` | Dataset explorer — browse SuperGPQA and other benchmark datasets |
| `/outlines` | Legal outline library (contract law, tort law) for reference |
| `/lsh-runs` | **LSH-RUHS Atlas** — browse and inspect historical clustering runs |
| `/legal-workflow` | **Frank-Karthic-Dasha SoF Pipeline** — full stage-separated workflow view |
| `/legal-autoeval-pipeline` | **Legal Auto-Eval Pipeline** — interactive demo interface |

**Key components:**

- **`DashaResultsExplorer`** — The primary results visualization. Displays cluster maps, topic confidence signals, centroid representatives, and edge members for any benchmark run
- **`DashaComparisonResults`** — Side-by-side comparison of model outputs across clusters

**Tech stack:**

- Next.js 14+ (App Router, TypeScript)
- Tailwind CSS
- Lucide Icons
- API routes for serving benchmark run data

---

## Models Evaluated

The benchmark currently supports the following model families:

**OpenAI (via OpenAI API)**
- `gpt-4o`
- `gpt-4-turbo`
- `gpt-5-nano`
- `gpt-5.2`

**Google (via Replicate)**
- `google/gemini-3-flash`
- `google/gemini-3-pro`

**Meta (via Replicate)**
- `meta/llama-4-maverick-instruct`

**Anthropic (via Replicate)**
- `anthropic/claude-4.5-sonnet`
- `anthropic/claude-3.5-haiku`

**DeepSeek (via Replicate)**
- `deepseek-ai/deepseek-v3.1`

**xAI (opt-in via environment variable)**
- `xai/grok-4`

Each model is queried **20 times per run** to capture reasoning variance across temperature-driven sampling.

---

## Datasets

### SuperGPQA — Law Subset

**Location:** `datasets/supergpqa/SuperGPQA Law Data.csv`

[SuperGPQA](https://github.com/SuperGPQA/SuperGPQA) is a large-scale graduate-level professional benchmark covering 285 disciplines. The law subset provides expert-level legal questions used as benchmark inputs.

### PRBench

**Location:** `datasets/prbench/`

An additional dataset used for extended benchmark runs.

### Real Case Documents

**Location:** `cases/`

Actual legal case documents (PDFs) used as source material for the Legal Auto-Eval Pipeline:

- *Westside Wrecker Service, Inc. v. Skafi* — One-year Statute of Frauds
- *Anglemire v. Policemen's Benevolent Association of Chicago* — Marriage Statute of Frauds
- *Demeritt v. Bickford* — Surety contracts

### Legal Outlines

**Location:** `outlines/`, `rubrics/`

- `contract_law_outline.pdf` — Detailed contract law outline used as grounding material
- `tort_law_outline.pdf` — Detailed tort law outline

---

## Repository Structure

```
tr-benchmarking/
├── lsh/                         # Baseline clustering pipeline
│   ├── pipeline.py              # LSHEvaluationPipeline
│   ├── density_clustering.py    # UMAP + HDBSCAN
│   ├── lsh_index.py             # Random Hyperplane LSH
│   ├── clustering.py            # Louvain graph clustering
│   ├── utils.py                 # Embedding utilities
│   ├── generate_data.py         # OpenAI data generation
│   ├── generate_replicate_data.py
│   ├── generate_gemini_data.py
│   ├── run_robust_benchmark.py  # Full robustness run
│   ├── visualize_pipeline.py    # UMAP + chart generation
│   ├── data/                    # responses.json
│   ├── results/                 # Clustering run outputs
│   └── requirements.txt
│
├── lsh-IRAC/                    # Structured reasoning pipeline (primary module)
│   ├── run_irac_benchmark.py    # Main benchmark orchestrator
│   ├── irac_pipeline.py         # IRACEvaluationPipeline
│   ├── irac_utils.py            # Parsing and normalization
│   ├── inject_poison_and_cluster.py  # Adversarial robustness tests
│   ├── data/                    # Parsed IRAC responses
│   └── results/                 # Clustering run outputs
│
├── rubric-automation/           # Recursive Rubric Decomposition
│   ├── rrd_legal.py             # CLI entry point
│   ├── rrd_legal_pkg/           # Pipeline modules
│   │   ├── models.py            # Data models
│   │   ├── prompts.py           # LLM prompt templates
│   │   ├── llm.py               # LLM client interface
│   │   ├── pipeline.py          # RRD orchestration
│   │   ├── evaluation.py        # Rubric scoring
│   │   ├── filters.py           # Redundancy filtering
│   │   └── weighting.py         # Criterion weighting strategies
│   ├── examples/                # Demo inputs
│   └── outputs/                 # Pipeline outputs
│
├── frontend/                    # Next.js research portal
│   ├── src/app/                 # App Router pages
│   │   ├── page.tsx             # Home dashboard
│   │   ├── demos/               # Workflow demos
│   │   ├── database-view/       # Dataset explorer
│   │   ├── outlines/            # Legal outline viewer
│   │   ├── lsh-runs/            # LSH-RUHS atlas
│   │   ├── legal-workflow/      # Frank-Karthic-Dasha pipeline
│   │   └── legal-autoeval-pipeline/  # Auto-eval interface
│   └── src/components/
│       ├── DashaResultsExplorer.tsx   # Main cluster visualization
│       └── DashaComparisonResults.tsx # Side-by-side comparison
│
├── cases/                       # Real legal case PDFs
├── datasets/                    # SuperGPQA and PRBench data
├── outlines/                    # Law school outlines (PDF)
├── rubrics/                     # Scoring rubrics (PDF)
├── prompt-libraries/            # Prompt templates (generation & judge)
├── instructions/                # Pipeline documentation and demo scripts
├── legal-workflow-data/         # Frank/Karthic/Dasha pipeline artifacts
│
├── run_experiment.py            # Run the baseline LSH pipeline end-to-end
└── run_benchmark.sh             # Shell script: setup venv and run benchmark
```

---

## Setup & Installation

### Prerequisites

- Python 3.10+
- Node.js 18+ (for the frontend)
- API keys for OpenAI and Replicate

### Python Environment

```bash
# Clone the repository
git clone https://github.com/at350/tr-benchmarking
cd tr-benchmarking

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r lsh/requirements.txt
```

**Python dependencies:**

| Package | Purpose |
|---|---|
| `numpy` | Numerical operations and embedding arithmetic |
| `scikit-learn` | Preprocessing and utility ML functions |
| `sentence-transformers` | `hkunlp/instructor-large` embedding model |
| `umap-learn` | Dimensionality reduction |
| `networkx` | Graph construction for LSH similarity graph |
| `python-louvain` | Louvain community detection |
| `openai` | OpenAI API client |
| `httpx` | Async HTTP client for Replicate API |
| `python-dotenv` | Environment variable loading |
| `tqdm` | Progress bars for async generation |

### API Keys

Create a `.env` file in the `lsh/` directory (or the project root):

```bash
OPENAI_API_KEY=your_openai_key_here
REPLICATE_API_TOKEN=your_replicate_token_here
ANTHROPIC_API_KEY=your_anthropic_key_here  # optional
ENABLE_GROK4=false                          # set to true to include grok-4
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The portal runs at `http://localhost:3000`.

---

## Running the Benchmark

### Option 1: Full IRAC Benchmark (Recommended)

```bash
# Activate the virtual environment
source lsh/.venv/bin/activate

# Run the benchmark on a question file
python lsh-IRAC/run_irac_benchmark.py --question lsh-IRAC/data/questions/question_iied.txt
```

This will:
1. Query all configured models 20 times each
2. Parse and validate IRAC JSON from every response
3. Embed all responses with `hkunlp/instructor-large`
4. Run UMAP + HDBSCAN clustering
5. Extract topic signals and compute confidence scores per cluster
6. Save results to `lsh-IRAC/results/run_{timestamp}.json`

**Resume an interrupted run:**

```bash
python lsh-IRAC/run_irac_benchmark.py \
  --question lsh-IRAC/data/questions/question_iied.txt \
  --resume lsh-IRAC/data/responses_20260224_001715.json
```

### Option 2: Baseline LSH Pipeline

```bash
# Generate responses (OpenAI)
python lsh/generate_data.py

# Generate responses (Replicate)
python lsh/generate_replicate_data.py

# Run clustering
python run_experiment.py
```

### Option 3: Shell Script (Robustness Benchmark)

```bash
bash run_benchmark.sh
```

### Option 4: Adversarial Robustness Test

```bash
python lsh-IRAC/inject_poison_and_cluster.py
```

### Option 5: Rubric Automation Demo

```bash
cd rubric-automation
python rrd_legal.py --demo --weighting doctrinal --verbose
```

---

## Output Format

### Clustering Run (`results/run_{timestamp}.json`)

```json
{
  "metadata": {
    "timestamp": "20260224_153621",
    "method": "density_umap_hdbscan",
    "umap_dims": 10,
    "min_cluster_size": 5,
    "question": "...",
    "schema": "IRAC",
    "total_items": 200,
    "num_clusters": 7
  },
  "clusters": {
    "0": {
      "representative": {
        "id": "gpt-4o_3",
        "model": "gpt-4o",
        "issue": "...",
        "rule": "...",
        "application": "...",
        "conclusion": "..."
      },
      "members": [...],
      "centroid_members": [...],
      "edge_members": [...],
      "topic_signals": {
        "Statute of Frauds": 82.4,
        "One-Year Rule": 14.1,
        "Part Performance": 3.5
      }
    },
    "-1": {
      "representative": { "id": "N/A", "model": "NOISE" },
      "members": [...]
    }
  }
}
```

**Key fields:**

| Field | Description |
|---|---|
| `representative` | The cluster's centroid member — most semantically central response |
| `members` | All responses assigned to this cluster |
| `centroid_members` | 3 members closest to the cluster's geometric center |
| `edge_members` | 3 random members from the outer third of the cluster (most divergent) |
| `topic_signals` | LLM-identified legal doctrines with softmax confidence percentages |
| `-1` | The noise cluster: responses HDBSCAN could not assign to any dense group |

---

## Roadmap

### Near-Term
- [ ] Larger benchmark datasets with expanded legal domains (employment, IP, administrative law)
- [ ] Automated IRAC quality scoring using LLM-as-a-judge evaluation against rubric criteria
- [ ] Cross-run stability analysis: track how cluster composition changes across model versions
- [ ] Standardized, reproducible benchmark runners with pinned model versions

### Medium-Term
- [ ] Model comparison dashboards: per-model cluster distribution, failure rate, and doctrine accuracy
- [ ] Automated reporting: export cluster analysis to structured PDF/HTML reports
- [ ] Ground-truth alignment: score cluster representatives against expert-verified answers
- [ ] Extended adversarial testing: doctrine substitution, fact inversion, jurisdiction swapping

### Long-Term
- [ ] Public benchmark leaderboard for legal reasoning quality
- [ ] Support for non-English legal systems and jurisdictions
- [ ] Fine-grained IRAC sub-component evaluation (issue identification accuracy, rule hallucination rate, etc.)
- [ ] Integration with legal citation verification tools

---

## Why This Matters

LLMs are increasingly being deployed in legal workflows — for contract review, case research, compliance checking, and legal question answering. Most evaluation of these systems relies on answer-accuracy benchmarks that cannot detect a critical class of failures:

> **A model that consistently produces the right answer through the wrong reasoning is not a safe legal tool.**

In law, the reasoning matters as much as the conclusion. A model that gets to "unenforceable" via the wrong statute, or that applies the Parol Evidence Rule in a case governed by the Statute of Frauds, is making doctrinal errors that could produce catastrophic results when the facts change slightly.

TR-Benchmarking provides the tooling to:

1. **See** the reasoning strategies models actually use
2. **Compare** those strategies across model families
3. **Identify** which doctrines models hallucinate or misapply
4. **Measure** reasoning consistency across repeated runs
5. **Validate** that evaluation systems can isolate flawed reasoning under adversarial conditions

This work is intended to support researchers, legal AI developers, and AI safety teams building reliable systems for high-stakes domains.

---

## References

- SuperGPQA Benchmark: https://github.com/SuperGPQA/SuperGPQA
- HDBSCAN: Campello et al., *Density-Based Clustering Based on Hierarchical Density Estimates*, 2013
- UMAP: McInnes et al., *UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction*, 2018
- Instructor Embeddings: Su et al., *One Embedder, Any Task: Instruction-Finetuned Text Embeddings*, 2022
- Louvain Community Detection: Blondel et al., *Fast unfolding of communities in large networks*, 2008
