"""Smoke-check that Replicate-hosted models accept a request with the current token.

Usage (from the repository root, with REPLICATE_API_TOKEN in .env or the environment):
    python lsh-IRAC/replicate_smoke_check.py anthropic/claude-3.5-haiku deepseek-ai/deepseek-v3

This is a manual connectivity check, not a pytest test, and it spends API credits.
"""
import argparse
import asyncio
import os
import sys

import httpx
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, "lsh", ".env"))
load_dotenv(os.path.join(ROOT, ".env"))
load_dotenv()
TOKEN = os.getenv("REPLICATE_API_TOKEN")

async def check_model(model_name):
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

async def main(models):
    for model in models:
        await check_model(model)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("models", nargs="*", default=["anthropic/claude-3.5-haiku", "deepseek-ai/deepseek-v3"])
    args = parser.parse_args()
    if not TOKEN:
        sys.exit("REPLICATE_API_TOKEN is not set.")
    asyncio.run(main(args.models))
