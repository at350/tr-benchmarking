# datasets

| File | Rows | Used by | Notes |
|---|---|---|---|
| `supergpqa/SuperGPQA Law Data.csv` | 656 | `/api/dataset` (default) and the `/database-view` page | Law-discipline subset of [SuperGPQA](https://github.com/SuperGPQA/SuperGPQA), a graduate-level multiple-choice benchmark. Columns: `uuid, question, options, answer, answer_letter, discipline, field, subfield, difficulty` plus derived `num_options` and `law_system`. |
| `prbench/legal-data.csv` | 500 | `/api/dataset?dataset=prbench` | Multi-turn legal tasks with an expert rubric and scratchpad per task (`task, turns, field, topic, expert, scratchpad, rubric, prompt_i, response_i`). Not surfaced in the UI yet. |
| `prbench/legal-data-hard.csv` | — | nothing in this repository | Harder split of the same source, kept for future extended runs. |

Both datasets are redistributed here for research use only; see the upstream
projects for their licence terms and cite them if you publish results.
