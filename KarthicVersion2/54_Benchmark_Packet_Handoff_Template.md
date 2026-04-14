# Benchmark Packet Handoff Template

Use this as the explicit Frank -> Karthic handoff artifact.

## Purpose
This packet freezes the inputs Karthic should treat as anchors before rubric drafting begins. It also forces an explicit output-shell choice so prompt shape, benchmark answer shape, rubric design, and answer judging stay synchronized.

## Required fields

### 1. Packet identity
- packet_id:
- date_created:
- created_by:
- source_authority:
- source_type:

### 2. Routing and benchmark posture
- selected_pack:
- doctrine_family:
- benchmark_posture:
- variation_lane:
- source_grounded_vs_generalized:

### 3. Locked doctrinal path
- jurisdiction_assumption:
- likely_controlling_doctrine:
- required_gate_order:
- strongest_expected_counterargument:
- key jurisdiction-sensitive points:

### 4. Explicit output-shell choice
- output_shell:
  - `core_cross_pack_v1`
  - `legacy_father_son_v1`
  - `custom` (only if the custom shell is written out below)
- custom_output_shell_text:

### 5. Core benchmark inputs
- gold_answer_ref:
- doctrine_guide_or_pack_ref:
- failure_bank_ref:
- clustered_centroids_or_archetypes_ref:
- human_weight_overrides:

### 6. Packet readiness controls
- failure_bank_status:
- cluster_confidence_or_escalation_flag:
- packet_readiness:
- missing_or_uncertain_items:
- zak_review_needed_before_lock:

## Prefill audit statuses
Use exactly one status per required field:
- Fixed
- Fixed but jurisdiction-sensitive
- Needs human confirmation

## Recommended use order
1. Frank completes the packet.
2. A JD confirms routing, controlling doctrine, gate order, and output shell.
3. Karthic performs the prefill audit from this packet before drafting rows.
4. The workbook mirrors these fields on the `Prefill_Audit` sheet and passes locked weights into scoring and overlays.

## Minimal copyable checklist
- selected_pack
- doctrine_family
- jurisdiction_assumption
- benchmark_posture
- likely_controlling_doctrine
- required_gate_order
- output_shell
- strongest_expected_counterargument
- gold_answer_ref
- doctrine_guide_or_pack_ref
- failure_bank_ref
- variation_lane
- human_weight_overrides
- packet_readiness
