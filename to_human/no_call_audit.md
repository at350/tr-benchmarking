# No-Call Audit

- Status: `no_call_audit_passed_with_declared_gaps`
- Live calls made: `False`

| Check | Status | Notes |
|---|---:|---|
| Paper lint | `paper_lint_passed` | errors=0 |
| Secrets lint | `secrets_lint_passed` | findings=0 |
| Live preflight | `live_preflight_passed` | warnings=1; blocking_errors=0 |
| Run bundle | `run_bundle_reviewable` | checks=33; blocking_errors=0 |
| Readiness | `internal_method_ready_with_gaps` | gates=10/11; partial=1 |
| Review packet | `ready_for_internal_review_with_declared_gaps` | to_human/internal_review_packet.md, to_human/internal_review_packet.html, to_human/internal_review_packet.json |
| Claim ledger | `claim_ledger_ready` | counts={'supported': 11, 'partial': 1} |
| Handoff manifest | `handoff_manifest_ready` | artifacts=114; hash=cb8a6022189b9806 |

## Declared Gaps And Warnings

- preflight warning: Missing local credentials for: gemini
- partial claim: C11 The next live perturbation run is bounded and preflighted before model spending.
