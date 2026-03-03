import argparse
import json
import os
import time
from collections import Counter
from itertools import combinations

from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score

from lsh.pipeline import LSHEvaluationPipeline

DATA_FILE = "lsh/data/responses.json"
RESULTS_DIR = "lsh/results"

def parse_args():
    parser = argparse.ArgumentParser(description="Run clustering experiment on existing responses.")
    parser.add_argument("--data-file", type=str, default=DATA_FILE)
    parser.add_argument("--results-dir", type=str, default=RESULTS_DIR)
    parser.add_argument("--embedding-backend", choices=["instructor", "legalbert"], default="instructor")
    parser.add_argument("--embedding-model-name", type=str, default=None)
    parser.add_argument("--seeds", type=int, nargs="+", default=[42, 43, 44])
    return parser.parse_args()


def summarize_partition(partition, ordered_ids):
    labels = [int(partition[doc_id]) for doc_id in ordered_ids]
    noise_count = sum(1 for x in labels if x == -1)
    non_noise = [x for x in labels if x != -1]
    sizes = Counter(non_noise)
    return {
        "labels": labels,
        "num_clusters": len(set(non_noise)),
        "noise_ratio": (noise_count / len(labels)) if labels else 0.0,
        "cluster_sizes": dict(sorted(sizes.items(), key=lambda kv: kv[1], reverse=True)),
    }


def main():
    args = parse_args()
    if not os.path.exists(args.data_file):
        print(f"Data file {args.data_file} not found.")
        return

    with open(args.data_file, "r") as f:
        data = json.load(f)
        
    print(f"Loaded {len(data)} items.")
    ordered_ids = [d["id"] for d in data]
    
    pipeline = LSHEvaluationPipeline(
        num_bits=128,
        num_bands=32,
        sim_threshold=0.88,
        resolution=1.0,
        embedding_backend=args.embedding_backend,
        embedding_model_name=args.embedding_model_name,
    )
    
    pipeline.ingest_data(data)

    seed_results = {}
    for seed in args.seeds:
        print(f"\nRunning density clustering with seed={seed} ...")
        run_result = pipeline.run_clustering(method="density", random_state=seed)
        summary = summarize_partition(run_result["partition"], ordered_ids)
        seed_results[str(seed)] = {
            "stats": {
                "num_clusters": summary["num_clusters"],
                "noise_ratio": summary["noise_ratio"],
                "cluster_sizes": summary["cluster_sizes"],
            },
            "partition": run_result["partition"],
        }
        print(f"Clusters: {summary['num_clusters']}")
        print(f"Noise ratio: {summary['noise_ratio']:.3f}")

    pairwise = []
    ari_values = []
    nmi_values = []
    for s1, s2 in combinations(args.seeds, 2):
        labels_1 = seed_results[str(s1)]["partition"]
        labels_2 = seed_results[str(s2)]["partition"]
        seq_1 = [int(labels_1[doc_id]) for doc_id in ordered_ids]
        seq_2 = [int(labels_2[doc_id]) for doc_id in ordered_ids]
        ari = float(adjusted_rand_score(seq_1, seq_2))
        nmi = float(normalized_mutual_info_score(seq_1, seq_2))
        ari_values.append(ari)
        nmi_values.append(nmi)
        pairwise.append({"seed_a": s1, "seed_b": s2, "ari": ari, "nmi": nmi})

    stability = {
        "pairwise": pairwise,
        "ari_mean": (sum(ari_values) / len(ari_values)) if ari_values else None,
        "nmi_mean": (sum(nmi_values) / len(nmi_values)) if nmi_values else None,
    }

    full_output = {
        "metadata": {
            "method": "density_umap_hdbscan",
            "embedding_backend": args.embedding_backend,
            "embedding_model_name": args.embedding_model_name or (
                "nlpaueb/legal-bert-base-uncased" if args.embedding_backend == "legalbert" else "hkunlp/instructor-large"
            ),
            "seeds": args.seeds,
            "umap_dims": 10,
            "min_cluster_size": 5,
            "total_items": len(data),
            "data_file": args.data_file,
        },
        "seed_results": seed_results,
        "stability": stability,
    }

    os.makedirs(args.results_dir, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    output_filename = os.path.join(args.results_dir, f"run_{timestamp}.json")
    
    with open(output_filename, "w") as f:
        json.dump(full_output, f, indent=2)
        
    print(f"\nResults saved to: {output_filename}")
    if stability["ari_mean"] is not None:
        print(f"ARI mean: {stability['ari_mean']:.4f}")
        print(f"NMI mean: {stability['nmi_mean']:.4f}")

if __name__ == "__main__":
    main()
