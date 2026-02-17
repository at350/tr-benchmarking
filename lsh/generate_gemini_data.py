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

# Specific model
MODEL = "google/gemini-3-flash"

TEST_QUESTION = """A father promised his son that if the son married the daughter of a politician within 18 months, the father would assume responsibility for the son's student loans.
The father was primarily motivated to make this promise by a tax deduction that he thought would be available to him if he paid the son's student loans, although he was also glad to help his son and hoped the son would marry the politician's daughter. The son agreed because he already planned to propose to the politician's daughter, but the father and son never signed a written contract. Fourteen months later, the son married the politician's daughter. The father refused to make any payments on the son's loans, however, because the father had learned that he would not in fact qualify for any tax deductions.
Is the father's oral promise to pay off the son's student loans enforceable?"""

# Rate limiting
SEM = asyncio.Semaphore(5)

async def fetch_gemini(index, client):
    async with SEM:
        print(f"Fetching from {MODEL} (req {index})...")
        headers = {
            "Authorization": f"Token {API_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "my-app/1.0"
        }
        
        # Construct input based on user's successful schema
        # User provided: top_p, prompt, temperature, thinking_level, max_output_tokens
        input_data = {
            "input": {
                "prompt": TEST_QUESTION,
                "max_output_tokens": 2048, # Increased for detail
                "temperature": 0.7,
                # "thinking_level": "low", # User example had this, maybe keep it? Or omit if default is fine. User said "Install Replicate... Run... input={... thinking_level: 'low' ...}". I'll include it.
                # Actually, user's prompt was for video transcript. For legal QA, maybe "high" thinking is better? Or just omit.
                # Let's try omitting first to be standard, or use "low" as in example if required. 
                # Replicate often has default values. I'll stick to a basic set first.
                "top_p": 0.95
            }
        }

        try:
            # 1. Create Prediction
            owner, name = MODEL.split("/")[:2]
            url = f"https://api.replicate.com/v1/models/{owner}/{name}/predictions"
            
            retry_count = 0
            while retry_count < 3:
                resp = await client.post(url, json=input_data, headers=headers)
                if resp.status_code == 429:
                    wait_time = int(resp.headers.get("retry-after", 5))
                    print(f"Rate limited on {MODEL}, waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    retry_count += 1
                    continue
                break
            
            if resp.status_code != 201:
                print(f"Error creating prediction for {MODEL}: {resp.status_code} {resp.text}")
                return None
                
            prediction = resp.json()
            get_url = prediction["urls"]["get"]
            
            # 2. Poll for completion
            while True:
                await asyncio.sleep(2)
                
                resp = await client.get(get_url, headers=headers)
                if resp.status_code != 200:
                    print(f"Error polling {MODEL}: {resp.status_code}")
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
                    
                    print(f"Success: {MODEL} (req {index})")
                    return {
                        "model": "gemini-3-flash",
                        "prompt": TEST_QUESTION,
                        "response": full_response,
                        "id": f"gemini-3-flash_{index}"
                    }
                    
                elif status == "failed":
                    print(f"Prediction failed for {MODEL}: {prediction.get('error')}")
                    return None
                elif status == "canceled":
                    print(f"Prediction canceled")
                    return None
                
        except Exception as e:
            print(f"Exception fetching {MODEL}: {e}")
            return None

async def main():
    target_count = 30
    
    tasks = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Create tasks
        for i in range(target_count):
            tasks.append(fetch_gemini(i, client))
            
        print(f"Starting generation of {len(tasks)} responses from {MODEL}...")
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
            
    # Append
    existing_data.extend(valid_results)
    
    with open(output_file, "w") as f:
        json.dump(existing_data, f, indent=2)
        
    print(f"Saved {len(valid_results)} new Gemini responses to {output_file}")
    print(f"Total responses now: {len(existing_data)}")

if __name__ == "__main__":
    asyncio.run(main())
