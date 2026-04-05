# tr-benchmarking

The active product surface in this repo is the `frank-karthic-dasha` legal benchmarking pipeline in [frontend](/Users/alantai/Documents/GitHub/tr-benchmarking/frontend).

## Frontend setup

Create `frontend/.env.local` with:

```bash
OPENAI_API_KEY=...
REPLICATE_API_TOKEN=...
```

Then run:

```bash
cd frontend
npm run dev
```

The frontend now exposes only the Frank, Karthic, and Dasha workflow.
