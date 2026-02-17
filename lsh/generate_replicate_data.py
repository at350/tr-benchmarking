import os
import json
import asyncio
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv(dotenv_path="../frontend/.env")

API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
if not API_TOKEN:
    print("Warning: REPLICATE_API_TOKEN not found in environment.")

# Models to query on Replicate
# Valid IDs based on search. Gemini is not available on Replicate, using Llama/Mistral as high-quality alternatives.
MODELS = [
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3.5-haiku",
    "meta/meta-llama-3-70b-instruct",
    "mistralai/mixtral-8x7b-instruct-v0.1" 
]

TEST_QUESTION = """A father promised his son that if the son married the daughter of a politician within 18 months, the father would assume responsibility for the son's student loans.
The father was primarily motivated to make this promise by a tax deduction that he thought would be available to him if he paid the son's student loans, although he was also glad to help his son and hoped the son would marry the politician's daughter. The son agreed because he already planned to propose to the politician's daughter, but the father and son never signed a written contract. Fourteen months later, the son married the politician's daughter. The father refused to make any payments on the son's loans, however, because the father had learned that he would not in fact qualify for any tax deductions.
Is the father's oral promise to pay off the son's student loans enforceable?"""

SYSTEM_PROMPT = "You are a helpful legal assistant."

# Rate limiting
SEM = asyncio.Semaphore(5) # max 5 concurrent requests

async def fetch_replicate(model, question, index):
    async with SEM:
        print(f"Fetching from {model}...")
        headers = {
            "Authorization": f"Token {API_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "my-app/1.0"
        }
        
        # Construct input
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
                # 1. Create Prediction
                owner, name = model.split("/")[:2]
                url = f"https://api.replicate.com/v1/models/{owner}/{name}/predictions"
                
                retry_count = 0
                while retry_count < 3:
                    resp = await client.post(url, json=input_data, headers=headers)
                    if resp.status_code == 429:
                        wait_time = int(resp.headers.get("retry-after", 5))
                        print(f"Rate limited on {model}, waiting {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        retry_count += 1
                        continue
                    break
                
                if resp.status_code == 404:
                    print(f"Model {model} not found.")
                    return None
                
                if resp.status_code != 201:
                    print(f"Error creating prediction for {model}: {resp.status_code} {resp.text}")
                    return None
                    
                prediction = resp.json()
                get_url = prediction["urls"]["get"]
                
                # 2. Poll for completion
                while True:
                    await asyncio.sleep(3) # Wait a bit before checking
                    
                    resp = await client.get(get_url, headers=headers)
                    if resp.status_code != 200:
                        print(f"Error polling {model}: {resp.status_code}")
                        return None
                        
                    prediction = resp.json()
                    status = prediction["status"]
                    
                    if status == "succeeded":
                        output = prediction["output"]
                        full_response = ""
                        if isinstance(output, list):
                            full_response = "".join(output)
                        elif isinstance(output, str):
                            full_response = output
                        else:
                            full_response = str(output)
                        
                        print(f"Success: {model}")
                        return {
                            "model": f"{owner}-{name}",
                            "prompt": question,
                            "response": full_response,
                            "id": f"{owner}-{name}_{index}"
                        }
                        
                    elif status == "failed":
                        print(f"Prediction failed for {model}: {prediction.get('error')}")
                        return None
                    elif status == "canceled":
                        print(f"Prediction canceled for {model}")
                        return None
                    
            except Exception as e:
                print(f"Exception fetching {model}: {e}")
                return None

async def main():
    target_count = 100
    per_model = target_count // len(MODELS) + 1
    
    tasks = []
    # Start ID index at something to avoid collision with existing data if we ran this multiple times for same model?
    # But for now, simple index 0..N is fine, the model name prefix makes it unique.
    
    for model in MODELS:
        # Increase the per_model slightly to ensure we hit target if some fail
        for i in range(per_model + 2):
            tasks.append(fetch_replicate(model, TEST_QUESTION, i))
            
    print(f"Starting generation of {len(tasks)} responses (limited concurrency)...")
    results = await asyncio.gather(*tasks)
    valid_results = [r for r in results if r is not None]
    
    output_file = "lsh/data/responses.json"
    existing_data = []
    
    if os.path.exists(output_file):
        try:
            with open(output_file, "r") as f:
                existing_data = json.load(f)
        except json.JSONDecodeError:
            print("Warning: Could not parse existing responses.json")
            
    # Calculate how many we actually need to add to reach close to target 
    # But user said "generate 100", so we append what we generated.
    
    existing_data.extend(valid_results)
    
    with open(output_file, "w") as f:
        json.dump(existing_data, f, indent=2)
        
    print(f"Saved {len(valid_results)} new responses to {output_file}")
    print(f"Total responses now: {len(existing_data)}")

if __name__ == "__main__":
    asyncio.run(main())
