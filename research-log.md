# Research Log

## 2026-05-09

- Activated the `autoresearch-loop` heartbeat at a 20-minute interval for
  continued autonomous research progress in this thread.
- Reviewed `VISION.md`, current manuscript sections, live run summaries, and
  validation harness tests.
- Identified a Dasha doctrine-generality gap: LLM-signature clustering had a
  doctrine-general schema, but trigger bucketing still leaned on fixed
  Statute-of-Frauds fallback labels unless signatures matched directly.
- Implemented source-derived gate aliasing so Dasha can normalize reasoning
  signatures against Frank's detected gates for non-SOF doctrine packets.
- Added regression coverage for non-SOF contract-interpretation gate aliasing.
- Initialized autoresearch state files and literature tracking so future work
  can proceed from repo artifacts instead of chat history.
- Implemented repeat-aware LLM-as-judge scoring. Live judge configs now support
  `judge.repeats`, repeated row scores are aggregated, stability metrics are
  recorded, and unstable rows create Zak packets instead of being silently
  accepted.
- Added Dasha member/centroid coherence auditing. LLM-signature clusters now
  preserve normalized member keys, internal validation records coherence and
  mismatch counts, and mismatches can fail Dasha validation.
- Revalidated `research/runs/live_natural_response_batch` without new model
  calls. The internal validation summary and paper tables now report
  `member_coherence=1.0`, 9 checked Dasha members, and 0 mismatches.
- Added a non-SOF contract-interpretation transfer smoke fixture. Frank now
  emits generic `doctrine_gates` and omits `statute_of_frauds` when the source
  case is not SOF, Karthic can build a generic source-grounded rubric, and
  Dasha outcome normalization separates buyer-remedy and seller-limitation
  reasoning. The focused offline validation test passes.
- Fixed Zak low-margin escalation. The prior deterministic judge agreement
  calculation could not realistically fall below the configured threshold for
  ordinary top-vs-runner-up disputes. Agreement is now normalized by the maximum
  possible weighted score, and a new regression verifies that low-margin
  centroid scores produce a Zak packet.
- Added judge-panel support for LLM-as-judge validation. Live configs can now
  list multiple judge model identifiers with per-model repeat counts; the run
  records the panel and aggregates all row scores through the existing
  stability metrics. Added regression coverage for config loading and panel
  aggregation without live model calls.
- Added a protocol-freeze manifest command. The freeze artifact records config,
  source, instruction-context, model roster, judge-panel, quality-gate,
  perturbation, and normalization hashes without including API keys or generated
  model outputs. Added regression coverage for the freeze manifest.
- Checked the local manuscript build environment: `latexmk`, `pdflatex`,
  `xelatex`, and `tectonic` are unavailable. Added a static paper-lint command
  that verifies LaTeX inputs, figures, bibliography files, and citation keys.
  The current manuscript passes that lint, but a true PDF compile remains
  blocked until a TeX engine is available.
- Added a no-call live preflight command. It checks live-mode structure,
  protocol-freeze buildability, natural prompting, response roster diversity,
  LLM agent configuration, Dasha clustering settings, judge stability settings,
  source availability, perturbation policy, and local credential presence before
  any paid model call. The current multi-provider example passes structurally
  with warnings for disabled perturbations and missing local Gemini credentials.
- Enabled invariant and material perturbation tracks in the main live
  multi-provider example. Preflight now reports only the missing local Gemini
  credential warning for that config.
- Added Gemini credential alias support. The Gemini provider adapter and
  preflight now accept `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or
  `GOOGLE_GENERATIVE_AI_API_KEY`; the current local environment has none of
  those set.
- Added a method-readiness report command and generated
  `experiments/method-readiness/results/method_readiness.json` plus a Markdown
  analysis. The report maps current evidence to `VISION.md`; after the
  run-bundle integrity gate was promoted, the current report has 7 of 10 gates
  met, judge stability and live preflight marked partial, and live perturbation
  validation marked as the main evidence gap.
- Extended live preflight with no-call execution planning. The current
  multi-provider perturbation config now reports 3 planned question tracks, 30
  response calls, 30 Dasha signature calls, at least 9 judge calls, and 69 total
  LLM calls excluding Frank and Karthic before any model budget is spent.
- Added hard live-call budget caps to research configs and preflight. The main
  multi-provider perturbation config caps the current 69-call plan at 30
  response calls, 12 judge calls, and 80 total calls excluding Frank/Karthic;
  a regression verifies that lowering those caps blocks preflight.
- Added runtime live-budget enforcement in the pipeline runner. Even if a
  researcher skips preflight and calls `run` directly, an over-budget live config
  now raises before Frank or any other LLM-backed stage is invoked.
- Added `secrets-lint` for shareable research artifacts. The command scans repo
  code, configs, paper files, experiment notes, and promoted outputs for likely
  API keys or credential assignments while excluding local env files and
  dependency/build folders. The current repo passes, and a synthetic bad-key
  regression fails as expected.
- Added `review-pack`, a generated internal handoff packet under `to_human/`.
  It combines method readiness, live preflight, secret lint, and the bounded
  call plan into Markdown, HTML, and JSON so researchers see the current
  evidence and declared gaps without reading raw run artifacts first.
- Added `claim-ledger`, a generated paper-review ledger under `to_human/`.
  It maps manuscript claims to evidence artifacts and limitations. After
  run-bundle integrity was promoted, the current status is 9 supported claims
  and 3 partial claims: perturbation validation, judge stability, and
  credential-ready preflight.
- Added `no-call-audit`, a single local pre-review command. It runs paper lint,
  secret lint, live preflight, readiness, review-pack generation, and
  claim-ledger generation without model calls. The current result has zero
  blocking errors and five declared warnings or gaps.
- Added `handoff-manifest`, a checksum inventory for the researcher-facing
  handoff set. The manifest hashes paper sources, figures, fixtures, experiment
  reports, review artifacts, and validation code while excluding itself and
  no-call audit files to avoid circular hashes. The current manifest tracks 104
  artifacts.
- Added `bundle-audit`, a no-call integrity check for completed source-to-score
  run bundles. The live natural-response bundle passes 33 checks covering
  required artifacts, manifest hashes, response counts, natural-response
  metadata, Dasha member links, judge cluster coverage, rankings, and Zak packet
  presence. The consolidated no-call audit now runs this check as a pre-review
  gate.
- Promoted run-bundle integrity into the method-readiness and internal-review
  packets. Readiness now reports 7 of 10 gates met, with bundle integrity met,
  judge stability and live preflight partial, and live perturbation validation
  still the only evidence gap.
- Promoted run-bundle integrity into the claim ledger as its own supported
  claim. The ledger now tracks 12 claims: 9 supported and 3 partial.
- Hardened shareability lint so absolute local machine paths are blocking
  findings, not just API keys. Sanitized promoted run artifacts to repo-relative
  source/output paths and recomputed affected manifest hashes.
- Hardened paper lint into a manuscript hygiene gate. It now fails stale
  readiness counts, provider-routing names, absolute local paths, JD-review
  dependencies, and common Statute-of-Frauds typos in addition to unresolved
  LaTeX references.
- Added generation of `paper/tables/review_readiness.tex` from the
  method-readiness report. The no-call audit now refreshes that table from
  machine-readable gates so the manuscript cannot silently drift from the
  readiness artifact.
