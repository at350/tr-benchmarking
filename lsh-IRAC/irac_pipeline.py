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
                try:
                    # hkunlp instructor logic requires pairs
                    inputs = [[instruction, text] for text in texts]
                    embeddings = model.encode(inputs)
                except Exception as e:
                    # Fallback if standard sentence-transformers wrapper is used instead of Instructor package
                    inputs = [f"{instruction} {text}" for text in texts]
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
        
    def extract_cluster_topics(self, cluster_texts: List[str], num_topics: int = 3) -> List[str]:
        """
        Uses an LLM to zero-shot extract the core legal doctrines/principles from a cluster of responses.
        """
        import os
        from openai import OpenAI
        import json
        from dotenv import load_dotenv

        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        env_path = os.path.join(root_dir, "lsh", ".env")
        load_dotenv(dotenv_path=env_path)
        load_dotenv(dotenv_path=os.path.join(root_dir, ".env"))
        load_dotenv()
        
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        if not client.api_key:
            print("Warning: OPENAI_API_KEY not found. Skipping topic extraction.")
            return []
            
        # Sample up to 20 responses to avoid massive context windows
        sample_size = min(len(cluster_texts), 20)
        import random
        sampled_texts = random.sample(cluster_texts, sample_size)
        
        combined_text = "\n\n---\n\n".join(sampled_texts)
        
        prompt = f"""You are a legal expert analyzing a cluster of highly similar AI-generated legal reasoning responses.
        
Read the following sample of responses from this cluster. Your goal is to identify the {num_topics} most defining legal doctrines, principles, or specific rules that these responses rely upon to reach their conclusion.

Return ONLY a valid JSON list of strings. Do not include Markdown blocks. Use concise, formal legal terms (e.g., ["Promissory Estoppel", "Statute of Frauds", "Consideration"]).

Responses:
{combined_text}
"""
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1
            )
            content = response.choices[0].message.content.strip()
            # Clean possible markdown
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
            
            topics = json.loads(content)
            if isinstance(topics, list):
                return [str(t) for t in topics][:num_topics]
            return []
        except Exception as e:
            print(f"Error during topic extraction: {e}")
            return []

    def calculate_topic_confidences(self, member_ids: List[str], topics: List[str]) -> Dict[str, float]:
        """
        Embeds the string topics to the Instructor latent space and computes the softmax normalized
        cosine similarity across all member embeddings in the cluster to yield confidence percentages.
        """
        if not topics or not member_ids:
            return {}
            
        # 1. Embed the topics using the exact same standard as the IRAC text formatting
        # Topic labels don't need the instruction tuning since they're just categories.
        topic_embeddings = self.encode_irac_responses(
            topics, 
            model_name="hkunlp/instructor-large"
        )
        
        # Normalize topic embeddings
        topic_embeddings_norm = topic_embeddings / np.linalg.norm(topic_embeddings, axis=1, keepdims=True)
        
        # 2. Gather normalized member embeddings
        member_embs = []
        for mid in member_ids:
            if mid in self.embeddings:
                emb = self.embeddings[mid]
                # Avoid modifying original
                norm_emb = emb / np.linalg.norm(emb)
                member_embs.append(norm_emb)
                
        if not member_embs:
            return {}
            
        member_embs = np.array(member_embs)
        
        # Compute cosine similarity matrix: (num_members, current_dim) x (current_dim, num_topics) -> (num_members, num_topics)
        similarities = np.dot(member_embs, topic_embeddings_norm.T)
        
        # We want the aggregate cluster confidence for each topic.
        # Options: average similarity, or median. Let's use average similarity across the cluster.
        avg_similarities = np.mean(similarities, axis=0) # Shape: (num_topics,)
        
        # To convert to percentages that sum to 100%, we use Softmax with a temperature to sharpen distinguishing features
        temperature = 0.05
        exp_sims = np.exp(avg_similarities / temperature)
        softmax_probs = exp_sims / np.sum(exp_sims)
        
        confidence_dict = {}
        for i, topic in enumerate(topics):
            # Round to 1 decimal place (e.g., 90.5%)
            confidence_dict[topic] = round(float(softmax_probs[i]) * 100, 1)
            
        # Sort by confidence descending
        return dict(sorted(confidence_dict.items(), key=lambda item: item[1], reverse=True))

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
                
        # --- NEW: Extract and compute SOTA Topic Confidences ---
        print("Extracting semantic topic confidences for valid clusters...")
        cluster_topics = {}
        for cluster_id, member_ids in clusters.items():
            if cluster_id == "noise":
                 cluster_topics["-1"] = {}
                 continue
                 
            # Gather texts
            cluster_texts = [format_irac_for_embedding(self.responses[mid].get('response', {})) for mid in member_ids if mid in self.responses]
            
            if cluster_texts:
                 print(f"  Analyzing Cluster {cluster_id} ({len(cluster_texts)} members)...")
                 extracted_topics = self.extract_cluster_topics(cluster_texts, num_topics=4)
                 
                 if extracted_topics:
                     confidences = self.calculate_topic_confidences(member_ids, extracted_topics)
                     cluster_topics[str(cluster_id)] = confidences
                     print(f"    -> {confidences}")
                 else:
                     cluster_topics[str(cluster_id)] = {}
            else:
                 cluster_topics[str(cluster_id)] = {}
                 
        return {
            "num_clusters": num_clusters,
            "clusters": clusters,
            "representatives": representatives,
            "partition": partition,
            "topic_signals": cluster_topics # Append the topic signals
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
