# Benchmarking Portal (frontend)

A Next.js 16 / React 19 / TypeScript app for running and inspecting the legal
reasoning benchmarks in this repository. It reads and writes JSON under
`../legal-workflow-data/`, reads clustering runs from `../lsh/results/` and
`../lsh-IRAC/results/`, serves the PDFs in `../outlines/`, and shells out to
`../lsh/cluster_legal_workflow.py` (clustering) and `../lsh-IRAC/run_irac_benchmark.py`
(full benchmark runs).

## Run

```bash
npm ci
cp .env.example .env.local   # add keys only if you want to run judges/drafting
npm run dev                  # http://localhost:3000
```

Browsing saved runs, datasets, and outlines needs no API key. The judge, drafting,
and clustering features need `OPENAI_API_KEY` (and optionally `GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`) plus a Python environment set up per the root README.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run test:dasha-comparison   # node:test unit tests for the comparison math
npm run build
```

## Pages

| Route | What it shows |
|---|---|
| `/` | Home and links |
| `/demos` | Scripted walkthroughs of the workflow |
| `/database-view` | SuperGPQA law subset browser (`/api/dataset`; add `?dataset=prbench` for PRBench) |
| `/outlines` | Contract and tort law outline PDFs |
| `/lsh-runs` | Every saved clustering run, with cluster maps and members |
| `/legal-workflow` | The four-stage packet → rubric → judge → review workflow, stage by stage |
| `/legal-autoeval-pipeline` | The same workflow grouped for a live demo |

## Layout

```
src/app/            pages and API routes (App Router)
src/app/api/        JSON endpoints; one folder per artifact type
src/components/     DashaResultsExplorer and ui/ primitives
src/lib/            server-side logic
  legal-workflow-v2-server.ts   file-backed workflow state (packets, rubric packs, runs, reviews) and LLM calls
  legal-workflow-v2-prompts.ts  loads prompt text from ../instructions/
  lsh-runs.ts / outlines.ts     readers for clustering runs and outline PDFs
  dasha-comparison.ts           comparison math (unit tested)
scripts/            background workers spawned by API routes
```

File and run identifiers coming from URLs are validated against fixed patterns
(`sanitizeFileName`, `isValidRunFileName`, `isValidOutlineFileName`) before they
touch the filesystem, and Python is invoked with `execFile` (no shell).
