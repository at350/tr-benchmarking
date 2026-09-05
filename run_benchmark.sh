#!/bin/bash
# Set up a virtual environment (if needed), install the Python dependencies,
# and run the LSH robustness benchmark. Run from the repository root.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Running robust benchmark..."
python3 lsh/run_robust_benchmark.py
