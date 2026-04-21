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
- `README_FLOW.md.rtf` inside `frank/` is the active file map for the Frank-side instruction family.
