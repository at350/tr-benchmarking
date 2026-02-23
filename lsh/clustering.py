import networkx as nx
import numpy as np
from typing import List, Dict, Tuple, Set
from collections import defaultdict

try:
    import community.community_louvain as community_louvain
except ImportError:
    community_louvain = None
    print("Warning: python-louvain not installed. Clustering will be limited to connected components.")

def build_similarity_graph(
    candidates: Set[Tuple[str, str]],
    embeddings: Dict[str, np.ndarray],
    threshold: float = 0.7
) -> nx.Graph:
    """
    Builds a graph where nodes are doc_ids and edges are weighted by cosine similarity.
    Only edges with similarity >= threshold are added.
    """
    G = nx.Graph()
    G.add_nodes_from(embeddings.keys())
    
    for id1, id2 in candidates:
        if id1 not in embeddings or id2 not in embeddings:
            continue
            
        emb1 = embeddings[id1]
        emb2 = embeddings[id2]
        
        # Compute cosine similarity
        norm1 = np.linalg.norm(emb1)
        norm2 = np.linalg.norm(emb2)
        
        if norm1 == 0 or norm2 == 0:
            sim = 0
        else:
            sim = np.dot(emb1, emb2) / (norm1 * norm2)
            
        if sim >= threshold:
            G.add_edge(id1, id2, weight=sim)
            
    return G

def cluster_graph(G: nx.Graph, resolution: float = 1.0) -> Dict[str, int]:
    """
    Clusters the graph using Louvain modularity (if available) or connected components.
    Returns: Dict[doc_id, cluster_id]
    """
    if community_louvain:
        # Louvain partition
        partition = community_louvain.best_partition(G, weight='weight', resolution=resolution)
        return partition
    else:
        # Fallback: Connected Components
        print("Using Connected Components clustering (fallback)")
        partition = {}
        for i, component in enumerate(nx.connected_components(G)):
            for node in component:
                partition[node] = i
        return partition

def get_cluster_representatives(
    partition: Dict[str, int],
    embeddings: Dict[str, np.ndarray]
) -> Dict[int, str]:
    """
    Selects the medoid for each cluster.
    Returns: Dict[cluster_id, representative_doc_id]
    """
    clusters = defaultdict(list)
    for doc_id, cluster_id in partition.items():
        clusters[cluster_id].append(doc_id)
        
    representatives = {}
    
    for cluster_id, members in clusters.items():
        if not members:
            continue
            
        if len(members) == 1:
            representatives[cluster_id] = members[0]
            continue
            
        # Compute centroid
        embs = np.array([embeddings[uid] for uid in members])
        centroid = np.mean(embs, axis=0)
        
        # Find member closest to centroid
        min_dist = float('inf')
        best_rep = members[0]
        
        for i, uid in enumerate(members):
            dist = np.linalg.norm(embs[i] - centroid)
            if dist < min_dist:
                min_dist = dist
                best_rep = uid
                
        representatives[cluster_id] = best_rep
        
    return representatives
