import asyncio
import json
import os
import random
import time
import numpy as np
from lsh.pipeline import LSHEvaluationPipeline

EDGE_SAMPLE_SEED = 42
EDGE_SAMPLE_COUNT = 3

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
    embeddings = pipeline.embeddings

    def get_centroid_members(cluster_id, member_ids):
        """Return centroid (representative) plus 2 closest members."""
        if cluster_id == "noise" or len(member_ids) == 0:
            return []
        rep_id = reps.get(cluster_id) if isinstance(cluster_id, int) else None
        if not rep_id or rep_id not in embeddings:
            return []
        centroid = embeddings[rep_id]
        members_excl_rep = [m for m in member_ids if m in embeddings and m != rep_id]
        result = [rep_id]
        if members_excl_rep:
            distances = [(m, float(np.linalg.norm(embeddings[m] - centroid))) for m in members_excl_rep]
            distances.sort(key=lambda x: x[1])
            result.extend([m for m, _ in distances[:2]])
        return result

    def get_edge_members(cluster_id, member_ids):
        """Sample 3 random members from the outer third (farthest from centroid)."""
        if cluster_id == "noise" or len(member_ids) < 2:
            return []
        rep_id = reps.get(cluster_id) if isinstance(cluster_id, int) else None
        if not rep_id or rep_id not in embeddings:
            return []
        centroid = embeddings[rep_id]
        members_with_emb = [m for m in member_ids if m in embeddings]
        if len(members_with_emb) < 2:
            return []
        distances = [(m, float(np.linalg.norm(embeddings[m] - centroid))) for m in members_with_emb]
        distances.sort(key=lambda x: x[1], reverse=True)
        outer_third_count = max(1, len(distances) // 3)
        outer_member_ids = [m for m, _ in distances[:outer_third_count]]
        rng = random.Random(EDGE_SAMPLE_SEED)
        sample = rng.sample(outer_member_ids, min(EDGE_SAMPLE_COUNT, len(outer_member_ids)))
        return sample

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

        centroid_ids = get_centroid_members(cluster_id, members)
        cluster_data["centroid_members"] = [
            {"id": cid, "model": id_to_model.get(cid, "unknown"), "text": id_to_text.get(cid, "")}
            for cid in centroid_ids
        ]

        edge_ids = get_edge_members(cluster_id, members)
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
    os.makedirs(RESULTS_DIR, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    output_filename = os.path.join(RESULTS_DIR, f"run_{timestamp}.json")
    
    with open(output_filename, "w") as f:
        json.dump(full_output, f, indent=2)
        
    print(f"\nFull results saved to: {output_filename}")

if __name__ == "__main__":
    main()
