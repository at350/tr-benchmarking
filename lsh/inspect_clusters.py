
import json
import os

RESULTS_FILE = "lsh/results/run_20260210_160702.json"
OUTPUT_FILE = "lsh/cluster_analysis.txt"

def inspect_clusters():
    with open(RESULTS_FILE, "r") as f:
        data = json.load(f)

    with open(OUTPUT_FILE, "w") as f_out:
        f_out.write(f"Total Clusters: {len(data['clusters'])}\n")
        
        for cluster_id, cluster_data in data['clusters'].items():
            rep = cluster_data['representative']
            members = cluster_data['members']
            size = len(members) + 1 
            
            f_out.write(f"\n=== Cluster {cluster_id} (Size: {size}) ===\n")
            f_out.write(f"Representative Model: {rep['model']}\n")
            f_out.write(f"Excerpts from Representative:\n")
            f_out.write(rep['text'][:800])
            f_out.write("\n...\n")

if __name__ == "__main__":
    inspect_clusters()
    print(f"Analysis written to {OUTPUT_FILE}")
