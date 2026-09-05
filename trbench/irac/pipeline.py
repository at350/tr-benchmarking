"""Clustering pipeline for IRAC-structured answers.

Extends the shared LSHEvaluationPipeline (trbench/pipeline.py): the same embedding,
UMAP + HDBSCAN clustering, and representative selection, plus (1) IRAC-aware
formatting of each answer before embedding and (2) per-cluster doctrine labels
("topic signals") produced by GPT-4o and scored against the members' embeddings.
"""
import json
import os
import random
from typing import Any, Dict, List

import numpy as np
from openai import OpenAI

from trbench.env import load_env
from trbench.irac.parsing import format_irac_for_embedding
from trbench.pipeline import LSHEvaluationPipeline
from trbench.text import encode_responses

IRAC_EMBEDDING_INSTRUCTION = "Represent the legal reasoning components (Issue, Rule, Application, Conclusion) of this text:"
TOPIC_LABEL_MODEL = "gpt-4o"
TOPIC_SAMPLE_SIZE = 20          # answers shown to the labelling model per cluster
TOPIC_SOFTMAX_TEMPERATURE = 0.05  # sharpens the confidence split between labels


class IRACEvaluationPipeline(LSHEvaluationPipeline):
    def __init__(self, *args, topic_sample_seed: int = 42, **kwargs):
        super().__init__(*args, **kwargs)
        self.topic_rng = random.Random(topic_sample_seed)  # makes the topic-label sample reproducible
        self._warned_no_api_key = False

    def encode_irac_responses(self, texts: List[str], model_name: str = 'hkunlp/instructor-large', instruction: str = None) -> np.ndarray:
        """Encode formatted IRAC texts; thin wrapper over lsh.utils.encode_responses."""
        return encode_responses(texts, model_name=model_name, instruction=instruction)

    def ingest_data(self, data: List[Dict[str, Any]]):
        """Each item must have 'id' and a 'response' dict with issue/rule/application/conclusion."""
        texts, ids, seen = [], [], set()
        print("Formatting IRAC dictionaries and encoding data...")
        for item in data:
            doc_id = item['id']
            if doc_id in seen:
                self.duplicate_ids.append(doc_id)
            seen.add(doc_id)
            self.responses[doc_id] = item
            texts.append(format_irac_for_embedding(item.get('response', {})))
            ids.append(doc_id)
        if self.duplicate_ids:
            print(f"Warning: {len(self.duplicate_ids)} duplicate ids in input; keeping the last occurrence of each.")

        embeddings = self.encode_irac_responses(texts, instruction=IRAC_EMBEDDING_INSTRUCTION)
        for doc_id, embedding in zip(ids, embeddings):
            self.embeddings[doc_id] = embedding
        print(f"Encoded {len(texts)} IRAC structured responses.")

    def run_clustering(self, method: str = "density") -> Dict[str, Any]:
        """Cluster as the base pipeline does, then attach per-cluster topic signals."""
        results = super().run_clustering(method=method)
        results["topic_signals"] = self._topic_signals(results["clusters"])
        return results

    def _topic_signals(self, clusters: Dict[Any, List[str]]) -> Dict[str, Dict[str, float]]:
        print("Extracting semantic topic confidences for valid clusters...")
        signals: Dict[str, Dict[str, float]] = {}
        for cluster_id, member_ids in clusters.items():
            if cluster_id == "noise":
                signals["-1"] = {}
                continue
            cluster_texts = [format_irac_for_embedding(self.responses[mid].get('response', {}))
                             for mid in member_ids if mid in self.responses]
            signals[str(cluster_id)] = {}
            if not cluster_texts:
                continue
            print(f"  Analyzing Cluster {cluster_id} ({len(cluster_texts)} members)...")
            topics = self.extract_cluster_topics(cluster_texts, num_topics=4)
            if topics:
                signals[str(cluster_id)] = self.calculate_topic_confidences(member_ids, topics)
                print(f"    -> {signals[str(cluster_id)]}")
        return signals

    def extract_cluster_topics(self, cluster_texts: List[str], num_topics: int = 3) -> List[str]:
        """Ask a model for the doctrines a cluster's answers rely on. Returns [] without an API key."""
        load_env()
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            if not self._warned_no_api_key:
                print("Warning: OPENAI_API_KEY not found. Skipping topic extraction for every cluster.")
                self._warned_no_api_key = True
            return []
        client = OpenAI(api_key=api_key)

        sampled_texts = self.topic_rng.sample(cluster_texts, min(len(cluster_texts), TOPIC_SAMPLE_SIZE))
        combined_text = "\n\n---\n\n".join(sampled_texts)
        prompt = f"""You are a legal expert analyzing a cluster of highly similar AI-generated legal reasoning responses.
        
Read the following sample of responses from this cluster. Your goal is to identify the {num_topics} most defining legal doctrines, principles, or specific rules that these responses rely upon to reach their conclusion.

Return ONLY a valid JSON list of strings. Do not include Markdown blocks. Use concise, formal legal terms (e.g., ["Promissory Estoppel", "Statute of Frauds", "Consideration"]).

Responses:
{combined_text}
"""
        try:
            response = client.chat.completions.create(
                model=TOPIC_LABEL_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
            topics = json.loads(content)
            return [str(t) for t in topics][:num_topics] if isinstance(topics, list) else []
        except Exception as e:
            print(f"Error during topic extraction: {e}")
            return []

    def calculate_topic_confidences(self, member_ids: List[str], topics: List[str]) -> Dict[str, float]:
        """Softmax over the mean cosine similarity between each topic label and the cluster's members, as percentages."""
        if not topics or not member_ids:
            return {}
        topic_embeddings = self.encode_irac_responses(topics)  # plain labels: no instruction needed
        topic_embeddings = topic_embeddings / np.linalg.norm(topic_embeddings, axis=1, keepdims=True)

        member_embeddings = [self.embeddings[mid] / np.linalg.norm(self.embeddings[mid])
                             for mid in member_ids if mid in self.embeddings]
        if not member_embeddings:
            return {}
        similarities = np.dot(np.array(member_embeddings), topic_embeddings.T)  # (members, topics)
        avg_similarities = np.mean(similarities, axis=0)
        exp_sims = np.exp(avg_similarities / TOPIC_SOFTMAX_TEMPERATURE)
        probabilities = exp_sims / np.sum(exp_sims)
        confidences = {topic: round(float(p) * 100, 1) for topic, p in zip(topics, probabilities)}
        return dict(sorted(confidences.items(), key=lambda item: item[1], reverse=True))
