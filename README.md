# Legal Reasoning Evaluation Research Pipeline

This branch is a research-paper-first legal-evaluation project, with Statute of
Frauds as the first calibration domain. It is no longer
organized around the old demo portal or historical run dumps.

The active goal is to develop, calibrate, and internally validate a
source-grounded pipeline for evaluating legal reasoning in LLM outputs. Future
expert review is outside the current milestone.

Statute of Frauds is the first calibration domain, not a hard-coded live
pipeline assumption. The LLM agent path loads canonical context from
`instructions/`, including `instructions/00_GENERAL_LEGAL_REASONING_PROTOCOL.md`,
and requires Frank, Karthic, and Dasha to infer doctrine from the source case.

## Active Pipeline

The canonical implementation lives in `research/validation/`.

The intended source-to-score flow is:

1. **Frank** ingests a source case and produces doctrine/gate detection, source extraction, a gold answer, a neutral question, controlled boundary variations, and a handoff packet.
2. **Karthic** builds fresh source-grounded rubric rows from the locked Frank packet and validates the rubric against required categories, duplicates, and output-shape rules.
3. **Perturbation tracks** convert selected Frank variations into executable invariant and material question edits.
4. **Dasha** generates or loads fresh model responses, clusters them by legal reasoning path and question track, and selects a representative answer for each cluster.
5. **Judge** scores cluster representatives against the Karthic rubric, projects centroid scores to all cluster members, and records row-level scores, model rankings, agreement, and escalation flags.
6. **Zak** creates a focused escalation packet only when the judge or cluster evidence indicates uncertainty, disagreement, or stage failure.

The engineering calibration loop happens before research freeze. It is not part of
the paper's empirical claim.

## Run the Offline Statute of Frauds Fixture

```bash
python3 -m research.validation run --config research/fixtures/tiny_config.json
```

The fixture uses one tiny source case and frozen synthetic responses, so it does
not require API calls. Generated outputs are written to `research/runs/`, which is
ignored by git.

Expected result:

```text
tiny_offline: internal_validation_ready
```

For live calibration, copy `research/fixtures/live_openai_config.example.json`,
point it at a source case, keep the output under `research/runs/`, and set
`mode` to `live_openai`. Use `judge.mode = "llm"` when you want the
LLM-as-judge scorer to apply the Karthic rubric to Dasha centroids.

For the general LLM-driven path, use
`research/fixtures/live_three_provider_config.example.json`,
`research/fixtures/live_openai_anthropic_config.example.json`, or
`research/fixtures/live_multi_provider_config.example.json`. These configs use
LLM Frank, LLM Karthic, natural benchmarked model answers, LLM Dasha reasoning
signatures, and LLM judge scoring.

The current internally validated live command is:

```bash
python3 -m research.validation run --config research/fixtures/live_natural_response_batch_config.example.json
python3 -m research.validation validate --run-dir research/runs/live_natural_response_batch --table paper/tables/internal_validation_summary.tex --natural-table paper/tables/natural_response_audit.tex --artifact-section paper/sections/artifact_examples.tex
```

The current pre-expert-review scale check is deterministic and does not use API
calls:

```bash
python3 -m research.validation stress --output-dir research/runs/internal_stress --sample-count 500 --seed 2026 --table paper/tables/internal_stress_summary.tex
```

The current perturbation smoke check is deterministic and does not use API
calls:

```bash
python3 -m research.validation run --config research/fixtures/tiny_perturbation_config.json
python3 -m research.validation validate --run-dir research/runs/tiny_perturbation --perturbation-table paper/tables/perturbation_validation_summary.tex
```

## Research Workbench UI

A minimal Next.js workbench remains in `frontend/`. It is intentionally small:

- one page showing the pipeline stages
- one button to run the offline fixture
- one API route that calls the research harness

Run it with:

```bash
cd frontend
npm run dev
```

The UI is not the research engine. The reproducible CLI harness is the source of
truth.

## Paper

The LaTeX scaffold is in `paper/`:

- `paper/main.tex`
- `paper/references.bib`
- `paper/sections/`
- `paper/tables/`
- `paper/figures/`

Tables and figures should be generated from frozen research outputs after the
pipeline is calibrated and internally validated.

## Repository Layout

- `research/validation/` - canonical research pipeline runner, quality gates, metrics, and tests
- `research/fixtures/` - curated offline fixtures
- `paper/` - LaTeX paper scaffold
- `instructions/` - canonical Frank, Karthic, Dasha, Zak, and question-variation instructions
- `cases/` - source case PDFs for calibration and future validation
- `frontend/` - minimal research workbench only

## Checks

```bash
python3 -m unittest discover -s research/validation/tests -p 'test*.py'
python3 -m py_compile $(find research/validation -name '*.py' -not -path '*/__pycache__/*')
cd frontend && npm run build
```

## Secrets

API keys live only in ignored local `.env` files such as `.env` or
`frontend/.env`. Do not commit secrets. Live model outputs should remain under
ignored `research/runs/` unless intentionally promoted to a curated fixture.
