# legal-workflow-data

Runtime state for the frontend's four-stage workflow, stored as plain JSON so
runs can be inspected and diffed. The folders here are also the demo fixtures:
a fresh clone has 23 packets, 12 rubric packs, 10 judged runs, and 3 expert
reviews to browse before any API key is configured.

| Folder | Written by | Contents |
|---|---|---|
| `frank-v2-packets/` | Intake stage (Frank) | Locked benchmark packets: routing, extraction sheet, gold answer, reverse-engineered question |
| `karthic-v2-rubric-packs/` | Rubric stage (Karthic) | Approved modular rubrics with weights, anchors, and failure labels |
| `dasha-v2-runs/` | Judge stage (Dasha) | Model answers, clusters, per-row and per-module scores from the judge panel |
| `zak-v1-reviews/` | Review stage (Zak) | Expert-escalation packets and decision records |
| `artifacts-v2/` | Intake stage | Uploaded source documents (PDF) and their extracted text, one folder per packet |

Paths inside packets (`storedPath`, `extractedTextPath`) are relative to the
repository root. `tmp/` is scratch and is gitignored. Commit new
records here only if they are meant to ship as examples.
