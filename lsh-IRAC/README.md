# lsh-IRAC Benchmark Pipeline

This directory contains an evolution of the `lsh` robustness benchmark pipeline. The key difference is the strict enforcement of a **Structured Output Schema**.

By forcing Large Language Models to structure their responses into a formal legal reasoning format (IRAC: Issue, Rule, Application, Conclusion) using JSON, we strip away conversational "fluff". This makes the embeddings far more precise and ensures that the density-based clustering algorithm groups responses based on their actual legal arguments and logic, rather than superficial similarities in tone or formatting.

## Methodology

The benchmarking pipeline evaluates the diverse legal reasoning of Large Language Models (LLMs) by parsing, structuring, and aggregating their responses computationally. The methodology follows a strict multi-step sequence:

### 1. Generation & Enforced Schema (`run_irac_benchmark.py`)
- **Multi-Model Sampling:** Simultaneously queries multiple OpenAI (e.g., `gpt-4o`, `gpt-5-nano`) and Replicate-hosted (e.g., `claude-3.5-haiku`, `llama-4-maverick`, `gemini-3-pro`) models.
- **Strict IRAC Formatting:** A rigorous system prompt is injected into every completion demanding the output conform to the `{issue, rule, application, conclusion}` JSON schema.
- **Generation Settings:** Temperature is set to 0.7 for standard models (and experimentally 1.0 for specific models) to encourage diverse reasoning paths without hallucinating structure.

### 2. Robust Parsing & Normalization (`irac_utils.py`)
- **JSON Extraction:** Handles disparate LLM behaviors—such as placing JSON in markdown blocks, omitting code block syntax, or appending trailing boilerplate text. If native JSON parsing fails, regex-assisted JSON block and bracket matching ensures stable extraction.
- **Boilerplate Stripping:** Normalizes output by removing persistent artifacts like “As an AI...” to reduce noise.
- **IRAC Concatenation:** Flattens the parsed dictionary into predictable plain text explicitly keyed for embedding vectors:
  ```text
  Issue: [extracted text]
  Rule: [extracted text]
  Application: [extracted text]
  Conclusion: [extracted text]
  ```

### 3. Representation & Clustering (`irac_pipeline.py`)
- **Instruct Embedding:** Converts the formatted IRAC plain text into a dense vector space continuously using the `hkunlp/instructor-large` model. The embeddings are contextually informed using the strict prefix: `"Represent the legal reasoning components (Issue, Rule, Application, Conclusion) of this text:"`.
- **Density-Based Clustering (UMAP + HDBSCAN):** First, UMAP reduces the high-dimensional representation to 10 latent dimensions. Subsequently, HDBSCAN (`min_cluster_size=5`, `min_samples=2`) distinguishes dense, similar semantic groupings (distinct lines of legal reasoning) from sparse noise (outliers, ID `-1`).
- **Cluster Representatives:** From valid, non-noise clusters, the pipeline mathematically resolves the most central “centroid” response to serve as a singular representation for a specific reasoning argument.

### 4. Adversarial Robustness Testing (`inject_poison_and_cluster.py`)
- **Validation against Data Poisoning:** Synthetically injects "poisoned" responses carrying logically incongruent themes (such as space alien interventions or criminal statutes applied to civil transactions).
- **Evaluating Separation:** Multiple identical copies of a given poison are synthesized (designed to hit the `min_cluster_size=5` threshold). This mathematically benchmarks the stability of the HDBSCAN algorithm, validating its ability to definitively isolate flawed logic into individual, easily identifiable clusters separately from genuine reasoning.

## Setup

This module relies on the environment and dependencies of the parent `lsh` folder.

1. Ensure you have installed the requirements in the parent directory.
2. Your API keys must be located in `lsh/.env`:
   - `OPENAI_API_KEY`
   - `REPLICATE_API_TOKEN`

## Running the Benchmark

Execute the main script from the root of the repository. You must provide a text file containing the legal question using the `--question` argument:

```bash
# Assuming you are in the tr-benchmarking directory
source lsh/.venv/bin/activate
python lsh-IRAC/run_irac_benchmark.py --question lsh-IRAC/data/questions/question_iied.txt
```

You can optionally resume a previous run (e.g., if you hit an API rate limit and only got partial results) by passing the existing JSON file via the `--resume` flag:
```bash
python lsh-IRAC/run_irac_benchmark.py --question lsh-IRAC/data/questions/question_iied.txt --resume lsh-IRAC/data/responses_20260224_001715.json
```

## Output

The pipeline will generate two artifacts upon completion:

1.  **Raw Data**: `lsh-IRAC/data/responses_{timestamp}.json` contains all the successfully parsed JSON responses from every model.
2.  **Clustered Results**: `lsh-IRAC/results/run_{timestamp}.json` contains the final HDBSCAN cluster mappings, assigning a representative "centroid" to each distinct line of legal reasoning, while separating outliers into a `noise` cluster (denoted by cluster ID `-1`).

## Why IRAC?

*   **Issue**: Did the model identify the correct legal question?
*   **Rule**: Did it hallucinate doctrine, or cite the correct law (e.g., Parol Evidence Rule)?
*   **Application**: Did it accurately apply the facts (the check bouncing) to the rule?
*   **Conclusion**: What was the final verdict?

Clustering on these specific dimensions allows for highly granular analysis of *where* and *how* different models diverge in their legal thinking.
