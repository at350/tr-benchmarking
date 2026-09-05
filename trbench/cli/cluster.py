"""``trbench cluster``: embed the collected free-form answers, cluster them, write a run file."""
import os

from trbench.results import (FREE_FORM_NOISE, build_results_document, free_form_fields, read_json,
                             timestamp, write_json)

DEFAULT_DATA = os.path.join("runs", "free-form", "responses", "responses.json")
DEFAULT_RESULTS_DIR = os.path.join("runs", "free-form", "results")


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--data", default=DEFAULT_DATA, help="responses JSON to cluster (default: %(default)s)")
    parser.add_argument("--results-dir", default=DEFAULT_RESULTS_DIR, help="where to write run_<timestamp>.json")
    parser.add_argument("--method", choices=["density", "lsh"], default="density",
                        help="density = UMAP + HDBSCAN (default); lsh = LSH candidate pairs + Louvain baseline")
    parser.set_defaults(run=run)


def run(args) -> int:
    from trbench.pipeline import LSHEvaluationPipeline

    if not os.path.exists(args.data):
        raise SystemExit(f"Data file {args.data} not found. Collect answers first with `trbench generate`.")
    data = read_json(args.data)
    if not isinstance(data, list) or not data:
        raise SystemExit(f"{args.data} holds no answers to cluster.")
    if not all(isinstance(record, dict) and isinstance(record.get("response"), str) for record in data):
        raise SystemExit(f"{args.data} does not look like a free-form responses file: every 'response' should be "
                         "text. IRAC answers (objects) are clustered by `trbench irac-benchmark` and `trbench poison`.")
    print(f"Loaded {len(data)} items from {args.data}.")

    pipeline = LSHEvaluationPipeline()
    pipeline.ingest_data(data)
    try:
        results = pipeline.run_clustering(method=args.method)
    except ValueError as exc:  # too few answers for the density method
        raise SystemExit(f"{exc} (pass --method lsh for a small file)") from exc
    print(f"\n=== RESULTS ===\nTotal clusters: {results['num_clusters']}")

    document = build_results_document(
        pipeline, results, data,
        metadata={"timestamp": timestamp(), "question": data[0].get("prompt", "") if data else ""},
        member_fields=free_form_fields, noise_fields=FREE_FORM_NOISE,
    )
    for key, cluster in list(document["clusters"].items())[:5]:
        if key == "-1":
            continue
        print(f"\n--- Cluster {key} (size {len(cluster['members'])}) ---")
        print(f"Representative ({cluster['representative']['id']}): {cluster['representative']['text'][:200]}...")

    path = write_json(os.path.join(args.results_dir, f"run_{document['metadata']['timestamp']}.json"), document)
    print(f"\nFull results saved to: {path}")
    return 0
