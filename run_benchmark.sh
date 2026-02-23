#!/bin/bash
set -e

# Change to the directory of this script's parent (root of repo)
# Assuming run_benchmark.sh is in the root or close to it.
# Actually let's assume it's run from the root.

# Setup virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r lsh/requirements.txt

# Run the benchmark
echo "Running robust benchmark..."
python3 lsh/run_robust_benchmark.py
