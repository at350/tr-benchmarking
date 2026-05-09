# Protocol Freeze Manifest Protocol

## Purpose

The pipeline should distinguish engineering calibration from claim-supporting
research runs. This experiment adds an executable freeze artifact that records
the intended protocol before running or reporting a validation batch.

## Acceptance Checks

- The freeze manifest records the run id, config hash, source hash, and protocol
  hash.
- It records ordered instruction-context hashes for Frank, Karthic, and Dasha.
- It records response-model roster, clustering settings, judge configuration,
  judge-panel composition, perturbation policy, and quality gates.
- It does not include API keys or generated model outputs.

## Command

```bash
python3 -m research.validation freeze \
  --config research/fixtures/live_multi_provider_config.example.json \
  --output research/runs/live_multi_provider_protocol_freeze.json
```
