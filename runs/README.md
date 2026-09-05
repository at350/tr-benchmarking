# runs

Saved model answers (`*/responses/`) and clustering runs (`*/results/`) for the free-form and the
IRAC pipelines. The file formats are described in [docs/clustering.md](../docs/clustering.md).

## Where the questions come from

Every question behind the saved runs is an item from the law subset of SuperGPQA
(`datasets/supergpqa/SuperGPQA Law Data.csv`), reproduced with its original wording, typos included,
so the runs can be matched back to the dataset. SuperGPQA is distributed under the Open Data Commons
Attribution License v1.0; [datasets/README.md](../datasets/README.md) has the notice and citation.

| Question (abridged) | SuperGPQA `uuid` | Question file | Runs |
|---|---|---|---|
| Father's oral promise to pay the son's loans if he marries (Statute of Frauds, marriage provision) | `b4239f357e884644884ea0de712876ab` | `irac/questions/question_sofmarriage.txt` | `run_20260224_010918`, `run_20260303_160150`, `run_20260303_163604`, `run_20260301_101100`, `run_20260303_163035` |
| Farmland deed, bounced $10,000 check, parol evidence objection | `ce38c58aedb74a91a48456c0f8e1db69` | `irac/questions/question_farmland.txt` | `run_20260223_223143`, `run_20260223_233818`, `run_20260224_000751_poisoned`, `run_20260303_155256_poisoned` |
| Merchant's signed firm offer, later revocation (UCC 2-205) | `76808b7766eb4f65ba3f444b593fb332` | `irac/questions/question_q2.txt` | `run_20260224_005948` |
| Missing dog, posted reward, finder unaware of it | `1f5bb1ab224a4685ac5ef72f94942ac6` | `irac/questions/question_dog.txt` | `run_20260224_153911` |
| "If you will mow my lawn..." neighbour promise (offer and revocation) | `0cb1513a0cf9410eaefde6fa28a701da` | `irac/questions/question_lawn.txt` | `run_20260224_154905` |
| Couple shopping, injury in a department store (intentional infliction of emotional distress) | `d5efc0c8412d42a3a2995a8c1bc87744` | `irac/questions/question_iied.txt` | `run_20260224_001715`, `run_20260224_003329` |

The question files hold exactly what the models were shown. `question_q2.txt`, `question_dog.txt`, `question_lawn.txt`, `question_iied.txt` also include the item's multiple-choice options (the dataset's `options` column) after the question text; the others give the question alone.

The free-form runs under `free-form/` all use the marriage-provision question (first row); the
same question is the worked example in `rubric-automation/examples/statute_of_frauds_marriage.json`.
Every run file also carries its question in `metadata.question`.
