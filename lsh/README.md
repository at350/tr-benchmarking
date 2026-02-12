# LSH for LLM Response Grouping

This directory contains an implementation of Locality Sensitive Hashing (LSH) to group similar LLM responses.

## Setup

1. Install dependencies:
   ```bash
   # Create a virtual environment (recommended)
   python3 -m venv .venv
   source .venv/bin/activate
   
   # Install packages
   pip install -r requirements.txt
   ```

2. Set up OpenAI API Key:
   Ensure `OPENAI_API_KEY` is set in your environment or in an `.env` file.

## Usage

### 1. Generate Data
Fetch responses from OpenAI models:
```bash
python generate_data.py
```
This saves data to `data/responses.json`.

### 2. Run Pipeline
Run the LSH indexing and clustering pipeline:
```bash
python ../run_experiment.py
```
(Note: `run_experiment.py` is in the parent directory for this demo, or you can move it here).

## Components

### 3. SOTA Density Clustering
To run the advanced UMAP + HDBSCAN pipeline:
1. Ensure dependencies are installed (`pip install umap-learn scikit-learn>=1.3.0 tqdm`).
2. Run `run_experiment.py` (it defaults to density clustering now).

## Components

- **`lsh_index.py`**: Implements Random Hyperplane LSH (Cosine Similarity).
- **`clustering.py`**: Standard graph clustering (Louvain).
- **`density_clustering.py`**: **NEW** SOTA pipeline using UMAP (dim reduction) and HDBSCAN (density clustering).
- **`pipeline.py`**: Orchestrates data ingestion, embeddings, and clustering strategy.
- **`utils.py`**: Text preprocessing and embeddings.

## Configuration

In `run_experiment.py`, you can switch methods:
```python
# For LSH + Louvain
pipeline.run_clustering(method="lsh")

# For SOTA Instruction-Tuned + Density (Default)
# Uses hkunlp/instructor-large + UMAP + HDBSCAN
# Automatically handles noise and separates distinct legal conclusions
pipeline.run_clustering(method="density")
```

### 4. Instruction-Tuned Clustering (Why It Works)
Standard embeddings (like `all-MiniLM-L6-v2`) focus on **topical similarity**. Responses arguing "Enforceable because X" and "Unenforceable because Y" are topically identical (both discuss enforceability), leading to mixed clusters.

To solve this without fragile regex rules, we switched to **`hkunlp/instructor-large`**. This model accepts an **instruction** alongside the text:
> *"Represent the legal conclusion and reasoning of this text:"*

This instruction forces the embedding model to prioritize the **stance** (conclusion) over the general topic. As a result, "Yes" and "No" answers are mapped to distinct regions of the vector space, allowing UMAP+HDBSCAN to separate them cleanly. This approach is:
1.  **Versatile**: Works for any legal question (just change the instruction).
2.  **Robust**: Handles noise automatically via HDBSCAN.
3.  **Pure**: Achieves high cluster purity without manual tuning.
