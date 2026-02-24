import os
import json
import random
import asyncio
import httpx
import time
import sys
import argparse

import numpy as np
from dotenv import load_dotenv

EDGE_SAMPLE_SEED = 42
EDGE_SAMPLE_COUNT = 3
from openai import AsyncOpenAI
from tqdm.asyncio import tqdm

# Add parent module to path to use lsh modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from irac_utils import extract_json
from irac_pipeline import IRACEvaluationPipeline

# Load environment variables (try lsh/.env, project root .env, and current dir)
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(root_dir, "lsh", ".env")
load_dotenv(dotenv_path=env_path)
load_dotenv(dotenv_path=os.path.join(root_dir, ".env"))
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")

if not REPLICATE_API_TOKEN:
    print("Warning: REPLICATE_API_TOKEN not found.")
if not ANTHROPIC_API_KEY:
    print("Warning: ANTHROPIC_API_KEY (or CLAUDE_API_KEY) not found. Claude models via Anthropic API will be skipped.")

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
    "deepseek-ai/deepseek-v3",
    "xai/grok-4",
]

# Claude models via Anthropic API (uses ANTHROPIC_API_KEY or CLAUDE_API_KEY)
ANTHROPIC_MODELS = [
    "claude-sonnet-4-5-20250929",
    "claude-3-5-haiku-20241022",
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


async def fetch_anthropic(model: str, question: str, index: int):
    """Fetch from Anthropic API using ANTHROPIC_API_KEY or CLAUDE_API_KEY."""
    if not ANTHROPIC_API_KEY:
        return {"error": "ANTHROPIC_API_KEY not set", "model": model, "id": f"{model}_{index}"}
    try:
        body = {
            "model": model,
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": question}],
            "system": SYSTEM_PROMPT,
            "temperature": 0.7,
        }
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "content-type": "application/json",
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
        if resp.status_code != 200:
            err = resp.json().get("error", {}).get("message", resp.text)
            return {"error": f"Anthropic API: {err}", "model": model, "id": f"{model}_{index}"}
        data = resp.json()
        content = "".join(
            p.get("text", "") for p in data.get("content", []) if p.get("type") == "text"
        )
        parsed_json = extract_json(content)
        if not parsed_json:
            return {"error": f"Failed to parse JSON:\n{content[:200]}...", "model": model, "id": f"{model}_{index}"}
        if not all(k in parsed_json for k in ("issue", "rule", "application", "conclusion")):
            return {"error": f"Missing IRAC keys:\n{parsed_json}", "model": model, "id": f"{model}_{index}"}
        return {
            "model": model,
            "prompt": question,
            "response": parsed_json,
            "raw_text": content,
            "id": f"{model}_{index}",
        }
    except Exception as e:
        return {"error": str(e), "model": model, "id": f"{model}_{index}"}


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

    # Anthropic (Claude via direct API - uses ANTHROPIC_API_KEY or CLAUDE_API_KEY)
    if ANTHROPIC_API_KEY:
        for model in ANTHROPIC_MODELS:
            for i in range(NUM_RESPONSES_PER_MODEL):
                item_id = f"{model}_{i}"
                if item_id in existing_ids:
                    continue
                tasks.append(fetch_anthropic(model, test_question, i))
            
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
        embeddings = pipeline.embeddings
        id_to_irac = {d['id']: d['response'] for d in valid_data}
        id_to_model = {d['id']: d['model'] for d in valid_data}

        def get_centroid_members(cluster_id, member_ids):
            """Return centroid (representative) plus 2 closest members."""
            if cluster_id == "noise" or len(member_ids) == 0:
                return []
            rep_id = reps.get(cluster_id) if isinstance(cluster_id, int) else None
            if not rep_id or rep_id not in embeddings:
                return []
            centroid = embeddings[rep_id]
            members_excl_rep = [m for m in member_ids if m in embeddings and m != rep_id]
            result = [rep_id]
            if members_excl_rep:
                distances = [(m, float(np.linalg.norm(embeddings[m] - centroid))) for m in members_excl_rep]
                distances.sort(key=lambda x: x[1])
                result.extend([m for m, _ in distances[:2]])
            return result

        def get_edge_members(cluster_id, member_ids):
            """Sample 3 random members from the outer third (farthest from centroid)."""
            if cluster_id == "noise" or len(member_ids) < 2:
                return []
            rep_id = reps.get(cluster_id) if isinstance(cluster_id, int) else None
            if not rep_id or rep_id not in embeddings:
                return []
            centroid = embeddings[rep_id]
            members_with_emb = [m for m in member_ids if m in embeddings]
            if len(members_with_emb) < 2:
                return []
            distances = [(m, float(np.linalg.norm(embeddings[m] - centroid))) for m in members_with_emb]
            distances.sort(key=lambda x: x[1], reverse=True)
            outer_third_count = max(1, len(distances) // 3)
            outer_member_ids = [m for m, _ in distances[:outer_third_count]]
            rng = random.Random(EDGE_SAMPLE_SEED)
            sample = rng.sample(outer_member_ids, min(EDGE_SAMPLE_COUNT, len(outer_member_ids)))
            return sample

        def make_member_obj(member_id):
            return {
                "id": member_id,
                "model": id_to_model.get(member_id, "unknown"),
                **id_to_irac.get(member_id, {}),
            }

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
                cluster_data["members"].append(make_member_obj(member_id))

            centroid_ids = get_centroid_members(cluster_id, members)
            cluster_data["centroid_members"] = [make_member_obj(cid) for cid in centroid_ids]

            edge_ids = get_edge_members(cluster_id, members)
            cluster_data["edge_members"] = [make_member_obj(eid) for eid in edge_ids]

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
