# Agent Handoff: Legal Reasoning Research Pipeline

## Current Branch Goal

This branch is a research-paper-first version of TR Benchmarking. The active
system is a general legal-reasoning evaluation pipeline, with Statute of Frauds
used as the first calibration domain because that is the data currently in hand.
The goal is to build, calibrate, freeze, and internally validate a pipeline that can
generate a benchmark from a source case, run model responses, cluster legal
reasoning, score centroids with a rubric, and rank models.

Do not claim the project is publishable yet. The current state is a working
general LLM-driven pipeline path plus SOF offline regression tests and a small
natural-response live batch across several model identifiers. The next work is
larger calibration across multiple SOF cases, more model samples, repeated judge
scoring, and eventually held-out expert labels.

Important: SOF is a calibration domain, not a live-path assumption. The live
Frank/Karthic/Dasha path loads `instructions/00_GENERAL_LEGAL_REASONING_PROTOCOL.md`
and the relevant canonical instruction files at runtime. Deterministic SOF logic
is for offline regression and controlled stress fixtures only.

## Canonical Context Files

- `README.md`: project overview, run commands, layout, checks.
- `README_RESEARCH.md`: research protocol, freeze/internal-validation expectations, what
  is and is not part of the research claim.
- `docs/tr-pipeline-groupme-extract.md`: extracted planning context from the
  original team discussion.
- `instructions/frank/`: Frank source intake, SOF routing, benchmark examples,
  and guardrails.
- `instructions/question-variance/`: Statute of Frauds variation packs and
  confusion sets.
- `instructions/karthic/`: rubric-generation requirements.
- `instructions/dasha/`: clustering/evaluation requirements.
- `instructions/zak/`: escalation packet requirements.
- `paper/`: LaTeX scaffold for the eventual research paper.

## Canonical Implementation

Use `research/validation/` as the source of truth:

- `frank.py`: deterministic SOF fallback used for offline regression tests.
- `karthic.py`: deterministic SOF fallback used for offline regression tests.
- `dasha.py`: deterministic SOF fallback and LLM-reasoning-signature clustering.
- `llm_agents.py`: general LLM-driven Frank, Karthic, Dasha signatures, and
  structured response generation.
- `provider_client.py`: provider abstraction for OpenAI, Anthropic/Claude, and
  Gemini REST calls.
- `judge.py`: scores Dasha centroid representatives against Karthic rows,
  projects centroid scores to all cluster members, and ranks models.
- `openai_client.py`: optional live OpenAI response generation and LLM-as-judge
  scoring.
- `pipeline.py`: end-to-end source-to-score runner.
- `tests/test_research_pipeline.py`: regression and behavior tests.

## Pipeline Flow

1. Frank ingests a source case and infers the legal doctrine/gates.
2. Frank emits source traceability, neutral question, gold answer, boundary
   variations, and controller card.
3. Karthic builds a dynamic rubric from the locked Frank packet.
4. Perturbation tracks convert selected Frank variations into executable
   invariant and material question edits.
5. Dasha clusters model responses by legal reasoning within each question track.
6. Judge scores cluster representatives against the rubric.
7. Judge projects centroid scores to cluster members and ranks models.
8. Zak emits escalation packets only when configured uncertainty/disagreement
   thresholds are met.

## Run Commands

Offline fixture, no API calls:

```bash
python3 -m research.validation run --config research/fixtures/tiny_config.json
```

Live OpenAI smoke/calibration:

```bash
python3 -m research.validation run --config research/fixtures/live_openai_config.example.json
```

General LLM-driven OpenAI+Anthropic smoke:

```bash
python3 -m research.validation run --config research/fixtures/live_openai_anthropic_config.example.json
```

General LLM-driven three-provider smoke:

```bash
python3 -m research.validation run --config research/fixtures/live_three_provider_config.example.json
python3 -m research.validation validate --run-dir research/runs/live_three_provider_smoke --table paper/tables/internal_validation_summary.tex
```

Current natural-response live batch used by the manuscript:

```bash
python3 -m research.validation run --config research/fixtures/live_natural_response_batch_config.example.json
python3 -m research.validation validate --run-dir research/runs/live_natural_response_batch --table paper/tables/internal_validation_summary.tex --natural-table paper/tables/natural_response_audit.tex --artifact-section paper/sections/artifact_examples.tex
```

Perturbation smoke, no API calls:

```bash
python3 -m research.validation run --config research/fixtures/tiny_perturbation_config.json
python3 -m research.validation validate --run-dir research/runs/tiny_perturbation --perturbation-table paper/tables/perturbation_validation_summary.tex
```

Internal 500-response stress suite, no API calls:

```bash
python3 -m research.validation stress --output-dir research/runs/internal_stress --sample-count 500 --seed 2026 --table paper/tables/internal_stress_summary.tex
```

Full multi-provider config template, including Gemini:

```bash
python3 -m research.validation run --config research/fixtures/live_multi_provider_config.example.json
```

Required checks:

```bash
python3 -m unittest discover -s research/validation/tests -p 'test*.py'
python3 -m py_compile $(find research/validation -name '*.py' -not -path '*/__pycache__/*')
cd frontend && npm run build
```

Frontend workbench:

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`.

## Current Workbench

The UI is intentionally bare. It runs the offline fixture and displays:

- case input
- Frank packet, gold answer, neutral question, boundary variations
- Karthic rubric rows
- Dasha clusters
- Judge scores and model rankings
- Zak escalation packet

The UI does not yet support arbitrary case upload/selection. To run a new case,
create or copy a research config and point `source_case_path` at the case text.

## Current Known Limitations

- The LLM-driven pipeline is designed for general legal doctrines, but current
  calibration evidence is still mostly SOF.
- The full multi-provider template includes Gemini, but local execution requires
  `GEMINI_API_KEY`.
- Dasha LLM-reasoning-signature clustering has passed a tiny live smoke, but it
  is not yet validated at 500-response live-model scale. The 500-response
  internal stress suite validates controlled clustering mechanics only.
- The live LLM-as-judge path runs, but it has not yet been validated against
  expert labels or inter-rater reliability targets.
- `research/runs/` is ignored output. Do not commit generated run bundles unless
  they are intentionally promoted to curated fixtures.
- Secrets belong only in ignored local env files. Never commit API keys.

## Recent Calibration Bugs Fixed

- Frank no longer treats incidental timing like "about a year later" as a
  one-year SOF gate when the real gate is marriage consideration.
- Dasha no longer flips a later-beneficiaries answer to wife-wins simply because
  the response mentions the wife's argument.
- Dasha no longer flips a wife-wins answer to later-beneficiaries merely because
  it states the children/sister counterargument.

## Development Rule

When you see obvious legal/pipeline errors, add a regression test first, fix the
pipeline, rerun the offline tests, and then rerun the relevant fixture/live
smoke. The engineering iteration loop is not part of the paper's research claim;
the paper should describe only the frozen pipeline and validation evidence.
