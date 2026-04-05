## Frank-Karthic-Dasha Frontend

This frontend now only serves the `frank-karthic-dasha` pipeline.

### Required environment variables

Create `frontend/.env.local` with whichever providers you want to run:

```bash
OPENAI_API_KEY=...
REPLICATE_API_TOKEN=...
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scope

- `Frank`: anchor case search, domain drafting, golden answer, question packet
- `Karthic`: rubric domain drafting and golden targets
- `Dasha`: multi-model generation, clustering, and centroid scoring

Other benchmark pages, outline viewers, dataset explorers, and prompt-file tooling were removed from this app.
