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
- Identified a blocking Frank failure from live review: an abstract Statute of
  Frauds prompt was being sent to Dasha without a complete legal scenario. Added
  scenario-quality gates and LLM Frank question repair so neutral and variation
  questions must be self-contained law-school-style hypotheticals with concrete
  parties, timing, writing/certificate facts, a later dispute, and a neutral
  call question.
- Reran the live replicate-roster batch after the Frank repair. The new Frank
  packet passed quality checks with a 180-word neutral scenario and a 199-word
  signed-writing material variation. The run produced 60 natural responses
  across ten actual model identifiers and three perturbation tracks, then
  checkpointed all 60 Dasha reasoning signatures and Dasha clusters.
- Stopped the run before judge scoring continued, because the immediate
  research question was whether Frank and Dasha were now valid. Saved Dasha
  audit artifacts show 41 track-aware clusters, member coherence 1.0, no
  mixed-reasoning clusters, invariant answer-bucket preservation, and material
  outcome shift from later-beneficiaries-control to wife-certificate-controls.
- Hardened perturbation validation to compare normalized answer buckets for
  invariant/material checks instead of literal long-form reasoning prose, while
  keeping full Dasha cluster keys available for separate reasoning audits.
- Reclassified the compact Anglemire-derived `tiny_source_case.txt` as an
  offline smoke fixture, not a claim-supporting source input. Added source-case
  metadata sidecars and changed all live configs to use the real court-case PDF
  `cases/MarriageSoF_Anglemire v Policemens Benev Assn of Chicago.pdf`.
- Added PDF source extraction and provenance recording. Protocol freeze,
  preflight, run manifests, and Frank source packets now record source metadata,
  original PDF hash, extracted-text hash, format, case id, citation, court,
  jurisdiction, and limitations. Live preflight now checks that source metadata
  is present and complete before a run can be treated as ready.
- Ran the smaller full live source-to-score pipeline on the real Anglemire PDF.
  The run completed with `internal_validation_ready`: 9 natural responses, 5
  Dasha clusters, 11 Karthic rubric rows, 55 repeated judge row scores, 3 model
  rankings, and 1 Zak escalation packet. No-call audit now reports 10 of 11
  readiness gates met; the remaining gap is live perturbation validation on the
  real court-case source.
- Ran the full real Anglemire perturbation-aware live roster from the court-case
  PDF. The first attempt generated 60 natural responses across ten model
  identifiers and three tracks, but Dasha overfragmented enough to exceed the
  judge budget. Added a runtime judge-budget guard, explicit Frank invariant
  perturbation normalization, and a coarser Dasha reasoning-family normalizer so
  the method fixes overfragmentation rather than spending through it.
- Completed the resumed live roster source-to-score run from the saved Frank,
  Karthic, response, and Dasha-signature checkpoints. The earlier final bundle
  had 15 track-aware Dasha clusters; this has since been superseded by the
  multi-path Dasha bundle below.
- Regenerated internal validation tables, method readiness, no-call audit,
  claim ledger, review packet, handoff manifest, and paper tables from the
  completed live roster bundle. The method-readiness report now marks 11 of 11
  internal gates met, and the claim ledger marks all 12 tracked manuscript
  claims supported for internal pre-expert-review.
- Responded to the multi-gate Dasha critique by adding primary/secondary path
  extraction. Dasha now asks for `primary_reasoning_path` plus structured
  `secondary_paths`; normalization records the full secondary-path audit profile
  and uses only accepted or uncertain non-primary paths in the grouping key.
  Regenerated Dasha signatures for the 60 saved Anglemire natural responses
  using the new prompt. The naive full-secondary-profile key produced 49
  clusters, confirming overfragmentation. A negative-language bug then surfaced:
  Dasha treated `unenforceable` as an enforceability signal and `lacks a signed
  writing` as signed-writing compliance. Fixed the bucket rules and reran the
  full source-to-score pipeline. Final bundle: `internal_validation_ready`, 60
  natural responses, 22 track-aware multi-path Dasha clusters, perturbation
  validation passed, 44 panel judge calls, 220 final row-level scores, 11
  adjudicated clusters, 60 projected member scores, 10 model rankings, and 1
  Zak packet. Added regression tests and documented the experiment under
  `experiments/multipath-dasha/`.
- Responded to the determinism critique by changing the primary Dasha live
  signature contract from prose buckets plus SOF fallback rules to
  agent-emitted canonical ids: `doctrine_id`, `rule_trigger_id`, `outcome_id`,
  `exception_or_defense_id`, and `primary_reasoning_id`. The deterministic code
  now groups those ids exactly and leaves legal classification to Dasha. Added a
  non-SOF administrative-law regression proving that Dasha can cluster by
  agent-provided doctrine-general ids without SOF keyword rules. Legacy keyword
  normalization remains only for archived/offline fixtures without canonical
  ids.
