import os
import json
import asyncio
import httpx
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
OUTPUT_FILE = "lsh/data/robust_responses_v2.json"
RESULTS_FILE = "lsh/results/robust_run_v2.json"

TEST_QUESTION = """Merchant A, a manufacturer of widgets, sent a signed letter to Buyer B on January 1st stating: "We offer to sell you 1,000 widgets at $10 each. This offer will remain open until March 31st." Buyer B did not pay anything to keep the offer open. On February 1st, Merchant A called Buyer B and said, "The price of widgets has gone up. I am revoking my offer of January 1st." On February 5th, Buyer B sent a letter accepting the January 1st offer.
Is there an enforceable contract between Merchant A and Buyer B?"""

SYSTEM_PROMPT = "You are a helpful legal assistant."

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
            temperature=0.7
        )
        content = response.choices[0].message.content
        return {
            "model": model,
            "prompt": question,
            "response": content,
            "id": f"{model}_{index}"
        }
    except Exception as e:
        print(f"Error OpenAI {model}: {e}")
        return None

SEM = asyncio.Semaphore(10)

async def fetch_replicate(model, question, index):
    async with SEM:
        headers = {
            "Authorization": f"Token {REPLICATE_API_TOKEN}",
            "Content-Type": "application/json"
        }
        
        # Standard input for most text models on Replicate
        input_data = {
            "input": {
                "prompt": question,
                "system_prompt": SYSTEM_PROMPT,
                "max_tokens": 1000,
                "temperature": 0.7
            }
        }
        
        owner, name = model.split("/")[:2]
        url = f"https://api.replicate.com/v1/models/{owner}/{name}/predictions"
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                # Create Prediction
                resp = await client.post(url, json=input_data, headers=headers)
                
                if resp.status_code == 422:
                    print(f"Error Replicate {model}: 422 Unprocessable Entity (Check model ID/Schema)")
                    return None
                if resp.status_code == 404:
                    print(f"Error Replicate {model}: 404 Model Not Found")
                    return None
                if resp.status_code != 201:
                    print(f"Error Replicate {model}: {resp.status_code}")
                    return None
                    
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
                        print(f"Failed Replicate {model}")
                        return None
                        
            except Exception as e:
                print(f"Exception Replicate {model}: {e}")
                return None

# --- Main Flow ---

async def main():
    print(f"Starting Robust Benchmark V2 (HTTPX fallback due to Py3.14/Pydantic)...")
    
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
    
    valid_data = [r for r in results if r is not None]
    print(f"Collected {len(valid_data)} valid responses.")
    
    # Save Data
    os.makedirs("lsh/data", exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(valid_data, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")
    
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
                "method": "density_umap_hdbscan",
                "question": "UCC Firm Offer",
                "total_items": len(valid_data),
                "num_clusters": results['num_clusters']
            },
            "clusters": {}
        }
        
        clusters = results['clusters']
        reps = results['representatives']
        id_to_text = {d['id']: d['response'] for d in valid_data}
        id_to_model = {d['id']: d['model'] for d in valid_data}

        for cluster_id, members in clusters.items():
            if cluster_id == "noise":
                cluster_data = {
                    "representative": {"id": "N/A", "model": "NOISE", "text": "Outliers"},
                    "members": []
                }
            else:
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
                
            full_output["clusters"][str(cluster_id)] = cluster_data

        with open(RESULTS_FILE, "w") as f:
            json.dump(full_output, f, indent=2)
            
        print(f"Clustering Results saved to {RESULTS_FILE}")
        print(f"Total Clusters: {results['num_clusters']}")

if __name__ == "__main__":
    asyncio.run(main())
