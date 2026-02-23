import os
import json
import asyncio
import httpx
import time
from dotenv import load_dotenv
from openai import AsyncOpenAI
from tqdm.asyncio import tqdm
import sys

# Add lsh module to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lsh.pipeline import LSHEvaluationPipeline

# Load environment variables
load_dotenv(dotenv_path="../frontend/.env")
load_dotenv() 

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")

if not REPLICATE_API_TOKEN:
    print("Warning: REPLICATE_API_TOKEN not found.")

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# --- Configuration ---
NUM_RESPONSES_PER_MODEL = 20
TIMESTAMP = time.strftime("%Y%m%d_%H%M%S")
OUTPUT_FILE = f"lsh/data/responses_{TIMESTAMP}.json"
RESULTS_FILE = f"lsh/results/run_{TIMESTAMP}.json"

TEST_QUESTION = """A woman owned a 10-acre tract of rural farmland in fee simple absolute. The woman agreed to sell the farmland to a man, and each signed a writing stating that the farmland was beitig sold: ". . . for $10,000, receipt of which is acknowledged. " In actuality, the man had not yet paid the woman the $10,000. At the date set for closing, the woman transferred a deed to the farmland to the man, who gave the woman a check for $10,000. Howevei, a few days after the woman deposited the check, she received notice from her bank that the check had not cleared, due to insufficient funds in the account. The woman then brought suit against the man. At trial, the woman seeks to testify that the man did not in fact pay her the $10,000 as recited in their written instrument. The man objects to the woman's proposed testimony. Will the trial court judge be correct in sustaining the man's objection?"""

SYSTEM_PROMPT = "You are a helpful legal assistant."

# User Specified Models
OPENAI_MODELS = [
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-5-nano",
    "gpt-5.2",
    "gpt-5-pro"
]

REPLICATE_MODELS = [
    "google/gemini-3-flash",
    "google/gemini-3-pro",
    "meta/llama-4-maverick-instruct",
    "anthropic/claude-4.5-sonnet",
    "anthropic/claude-3.5-haiku"
]

# --- Fetch Functions ---

async def fetch_openai(model, question, index):
    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": question}]
        response = await openai_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=1.0 if model == "gpt-5-nano" else 0.7
        )
        content = response.choices[0].message.content
        return {
            "model": model,
            "prompt": question,
            "response": content,
            "id": f"{model}_{index}"
        }
    except Exception as e:
        return {"error": str(e), "model": model, "id": f"{model}_{index}"}

SEM = asyncio.Semaphore(10)

async def fetch_replicate(model, question, index):
    async with SEM:
        headers = {
            "Authorization": f"Token {REPLICATE_API_TOKEN}",
            "Content-Type": "application/json"
        }
        
        input_data = {
            "input": {
                "prompt": question,
                "system_prompt": SYSTEM_PROMPT,
                "max_tokens": 2048 if "claude-4.5-sonnet" in model else 1000,
                "temperature": 0.7
            }
        }
        
        # Handle simple model ID parsing
        try:
            parts = model.split("/")
            if len(parts) >= 2:
                owner, name = parts[:2]
            else:
                # Fallback if format is different
                owner, name = "unknown", model
                
            url = f"https://api.replicate.com/v1/models/{owner}/{name}/predictions"
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=input_data, headers=headers)
                
                if resp.status_code != 201:
                    return {"error": f"Status {resp.status_code}: {resp.text}", "model": model, "id": f"{model}_{index}"}
                    
                prediction = resp.json()
                get_url = prediction["urls"]["get"]
                
                # Poll
                while True:
                    await asyncio.sleep(2)
                    resp = await client.get(get_url, headers=headers)
                    pred = resp.json()
                    status = pred["status"]
                    
                    if status == "succeeded":
                        output = pred["output"]
                        text = "".join(output) if isinstance(output, list) else str(output)
                        cleaned_model = model.split("/")[-1]
                        return {
                            "model": cleaned_model,
                            "prompt": question,
                            "response": text,
                            "id": f"{cleaned_model}_{index}"
                        }
                    elif status in ["failed", "canceled"]:
                        return {"error": f"Prediction status: {status}", "model": model, "id": f"{model}_{index}"}
                        
        except Exception as e:
            return {"error": str(e), "model": model, "id": f"{model}_{index}"}

# --- Main Flow ---

async def main():
    print(f"Starting Robust Benchmark (Standardized Run)...")
    print(f"Timestamp: {TIMESTAMP}")
    print(f"Target: {NUM_RESPONSES_PER_MODEL} responses per model.")
    
    tasks = []
    
    # OpenAI
    for model in OPENAI_MODELS:
        for i in range(NUM_RESPONSES_PER_MODEL):
            tasks.append(fetch_openai(model, TEST_QUESTION, i))
            
    # Replicate
    for model in REPLICATE_MODELS:
        for i in range(NUM_RESPONSES_PER_MODEL):
            tasks.append(fetch_replicate(model, TEST_QUESTION, i))
            
    print(f"Dispatched {len(tasks)} generation tasks...")
    results = await tqdm.gather(*tasks)
    
    # Separation
    valid_data = []
    failures = []
    
    for r in results:
        if "error" in r:
            failures.append(r)
        else:
            valid_data.append(r)
            
    print(f"Collected {len(valid_data)} valid responses.")
    if failures:
        print(f"Encountered {len(failures)} failures.")
        # Aggregate failures by model
        fail_counts = {}
        for f in failures:
            m = f["model"]
            fail_counts[m] = fail_counts.get(m, 0) + 1
            
        print("\n--- Failure Report ---")
        for m, count in fail_counts.items():
            # Get one error message example
            example_error = next((f["error"] for f in failures if f["model"] == m), "Unknown")
            print(f"Model: {m} | Failures: {count}/{NUM_RESPONSES_PER_MODEL}")
            print(f"  Example Error: {example_error}")
        print("----------------------\n")
    
    # Save Data (even if partial, we save what we got)
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(valid_data, f, indent=2)
    print(f"Saved responses to {OUTPUT_FILE}")
    
    # Run Clustering Pipeline ONLY if we have data
    if len(valid_data) > 0:
        print("\n--- Running Clustering Pipeline ---")
        pipeline = LSHEvaluationPipeline(
            num_bits=128,
            sim_threshold=0.88,
            resolution=1.0
        )
        
        pipeline.ingest_data(valid_data)
        results = pipeline.run_clustering(method="density")
        
        # Prepare output
        full_output = {
            "metadata": {
                "timestamp": TIMESTAMP,
                "method": "density_umap_hdbscan",
                "umap_dims": 10,
                "min_cluster_size": 5,
                "question": TEST_QUESTION,
                "total_items": len(valid_data),
                "num_clusters": results['num_clusters'],
                "failures": fail_counts if failures else {}
            },
            "clusters": {}
        }
        
        clusters = results['clusters']
        reps = results['representatives']
        id_to_text = {d['id']: d['response'] for d in valid_data}
        id_to_model = {d['id']: d['model'] for d in valid_data}

        for cluster_id, members in clusters.items():
            if cluster_id == "noise":
                # Assign noise to a numeric ID, e.g., -1 for noise
                cluster_key = "-1"
                cluster_data = {
                    "representative": {"id": "N/A", "model": "NOISE", "text": "Outliers"},
                    "members": []
                }
            else:
                cluster_key = str(cluster_id)
                rep_id = reps[cluster_id]
                cluster_data = {
                    "representative": {
                        "id": rep_id,
                        "model": id_to_model.get(rep_id, "unknown"),
                        "text": id_to_text.get(rep_id, "")
                    },
                    "members": []
                }
            
            for member_id in members:
                cluster_data["members"].append({
                    "id": member_id, 
                    "model": id_to_model.get(member_id, "unknown"),
                    "text": id_to_text.get(member_id, "")
                })
                
            full_output["clusters"][cluster_key] = cluster_data

        os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
        with open(RESULTS_FILE, "w") as f:
            json.dump(full_output, f, indent=2)
            
        print(f"Clustering Results saved to {RESULTS_FILE}")
        print(f"Total Clusters: {results['num_clusters']}")
    else:
        print("No valid data to cluster. Exiting.")

if __name__ == "__main__":
    asyncio.run(main())
