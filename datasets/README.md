# datasets

| File | Rows | Used by | Notes |
|---|---|---|---|
| `supergpqa/SuperGPQA Law Data.csv` | 656 | `/api/dataset` (default), the `/database-view` page, and the six benchmark questions behind `runs/` | Law-discipline subset of [SuperGPQA](https://github.com/SuperGPQA/SuperGPQA), a graduate-level multiple-choice benchmark. Columns: `uuid, question, options, answer, answer_letter, discipline, field, subfield, difficulty, is_calculation` (`is_calculation` is a boolean string; 3 of 656 rows are `true`). |

## SuperGPQA: licence and attribution

The subset is redistributed under the [Open Data Commons Attribution License v1.0](https://opendatacommons.org/licenses/by/1-0/)
(ODC-BY), the licence declared by the upstream dataset. It permits any use, including redistribution,
as long as this notice and the attribution below travel with the data. The licence covers the
collection; it asserts no copyright over the individual questions.

> M-A-P Team et al., *SuperGPQA: Scaling LLM Evaluation across 285 Graduate Disciplines* (2025),
> arXiv:2502.14739. https://github.com/SuperGPQA/SuperGPQA

Cite the paper if you publish results on it. The six questions used for the saved benchmark runs
are listed with their `uuid` values in [runs/README.md](../runs/README.md).

## PRBench (removed)

A 500-task `legal` split of PRBench (`prbench/legal-data.csv`, 11 MB) and its harder companion
split were tracked until September 2026 and were removed because no page used them and to keep
the clone small. PRBench is published by Scale AI under the Creative Commons Attribution 4.0
licence (CC BY 4.0); the files remain in this repository's git history under those terms, with
this attribution. `/api/dataset?dataset=prbench` still serves the file if you download it from
the upstream dataset and place it at that path.
