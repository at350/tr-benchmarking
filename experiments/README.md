# Experiment scripts (historical)

These are the exact scripts that produced specific data files checked into
`runs/free-form/responses/`. They are kept for provenance and are not part of the
current pipeline; `trbench robust-benchmark` is the maintained version. They need
the package installed (`pip install -e .`) and run from the repository root.

| Script | Question | Data file it produced |
|---|---|---|
| `run_robust_benchmark_v2.py` | UCC firm-offer / revocation hypothetical | `runs/free-form/responses/robust_responses_v2.json` |
| `generate_supplemental_data.py` | Same question, extra models | `runs/free-form/responses/robust_supplemental.json` |
| `run_robust_patch_v3.py` | Merges the two files above and re-clusters | `runs/free-form/responses/robust_responses_final.json` |

The clustering results these scripts wrote (`robust_run_*.json`)
were not kept. All three expect to be run from the repository root with
`OPENAI_API_KEY` and `REPLICATE_API_TOKEN` set, and they call paid model APIs.
