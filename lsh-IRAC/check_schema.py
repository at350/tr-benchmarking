import json

path = "/Users/alantai/Documents/GitHub/tr-benchmarking/lsh-IRAC/results/run_20260303_163604.json"
try:
    with open(path, "r") as f:
        data = json.load(f)
    print("Keys in root:", list(data.keys()))
    if "data" in data and "clusters" not in data:
         print("WARNING: Root missing 'clusters'.")
    if "metadata" in data:
         print("Metadata:", data["metadata"])
except Exception as e:
    print("Error:", e)
