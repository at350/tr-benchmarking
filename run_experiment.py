import asyncio
import json
import os
import time
from lsh.pipeline import LSHEvaluationPipeline

DATA_FILE = "lsh/data/responses.json"
RESULTS_DIR = "lsh/results"

def main():
    if not os.path.exists(DATA_FILE):
        print(f"Data file {DATA_FILE} not found. Running generation...")
        print("Please run 'python3 lsh/generate_data.py' first.")
        return

    with open(DATA_FILE, "r") as f:
        data = json.load(f)
        
    print(f"Loaded {len(data)} items.")
    
    # Initialize pipeline
    pipeline = LSHEvaluationPipeline(
        num_bits=128,
        num_bands=32,
        sim_threshold=0.88,  # Target: Merge singletons (0.90 was too high, 0.85 too low)
        resolution=1.0       
    )
    
    pipeline.ingest_data(data)
    # Run density-based clustering (UMAP+HDBSCAN)
    results = pipeline.run_clustering(method="density")
    
    print("\nXXX RESULTS XXX")
    print(f"Total Clusters: {results['num_clusters']}")
    
    # Prepare full results object
    full_output = {
        "metadata": {
            "method": "density_umap_hdbscan",
            "umap_dims": 5,
            "min_cluster_size": 5,
            "total_items": len(data),
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
            
        full_output["clusters"][str(cluster_id)] = cluster_data
        
        # Print summary for top 5 clusters (skip noise for summary unless it's huge)
        if cluster_id != "noise" and int(cluster_id) in [int(c[0]) for c in sorted_clusters[:5] if c[0] != "noise"]:
            print(f"\n--- Cluster {cluster_id} (Size: {len(members)}) ---")
            print(f"Representative ({rep_id}):")
            text_preview = id_to_text.get(rep_id, "")
            print(text_preview[:200] + "..." if len(text_preview) > 200 else text_preview)

    # Save to file
    os.makedirs(RESULTS_DIR, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    output_filename = os.path.join(RESULTS_DIR, f"run_{timestamp}.json")
    
    with open(output_filename, "w") as f:
        json.dump(full_output, f, indent=2)
        
    print(f"\nFull results saved to: {output_filename}")

if __name__ == "__main__":
    main()
