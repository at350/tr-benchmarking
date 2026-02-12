
import numpy as np
import umap
from sklearn.cluster import HDBSCAN
from typing import Dict, List, Tuple
from collections import defaultdict

def run_density_clustering(
    embeddings: Dict[str, np.ndarray],
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    min_cluster_size: int = 5,
    min_samples: int = None,
    n_components: int = 5,
    random_state: int = 42
) -> Dict[str, int]:
    """
    Runs the UMAP + HDBSCAN pipeline.
    
    1. UMAP: Reduces dimensionality to `n_components` while preserving local structure.
    2. HDBSCAN: Clusters the reduced data based on density.
    
    Args:
        embeddings: Dict mapping doc_id to embedding vector.
        n_neighbors: UMAP parameter (local neighborhood size).
        min_dist: UMAP parameter (minimum distance between points).
        min_cluster_size: HDBSCAN parameter (smallest cluster size).
        min_samples: HDBSCAN parameter (measure of how conservative clustering is).
        n_components: Number of dimensions to reduce to.
        random_state: Seed for reproducibility.
        
    Returns:
        Dict mapping doc_id to cluster_id. Noise points are assigned cluster_id -1.
    """
    
    doc_ids = list(embeddings.keys())
    # Stack embeddings into a matrix
    X = np.stack([embeddings[uid] for uid in doc_ids])
    
    print(f"Running UMAP reduction ({X.shape[1]} -> {n_components} dims)...")
    reducer = umap.UMAP(
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        n_components=n_components,
        metric='cosine', # Use cosine metric for text embeddings
        random_state=random_state
    )
    X_embedded = reducer.fit_transform(X)
    
    print(f"Running HDBSCAN clustering (min_cluster_size={min_cluster_size})...")
    clusterer = HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric='euclidean', # HDBSCAN on reduced space usually uses euclidean
        cluster_selection_method='eom' # Excess of Mass (standard)
    )
    labels = clusterer.fit_predict(X_embedded)
    
    # Map back to doc_ids
    partition = {doc_id: int(label) for doc_id, label in zip(doc_ids, labels)}
    
    # Count noise
    n_noise = list(labels).count(-1)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    print(f"Density clustering found {n_clusters} clusters and {n_noise} noise points.")
    
    return partition
