import random
import sys

import numpy as np
from typing import List, Dict, Any, Tuple
import json
import os
from collections import defaultdict

from trbench.text import clean_text, encode_responses
from trbench.lsh_index import LSHIndex
from trbench.graph_clustering import build_similarity_graph, cluster_graph, get_cluster_representatives
from trbench.density_clustering import run_density_clustering

class LSHEvaluationPipeline:
    def __init__(self,
                 num_bits=128,
                 num_bands=32,
                 sim_threshold=0.7,
                 resolution=1.0,
                 # density path (UMAP + HDBSCAN); defaults chosen after a grid search on this data
                 umap_dims=10,
                 n_neighbors=5,
                 min_dist=0.1,
                 min_cluster_size=5,
                 min_samples=2,
                 random_state=42):
        # LSH / graph path
        self.num_bits = num_bits
        self.num_bands = num_bands
        self.sim_threshold = sim_threshold
        self.resolution = resolution
        # density path
        self.umap_dims = umap_dims
        self.n_neighbors = n_neighbors
        self.min_dist = min_dist
        self.min_cluster_size = min_cluster_size
        self.min_samples = min_samples
        self.random_state = random_state

        self.lsh_index = None
        self.embeddings = {}  # id -> np.array
        self.responses = {}   # id -> text/metadata
        self.duplicate_ids = []  # ids seen more than once during ingest (last one wins)

    def ingest_data(self, data: List[Dict[str, Any]]):
        """
        Ingests data. Each item must have 'id' and 'response' fields.
        """
        texts = []
        ids = []
        
        print("Preprocessing and encoding data...", file=sys.stderr)
        seen = set()
        for item in data:
            doc_id = item['id']
            if doc_id in seen:
                self.duplicate_ids.append(doc_id)
            seen.add(doc_id)
            text = clean_text(item['response'])
            
            self.responses[doc_id] = item
            texts.append(text)
            ids.append(doc_id)
        if self.duplicate_ids:
            print(f"Warning: {len(self.duplicate_ids)} duplicate ids in input; keeping the last occurrence of each.", file=sys.stderr)
            
        # Bulk encode with instruction to focus on legal conclusion
        embs = encode_responses(
            texts, 
            model_name="hkunlp/instructor-large", 
            instruction="Represent the legal conclusion and reasoning of this text:"
        )
        
        # Store embeddings
        for doc_id, emb in zip(ids, embs):
            self.embeddings[doc_id] = emb
            
        print(f"Encoded {len(texts)} responses.", file=sys.stderr)

    def run_clustering(self, method="density") -> Dict[str, Any]:
        """
        Runs the clustering pipeline.
        
        Args:
            method: "density" (default: UMAP + HDBSCAN) or "lsh" (LSH candidate pairs + Louvain).

        Raises ValueError when the density method is given fewer answers than UMAP can reduce
        (``umap_dims + 2``); collect more answers or use "lsh" for such small sets.
        """
        if method == "density":
            minimum = self.umap_dims + 2
            if len(self.embeddings) < minimum:
                raise ValueError(
                    f"Density clustering needs at least {minimum} answers to reduce to {self.umap_dims} "
                    f"UMAP dimensions; got {len(self.embeddings)}. Collect more answers or use method='lsh'."
                )
            print("Running Density-Based Clustering (UMAP + HDBSCAN)...", file=sys.stderr)
            partition = run_density_clustering(
                self.embeddings,
                n_neighbors=self.n_neighbors,
                min_dist=self.min_dist,
                min_cluster_size=self.min_cluster_size,
                min_samples=self.min_samples,
                n_components=self.umap_dims,
                random_state=self.random_state,
            )
            params = {
                "method": "density_umap_hdbscan",
                "umap_dims": self.umap_dims,
                "n_neighbors": self.n_neighbors,
                "min_dist": self.min_dist,
                "min_cluster_size": self.min_cluster_size,
                "min_samples": self.min_samples,
                "random_state": self.random_state,
            }
            num_clusters = len(set(partition.values())) - (1 if -1 in partition.values() else 0)
        else:
            # Traditional LSH pipeline
            if not self.lsh_index:
                self.build_index()
                
            print("Retrieving candidates...", file=sys.stderr)
            candidates = self.lsh_index.get_candidates()
            print(f"Found {len(candidates)} candidate pairs.", file=sys.stderr)
            
            print("Building similarity graph...", file=sys.stderr)
            G = build_similarity_graph(candidates, self.embeddings, self.sim_threshold)
            print(f"Graph has {G.number_of_nodes()} nodes and {G.number_of_edges()} edges.", file=sys.stderr)
            
            print(f"Clustering (resolution={self.resolution})...", file=sys.stderr)
            partition = cluster_graph(G, resolution=self.resolution)
            num_clusters = len(set(partition.values())) if partition else 0
            params = {
                "method": "lsh_louvain",
                "num_bits": self.num_bits,
                "num_bands": self.num_bands,
                "sim_threshold": self.sim_threshold,
                "resolution": self.resolution,
            }
            
        print(f"Found {num_clusters} clusters.", file=sys.stderr)
        
        print("Selecting representatives...", file=sys.stderr)
        # Filter out noise (-1) for representative selection if using density
        valid_partition = {k: v for k, v in partition.items() if v != -1}
        representatives = get_cluster_representatives(valid_partition, self.embeddings)
        
        # Format results
        clusters = defaultdict(list)
        for doc_id, cluster_id in partition.items():
            if cluster_id == -1:
                clusters["noise"].append(doc_id)
            else:
                clusters[cluster_id].append(doc_id)
            
        return {
            "num_clusters": num_clusters,
            "clusters": clusters,
            "representatives": representatives,
            "partition": partition,
            "params": params,
        }
    
    def centroid_members(self, cluster_id, member_ids, count: int = 3):
        """The `count` members closest to the cluster's geometric centroid (mean embedding)."""
        if cluster_id == "noise" or not member_ids:
            return []
        members = [m for m in member_ids if m in self.embeddings]
        if not members:
            return []
        center = np.mean(np.array([self.embeddings[m] for m in members]), axis=0)
        by_distance = sorted(members, key=lambda m: float(np.linalg.norm(self.embeddings[m] - center)))
        return by_distance[:count]

    def edge_members(self, cluster_id, member_ids, count: int = 3, seed: int = 42):
        """A seeded sample of `count` members from the outer third of the cluster (farthest from the centroid)."""
        if cluster_id == "noise" or len(member_ids) < 2:
            return []
        members = [m for m in member_ids if m in self.embeddings]
        if len(members) < 2:
            return []
        center = np.mean(np.array([self.embeddings[m] for m in members]), axis=0)
        by_distance = sorted(members, key=lambda m: float(np.linalg.norm(self.embeddings[m] - center)), reverse=True)
        outer = by_distance[:max(1, len(by_distance) // 3)]
        return random.Random(seed).sample(outer, min(count, len(outer)))

    def build_index(self):
        """
        Builds the LSH index from stored embeddings.
        """
        if not self.embeddings:
            raise ValueError("No data to index. Call ingest_data first.")
            
        input_dim = next(iter(self.embeddings.values())).shape[0]
        self.lsh_index = LSHIndex(input_dim, self.num_bits, self.num_bands)
        
        print("Building LSH index...", file=sys.stderr)
        for doc_id, emb in self.embeddings.items():
            self.lsh_index.add(emb, doc_id)
