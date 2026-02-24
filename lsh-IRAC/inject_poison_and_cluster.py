import json
import os
from datetime import datetime
from irac_pipeline import IRACEvaluationPipeline

# The original question from the benchmark
question = "A woman owned a 10-acre tract of rural farmland in fee simple absolute. The woman agreed to sell the farmland to a man, and each signed a writing stating that the farmland was beitig sold: \". . . for $10,000, receipt of which is acknowledged. \" In actuality, the man had not yet paid the woman the $10,000. At the date set for closing, the woman transferred a deed to the farmland to the man, who gave the woman a check for $10,000. Howevei, a few days after the woman deposited the check, she received notice from her bank that the check had not cleared, due to insufficient funds in the account. The woman then brought suit against the man. At trial, the woman seeks to testify that the man did not in fact pay her the $10,000 as recited in their written instrument. The man objects to the woman's proposed testimony. Will the trial court judge be correct in sustaining the man's objection?"

poison_1_nonsensical = {
    "model": "poison-nonsense",
    "prompt": question,
    "response": {
        "issue": "Whether the space aliens correctly abducted the cow from the farmland before the $10,000 check was printed.",
        "rule": "The intergalactic treaty of 1994 states that all cows are property of the mothership and cannot be sold for Earth dollars.",
        "application": "Because the woman attempted to sell the cow-adjacent land to a human man, the extraterrestrial police intervened and caused the check to bounce using mind beams.",
        "conclusion": "The trial court judge will be incorrect because the jurisdiction is actually Mars."
    },
    "raw_text": "...",
    "id": "poison-nonsense_0"
}

poison_2_wrong_standard = {
    "model": "poison-wrong-standard",
    "prompt": question,
    "response": {
        "issue": "Whether the trial court judge should sustain the man's objection to the woman's testimony about the non-payment under the rule against perpetuities.",
        "rule": "The rule against perpetuities prevents property interests from vesting too far into the future, specifically stating that no interest is good unless it must vest, if at all, not later than twenty-one years after some life in being at the creation of the interest.",
        "application": "In this case, the woman is attempting to introduce evidence of non-payment. However, because the payment was meant to vest immediately upon the transfer of the 10-acre tract, and there are no validating lives that would cause the interest to violate the 21-year period, the rule against perpetuities is satisfied. The bounced check does not create a contingent remainder that violates this property rule.",
        "conclusion": "The trial court judge will be correct in sustaining the man's objection because the rule against perpetuities has not been violated."
    },
    "raw_text": "...",
    "id": "poison-wrong-standard_0"
}

poison_3_criminal_law = {
    "model": "poison-criminal-law",
    "prompt": question,
    "response": {
        "issue": "Whether the man is guilty of first-degree murder for giving the woman a bounced check for the farmland.",
        "rule": "First-degree murder requires the unlawful killing of a human being with malice aforethought, deliberation, and premeditation.",
        "application": "The man wrote a check for $10,000 that bounced due to insufficient funds. While this may constitute fraud or a bad check offense, there is no evidence that the man caused the death of the woman, let alone with malice aforethought or premeditation. A financial dispute over real estate does not meet the elements of homicide.",
        "conclusion": "The trial court judge will be correct, as the man cannot be convicted of murder for a bounced check."
    },
    "raw_text": "...",
    "id": "poison-criminal-law_0"
}

def main():
    original_file = "data/responses_20260223_233818.json"
    print(f"Loading {original_file}...")
    with open(original_file, "r") as f:
        data = json.load(f)
    
    # We add 5 identical copies of each poisoned data type, but with different IDs.
    # Since HDBSCAN 'min_cluster_size' is 5, less than 5 will be marked as Noise (-1).
    # Since the user specifically wants to see if "it should appear in its own cluster",
    # we provide exactly 5 copies so it meets the cluster size threshold if they are perfectly identical.
    # If we only provided 1, it would just be noise (-1).
    
    poisons = []
    
    for i in range(5):
        p1 = poison_1_nonsensical.copy()
        p1["id"] = f"poison-nonsense_{i}"
        
        p2 = poison_2_wrong_standard.copy()
        p2["id"] = f"poison-wrong-standard_{i}"
        
        p3 = poison_3_criminal_law.copy()
        p3["id"] = f"poison-criminal-law_{i}"
        
        poisons.extend([p1, p2, p3])
        
    data.extend(poisons)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = f"data/responses_poisoned_{timestamp}.json"
    
    with open(out_file, "w") as f:
        json.dump(data, f, indent=2)
        
    print(f"Saved poisoned dataset to {out_file} (Total items: {len(data)})")
    
    # Run HDBSCAN Pipeline
    print("\n--- Running Clustering Pipeline ---")
    pipeline = IRACEvaluationPipeline(
        num_bits=128,
        sim_threshold=0.88,
        resolution=1.0
    )
    
    pipeline.ingest_data(data)
    results = pipeline.run_clustering(method="density")
    
    # Prepare output
    full_output = {
        "metadata": {
            "timestamp": f"{timestamp}_poisoned",
            "method": "density_umap_hdbscan",
            "umap_dims": 10,
            "min_cluster_size": 5,
            "question": question,
            "schema": "IRAC",
            "total_items": len(data),
            "num_clusters": results['num_clusters']
        },
        "clusters": {}
    }
    
    clusters = results['clusters']
    reps = results['representatives']
    id_to_irac = {d['id']: d['response'] for d in data}
    id_to_model = {d['id']: d['model'] for d in data}

    for cluster_id, members in clusters.items():
        if cluster_id == "noise":
            cluster_key = "-1"
            cluster_data = {
                "representative": {
                    "id": "N/A", 
                    "model": "NOISE", 
                    "issue": "N/A",
                    "rule": "N/A",
                    "application": "N/A",
                    "conclusion": "Outliers"
                 },
                "members": []
            }
        else:
            cluster_key = str(cluster_id)
            rep_id = reps[cluster_id]
            cluster_data = {
                "representative": {
                    "id": rep_id,
                    "model": id_to_model.get(rep_id, "unknown"),
                    **id_to_irac.get(rep_id, {})
                },
                "members": []
            }
        
        for member_id in members:
            cluster_data["members"].append({
                "id": member_id, 
                "model": id_to_model.get(member_id, "unknown"),
                **id_to_irac.get(member_id, {})
            })
            
        full_output["clusters"][cluster_key] = cluster_data

    RESULTS_FILE = f"results/run_{timestamp}_poisoned.json"
    os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
    with open(RESULTS_FILE, "w") as f:
        json.dump(full_output, f, indent=2)
    print(f"Results saved to {RESULTS_FILE}")
    
if __name__ == "__main__":
    main()
