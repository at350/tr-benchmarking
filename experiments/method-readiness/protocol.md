# Method Readiness Report

## Question

Can the repository produce a single auditable report that maps the current
pipeline evidence to the gates in `VISION.md` without overstating live evidence?

## Prediction

The report should mark the current live natural-response run as internally
useful but incomplete. Frank, Karthic, natural response generation, Dasha
clustering, Zak packet plumbing, and controlled stress evidence should be met.
Live perturbation evidence should remain an evidence gap. Judge scoring should
be partial when the live run was not repeated or panel-judged. Live preflight
should be partial while credential warnings remain.

## Method

Add a no-call `readiness` command that reads a completed run bundle, optional
live config preflight, and optional deterministic stress artifacts. The command
emits JSON and Markdown, using the stricter research interpretation rather than
raw engineering pass/fail alone.

## Success Criteria

- The command is covered by a unit test.
- The generated report distinguishes `met`, `partial`, and `evidence_gap`.
- The report identifies the live perturbation run as the main missing evidence.
- The report does not claim publication readiness.
