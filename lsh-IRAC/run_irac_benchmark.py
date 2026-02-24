import os
import json
import asyncio
import httpx
import time
import sys
import argparse

from dotenv import load_dotenv
from openai import AsyncOpenAI
from tqdm.asyncio import tqdm

# Add parent module to path to use lsh modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from irac_utils import extract_json
from irac_pipeline import IRACEvaluationPipeline

# Load environment variables
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lsh", ".env")
load_dotenv(dotenv_path=env_path)
load_dotenv() 

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")

if not REPLICATE_API_TOKEN:
    print("Warning: REPLICATE_API_TOKEN not found.")

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# --- Configuration ---
NUM_RESPONSES_PER_MODEL = 20
TIMESTAMP = time.strftime("%Y%m%d_%H%M%S")

# Base directory is the lsh-IRAC folder where this script lives
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, f"data/responses_{TIMESTAMP}.json")
RESULTS_FILE = os.path.join(BASE_DIR, f"results/run_{TIMESTAMP}.json")

SYSTEM_PROMPT = """You are an expert legal assistant. 

You must formulate your response using the IRAC method (Issue, Rule, Application, Conclusion).

You MUST return ONLY a strictly formatted JSON object. 
Do not include conversational conversational text. Do not use Markdown JSON block wrappers if your API does not support them natively; just return raw JSON text.

Your JSON must exactly match the following schema:
{
  "issue": "A concise statement of the core legal question.",
  "rule": "The relevant legal doctrine or rules governing the issue.",
  "application": "How the rule directly applies to the specific facts provided.",
  "conclusion": "A direct, definitive answer to the legal question."
}
"""

OPENAI_MODELS = [
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-5-nano",
    "gpt-5.2"
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
        
        # Use simple standard format unless the model supports structured outputs natively.
        response = await openai_client.chat.completions.create(
            model=model,
            messages=messages,
            # Force high temperature on experimental nano
            temperature=1.0 if model == "gpt-5-nano" else 0.7 
        )
        content = response.choices[0].message.content
        
        # Robustly parse the expected JSON
        parsed_json = extract_json(content)
        
        if not parsed_json:
             return {"error": f"Failed to parse JSON from response:\n{content}", "model": model, "id": f"{model}_{index}"}
             
        # Validate that the dict contains IRAC keys broadly
        if not ('issue' in parsed_json and 'rule' in parsed_json and 'application' in parsed_json and 'conclusion' in parsed_json):
            return {"error": f"JSON parsed but missing core IRAC keys:\n{parsed_json}", "model": model, "id": f"{model}_{index}"}
            
        return {
            "model": model,
            "prompt": question,
            "response": parsed_json, # Returning dictionary
            "raw_text": content,
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
        
        # Handle Gemini models which do not support system_prompt natively in Replicate API
        if "gemini" in model.lower():
             input_prompt = f"System Instruction: {SYSTEM_PROMPT}\n\nUser Question: {question}"
             input_data = {
                 "input": {
                     "prompt": input_prompt,
                     "temperature": 0.7
                 }
             }
        else:
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
                owner, name = "unknown", model
                
            url = f"https://api.replicate.com/v1/models/{owner}/{name}/predictions"
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                max_retries = 5
                for attempt in range(max_retries):
                    resp = await client.post(url, json=input_data, headers=headers)
                    if resp.status_code == 429:
                        await asyncio.sleep(2 ** attempt + 2)
                        continue
                        
                    if resp.status_code != 201:
                        if attempt == max_retries - 1:
                            return {"error": f"Status {resp.status_code}: {resp.text}", "model": model, "id": f"{model.split('/')[-1]}_{index}"}
                        else:
                            await asyncio.sleep(2 ** attempt + 2)
                            continue
                    break # Success on getting 201
                    
                prediction = resp.json()
                get_url = prediction["urls"]["get"]
                
                # Poll
                while True:
                    await asyncio.sleep(3)
                    resp = await client.get(get_url, headers=headers)
                    if resp.status_code == 429:
                        continue
                    if resp.status_code != 200:
                        continue
                    
                    pred = resp.json()
                    status = pred["status"]
                    
                    if status == "succeeded":
                        output = pred["output"]
                        text = "".join(output) if isinstance(output, list) else str(output)
                        cleaned_model = model.split("/")[-1]
                        
                        parsed_json = extract_json(text)
                        
                        if not parsed_json:
                            # Replicate models are trickier with Markdown blocks
                            return {"error": f"Failed to parse JSON from response:\n{text}", "model": cleaned_model, "id": f"{cleaned_model}_{index}"}
                        
                        # Validate that the dict contains IRAC keys broadly
                        keys_lower = [k.lower() if isinstance(k, str) else k for k in parsed_json.keys()]
                        if not ('issue' in keys_lower and 'rule' in keys_lower and 'application' in keys_lower and 'conclusion' in keys_lower):
                            return {"error": f"JSON parsed but missing core IRAC keys:\n{parsed_json}", "model": cleaned_model, "id": f"{cleaned_model}_{index}"}
                            
                        # Standardize dict key casing
                        standardized_json = {
                            "issue": parsed_json.get("issue", parsed_json.get("Issue", "")),
                            "rule": parsed_json.get("rule", parsed_json.get("Rule", "")),
                            "application": parsed_json.get("application", parsed_json.get("Application", "")),
                            "conclusion": parsed_json.get("conclusion", parsed_json.get("Conclusion", ""))
                        }
                        
                        return {
                            "model": cleaned_model,
                            "prompt": question,
                            "response": standardized_json,
                            "raw_text": text,
                            "id": f"{cleaned_model}_{index}"
                        }
                    elif status in ["failed", "canceled"]:
                         return {"error": f"Prediction status: {status}", "model": model, "id": f"{model.split('/')[-1]}_{index}"}
                        
        except Exception as e:
            cleaned_model = model.split("/")[-1]
            return {"error": str(e), "model": cleaned_model, "id": f"{cleaned_model}_{index}"}

# --- Main Flow ---

async def main(args):
    print(f"Starting IRAC Benchmark Run...")
    print(f"Timestamp: {TIMESTAMP}")
    print(f"Target: {NUM_RESPONSES_PER_MODEL} responses per model.")
    
    with open(args.question, "r") as f:
        test_question = f.read()

    # Load existing data if we want to skip already generated data
    existing_data = []
    existing_ids = set()
    if args.resume:
        try:
            with open(args.resume, "r") as f:
                existing_data = json.load(f)
                for item in existing_data:
                    existing_ids.add(item["id"])
            print(f"Loaded {len(existing_data)} existing responses from {args.resume}.")
        except Exception as e:
            print(f"Error loading resume file: {e}")
    
    tasks = []
    
    # OpenAI
    for model in OPENAI_MODELS:
        for i in range(NUM_RESPONSES_PER_MODEL):
            item_id = f"{model}_{i}"
            if item_id in existing_ids:
                continue
            tasks.append(fetch_openai(model, test_question, i))
            
    # Replicate
    for model in REPLICATE_MODELS:
        cleaned_model = model.split("/")[-1]
        for i in range(NUM_RESPONSES_PER_MODEL):
            item_id = f"{cleaned_model}_{i}"
            if item_id in existing_ids:
                continue
            tasks.append(fetch_replicate(model, test_question, i))
            
    print(f"Dispatched {len(tasks)} NEW JSON generation tasks...")
    
    if len(tasks) > 0:
        new_results = await tqdm.gather(*tasks)
    else:
        new_results = []
        
    results = new_results + existing_data
    
    # Separation
    valid_data = []
    failures = []
    
    for r in results:
        if "error" in r:
            failures.append(r)
        else:
            valid_data.append(r)
            
    print(f"Collected {len(valid_data)} valid IRAC responses.")
    if failures:
        print(f"Encountered {len(failures)} failures (mostly from JSON parsing).")
        # Aggregate failures by model
        fail_counts = {}
        for f in failures:
            m = f["model"]
            fail_counts[m] = fail_counts.get(m, 0) + 1
            
        print("\n--- JSON/Generation Failure Report ---")
        for m, count in fail_counts.items():
            example_error = next((f["error"] for f in failures if f["model"] == m), "Unknown")
            # Truncate long JSON strings in error output
            example_error = (example_error[:150] + "...") if len(example_error) > 150 else example_error
            print(f"Model: {m} | Failures: {count}/{NUM_RESPONSES_PER_MODEL}")
            print(f"  Example Error:\n    {example_error}")
        print("----------------------\n")
    
    # Save Data
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(valid_data, f, indent=2)
    print(f"Saved JSON structured responses to {OUTPUT_FILE}")
    
    # Run HDBSCAN Pipeline
    if len(valid_data) > 0:
        print("\n--- Running Clustering Pipeline ---")
        pipeline = IRACEvaluationPipeline(
            num_bits=128,
            sim_threshold=0.88,
            resolution=1.0
        )
        
        pipeline.ingest_data(valid_data)
        results = pipeline.run_clustering(method="density") # Using Density clusterer by default 
        
        # Prepare output
        full_output = {
            "metadata": {
                "timestamp": TIMESTAMP,
                "method": "density_umap_hdbscan",
                "umap_dims": 10,
                "min_cluster_size": 5,
                "question": test_question,
                "schema": "IRAC",
                "total_items": len(valid_data),
                "num_clusters": results['num_clusters'],
                "failures": fail_counts if failures else {}
            },
            "clusters": {}
        }
        
        clusters = results['clusters']
        reps = results['representatives']
        id_to_irac = {d['id']: d['response'] for d in valid_data}
        id_to_model = {d['id']: d['model'] for d in valid_data}

        for cluster_id, members in clusters.items():
            if cluster_id == "noise":
                cluster_key = "-1"
                cluster_data = {
                    "representative": {
                        "id": "N/A", 
                        "model": "NOISE", 
                        "issue": "N/A",
                        "rule": "N/A",
                        "application": "N/A",
                        "conclusion": "Outliers"
                     },
                    "members": []
                }
            else:
                cluster_key = str(cluster_id)
                rep_id = reps[cluster_id]
                cluster_data = {
                    "representative": {
                        "id": rep_id,
                        "model": id_to_model.get(rep_id, "unknown"),
                        **id_to_irac.get(rep_id, {})
                    },
                    "members": []
                }
            
            for member_id in members:
                cluster_data["members"].append({
                    "id": member_id, 
                    "model": id_to_model.get(member_id, "unknown"),
                    **id_to_irac.get(member_id, {})
                })
                
            full_output["clusters"][cluster_key] = cluster_data

        os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
        with open(RESULTS_FILE, "w") as f:
            json.dump(full_output, f, indent=2)
            
        print(f"IRAC Clustering Results saved to {RESULTS_FILE}")
        print(f"Total Clusters: {results['num_clusters']}")
    else:
        print("No valid parsed JSON data to cluster. Ensure models are returning correct formats.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run IRAC Benchmark")
    parser.add_argument("--question", required=True, help="Path to the text file containing the question.")
    parser.add_argument("--resume", help="Path to an existing JSON results file to resume from.")
    args = parser.parse_args()
    asyncio.run(main(args))
