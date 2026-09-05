# Recursive Rubric Decomposition (RRD)

A standard-library-only Python package that turns a legal question plus a
gold-standard answer into a weighted scoring rubric, then scores sample answers
against it. It ships with a deterministic mock LLM client, so the whole
pipeline runs offline and is unit tested; OpenAI and Anthropic clients are optional.

## Run

From this directory:

```bash
python rrd_legal.py --demo --weighting doctrinal --verbose
python rrd_legal.py --input examples/statute_of_frauds_marriage.json --weighting doctrinal
python -m pytest -q tests          # or just `pytest` from the repository root
```

Exports go to `outputs/<input-stem>/` (gitignored):
`final_rubrics.json`, `rubric_matrix.csv`, `coverage_audit.json`, `pipeline_log.json`.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--input PATH` | | Task JSON (see format below) |
| `--demo` | | Use `examples/toy_legal_task.json` |
| `--output-dir PATH` | `outputs` | Export directory |
| `--weighting` | `doctrinal` | `uniform`, `llm`, `whitened`, or `doctrinal` |
| `--threshold N` | 3 | Decomposition match threshold |
| `--max-iterations N` | 4 | RRD iteration cap |
| `--disable-misalignment` | | Skip the misalignment filter |
| `--include-style-rubrics` | | Keep style-only criteria |
| `--provider` | `mock` | `mock`; `openai` (`pip install openai`; `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`); `anthropic` (no extra package; `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`, optional `ANTHROPIC_BASE_URL`) |
| `--model` | per provider | `gpt-4.1-mini` for OpenAI, `claude-sonnet-4-6` for Anthropic |
| `--verbose` | | Print iteration progress |

## What the pipeline does

1. Extract the legal structure of the gold answer (doctrines, sub-issues, rules).
2. Generate a first rubric: criteria a correct answer must satisfy.
3. Decompose broad criteria into atomic, independently gradeable items.
4. Filter redundant or misaligned items.
5. Weight items (`weighting.py`): uniform, LLM-assigned, statistically whitened, or doctrinal centrality.
6. Audit coverage against every issue in the gold answer and repair gaps.
7. Score each sample response, producing a rubric × response matrix.

## Input format

```json
{
  "legal_question": "...",
  "golden_answer": "...",
  "sample_responses": ["...", "..."],
  "jurisdiction": "United States",
  "legal_domain": "Contracts",
  "metadata": {}
}
```

`examples/` contains the toy task used by `--demo` and a real Statute of Frauds
(marriage provision) task with two sample model responses.

## Layout

```
rrd_legal.py            CLI entry point (delegates to rrd_legal_pkg.cli)
rrd_legal_pkg/
  cli.py                argument parsing
  models.py             dataclasses for tasks, rubrics, evaluations, config
  prompts.py            JSON-only prompt templates
  llm.py                LLMClient interface; Mock, OpenAI, and Anthropic clients
  extractors.py         legal-structure extraction
  pipeline.py           orchestration, coverage repair, export
  evaluation.py         rubric scoring and matrix construction
  filters.py            redundancy / misalignment filtering
  weighting.py          the four weighting strategies
tests/test_rrd.py       unit and integration tests on the mock client
```
