import numpy as np
from typing import List, Dict, Any
from collections import defaultdict

# Reuse existing utilities from the lsh module 
from lsh.utils import get_embedding_model
from lsh.lsh_index import LSHIndex
from lsh.clustering import build_similarity_graph, cluster_graph, get_cluster_representatives
from lsh.density_clustering import run_density_clustering

from irac_utils import format_irac_for_embedding

class IRACEvaluationPipeline:
    def __init__(self, 
                 num_bits=128, 
                 num_bands=32, 
                 sim_threshold=0.7, 
                 min_cluster_size=1,
                 resolution=1.0):
        self.num_bits = num_bits
        self.num_bands = num_bands
        self.sim_threshold = sim_threshold
        self.min_cluster_size = min_cluster_size
        self.resolution = resolution
        self.lsh_index = None
        self.embeddings = {} # id -> np.array
        self.responses = {}  # id -> text/metadata
        # Density parameters
        self.use_density = False

    def encode_irac_responses(self, texts: List[str], model_name: str = 'hkunlp/instructor-large', instruction: str = None) -> np.ndarray:
        """
        Encodes a list of formatted IRAC texts into dense vectors.
        """
        model = get_embedding_model(model_name)
        if model:
            if "instructor" in model_name.lower() and instruction:
                print(f"Encoding IRAC text with instruction: '{instruction}'")
                inputs = [[instruction, text] for text in texts]
                embeddings = model.encode(inputs)
            else:
                if instruction:
                     inputs = [f"{instruction} {text}" for text in texts]
                     embeddings = model.encode(inputs)
                else:
                     embeddings = model.encode(texts)
            return embeddings
        else:
            print("Using random embeddings (mock mode)")
            return np.random.randn(len(texts), 768)

    def ingest_data(self, data: List[Dict[str, Any]]):
        """
        Ingests data. Each item must have 'id' and 'response'. 
        The 'response' field should be a parsed IRAC dictionary.
        """
        texts = []
        ids = []
        
        print("Formatting IRAC dictionaries and encoding data...")
        for item in data:
            doc_id = item['id']
            # Assume 'response' is already a parsed dictionary from JSON
            irac_dict = item.get('response', {}) 
            
            # Format the dictionary into a cleaner string for embedding
            formatted_text = format_irac_for_embedding(irac_dict)
            
            self.responses[doc_id] = item
            texts.append(formatted_text)
            ids.append(doc_id)
            
        # Bulk encode with instruction to focus on structured legal conclusion
        embs = self.encode_irac_responses(
            texts, 
            model_name="hkunlp/instructor-large", 
            instruction="Represent the legal reasoning components (Issue, Rule, Application, Conclusion) of this text:"
        )
        
        # Store embeddings
        for doc_id, emb in zip(ids, embs):
            self.embeddings[doc_id] = emb
            
        print(f"Encoded {len(texts)} IRAC structured responses.")

    def run_clustering(self, method="lsh") -> Dict[str, Any]:
        """
        Runs the clustering pipeline using density (UMAP + HDBSCAN) or standard LSH.
        """
        if method == "density":
            print("Running Density-Based Clustering (UMAP + HDBSCAN)...")
            partition = run_density_clustering(
                self.embeddings,
                n_neighbors=5,
                min_dist=0.1,
                min_cluster_size=5,
                min_samples=2,
                n_components=10, 
                random_state=42
            )
            num_clusters = len(set(partition.values())) - (1 if -1 in partition.values() else 0)
        else:
            if not self.lsh_index:
                self.build_index()
                
            print("Retrieving candidates...")
            candidates = self.lsh_index.get_candidates()
            
            print("Building similarity graph...")
            G = build_similarity_graph(candidates, self.embeddings, self.sim_threshold)
            
            print(f"Clustering (resolution={self.resolution})...")
            partition = cluster_graph(G, resolution=self.resolution)
            num_clusters = len(set(partition.values())) if partition else 0
            
        print(f"Found {num_clusters} clusters.")
        
        print("Selecting representatives...")
        valid_partition = {k: v for k, v in partition.items() if v != -1}
        representatives = get_cluster_representatives(valid_partition, self.embeddings)
        
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
            "partition": partition
        }
    
    def build_index(self):
        """
        Builds the LSH index from stored embeddings.
        """
        if not self.embeddings:
            raise ValueError("No data to index. Call ingest_data first.")
            
        input_dim = next(iter(self.embeddings.values())).shape[0]
        self.lsh_index = LSHIndex(input_dim, self.num_bits, self.num_bands)
        
        print("Building LSH index...")
        for doc_id, emb in self.embeddings.items():
            self.lsh_index.add(emb, doc_id)
