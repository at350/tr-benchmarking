# Experiment scripts (historical)

These are the exact scripts that produced specific data files checked into
`lsh/data/`. They are kept for provenance and are not part of the current
pipeline; `lsh/run_robust_benchmark.py` is the maintained version.

| Script | Question | Data file it produced |
|---|---|---|
| `run_robust_benchmark_v2.py` | UCC firm-offer / revocation hypothetical | `lsh/data/robust_responses_v2.json` |
| `generate_supplemental_data.py` | Same question, extra models | `lsh/data/robust_supplemental.json` |
| `run_robust_patch_v3.py` | Merges the two files above and re-clusters | `lsh/data/robust_responses_final.json` |

The clustering results these scripts wrote (`lsh/results/robust_run_*.json`)
were not kept. All three expect to be run from the repository root with
`OPENAI_API_KEY` and `REPLICATE_API_TOKEN` set, and they call paid model APIs.
