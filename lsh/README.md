# LSH for LLM Response Grouping

This directory contains an implementation of Locality Sensitive Hashing (LSH) and Density Clustering (UMAP + HDBSCAN) to group semantically similar LLM responses.

## Overview

The pipeline ingests legal responses from various LLMs, generates **Instruction-Tuned Embeddings** to capture legal reasoning, reduces dimensionality with UMAP, and clusters them using HDBSCAN. This allows for clean separation of responses based on their legal conclusion (e.g., "Enforceable" vs "Unenforceable") rather than just topical similarity.

## Setup

1. **Install Dependencies**:
   ```bash
   # Create and activate virtual environment
   python3 -m venv .venv
   source .venv/bin/activate
   
   # Install required packages
   pip install -r requirements.txt
   ```

2. **Set API Keys**:
   Make sure the following environment variables are set (or present in `.env`):
   - `OPENAI_API_KEY`: For generating OpenAI data.
   - `REPLICATE_API_TOKEN`: For generating Replicate/Claude/Gemini data.

## Usage

### 1. Data Generation
Scripts to fetch responses from different model families:

- **OpenAI Models** (GPT-4o, GPT-3.5, etc.):
  ```bash
  python generate_data.py
  ```
- **Replicate Models** (Claude 3.5 Sonnet, Llama 3):
  ```bash
  python generate_replicate_data.py
  ```
- **Gemini Models** (Gemini 1.5 Pro/Flash via Replicate):
  ```bash
  python generate_gemini_data.py
  ```

All scripts append unique responses to `data/responses.json`.

### 2. Clustering Pipeline
Run the full clustering pipeline. This reads `data/responses.json`, generates embeddings, clusters them, and saves the results.
```bash
python ../run_experiment.py
```
**Output**: A JSON file in `results/` (e.g., `results/run_20260217_153621.json`) containing cluster assignments, representatives, and metadata.

### 3. Visualization
Generate performance charts and UMAP visualizations:
```bash
python visualize_pipeline.py
```
**Output**: Images saved in `presentation_assets/`:
- `viz_before_topical.png`: UMAP of baseline embeddings (mixed clusters).
- `viz_after_instruction.png`: UMAP of instruction-tuned embeddings (clean separation).
- `viz_cluster_distribution.png`: Bar chart of cluster sizes and verdicts.

## Files & Directories

### Core Logic
- **`pipeline.py`**: Main class `LSHEvaluationPipeline` that orchestrates the workflow.
- **`density_clustering.py`**: Implementation of UMAP + HDBSCAN clustering logic.
- **`lsh_index.py`**: Baseline Random Hyperplane LSH implementation.
- **`clustering.py`**: Baseline graph clustering (Louvain).
- **`utils.py`**: Helper functions for text preprocessing and embedding generation.

### Tools & Inspection
- **`deep_inspect.py`**: Script to print detailed text content of clusters for manual verification of purity.
- **`visualize_pipeline.py`**: Generates the project's visual assets.
- **`inspect_clusters.py`**: Simple CLI tool to list cluster members.

### Data & Results
- **`data/`**: Contains the input dataset `responses.json`.
- **`results/`**: Archive of clustering run outputs.
- **`presentation_assets/`**: Generated plots and charts for reports.

## Methodology

### Instruction-Tuned Embeddings
We use `hkunlp/instructor-large` with the instruction:
> *"Represent the legal conclusion and reasoning of this text:"*

This directs the model to embed the *outcome* of the legal argument, ensuring that "Enforceable" and "Unenforceable" answers are semantically distinct, even if they use similar legal vocabulary.

### Density Clustering
We use **UMAP** (Uniform Manifold Approximation and Projection) to reduce embeddings to a lower-dimensional space, followed by **HDBSCAN** (Hierarchical Density-Based Spatial Clustering of Applications with Noise) to identify dense clusters of varying shapes and sizes, while automatically classifying outliers as noise.
