"""Embed and cluster the collected free-form answers, then save a run file the portal can read.

Usage (from the repository root):
    python run_experiment.py                      # UMAP + HDBSCAN (the method used for the saved runs)
    python run_experiment.py --method lsh         # random-hyperplane LSH + Louvain baseline, for comparison
    python run_experiment.py --data lsh/data/robust_responses_final.json --results-dir lsh/results
"""
import argparse
import json
import os
import time

from lsh.pipeline import LSHEvaluationPipeline

def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default="lsh/data/responses.json", help="responses JSON to cluster")
    parser.add_argument("--results-dir", default="lsh/results", help="where to write run_<timestamp>.json")
    parser.add_argument("--method", choices=["density", "lsh"], default="density",
                        help="density = UMAP + HDBSCAN (default); lsh = LSH candidate pairs + Louvain baseline")
    return parser.parse_args()


def main():
    args = parse_args()
    if not os.path.exists(args.data):
        raise SystemExit(f"Data file {args.data} not found. Run 'python lsh/generate_data.py' first.")

    with open(args.data, "r") as f:
        data = json.load(f)
        
    print(f"Loaded {len(data)} items.")
    
    pipeline = LSHEvaluationPipeline()  # density defaults: UMAP to 10 dims, HDBSCAN min_cluster_size=5
    pipeline.ingest_data(data)
    results = pipeline.run_clustering(method=args.method)
    
    print("\n=== RESULTS ===")
    print(f"Total Clusters: {results['num_clusters']}")
    
    # Prepare full results object
    params = results["params"]
    full_output = {
        "metadata": {
            "method": params["method"],
            "params": params,
            "umap_dims": params.get("umap_dims"),
            "min_cluster_size": params.get("min_cluster_size"),
            "total_items": len(pipeline.embeddings),
            "duplicate_ids_dropped": len(pipeline.duplicate_ids),
            "num_clusters": results['num_clusters']
        },
        "clusters": {}
    }

    clusters = results['clusters']
    reps = results['representatives']

    # Sort clusters by size
    sorted_clusters = sorted(clusters.items(), key=lambda x: len(x[1]), reverse=True)
    
    # Map for quick text lookup
    id_to_text = {d['id']: d['response'] for d in data}
    id_to_model = {d['id']: d['model'] for d in data}

    for cluster_id, members in sorted_clusters:
        if cluster_id == "noise":
            cluster_data = {
                "representative": {
                    "id": "N/A",
                    "model": "NOISE",
                    "text": "Outliers/Noise points"
                },
                "members": []
            }
        else:
            rep_id = reps[cluster_id]
            cluster_data = {
                "representative": {
                    "id": rep_id,
                    "model": id_to_model.get(rep_id, "unknown"),
                    "text": id_to_text.get(rep_id, "")
                },
                "members": []
            }
        
        for member_id in members:
            cluster_data["members"].append({
                "id": member_id,
                "model": id_to_model.get(member_id, "unknown"),
                "text": id_to_text.get(member_id, "")
            })

        centroid_ids = pipeline.centroid_members(cluster_id, members)
        cluster_data["centroid_members"] = [
            {"id": cid, "model": id_to_model.get(cid, "unknown"), "text": id_to_text.get(cid, "")}
            for cid in centroid_ids
        ]

        edge_ids = pipeline.edge_members(cluster_id, members)
        cluster_data["edge_members"] = [
            {"id": eid, "model": id_to_model.get(eid, "unknown"), "text": id_to_text.get(eid, "")}
            for eid in edge_ids
        ]
            
        full_output["clusters"][str(cluster_id)] = cluster_data
        
        # Print summary for top 5 clusters (skip noise for summary unless it's huge)
        if cluster_id != "noise" and int(cluster_id) in [int(c[0]) for c in sorted_clusters[:5] if c[0] != "noise"]:
            print(f"\n--- Cluster {cluster_id} (Size: {len(members)}) ---")
            print(f"Representative ({rep_id}):")
            text_preview = id_to_text.get(rep_id, "")
            print(text_preview[:200] + "..." if len(text_preview) > 200 else text_preview)

    # Save to file
    os.makedirs(args.results_dir, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    output_filename = os.path.join(args.results_dir, f"run_{timestamp}.json")
    
    with open(output_filename, "w") as f:
        json.dump(full_output, f, indent=2)
        
    print(f"\nFull results saved to: {output_filename}")

if __name__ == "__main__":
    main()
