"""``trbench poison``: add deliberately wrong IRAC answers to a saved dataset and re-cluster.

Each poison is copied ``--copies`` times (HDBSCAN's min_cluster_size) so a well-separated
poison forms its own cluster instead of being labelled noise. Writes a ``*_poisoned``
responses/results pair next to the originals. Needs OPENAI_API_KEY for doctrine labels;
without it the clustering still runs and topic signals are empty.
"""
import os
from datetime import datetime

from trbench.irac.poisons import poison_records
from trbench.results import IRAC_NOISE, build_results_document, irac_fields, read_json, write_json

DEFAULT_INPUT = os.path.join("runs", "irac", "responses", "responses_20260223_233818.json")
DEFAULT_OUTPUT_DIR = os.path.join("runs", "irac")


def add_parser(subparsers, name, help_text):
    parser = subparsers.add_parser(name, help=help_text, description=__doc__)
    parser.add_argument("--input", default=DEFAULT_INPUT, help="responses_<timestamp>.json to poison (default: %(default)s)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="root holding responses/ and results/ (default: %(default)s)")
    parser.add_argument("--copies", type=int, default=5, help="copies of each poison (default: %(default)s = min_cluster_size)")
    parser.set_defaults(run=run)


def run(args) -> int:
    from trbench.irac.pipeline import IRACEvaluationPipeline

    print(f"Loading {args.input}...")
    data = read_json(args.input)
    if not isinstance(data, list) or not data or not all(
            isinstance(record, dict) and isinstance(record.get("response"), dict) for record in data):
        raise SystemExit(f"{args.input} is not an IRAC responses file (each 'response' should be an "
                         "{issue, rule, application, conclusion} object, as written by `trbench irac-benchmark`).")
    question = (data[0].get("prompt") if data else None) or ""
    data = list(data) + poison_records(question, args.copies)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    responses_path = write_json(os.path.join(args.output_dir, "responses", f"responses_poisoned_{stamp}.json"), data)
    print(f"Saved poisoned dataset to {responses_path} ({len(data)} items)")

    print("\n--- Running clustering pipeline ---")
    pipeline = IRACEvaluationPipeline()
    pipeline.ingest_data(data)
    results = pipeline.run_clustering(method="density")

    document = build_results_document(
        pipeline, results, data,
        metadata={"timestamp": f"{stamp}_poisoned", "question": question, "schema": "IRAC",
                  "poisons": sorted({r["model"] for r in data if r["model"].startswith("poison-")}),
                  "poison_copies": args.copies},
        member_fields=irac_fields, noise_fields=IRAC_NOISE,
    )
    results_path = write_json(os.path.join(args.output_dir, "results", f"run_{stamp}_poisoned.json"), document)
    print(f"Results saved to {results_path} ({results['num_clusters']} clusters)")

    # Report whether each poison landed in its own cluster.
    for label in document["metadata"]["poisons"]:
        homes = {key for key, cluster in document["clusters"].items()
                 if any(m["model"] == label for m in cluster["members"])}
        print(f"  {label}: in cluster(s) {sorted(homes)}")
    return 0
