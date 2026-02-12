import os
import json
import asyncio
from dotenv import load_dotenv
from openai import AsyncOpenAI
from tqdm.asyncio import tqdm

# Load environment variables
load_dotenv(dotenv_path="../frontend/.env")

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    # Try looking in current directory .env too, or just rely on env var
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    print("Warning: OPENAI_API_KEY not found in environment or .env file.")

client = AsyncOpenAI(api_key=api_key)


MODELS = [
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-5.2",
    "gpt-5-mini",
]

PROMPT_TEMPLATE = """
You are a legal assistant. Answer the following question clearly and concisely.

Question:
{question}
"""

TEST_QUESTION = """A father promised his son that if the son married the daughter of a politician within 18 months, the father would assume responsibility for the son's student loans.
The father was primarily motivated to make this promise by a tax deduction that he thought would be available to him if he paid the son's student loans, although he was also glad to help his son and hoped the son would marry the politician's daughter. The son agreed because he already planned to propose to the politician's daughter, but the father and son never signed a written contract. Fourteen months later, the son married the politician's daughter. The father refused to make any payments on the son's loans, however, because the father had learned that he would not in fact qualify for any tax deductions.
Is the father's oral promise to pay off the son's student loans enforceable?"""

async def fetch_response(model: str, question: str, index: int) -> dict:
    try:
        # Handle temperature constraints
        temperature = 0.7 + (index % 5) * 0.1
        if "mini" in model:
            temperature = 1.0

        # Handle completion vs chat models
        if "pro" in model:
            response = await client.completions.create(
                model=model,
                prompt=f"You are a helpful legal assistant.\n\nQuestion: {question}\n\nAnswer:",
                temperature=temperature,
                max_tokens=600
            )
            content = response.choices[0].text.strip()
        else:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a helpful legal assistant."},
                    {"role": "user", "content": question}
                ],
                temperature=temperature,
            )
            content = response.choices[0].message.content

        return {
            "model": model,
            "prompt": question,
            "response": content,
            "id": f"{model}_{index}"
        }
    except Exception as e:
        print(f"Error fetching from {model}: {e}")
        return None

async def generate_dataset(num_responses=200, output_file="lsh/data/responses.json"):
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    tasks = []
    responses_per_model = num_responses // len(MODELS) + 1
    
    count = 0
    for model in MODELS:
        for i in range(responses_per_model):
            if count >= num_responses:
                break
            tasks.append(fetch_response(model, TEST_QUESTION, i))
            count += 1
            
    results = await tqdm.gather(*tasks)
    valid_results = [r for r in results if r is not None]
    
    with open(output_file, "w") as f:
        json.dump(valid_results, f, indent=2)
        
    print(f"Saved {len(valid_results)} responses to {output_file}")

if __name__ == "__main__":
    asyncio.run(generate_dataset())
