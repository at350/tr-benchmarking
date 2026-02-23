import numpy as np
from collections import defaultdict
from typing import List, Dict, Set, Tuple

class LSHIndex:
    def __init__(self, input_dim: int, num_bits: int = 128, num_bands: int = 32, seed: int = 42):
        """
        Initializes the LSH Index with Random Hyperplanes (Cosine Similarity).
        
        Args:
            input_dim: Dimension of the input vectors.
            num_bits: Total number of bits in the signature (k).
            num_bands: Number of bands for LSH banding (b).
            seed: Random seed for reproducibility.
        """
        self.input_dim = input_dim
        self.num_bits = num_bits
        self.num_bands = num_bands
        self.rows_per_band = num_bits // num_bands
        
        if num_bits % num_bands != 0:
            raise ValueError(f"num_bits ({num_bits}) must be divisible by num_bands ({num_bands})")
            
        np.random.seed(seed)
        # Generate random hyperplanes: shape (num_bits, input_dim)
        self.hyperplanes = np.random.randn(num_bits, input_dim)
        
        # Storage: List of dictionaries, one per band
        # band_tables[j][band_hash] = [doc_id_1, doc_id_2, ...]
        self.band_tables = [defaultdict(list) for _ in range(num_bands)]
        
        # Keep track of all added IDs
        self.doc_ids = set()

    def _compute_signature(self, vector: np.ndarray) -> np.ndarray:
        """Computes the boolean signature for a single vector."""
        # Project vector onto hyperplanes
        # (num_bits, input_dim) @ (input_dim,) -> (num_bits,)
        projections = np.dot(self.hyperplanes, vector)
        return (projections >= 0).astype(int)

    def _hash_band(self, band_bits: np.ndarray) -> str:
        """Converts a chunk of bits into a hashable string key."""
        # Convert [0, 1, 1, 0] -> "0110" or similar hashable representation
        # Using bytes is faster/compact, or just a tuple
        return tuple(band_bits)

    def add(self, vector: np.ndarray, doc_id: str):
        """Adds a vector to the LSH index."""
        if doc_id in self.doc_ids:
            return # Avoid duplicates if necessary, or handle updates
            
        signature = self._compute_signature(vector)
        
        for i in range(self.num_bands):
            start = i * self.rows_per_band
            end = (i + 1) * self.rows_per_band
            band_key = self._hash_band(signature[start:end])
            self.band_tables[i][band_key].append(doc_id)
            
        self.doc_ids.add(doc_id)

    def get_candidates(self) -> Set[Tuple[str, str]]:
        """
        Retrieves all candidate pairs that collide in at least one band.
        for graph construction.
        Returns a set of (id1, id2) tuples.
        """
        candidates = set()
        
        for band_table in self.band_tables:
            for bucket_ids in band_table.values():
                if len(bucket_ids) > 1:
                    # All pairs in this bucket are candidates
                    # Optimization: Don't generate all pairs if bucket is huge?
                    # For now, simplistic approach
                    for i in range(len(bucket_ids)):
                        for j in range(i + 1, len(bucket_ids)):
                            # Sort to ensure consistent pair ordering
                            id1, id2 = sorted((bucket_ids[i], bucket_ids[j]))
                            candidates.add((id1, id2))
                            
        return candidates

    def get_candidate_groups(self) -> Dict[str, Set[str]]:
        """
        Returns a mapping of doc_id -> set of candidate doc_ids.
        Usage: graph adjacency list construction.
        """
        adjacency = defaultdict(set)
        
        for band_table in self.band_tables:
             for bucket_ids in band_table.values():
                if len(bucket_ids) > 1:
                    for doc_id in bucket_ids:
                        adjacency[doc_id].update(bucket_ids)
                        
        # Remove self-loops
        for doc_id, neighbors in adjacency.items():
            if doc_id in neighbors:
                neighbors.remove(doc_id)
                
        return adjacency
