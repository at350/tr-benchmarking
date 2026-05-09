# Secret-Lint Protocol

## Purpose

The research branch contains live-model configuration, protocol-freeze manifests,
paper artifacts, and generated run summaries. Before sharing the branch with a
research team or promoting artifacts, the repo should have an executable guard
against accidentally committing API keys or provider tokens.

## Method

Run `python3 -m research.validation secrets-lint`. The scanner skips local env
files, virtual environments, build outputs, and dependency folders, then scans
shareable text files for likely provider keys and credential assignments.

## Success Criteria

- The current shareable repo files pass with no findings.
- A synthetic realistic API key fixture is flagged in tests.
- The command can emit JSON evidence for the research log.
