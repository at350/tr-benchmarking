# Live Config Preflight Protocol

## Purpose

Live multi-model validation is the next expensive step. Before spending model
budget, the pipeline should verify that the chosen config is structurally ready
and that known local blockers are visible.

## Acceptance Checks

- The config is live-capable.
- Response models answer with natural, question-only prompting.
- The response roster has at least three model identifiers, at least three
  provider/model-family routes, and at least nine total samples.
- Frank, Karthic, and Dasha are configured as LLM agents.
- Dasha uses LLM reasoning-signature clustering and requires at least two
  observed reasoning clusters.
- Judge uses LLM row-level scoring with repeats or a judge panel.
- Invariant and material perturbation tracks are enabled for claim-supporting
  live validation configs.
- The source case exists.
- A protocol-freeze manifest can be built.
- Credential and perturbation-policy gaps are reported before any API call.
- The planned question tracks, response calls, Dasha signature calls, judge
  invocations, and total no-call budget are visible before the run starts.
- Configured budget caps block the run if planned response calls, judge calls,
  or total calls exceed the approved live-run budget.
- The pipeline runner enforces the same caps before any LLM-backed stage starts,
  so direct execution cannot bypass the budget guard.

## Command

```bash
python3 -m research.validation preflight \
  --config research/fixtures/live_multi_provider_config.example.json \
  --output research/runs/live_preflight.json
```
