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

# Load environment variables
load_dotenv(dotenv_path="../frontend/.env")
load_dotenv() 

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

NUM_RESPONSES = 20
OUTPUT_FILE = "lsh/data/robust_supplemental.json"

TEST_QUESTION = """Merchant A, a manufacturer of widgets, sent a signed letter to Buyer B on January 1st stating: "We offer to sell you 1,000 widgets at $10 each. This offer will remain open until March 31st." Buyer B did not pay anything to keep the offer open. On February 1st, Merchant A called Buyer B and said, "The price of widgets has gone up. I am revoking my offer of January 1st." On February 5th, Buyer B sent a letter accepting the January 1st offer.
Is there an enforceable contract between Merchant A and Buyer B?"""

SYSTEM_PROMPT = "You are a helpful legal assistant."

# Substitutes for failed models
OPENAI_MODELS = [
    "o1-preview",
    "o1-mini",
    # "gpt-4o-mini" # User might want "gpt-5-nano" equivalent
]

REPLICATE_MODELS = [
    "anthropic/claude-3.5-sonnet", # Fixing claude-4
    "anthropic/claude-3-opus"      # Adding variety
]

# Fetch functions similar to before
async def fetch_openai(model, question, index):
    try:
        # o1 models don't support system prompt in standard way sometimes, or check docs.
        # usually user message is fine.
        messages = [{"role": "user", "content": question}]
        
        # o1-preview/mini currently beta, might need specific call or just chat works. 
        # OpenAI Python lib usually handles it if model name is valid.
        # Note: o1 models don't support 'temperature' (fixed at 1) or 'system' role in some versions.
        # We will use simple prompt.
        
        response = await openai_client.chat.completions.create(
            model=model,
            messages=messages
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
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
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
                        cleaned = model.replace("anthropic/", "")
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
    tasks = []
    
    # OpenAI
    for model in OPENAI_MODELS:
        for i in range(NUM_RESPONSES):
            tasks.append(fetch_openai(model, TEST_QUESTION, i))
            
    # Replicate
    for model in REPLICATE_MODELS:
        for i in range(NUM_RESPONSES):
            tasks.append(fetch_replicate(model, TEST_QUESTION, i))
            
    print(f"Generating {len(tasks)} supplemental responses...")
    results = await tqdm.gather(*tasks)
    valid = [r for r in results if r is not None]
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump(valid, f, indent=2)
    print(f"Saved {len(valid)} supplemental items.")

if __name__ == "__main__":
    asyncio.run(main())
