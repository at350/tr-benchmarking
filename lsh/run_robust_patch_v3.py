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

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# --- Configuration ---
EXISTING_FILE = "lsh/data/robust_responses_v2.json"
FINAL_FILE = "lsh/data/robust_responses_final.json"
RESULTS_FILE = "lsh/results/robust_run_final.json"

TARGET_TOTAL = 200
SYSTEM_PROMPT = "You are a helpful legal assistant."
TEST_QUESTION = """Merchant A, a manufacturer of widgets, sent a signed letter to Buyer B on January 1st stating: "We offer to sell you 1,000 widgets at $10 each. This offer will remain open until March 31st." Buyer B did not pay anything to keep the offer open. On February 1st, Merchant A called Buyer B and said, "The price of widgets has gone up. I am revoking my offer of January 1st." On February 5th, Buyer B sent a letter accepting the January 1st offer.
Is there an enforceable contract between Merchant A and Buyer B?"""

# Substitute Models for the failed ones (Claude 4.5, GPT-5 variants)
PATCH_MODELS_OPENAI = [
    "gpt-4o-mini",
    "gpt-3.5-turbo"
]

PATCH_MODELS_REPLICATE = [
    "meta/meta-llama-3-70b-instruct"
]

# Fetch Functions
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
        input_data = {
            "input": {
                "prompt": question,
                "max_tokens": 1000,
                "temperature": 0.7,
                "system_prompt": SYSTEM_PROMPT
            }
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                owner, name = model.split("/")[:2]
                url = f"https://api.replicate.com/v1/models/{owner}/{name}/predictions"
                resp = await client.post(url, json=input_data, headers=headers)
                
                if resp.status_code != 201:
                    print(f"Error {model}: {resp.status_code}")
                    return None
                    
                prediction = resp.json()
                get_url = prediction["urls"]["get"]
                
                while True:
                    await asyncio.sleep(2)
                    resp = await client.get(get_url, headers=headers)
                    pred = resp.json()
                    status = pred["status"]
                    if status == "succeeded":
                        output = pred["output"]
                        text = "".join(output) if isinstance(output, list) else str(output)
                        cleaned = model.replace("meta/", "")
                        return {
                            "model": cleaned,
                            "prompt": question,
                            "response": text,
                            "id": f"{cleaned.replace('/','-')}_{index}"
                        }
                    elif status in ["failed", "canceled"]:
                        return None
            except Exception as e:
                print(f"Exception {model}: {e}")
                return None

async def main():
    # 1. Load existing data
    existing_data = []
    if os.path.exists(EXISTING_FILE):
        with open(EXISTING_FILE, "r") as f:
            existing_data = json.load(f)
            
    current_count = len(existing_data)
    needed = max(0, TARGET_TOTAL - current_count)
    
    print(f"Current valid responses: {current_count}")
    print(f"Need: {needed}")
    
    if needed > 0:
        tasks = []
        # Distribute needed count among patch models
        # 3 patch models
        per_model = (needed // 3) + 2 # slightly more to ensure coverage
        
        for model in PATCH_MODELS_OPENAI:
            for i in range(per_model):
                tasks.append(fetch_openai(model, TEST_QUESTION, i))
                
        for model in PATCH_MODELS_REPLICATE:
            for i in range(per_model):
                tasks.append(fetch_replicate(model, TEST_QUESTION, i))
                
        print(f"Fetching {len(tasks)} patch responses...")
        results = await tqdm.gather(*tasks)
        patch_data = [r for r in results if r is not None]
        
        # Combine
        combined_data = existing_data + patch_data
        # Trim to exactly target or keep all? Keep all is safer
        print(f"Total after patch: {len(combined_data)}")
    else:
        combined_data = existing_data
        
    # Save Final
    with open(FINAL_FILE, "w") as f:
        json.dump(combined_data, f, indent=2)
    print(f"Saved final robust dataset to {FINAL_FILE}")
    
    # 2. Run Clustering
    if len(combined_data) > 0:
        print("\n--- Running Final Clustering ---")
        pipeline = LSHEvaluationPipeline(
            num_bits=128,
            sim_threshold=0.88,
            resolution=1.0
        )
        pipeline.ingest_data(combined_data)
        results = pipeline.run_clustering(method="density")
        
        # Output Format
        full_output = {
            "metadata": {
                "method": "density_umap_hdbscan",
                "question": "UCC Firm Offer",
                "total_items": len(combined_data),
                "num_clusters": results['num_clusters']
            },
            "clusters": {}
        }
        
        clusters = results['clusters']
        reps = results['representatives']
        id_to_text = {d['id']: d['response'] for d in combined_data}
        id_to_model = {d['id']: d['model'] for d in combined_data}

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
        print(f"Final Clustering Results saved to {RESULTS_FILE}")

if __name__ == "__main__":
    asyncio.run(main())
