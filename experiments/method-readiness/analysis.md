# Method Readiness Report

- Status: `internal_method_ready_with_gaps`
- Run: `live_natural_response_batch`
- Gates met: 7 / 10
- Partial gates: 2

| Gate | Status | Evidence | Remaining gap |
|---|---:|---|---|
| Frank source-to-packet validity | `met` | doctrine=Statute of Frauds (marriage provision) applied to a premarital promise to make/keep a spouse as beneficiary of a fraternal benefit certificate; interaction with fraternal benefit association certificate rules and change-of-beneficiary procedures; question_chars=600; variations=4 | Run Frank on held-out source cases before broad external-validity claims. |
| Karthic dynamic rubric validity | `met` | rows=10; categories=conclusion,counterargument,doctrine,exceptions,facts,rule,source_support,variation | Add held-out rubric artifact review and later expert agreement. |
| Natural response protocol | `met` | response_prompt_style=natural; responses=9; models=3 | Live model rosters should use question-only prompting by default. |
| Run bundle integrity | `met` | bundle_status=run_bundle_reviewable; checks=33; blocking_errors=0; responses=9; clusters=3 | Regenerate bundle audit after any claim-supporting run or artifact rewrite. |
| Dasha natural-response clustering | `met` | responses=9; clusters=3; min_observed_clusters=2; cluster_purity=1.0; member_coherence=1.0; mean_centroid_text_similarity=0.755; non_latin_signal_flags=0; natural_audit=natural_response_audit_passed; observed_clusters=3 | Run larger natural batches across more model families and held-out questions. |
| Perturbation validation | `evidence_gap` | perturbation_report=not_configured | Run invariant and material perturbation tracks with live model responses. |
| Judge row-level scoring and rankings | `partial` | judge_model=gpt-5.2; judge_panel=1; row_scores=30; agreement_score=0.755; stability=not_repeated; judge_repeats=1; model_rankings=3 | Quantify live repeat or panel stability before stronger reliability claims. |
| Zak escalation mechanism | `met` | needs_zak=False; packets=0 | Calibrate live escalation thresholds with repeated judge evidence. |
| Controlled scale regression | `met` | stress_status=internal_stress_passed; stress_responses=500; stress_macro_f1=1.0 | Keep this separated from live discovery evidence. |
| Live-run preflight | `partial` | preflight_status=live_preflight_passed; warnings=1; blocking_errors=0 | Resolve credential warnings before claim-supporting paid live runs. |

This report is an internal readiness artifact. It distinguishes implemented and tested method components from live-evidence gaps.
