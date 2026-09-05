# Contributing

Thanks for your interest. This is a small research codebase; the bar for a contribution is
that it keeps the checks green and the documentation true.

## Set up

```bash
git clone https://github.com/at350/tr-benchmarking && cd tr-benchmarking
python3 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # optional: CPU-only PyTorch first
pip install -e ".[all]"
cd frontend && npm ci && cd ..
cp .env.example .env                                                  # only needed for commands that call model APIs
```

## Run the checks

```bash
pytest                          # Python: parsing, provider client, run-file builder, clustering bridge, rubric pipeline
cd frontend
npm run lint && npx tsc --noEmit && npm run test:dasha-comparison && npm run build
```

`LSH_MOCK_EMBEDDINGS=1` swaps the embedding model for random vectors so the clustering
commands run without a download; the bridge tests use it.

## Where things live

| Path | What |
|---|---|
| `trbench/` | The Python package. Library modules at the top level, one module per command under `trbench/cli/`. |
| `runs/` | Collected model answers (`responses/`) and clustering runs (`results/`) for the free-form and IRAC pipelines. |
| `rubric-automation/` | The rubric-decomposition package, standard library only, with its own tests. |
| `frontend/` | The Next.js portal. |
| `instructions/` | Prompt files the portal loads by exact name; renaming one means updating the registry in `frontend/src/lib/legal-workflow-v2-prompts.ts` (or `frontend/src/lib/question-variance-prompts.ts` for the `question-variance/` files). `instructions/README.md` lists every runtime-loaded file. |
| `legal-workflow-data/` | JSON written by the portal; doubles as demo fixtures. |
| `docs/` | Figures and longer-form documentation. |

## Conventions

- Add a subcommand by creating `trbench/cli/<name>.py` with `add_parser(subparsers, name, help_text)`
  and `run(args)`, then list it in `COMMANDS` in `trbench/cli/__init__.py`. Keep heavy imports
  inside `run` so `trbench --help` stays fast.
- Anything that writes JSON to stdout for the portal (`trbench bridge`) must send progress to stderr.
- Commands that call paid APIs say so in their help text and support `--dry-run` where a plan can be printed.
- Do not commit `.env`, virtual environments, or generated outputs other than curated example runs.
- Keep commit messages descriptive: what changed and why.

## Reporting problems

Open an issue with the command you ran, the output, and your Python and Node versions.
