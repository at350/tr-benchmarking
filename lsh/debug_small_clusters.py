
import json

RESULTS_FILE = "lsh/results/run_20260210_161805.json"

def list_small_clusters():
    with open(RESULTS_FILE, "r") as f:
        data = json.load(f)

    print(f"Total Clusters: {len(data['clusters'])}")
    
    for cluster_id, cluster_data in data['clusters'].items():
        size = len(cluster_data['members'])
        if size <= 3:
            rep = cluster_data['representative']
            print(f"\n--- Cluster {cluster_id} (Size: {size}) ---")
            print(f"Model: {rep['model']}")
            print(f"Text Preview: {rep['text'][:200]}...")

if __name__ == "__main__":
    list_small_clusters()
