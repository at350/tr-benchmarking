# Method Readiness Report

- Status: `internal_method_ready_with_gaps`
- Run: `live_natural_response_batch`
- Gates met: 9 / 11
- Partial gates: 1

| Gate | Status | Evidence | Remaining gap |
|---|---:|---|---|
| Claim-supporting source provenance | `met` | run_source=cases/MarriageSoF_Anglemire v Policemens Benev Assn of Chicago.pdf; protocol_source=cases/MarriageSoF_Anglemire v Policemens Benev Assn of Chicago.pdf; case_id=anglemire_v_policemens_benev_assn_chicago_1939; source_type=real reported court case PDF |  |
| Frank source-to-packet validity | `met` | doctrine=Statute of Frauds — agreements made upon consideration of marriage (other than the mutual promise to marry); effect on oral promise to name spouse as beneficiary / settle property; question_chars=1512; variations=1 | Run Frank on held-out source cases before broad external-validity claims. |
| Karthic dynamic rubric validity | `met` | rows=11; categories=conclusion,counterargument,doctrine,exceptions,facts,rule,source_support,variation | Add held-out rubric artifact review and later expert agreement. |
| Natural response protocol | `met` | response_prompt_style=natural; responses=9; models=3 | Live model rosters should use question-only prompting by default. |
| Run bundle integrity | `met` | bundle_status=run_bundle_reviewable; checks=33; blocking_errors=0; responses=9; clusters=5 | Regenerate bundle audit after any claim-supporting run or artifact rewrite. |
| Dasha natural-response clustering | `met` | responses=9; clusters=5; min_observed_clusters=2; cluster_purity=1.0; member_coherence=1.0; mean_centroid_text_similarity=0.701; non_latin_signal_flags=0; natural_audit=natural_response_audit_passed; observed_clusters=5 | Run larger natural batches across more model families and held-out questions. |
| Perturbation validation | `evidence_gap` | perturbation_report=not_configured | Run invariant and material perturbation tracks with live model responses. |
| Judge row-level scoring and rankings | `met` | judge_model=gpt-5.2; judge_panel=1; row_scores=55; agreement_score=0.28; stability=stable; judge_repeats=2; model_rankings=3 | Quantify live repeat or panel stability before stronger reliability claims. |
| Zak escalation mechanism | `met` | needs_zak=True; packets=1 | Calibrate live escalation thresholds with repeated judge evidence. |
| Controlled scale regression | `met` | stress_status=internal_stress_passed; stress_responses=500; stress_macro_f1=1.0 | Keep this separated from live discovery evidence. |
| Live-run preflight | `partial` | preflight_status=live_preflight_passed; warnings=1; blocking_errors=0 | Resolve credential warnings before claim-supporting paid live runs. |

This report is an internal readiness artifact. It distinguishes implemented and tested method components from live-evidence gaps.
