# Recursive Rubric Decomposition for Legal Answers

This folder contains a production-style Python implementation of an automated Recursive Rubric Decomposition (RRD) pipeline for legal-answer evaluation.

## Module Structure

- `rrd_legal.py`: top-level CLI entry point matching the requested usage style.
- `rrd_legal_pkg/models.py`: dataclasses for legal tasks, rubrics, evaluations, config, and pipeline results.
- `rrd_legal_pkg/prompts.py`: default JSON-only prompt templates for structure extraction, rubric generation, decomposition, evaluation, redundancy, weighting, and coverage auditing.
- `rrd_legal_pkg/llm.py`: `LLMClient` interface plus a deterministic `MockLLMClient` and optional `OpenAILLMClient`.
- `rrd_legal_pkg/extractors.py`: legal-structure extraction service wrapper.
- `rrd_legal_pkg/evaluation.py`: rubric evaluation and rubric-response matrix construction.
- `rrd_legal_pkg/filters.py`: redundancy and misalignment filtering.
- `rrd_legal_pkg/weighting.py`: uniform, LLM, whitened, and doctrinal weighting strategies.
- `rrd_legal_pkg/pipeline.py`: end-to-end RRD orchestration, coverage repair, and export logic.
- `examples/toy_legal_task.json`: bundled end-to-end demo input.
- `tests/test_rrd.py`: lightweight unit and integration tests using the mocked client.

## Running It

From the `rubric-automation` directory:

```bash
python rrd_legal.py --demo --weighting doctrinal --verbose
```

Or with your own input file:

```bash
python rrd_legal.py --input examples/toy_legal_task.json --weighting doctrinal
```

Optional flags:

- `--threshold`
- `--max-iterations`
- `--disable-misalignment`
- `--weighting uniform|llm|whitened|doctrinal`
- `--include-style-rubrics`
- `--verbose`
- `--use-openai`
- `--model`

Outputs are exported into `outputs/<input-stem>/` by default:

- `final_rubrics.json`
- `rubric_matrix.csv`
- `coverage_audit.json`
- `pipeline_log.json`

## Example Input

See [`examples/toy_legal_task.json`](/Users/clarkhanlon/Desktop/CS/CS397/tr-benchmarking-lsh/rubric-automation/examples/toy_legal_task.json).

The JSON format is:

```json
{
  "legal_question": "...",
  "golden_answer": "...",
  "sample_responses": ["...", "..."],
  "jurisdiction": "United States",
  "legal_domain": "Torts",
  "metadata": {}
}
```

## Plugging In a Real LLM API Key

The API-specific code lives in [`rrd_legal_pkg/llm.py`](/Users/clarkhanlon/Desktop/CS/CS397/tr-benchmarking-lsh/rubric-automation/rrd_legal_pkg/llm.py).

To use a real model:

1. Install the `openai` Python package in your environment.
2. Set `OPENAI_API_KEY` in your shell.
3. Run:

```bash
python rrd_legal.py --input your_task.json --use-openai --model gpt-4.1-mini
```

The mocked client remains the default so the package works offline for testing and development.
