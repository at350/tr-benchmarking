
import json
from collections import Counter

RESULTS_FILE = "lsh/results/run_20260210_163656.json"

def analyze_membership():
    with open(RESULTS_FILE, "r") as f:
        data = json.load(f)

    print(f"Total Clusters: {len(data['clusters'])}\n")
    
    for cluster_id, cluster_data in data['clusters'].items():
        members = cluster_data['members']
        models = [m['model'] for m in members]
        counts = Counter(models)
        
        print(f"=== Cluster {cluster_id} (Size: {len(members)}) ===")
        print(f"Model Breakdown: {dict(counts)}")
        
        # Check specifically for gpt-5.2 in this cluster
        gpt52_indices = [i for i, m in enumerate(members) if m['model'] == 'gpt-5.2']
        if gpt52_indices:
            print(f"Contains {len(gpt52_indices)} GPT-5.2 responses.")
            # Print first 200 chars of one response to see if it's the skeptical one
            sample_idx = gpt52_indices[0]
            print("Sample GPT-5.2 Text:")
            print(members[sample_idx]['text'][:300] + "...")
        print("-" * 40)

if __name__ == "__main__":
    analyze_membership()
