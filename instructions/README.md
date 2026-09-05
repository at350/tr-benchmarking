# Canonical Instructions

This directory is the single source of truth for the legal workflow instruction sets.

Subdirectories:
- `frank/`: Frank packet construction, core workflow files, doctrine packs, and dual-rubric protocol.
- `question-variance/`: Controlled question-variation routing, menus, provision packs, and confusion sets.
- `karthic/`: Karthic rubric-build canon, overlays, and thin executor prompt.
- `dasha/`: Dasha evaluation canon, case-citation verification, and centroid/Zak rules.
- `zak/`: Zak SME-review canon and thin executor prompt.

Consolidation rules:
- The app should load instructions only from this tree.
- ZIP bundles, duplicate snapshots, and superseded legacy instruction folders should not be used at runtime.
- `README_FLOW.md` inside `frank/` is the active file map for the Frank-side instruction family.

Which files the app loads:
- **Loaded at runtime** (by exact filename, from the registries in
  `frontend/src/lib/legal-workflow-v2-prompts.ts` and `question-variance-prompts.ts`):
  every numbered file in `frank/` except `14_`/`15_` and `54_`, all of `karthic/`,
  `dasha/`, and `zak/`, and `B00`–`B16` plus `B30`–`B36` in `question-variance/`.
  Renaming any of these requires updating the registry.
- **Reference only** (read by people, not by code): `README_FLOW.md`,
  `CORE_GUARDRAILS.md`, `00A_PACKET_SCHEMA_AND_ENUMS.md`, the surety worked
  examples `14_`/`15_`, the dual-rubric protocol `54_`, the worked benchmark
  examples `B20`–`B26`, and `LEGAL_AUTOEVAL_LIVE_DEMO_BLUEPRINT.md` (the live demo
  script, which `scripts/generate_live_demo_pdf.py` renders to PDF).
