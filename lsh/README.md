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

### 4. Temperature Sweep Experiment
Run a temperature sweep for one model and up to two questions, using fixed UMAP/HDBSCAN params and multiple clustering seeds:
```bash
python temperature_sweep.py \
  --model gpt-4o \
  --question-file ../lsh-IRAC/data/questions/question_q2.txt \
  --temperatures 0.1,0.2,0.3,0.7 \
  --responses-per-temp 120 \
  --seeds 42,43,44
```

Outputs are saved under `lsh/results/temperature_sweep_<timestamp>/`:
- `summary_table.json`: cluster count/noise ratio per temperature and stability summaries.
- `stability_pairs.json`: pairwise ARI/NMI per temperature.
- `centroid_drift.json`: centroid matching similarity from lowest temperature to higher temperatures.
- `temperature_only_clusters.json`: high-temperature clusters with low similarity to baseline clusters.
- `plot_cluster_noise.png` and `plot_stability_drift.png`: quick report plots.
- `report.md`: one-page markdown summary.

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
