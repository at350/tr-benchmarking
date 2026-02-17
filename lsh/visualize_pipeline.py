
import logging
# Suppress matplotlib font manager logs which can hang on macOS
logging.getLogger('matplotlib.font_manager').setLevel(logging.WARNING)

import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
import umap
from sentence_transformers import SentenceTransformer
import json
import re

def clean_text_for_verdict(text):
    # Remove markdown bold/italics
    text = re.sub(r'[*_]', '', text)
    # Normalize whitespace
    text = " ".join(text.split())
    return text.lower()

def get_verdict_hint(text):
    # Only look at the very beginning for the "Short answer" or header
    # Many models put the verdict in the first 100 chars.
    clean = clean_text_for_verdict(text[:200])
    
    # Strict NO patterns
    no_patterns = [
        "not enforceable", "unenforceable", "probably not", "likely not", 
        "unlikely", "no, the", "no. the", "no the", "short answer: no", 
        "answer: no"
    ]
    # Strict YES patterns
    yes_patterns = [
        "is enforceable", "are enforceable", "likely enforceable", 
        "probably yes", "likely yes", "very likely yes", "short answer: yes",
        "answer: yes", "potentially enforceable", "may be enforceable"
    ]
    
    for p in no_patterns:
        if p in clean:
            return "NO"
            
    for p in yes_patterns:
        if p in clean:
            return "YES"
            
    return "AMBIGUOUS"
import os

# Set style
sns.set(style="whitegrid", context="talk")

DATA_FILE = "lsh/data/responses.json"
OUTPUT_DIR = "lsh/presentation_assets"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_data():
    with open(DATA_FILE, "r") as f:
        data = json.load(f)
    return data

def get_verdict_color(text):
    hint = get_verdict_hint(text)
    if hint == "YES": return "green"
    if hint == "NO": return "red"
    return "gray"

def visualize_embeddings(data, model_name, title, filename, instruction=None):
    print(f"Generating visualization for: {title}...")
    texts = [d['response'] for d in data]
    ids = [d['id'] for d in data]
    colors = [get_verdict_color(t) for t in texts]
    
    # Encode
    model = SentenceTransformer(model_name)
    if instruction:
        inputs = [[instruction, t] for t in texts]
        embeddings = model.encode(inputs)
    else:
        embeddings = model.encode(texts)
        
    # UMAP to 2D
    reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, n_components=2, random_state=42)
    embedding_2d = reducer.fit_transform(embeddings)
    
    # Plot
    plt.figure(figsize=(10, 8))
    
    # Scatter plot with manual legend
    for verdict, color in [("YES", "green"), ("NO", "red"), ("AMBIGUOUS", "gray")]:
        indices = [i for i, c in enumerate(colors) if c == color]
        if indices:
            plt.scatter(
                embedding_2d[indices, 0], 
                embedding_2d[indices, 1], 
                c=color, 
                label=verdict,
                alpha=0.6,
                s=50
            )
            
    plt.title(title, fontsize=16)
    plt.legend(title="Automated Verdict")
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, filename))
    plt.close()
    print(f"Saved {filename}")

import glob

def get_latest_results_file():
    files = glob.glob("lsh/results/run_*.json")
    if not files: return None
    return max(files, key=os.path.getctime)

def visualize_cluster_distribution():
    print("Generating Cluster Distribution Chart...")
    result_file = get_latest_results_file()
    if not result_file:
        print("No results found in lsh/results/")
        return
        
    with open(result_file, "r") as f:
        res = json.load(f)
        
    clusters = []
    
    # Process clusters
    for cid, data in res["clusters"].items():
        if cid == "noise":
            verdict = "NOISE"
            color = "gray"
            size = len(data["members"])
        else:
            rep_text = data["representative"]["text"]
            verdict_hint = get_verdict_hint(rep_text) # YES/NO/AMBIGUOUS
            verdict = f"{verdict_hint} (Cluster {cid})"
            color = get_verdict_color(rep_text)
            size = len(data["members"])
            
        clusters.append({
            "Cluster": cid,
            "Size": size,
            "Verdict": verdict_hint if cid != "noise" else "NOISE",
            "Color": color
        })
    
    df = pd.DataFrame(clusters)
    
    # Sort by verdict then size
    df["VerdictOrder"] = df["Verdict"].map({"YES": 0, "NO": 1, "AMBIGUOUS": 2, "NOISE": 3})
    df = df.sort_values(["VerdictOrder", "Size"], ascending=[True, False])
    
    plt.figure(figsize=(12, 6))
    bars = plt.bar(df["Cluster"], df["Size"], color=df["Color"])
    
    # Add labels
    plt.xlabel("Cluster ID")
    plt.ylabel("Number of Responses")
    plt.title("Cluster Distribution by Verdict (Instruction-Tuned)", fontsize=16)
    
    # Custom Legend
    from matplotlib.lines import Line2D
    custom_lines = [
        Line2D([0], [0], color="green", lw=4),
        Line2D([0], [0], color="red", lw=4),
        Line2D([0], [0], color="gray", lw=4)
    ]
    plt.legend(custom_lines, ['YES (Enforceable)', 'NO (Unenforceable)', 'Ambiguous/Noise'])
    
    plt.tight_layout()
    filename = "viz_cluster_distribution.png"
    plt.savefig(os.path.join(OUTPUT_DIR, filename))
    plt.close()
    print(f"Saved {filename}")

def main():
    data = load_data()
    
    # 1. BEFORE: Topical Embeddings (MiniLM)
    visualize_embeddings(
        data, 
        "all-MiniLM-L6-v2", 
        "Before: Topical Similarity (MiniLM)\nMixed Clusters (Yes/No overlap)", 
        "viz_before_topical.png"
    )
    
    # 2. AFTER: Instruction-Tuned (Instructor-Large)
    visualize_embeddings(
        data, 
        "hkunlp/instructor-large", 
        "After: Instruction-Tuned (Instructor)\nClear Separation of Verdicts", 
        "viz_after_instruction.png",
        instruction="Represent the legal conclusion and reasoning of this text:"
    )
    
    # 3. Distribution Chart
    visualize_cluster_distribution()
    
    print("All visualizations generated.")

if __name__ == "__main__":
    main()
