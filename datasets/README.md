# datasets

| File | Rows | Used by | Notes |
|---|---|---|---|
| `supergpqa/SuperGPQA Law Data.csv` | 656 | `/api/dataset` (default) and the `/database-view` page | Law-discipline subset of [SuperGPQA](https://github.com/SuperGPQA/SuperGPQA), a graduate-level multiple-choice benchmark. Columns: `uuid, question, options, answer, answer_letter, discipline, field, subfield, difficulty` plus derived `num_options` and `law_system`. |

A 500-task PRBench legal split (`prbench/legal-data.csv`, 11 MB) and its harder companion were tracked until September 2026. They were removed because their redistribution terms were not documented and no page used them; `/api/dataset?dataset=prbench` still serves the file if you place it at that path yourself. Both remain in git history.

The SuperGPQA subset is redistributed for research use; see the upstream project for its licence and cite it if you publish results.
