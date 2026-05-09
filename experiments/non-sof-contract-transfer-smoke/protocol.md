# Non-SOF Contract Transfer Smoke Protocol

## Purpose

This offline smoke test checks whether the research pipeline can run on a
non-Statute-of-Frauds legal source without carrying SOF-specific artifacts into
Frank, Karthic, or Dasha outputs.

The test is schema-transfer evidence, not a live doctrine-transfer result. It
uses a tiny deterministic contract-interpretation fixture so it can run in CI
without model calls.

## Fixture

- Source case: `research/fixtures/tiny_contract_source_case.txt`
- Responses: `research/fixtures/tiny_contract_responses.json`
- Config: `research/fixtures/tiny_contract_config.json`

The source concerns interpretation of a software-license remedy covenant and a
service-credit schedule. It exercises two source-derived gates:

- plain-meaning interpretation
- contra proferentem

## Acceptance Checks

- Frank labels the doctrine as contract interpretation.
- Frank emits `doctrine_gates` and does not emit a `statute_of_frauds` packet.
- Karthic generates a generic legal rubric rather than a SOF-specific rubric.
- Dasha separates text-first buyer reasoning, contra-proferentem reasoning, and
  seller-limitation reasoning.
- Internal validation reaches `internal_validation_ready`.

## Command

```bash
PYTHONPATH=. python3 -m unittest research.validation.tests.test_research_pipeline.ResearchPipelineTests.test_offline_contract_interpretation_fixture_runs_without_sof_assumption
```
