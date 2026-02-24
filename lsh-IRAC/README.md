# lsh-IRAC Benchmark Pipeline

This directory contains an evolution of the `lsh` robustness benchmark pipeline. The key difference is the strict enforcement of a **Structured Output Schema**.

By forcing Large Language Models to structure their responses into a formal legal reasoning format (IRAC: Issue, Rule, Application, Conclusion) using JSON, we strip away conversational "fluff". This makes the embeddings far more precise and ensures that the density-based clustering algorithm groups responses based on their actual legal arguments and logic, rather than superficial similarities in tone or formatting.

## Architecture

1.  **Generation & Enforced Schema (`run_irac_benchmark.py`)**: 
    - Queries a configured list of OpenAI and Replicate models.
    - The `SYSTEM_PROMPT` explicitly demands a raw JSON object matching the `{issue, rule, application, conclusion}` schema.
    - Validates the JSON structure upon receipt.
2.  **Robust Parsing (`irac_utils.py`)**: 
    - Handles the reality that different LLMs return JSON differently (some use Markdown blocks, some just send raw text, some include trailing characters).
    - Formats the parsed dictionary into a clean, predictable string for the embedding model to process:
      ```
      Issue: [extracted text]
      Rule: [extracted text]
      ...
      ```
3.  **Embedding & Clustering (`irac_pipeline.py`)**:
    - Inherits the core LSH and Density (UMAP + HDBSCAN) clustering logic from the parent `lsh` module.
    - Feeds the cleanly formatted IRAC strings into `hkunlp/instructor-large` with a specific instruction to focus on legal reasoning components.

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
