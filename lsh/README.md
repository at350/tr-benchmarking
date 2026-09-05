# lsh — embedding and clustering of model responses

The folder keeps its historical name: locality-sensitive hashing was the first
clustering approach and survives only as a baseline (`lsh_index.py`, run with
`python run_experiment.py --method lsh`). The pipeline that produced every saved
run is UMAP + HDBSCAN.

Generates many answers to one legal question from several models, embeds them
with an instruction-tuned encoder, and clusters the embeddings to find the
distinct lines of reasoning the models take. Outliers land in a `noise`
cluster. This is the shared engine; `lsh-IRAC/` builds on it and the frontend
calls `cluster_legal_workflow.py` from it.

All commands below run from the **repository root** (the scripts use paths like
`lsh/data/...`).

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # OPENAI_API_KEY, REPLICATE_API_TOKEN
```

## Pipeline

```bash
# 1. Collect responses into lsh/data/responses.json (all three spend API credits; run in this order:
#    generate_data.py creates/overwrites the file, the other two append to it)
python lsh/generate_data.py             # OpenAI models
python lsh/generate_replicate_data.py   # Claude, Llama, Mixtral via Replicate
python lsh/generate_gemini_data.py      # Gemini via Replicate

# 2. Embed + cluster -> lsh/results/run_<timestamp>.json  (add --method lsh for the LSH + Louvain baseline)
python run_experiment.py

# 3. Look at a run
python lsh/inspect_run.py lsh/results/run_20260217_153621.json summary
python lsh/inspect_run.py lsh/results/run_20260217_153621.json verdicts   # flags clusters that disagree on the outcome

# 4. Figures -> lsh/presentation_assets/ (re-embeds lsh/data/responses.json with the instructor model, no API calls)
python lsh/visualize_pipeline.py
```

`run_robust_benchmark.py` (or `bash run_benchmark.sh`) does generation and
clustering in one go for a fixed robustness question.

## How it works

1. **Embedding** (`utils.py`): `hkunlp/instructor-large` with the instruction
   *"Represent the legal conclusion and reasoning of this text"*, so that
   "enforceable" and "unenforceable" answers separate even when they share vocabulary.
2. **Dimensionality reduction + clustering** (`density_clustering.py`): UMAP to a
   low-dimensional manifold, then HDBSCAN; points HDBSCAN cannot place are noise.
3. **Representatives** (`pipeline.py`): the member closest to each cluster's mean
   embedding, plus the three most central (`centroid_members`) and a seeded sample of
   three from the outer third (`edge_members`).
4. Baseline alternatives kept for comparison: random-hyperplane LSH
   (`lsh_index.py`) and Louvain graph clustering (`clustering.py`).

## Files

| File | Purpose |
|---|---|
| `pipeline.py` | `LSHEvaluationPipeline`: ingest, embed, cluster, pick representatives |
| `density_clustering.py` | UMAP + HDBSCAN |
| `lsh_index.py` | Random-hyperplane LSH index (baseline) |
| `clustering.py` | Similarity graph + Louvain (baseline) |
| `utils.py` | Text cleaning and embedding helpers |
| `generate_data.py`, `generate_replicate_data.py`, `generate_gemini_data.py` | Response collection |
| `run_robust_benchmark.py` | One-shot generation + clustering for the robustness question |
| `grid_search.py` | Sweep clustering hyperparameters |
| `inspect_run.py` | CLI to summarise a saved run (model mix, small clusters, verdict splits, excerpts) |
| `visualize_pipeline.py` | UMAP scatter plots and cluster-size charts |
| `cluster_legal_workflow.py` | JSON-in / JSON-out clustering used by the frontend (`--input file.json`) |
| `data/` | Collected responses |
| `results/` | Saved runs (`run_<timestamp>.json`) |
| `presentation_assets/` | Generated figures |
| `experiments/` | Earlier benchmark iterations kept for provenance (see its README) |
