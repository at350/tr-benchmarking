
import sys
import os

# Add parent directory to path so we can import lsh.utils if running as script
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import umap
from sklearn.cluster import HDBSCAN
from typing import Dict, List
import json
import re
from lsh.utils import encode_responses

DATA_FILE = "lsh/data/responses.json"

def get_verdict_hint(text):
    text = text.lower()
    if "not enforceable" in text or "unenforceable" in text or "probably not" in text:
        return 0 # NO
    if "is enforceable" in text or "enforceable" in text or "likely yes" in text or "probably yes" in text:
        return 1 # YES
    return -1 # AMBIGUOUS

def calculate_purity_score(partition, texts):
    # Calculate how pure each cluster is regarding verdicts
    # Score = avg(max(yes_count, no_count) / total_count) weighted by cluster size
    clusters = {}
    for doc_id, c_id in partition.items():
        if c_id == -1: continue
        if c_id not in clusters: clusters[c_id] = []
        clusters[c_id].append(get_verdict_hint(texts[doc_id]))
        
    total_score = 0
    total_items = 0
    
    for c_id, verdicts in clusters.items():
        yes = verdicts.count(1)
        no = verdicts.count(0)
        total = len(verdicts)
        if total == 0: continue
        
        # Purity of this cluster (ignoring ambiguous)
        definitive = yes + no
        if definitive == 0: 
            purity = 0 
        else:
            purity = max(yes, no) / definitive
            
        # Penalize if too small? No, hdbscan handles that.
        total_score += purity * total
        total_items += total
        
    return total_score / total_items if total_items > 0 else 0

def grid_search():
    print("Loading data...")
    with open(DATA_FILE, "r") as f:
        data = json.load(f)
    
    texts = {d['id']: d['response'] for d in data}
    ids = list(texts.keys())
    raw_texts = [texts[uid] for uid in ids]
    
    print("Encoding...")
    embeddings_array = encode_responses(raw_texts, model_name='all-mpnet-base-v2')
    embeddings = {uid: emb for uid, emb in zip(ids, embeddings_array)}
    
    # Param grid
    n_neighbors_list = [5, 10, 15, 30]
    min_dist_list = [0.0, 0.05, 0.1, 0.2]
    min_cluster_size_list = [5, 10]
    
    best_score = -1
    best_params = {}
    
    print(f"Starting grid search over {len(n_neighbors_list)*len(min_dist_list)*len(min_cluster_size_list)} combinations...")
    
    for n in n_neighbors_list:
        for d in min_dist_list:
            # UMAP first
            reducer = umap.UMAP(
                n_neighbors=n,
                min_dist=d,
                n_components=10,
                metric='cosine',
                random_state=42
            )
            embedding_reduced = reducer.fit_transform(embeddings_array)
            
            for mcs in min_cluster_size_list:
                clusterer = HDBSCAN(
                    min_cluster_size=mcs,
                    min_samples=1, # Keep low to allow noise
                    cluster_selection_method='eom'
                )
                labels = clusterer.fit_predict(embedding_reduced)
                partition = {uid: l for uid, l in zip(ids, labels)}
                
                score = calculate_purity_score(partition, texts)
                n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
                
                print(f"Params: n={n}, d={d}, mcs={mcs} -> Clusters: {n_clusters}, Purity: {score:.4f}")
                
                if score > best_score and n_clusters >= 3: # Constraint: at least 3 clusters
                    best_score = score
                    best_params = {'n_neighbors': n, 'min_dist': d, 'min_cluster_size': mcs}
                    
    print("\nXXX BEST PARAMS XXX")
    print(best_params)
    print(f"Score: {best_score}")

if __name__ == "__main__":
    grid_search()
