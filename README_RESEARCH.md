# Legal Reasoning Research Protocol Notes

This branch is building a general legal-reasoning evaluation pipeline. Statute
of Frauds is the first calibration domain because that is the data currently in
hand, but the live path should infer doctrine from the source case rather than
hard-code SOF assumptions.

The live LLM path loads the active instruction tree at runtime. The deterministic
SOF code paths are retained for offline regression fixtures and controlled stress
tests only.

## Engineering Calibration vs. Internal Research Validation

During development, the team may repeatedly adjust prompts, rubric generation,
clustering configuration, and judge settings on calibration cases. That loop is
engineering work. It should not be reported as the paper's validation method.

Before reporting internal validation results, freeze:

- Frank prompts and output schema
- question-variation policy
- Karthic rubric generation and quality gates
- question-perturbation track construction and comparison rules
- Dasha clustering method and parameters
- judge model roster and aggregation rule
- Zak escalation threshold

The manuscript should report only results from frozen pipeline runs. Expert
legal review remains a future publication step, not a dependency for the current
internal validation manuscript.

## Internal Acceptance Gates

The pipeline is internally acceptable only when:

- Frank packets detect the correct legal doctrine/gate, preserve source traceability, generate a neutral question, and create boundary variations that test legally meaningful fact changes.
- Karthic rubrics are fresh per source case, source-grounded, non-duplicative, category-complete, and focused on gate, rule, facts, writing/compliance, exceptions, counterargument, conclusion, variation sensitivity, and source support.
- Perturbation tracks execute selected Frank variations as real benchmark questions. Invariant edits should preserve the dominant legal answer path, while material legal edits should change the dominant answer path or reasoning signature.
- Dasha clusters group responses by similar legal reasoning, including doctrine/gate, outcome, exception/substitute or defense, and core reasoning path.
- Judge scoring is row-level, explainable, stable under the frozen config, and projects centroid scores to all responses in each Dasha cluster.
- Zak packets are produced only for disputed or low-confidence cases.
- A complete run bundle can be regenerated from config.

## Live Validation

Internal validation runs should use fresh model outputs generated from newly
created Frank questions, not historical response dumps tied to older
hand-authored questions. Historical artifacts were removed from the active
branch for that reason.

Benchmarked response models should answer naturally. The default live response
prompt style is `"natural"`, which sends the model only the Frank-generated
question as a user message. It does not add a system prompt, a source excerpt
outside the question, or a required jurisdiction/outcome/doctrine heading
template. Those structured fields are extracted downstream by Dasha and judged
against Karthic; they are not imposed on the model being benchmarked.

Dasha validation has two separate standards:

- coverage: every unlabeled model response to the same Frank question is
  assigned to a cluster after generation
- divergence: a tricky question and sufficiently broad model roster produce at
  least the configured number of observed legal-reasoning clusters

A one-cluster natural run is useful as an end-to-end smoke test, but it is not a
successful Dasha discovery validation. Set
`"clustering": {"min_observed_clusters": 2, ...}` or higher for live divergence
runs.

Question-perturbation validation is a separate lane. Set
`"perturbations": {"enabled": true, "require_invariant": true,
"require_material": true}` to make the runner generate the original question and
selected Frank variations as separate tracks. The report compares each
variant's dominant Dasha signal against the original: surface edits such as
party-name changes should remain stable, and legally operative edits such as
duration, writing, land, goods, suretyship, or marriage changes should move the
dominant reasoning or outcome when doctrine requires it.

Use `"mode": "live_openai"` in a research config to generate fresh Dasha
responses from the locked Frank question. The API key is read from process env
or ignored local env files; it should never be committed.

Before treating a config as a frozen research protocol, write a freeze manifest:

```bash
python3 -m research.validation freeze --config research/fixtures/live_multi_provider_config.example.json --output research/runs/live_multi_provider_protocol_freeze.json
```

The freeze manifest records the config hash, source hash, instruction-context
hashes, model rosters, judge panel, quality gates, perturbation policy, and
normalization versions. It is provenance metadata only; it does not include API
keys or generated model outputs.

Run no-call live readiness checks before spending model budget:

```bash
python3 -m research.validation preflight --config research/fixtures/live_multi_provider_config.example.json --output research/runs/live_preflight.json
```

The preflight check builds the freeze metadata in memory, checks live-mode
structure, natural prompting, response roster size and diversity, LLM agent
configuration, Dasha clustering settings, judge-repeat or judge-panel settings,
source availability, quality gates, perturbation policy, and local credential
presence. It also estimates planned question tracks, response calls, Dasha
signature calls, minimum judge calls, and total LLM calls excluding Frank and
Karthic. Credential, perturbation, and budget gaps are reported before any API
call is made.

For Gemini routes, either `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or
`GOOGLE_GENERATIVE_AI_API_KEY` is accepted by preflight and the live provider
adapter.

After a claim-supporting run, build the method-readiness report:

```bash
python3 -m research.validation readiness \
  --run-dir research/runs/live_natural_response_batch \
  --live-config research/fixtures/live_multi_provider_config.example.json \
  --stress-dir research/runs/internal_stress \
  --output experiments/method-readiness/results/method_readiness.json \
  --markdown experiments/method-readiness/analysis.md \
  --review-table paper/tables/review_readiness.tex
```

This report maps run evidence to the gates in `VISION.md` and distinguishes
`met`, `partial`, and `evidence_gap`. It is intentionally stricter than raw
engineering success: unrepeated live judge scoring remains partial, preflight
with credential warnings remains partial, and missing live perturbation evidence
remains an evidence gap. The optional `--review-table` output regenerates the
manuscript readiness table from the same machine-readable report.

Live configs may include a `budget` block:

```json
{
  "budget": {
    "max_response_calls": 30,
    "max_judge_calls": 12,
    "max_total_llm_calls_excluding_frank_karthic": 80
  }
}
```

Preflight treats these as hard caps. A run whose planned response calls, minimum
judge calls, or total calls excluding Frank/Karthic exceed the configured caps
fails before any provider call is made. Use `0` or omit a cap only when there is
an explicit reason not to bound that dimension. The pipeline runner enforces the
same caps before invoking Frank, so the budget guard still applies if a
researcher calls `run` directly without first running preflight.

Run static manuscript checks with:

```bash
python3 -m research.validation paper-lint --paper-root paper --output research/runs/paper_lint.json
```

This does not replace a real TeX build. It verifies that paper inputs, figures,
bibliographies, and citation keys resolve in environments where `latexmk` or
`pdflatex` is not installed. It also blocks stale readiness counts,
provider-routing names in the manuscript, absolute local paths, JD-review
dependencies, and common Statute-of-Frauds typos.

Run secret lint before sharing the branch or promoting generated artifacts:

```bash
python3 -m research.validation secrets-lint --output experiments/security-lint/results.json
```

The scanner checks shareable repo text files for likely provider keys and
credential assignments. It excludes local env files, virtual environments,
dependency folders, and build outputs. It also blocks absolute local machine
paths in shareable artifacts so generated reports stay portable across research
machines.

Build the human-facing internal review packet with:

```bash
python3 -m research.validation review-pack
```

This writes `to_human/internal_review_packet.md`,
`to_human/internal_review_packet.html`, and
`to_human/internal_review_packet.json` from the current readiness, preflight,
run-bundle integrity, and secret-lint artifacts. Regenerate it after any
claim-supporting run or validation result changes.

Build the manuscript claim ledger with:

```bash
python3 -m research.validation claim-ledger
```

This writes `to_human/claim_ledger.md`, `to_human/claim_ledger.html`, and
`to_human/claim_ledger.json`. It maps major manuscript claims to evidence
artifacts, marks claims as supported or partial, and records the limitation that
keeps each claim from being overstated.

Audit a completed run bundle with:

```bash
python3 -m research.validation bundle-audit \
  --run-dir research/runs/live_natural_response_batch \
  --json experiments/run-bundle-integrity/results.json \
  --markdown experiments/run-bundle-integrity/analysis.md
```

This verifies the required source-to-score artifacts, manifest hashes,
configured response counts, natural-response metadata, Dasha member links, judge
cluster coverage, model rankings, and Zak packet presence without invoking any
model.

Build the handoff checksum manifest with:

```bash
python3 -m research.validation handoff-manifest
```

This writes `to_human/handoff_manifest.json`, a checksum inventory of the
paper, figures, fixtures, experiment reports, human-review artifacts, and
research validation code expected to be reviewed or regenerated. It excludes the
manifest itself and no-call audit files to avoid circular hashes.

Run the consolidated no-call audit with:

```bash
python3 -m research.validation no-call-audit
```

This runs paper lint, secret lint, live preflight, run-bundle integrity, method
readiness, review-pack generation, claim-ledger generation, and handoff-manifest
generation without invoking any model. It is the single local pre-review command
to run before sharing the branch or asking researchers to review the manuscript.

Set `"judge": {"mode": "llm", "provider": "openai", "model": "gpt-5.2", ...}`
to use the LLM-as-judge path for centroid scoring. In config, `provider` is only
call-routing metadata; the research object is the actual `model` identifier and
its generated output. The offline fixture uses deterministic judging only so
tests remain reproducible.

Set `"judge": {"repeats": 2}` or higher for live validation runs that need
judge-stability evidence. Repeated judge calls are aggregated at the rubric-row
level and the run records pairwise MAE, weighted kappa, maximum row-score range,
and unstable-row flags. Rows that vary by two or more points create Zak
escalation packets instead of being silently averaged.

Set `"judge": {"judge_models": [...]}` to use a judge panel. Each entry supplies
the actual judge model identifier plus its repeat count. Panel outputs are
aggregated through the same row-level stability machinery, and the run bundle
records the judge panel composition for reproducibility.

Zak also escalates low-margin centroid comparisons. The judge agreement score is
the top-vs-runner-up weighted-score margin normalized by the maximum possible
weighted score; if it falls below the configured `agreement_threshold`, the run
records a Zak packet instead of silently accepting the ranking.

Run the internal 500-response stress suite with:

```bash
python3 -m research.validation stress --output-dir research/runs/internal_stress --sample-count 500 --seed 2026 --table paper/tables/internal_stress_summary.tex
```

The stress suite is controlled fixture evidence. It validates Dasha clustering
and reporting mechanics at the target scale, but it is not counted as live model
performance.

Run the offline non-SOF transfer smoke with:

```bash
python3 -m research.validation run --config research/fixtures/tiny_contract_config.json
```

This fixture checks doctrine-general mechanics on a contract-interpretation
source case. It is useful for guarding against SOF leakage in Frank/Karthic/Dasha
artifacts, but it is not a substitute for a live multi-model held-out doctrine
study.
