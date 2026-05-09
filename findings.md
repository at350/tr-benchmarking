# Findings

## Current Understanding

The strongest current contribution is the source-to-score architecture: Frank
creates a source-grounded benchmark packet, Karthic creates a fresh rubric from
that locked packet, response models answer the generated question naturally,
Dasha clusters the resulting responses by legal reasoning, Judge scores cluster
centroids against rubric rows, and Zak records escalation state.

The present evidence supports an internal, pre-expert-review claim on one
Statute-of-Frauds case. The live natural-response run produced nine answers from
three model identifiers and three Dasha clusters. The deterministic 500-response
stress run is useful software evidence for clustering/projection mechanics, but
it is not discovery evidence because those fixture responses are controlled.
The perturbation smoke path is implemented and tested, but still needs a live
multi-model perturbation run before the paper should claim real model
sensitivity to invariant versus material legal edits.

## Patterns And Insights

The paper and code must keep three evidence types separate:

- Live natural-response discovery evidence: models answer without hidden labels
  or forced headings, and Dasha clusters after the fact.
- Controlled regression evidence: synthetic or fixture responses test scale,
  bookkeeping, projection, and table generation.
- Legal-methodological assessment: researchers inspect whether Frank, Karthic,
  Dasha, Judge, and Zak artifacts are legally coherent and source-grounded.

Dasha should not depend on Statute-of-Frauds labels as the only clustering
ontology. The better design is to let Frank expose source-derived gates and let
Dasha normalize signatures against those gates. The remaining SOF-specific
fallback code is acceptable only for offline fixtures and calibration, not as
the general live method.

Dasha cluster validity should be measured at the member level. The run bundle
now preserves each member's normalized signature key and each cluster's centroid
key, and the validation layer records member/centroid coherence. This turns the
claim "members belong with their centroid" into an auditable artifact rather
than an informal visual inspection.

The existing live natural-response run has now been revalidated with the
member/centroid audit logic. It checks nine clustered members across three
clusters, finds zero mismatches, and reports member/centroid coherence of 1.0.
Because this was a revalidation of a saved run, the summary and paper tables are
updated without new model calls; the stored `dasha_clusters.json` itself should
be regenerated in a future live run if the project needs normalized member keys
inside the cluster artifact, not only in the validation summary.

The first non-SOF transfer smoke is now executable. A tiny contract-
interpretation source case generates a Frank packet with contract-interpretation
gates rather than a `statute_of_frauds` artifact, Karthic emits a generic legal
rubric, and Dasha separates plain-meaning, contra-proferentem, and seller-
limitation reasoning. This is narrow schema-transfer evidence only: it shows the
pipeline can avoid SOF-specific artifacts on a held-out doctrine fixture, but it
does not replace a larger live doctrine-transfer run.

Perturbation testing is best framed as a legal metamorphic test: invariant
source edits should preserve the answer path, and material edits should change
the answer path when doctrine requires it. This gives the pipeline a stronger
validity argument than a single static question.

Judge stability must be treated as a measured artifact, not an assumption. The
pipeline now supports repeated LLM-as-judge calls, aggregates row scores across
repeats, records pairwise MAE and weighted kappa, and escalates rows whose scores
vary by two or more points. This does not yet prove live judge reliability
because the repeated live run has not been executed, but the method now has the
right artifact surface for that evidence.

The judge path now also supports model panels, not just repeated calls to one
judge model. A config can list multiple judge model identifiers with per-model
repeat counts; the run records the panel composition and aggregates all row
scores through the same stability metrics. This is still offline-verified
machinery until a live panel run is executed, but it closes an implementation
gap for ensemble LLM-as-judge validation.

The reproducibility story now has an executable freeze artifact. Before a run is
treated as claim-supporting, the pipeline can write a protocol-freeze manifest
containing the config hash, source hash, instruction-context hashes, response
model roster, clustering settings, judge panel, quality gates, perturbation
policy, normalization versions, and protocol hash. The manifest excludes API
keys and generated outputs, so it can be shared with researchers as provenance
metadata without exposing credentials.

This machine does not have `latexmk`, `pdflatex`, `xelatex`, or `tectonic`, so
the paper still cannot be honestly reported as PDF-compiled here. To reduce that
risk, the repo now has a static manuscript linter that verifies all LaTeX
inputs, figure paths, bibliography files, and citation keys resolve. It now
also blocks stale readiness counts, provider-routing names in the manuscript,
absolute local paths, JD-review dependencies, and common Statute-of-Frauds
typos. It passes on the current manuscript and should be run until a full TeX
environment is available.

The live-run path now has a no-call preflight gate. It checks that a proposed
live config is live-capable, uses natural response prompting, has enough model
diversity and samples, uses LLM Frank/Karthic/Dasha agents, uses
reasoning-signature Dasha clustering, requires multiple observed clusters,
configures judge repeats or a judge panel, can build a protocol freeze, and can
see the source case. It reports local credential and perturbation-policy
warnings before any API call is made. The current multi-provider example now
enables invariant and material perturbation tracks and passes structurally; the
only remaining warning is that no local Gemini credential alias is present. The
Gemini adapter and preflight now accept `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or
`GOOGLE_GENERATIVE_AI_API_KEY`, so researchers can use the common Google API-key
environment names without editing the pipeline.

The preflight now includes an execution-plan estimate, which matters because
perturbation validation multiplies the live budget. The current multi-provider
example plans three question tracks, 30 natural response calls, 30 Dasha
signature-extraction calls, and at least nine judge calls, or 69 LLM calls
excluding Frank and Karthic. This makes the cost of closing the live
perturbation evidence gap explicit before any provider call is made.

The live config now also carries explicit budget caps. Preflight blocks runs
whose planned response calls, minimum judge calls, or total planned LLM calls
exceed those caps. The current multi-provider perturbation example is capped at
30 response calls, 12 judge calls, and 80 total calls excluding Frank and
Karthic; its 69-call plan passes those caps. A regression test lowers the caps
and verifies that preflight becomes a blocking failure.

Budget enforcement is now duplicated at the pipeline-entry point. If someone
skips preflight and calls `run` directly with an over-budget live config, the
pipeline computes the same plan and raises before invoking Frank or any other
LLM-backed stage. This closes the main cost-control loophole in the execution
path.

The branch now has a shareability-focused secret lint. It scans research code,
configs, paper files, experiment notes, and promoted artifacts for likely API
keys or credential assignments while excluding local env files, dependency
folders, virtual environments, and build outputs. The current shareable repo
passes, and a regression confirms that a realistic synthetic API key is flagged.
The lint now also treats absolute local machine paths as blocking shareability
findings. Existing promoted run artifacts were sanitized to use repo-relative
paths, and the affected manifest hashes were recomputed.

The human review surface is now generated from machine-readable evidence. The
internal review packet combines method readiness, live preflight, secret lint,
and the bounded call plan into Markdown, HTML, and JSON under `to_human/`. It
states the current branch is ready for internal review with declared gaps, not
publication-ready: seven of ten gates are met, judge scoring and live preflight
are partial, run-bundle integrity is met, and live perturbation validation
remains the evidence gap.

The manuscript now has a generated claim ledger. It maps 12 review claims to
specific evidence artifacts, statuses, and limitations. The current ledger has
nine supported claims and three partial claims. The partial claims are exactly
the known limits: live perturbation validation has not run, live judge stability
has not been measured with repeats or a panel, and preflight still carries the
local Gemini credential warning. Run-bundle integrity is now a supported claim
rather than being buried inside the general pipeline-run claim.

The no-call audit now provides a single pre-review command. It runs paper lint,
secret lint, live preflight, run-bundle integrity, method readiness,
review-pack generation, and claim-ledger generation without invoking any model.
The current audit has no blocking errors and five declared warnings or gaps:
the Gemini credential warning, the live perturbation evidence gap, and the three
partial claims in the claim ledger.

The saved live run now has a dedicated bundle-integrity audit. It verifies that
the source-to-score run contains all required artifacts, that JSON artifacts
parse, that Frank/Karthic/Dasha/Judge/Zak artifacts match the manifest hashes,
that the response count matches the configured model sample plan, that natural
response metadata is preserved, that Dasha member ids resolve to `responses.json`,
and that Judge and Zak artifacts have the expected review surfaces. The current
live bundle passes 33 checks with zero blocking errors. This is not new legal
validity evidence, but it makes the case-study evidence more reproducible and
harder to accidentally desynchronize.

Run-bundle integrity is now part of the main readiness surface rather than a
side report. The method-readiness report now counts it as a met gate, so the
current evidence is 7 of 10 gates met, with judge stability and live preflight
partial and live perturbation validation as the only evidence gap. The internal
review packet also exposes the bundle audit directly.

The manuscript review-readiness table is now generated from
`method_readiness.json`. This removes another manual synchronization point: when
the readiness gates change, the no-call audit regenerates the paper table from
the same machine-readable evidence used by the review packet and claim ledger.

The handoff now has a checksum manifest. `to_human/handoff_manifest.json` hashes
the researcher-facing paper sources, figures, fixtures, experiment reports,
review artifacts, and research validation code so reviewers can detect drift
between the manuscript, evidence, and implementation. It deliberately excludes
itself and no-call audit files to avoid circular hashes. The current manifest
tracks 104 artifacts.

The current evidence is now summarized by an executable method-readiness report
rather than only by manuscript prose. The report maps the saved live
natural-response run, live multi-provider preflight, and deterministic stress
run onto the gates in `VISION.md`. It marks seven of ten gates as met, treats
live judge scoring as partial because the saved live run was not repeated or
panel-judged, treats preflight as partial because a Gemini credential warning
remains, and keeps live perturbation validation as an evidence gap. This is a
more honest internal-review artifact than a binary "ready/not ready" label.

Zak escalation had an important engineering defect: the deterministic agreement
score added the configured threshold to the top-vs-runner-up margin, which made
ordinary low-margin cluster disputes almost impossible to escalate. The scoring
path now normalizes the margin by the maximum possible weighted score and tests
that low-margin centroid scores create a Zak packet. Positive escalation is
therefore implemented for offline regression, but live escalation thresholds
still need calibration with repeated judge runs.

## Lessons And Constraints

- Do not report engineering iteration as the research method.
- Do not count the 500-response controlled fixture as evidence that Dasha
  discovered natural model reasoning families.
- Do not expose provider names as research objects in the manuscript; actual
  model identifiers and outputs matter.
- Do not force benchmarked response models into structured legal headings under
  the natural-response protocol.
- Do not treat an empty Zak packet as the only success case; the system must
  also prove that low confidence and unstable judge rows create packets.
- Keep generated run outputs ignored unless promoted intentionally as curated
  fixtures or paper tables.
- Freeze the selected config before running any new claim-supporting live batch.
- Run live preflight before spending model budget; treat warnings as explicit
  run-design decisions, not as invisible assumptions.
- Keep live-call budget caps in frozen configs so perturbation validation cannot
  silently expand into an unintended paid run.
- Treat runtime budget enforcement as a required backstop, not only a preflight
  convenience.
- Run secret lint before sharing the branch, exporting research bundles, or
  promoting generated outputs.
- Do not let generated evidence artifacts contain absolute local machine paths;
  use repo-relative paths in manifests and human-facing reports.
- Regenerate the internal review packet after readiness, preflight, or security
  artifacts change so the human-facing handoff does not drift from the evidence.
- Keep the claim ledger synchronized with manuscript edits so paper claims can
  be audited against artifacts instead of prose alone.
- Run the bundle-integrity audit after generating or revalidating a run bundle
  so stale hashes, missing artifacts, or broken cross-links are caught before
  review.
- Use the no-call audit as the final local gate before sharing the branch or
  asking researchers to review the manuscript.
- Regenerate the handoff manifest before sharing an internal review packet so
  reviewers can verify the exact artifact set they received.
- Run the method-readiness report after each claim-supporting run and preserve
  its `met`, `partial`, and `evidence_gap` distinctions in the manuscript.
- Generate the review-readiness paper table from the method-readiness report;
  do not hand-edit readiness gate counts in the manuscript.
- Use paper lint as the local manuscript build guard until a TeX engine is
  installed; do not call it a compiled PDF.
- Treat paper lint as a manuscript hygiene gate too: stale readiness counts,
  provider-routing names, local paths, JD-review dependencies, and SOF typos
  should fail before internal review.
- Citation entries must be verified from primary or stable scholarly sources
  before they are added to the paper.
- Revalidation can enrich paper tables and validation summaries without new
  model calls, but it cannot backfill every field into the original generated
  cluster artifact.

## Open Questions

- How stable are row-level judge scores under actual repeated live calls,
  model-separated judges, or small prompt perturbations?
- What live agreement and row-instability thresholds produce useful Zak packets
  without over-escalating routine close calls?
- How well does Dasha preserve member/centroid coherence when the response set
  grows from 9 natural responses to tens or hundreds of natural responses?
- Which live non-SOF source cases should follow the contract-interpretation
  smoke test for stronger doctrine-transfer validation?
- What are the minimum internal thresholds for judge repeat agreement,
  centroid/member feature agreement, and perturbation divergence before the
  manuscript should claim readiness for external review?
