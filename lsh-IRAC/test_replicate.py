import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv("lsh/.env")
load_dotenv(".env")
TOKEN = os.getenv("REPLICATE_API_TOKEN")

async def test_model(model_name):
    headers = {"Authorization": f"Token {TOKEN}", "Content-Type": "application/json"}
    owner, name = model_name.split("/")[:2]
    url = f"https://api.replicate.com/v1/models/{owner}/{name}/predictions"
    
    input_data = {
        "input": {
            "prompt": "System Instruction: \n\nUser Question: Hello inside structured json",
            "temperature": 0.7,
            "max_tokens": 1000
        }
    }
    
    print(f"Testing {model_name}...")
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=input_data, headers=headers)
        print(f"POST Initial: {resp.status_code}")
        if resp.status_code != 201:
            print(resp.text)
            return
            
        get_url = resp.json()["urls"]["get"]
        while True:
            await asyncio.sleep(2)
            resp = await client.get(get_url, headers=headers)
            pred = resp.json()
            if pred["status"] in ["succeeded", "failed", "canceled"]:
                print(f"Final status: {pred['status']}")
                if "error" in pred:
                     print(f"Error payload: {pred['error']}")
                else:
                     print(f"Output: {pred.get('output')}")
                break

async def main():
    await test_model("anthropic/claude-3.5-haiku")
    await test_model("deepseek-ai/deepseek-v3")

asyncio.run(main())
