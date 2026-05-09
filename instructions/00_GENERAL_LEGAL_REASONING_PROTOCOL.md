# General Legal Reasoning Pipeline Protocol

STATUS: ACTIVE CROSS-AGENT CANON

This file controls whenever the research pipeline is run on a new source case.
Statute of Frauds is the first calibration domain, not the global assumption.
The agents must infer the relevant doctrine from the source case, uploaded
authority, and active instruction context.

## Cross-Agent Rule

Do not hard-code Statute of Frauds labels, gates, outcomes, or rubrics into the
live agent workflow. Use Statute of Frauds packs only when the source case
actually supports a Statute of Frauds or writing-requirement issue.

If the source points to another legal doctrine, the agents must keep the same
pipeline structure while adapting the substantive content:

- Frank identifies the doctrine, controlling issue, source-supported facts,
  neutral question, gold answer, and legally meaningful variations.
- Karthic builds a fresh source-grounded rubric from the locked Frank packet.
- Dasha clusters model responses by normalized legal reasoning, not by surface
  words or preselected SOF labels.
- Judge applies the Karthic rubric row by row to cluster representatives.
- Zak creates escalation packets only when uncertainty, disagreement, or stage
  failure requires review.

## Source Authority Rule

The source case and provided authority control legal substance. Existing
doctrine packs are routing and drafting aids. If no pack fits, the agent should:

1. infer the doctrine from the source;
2. state source limits explicitly;
3. avoid importing unsupported SOF-specific concepts;
4. create doctrine-neutral gates/elements using the same packet schema;
5. flag any missing context that prevents a stable benchmark.

## Output Schema Rule

The schema can remain stable even when doctrine changes. Terms like
`doctrine_gates`, `primary_gate_id`, `rule_trigger`, and `exception_or_defense`
mean the controlling legal elements or decision points for the source-supported
doctrine. They are not Statute of Frauds-only fields.

## Variation Rule

Variations should change legally meaningful facts for the detected doctrine. For
Statute of Frauds, that may include timing, writing, party role, or transaction
type. For other doctrines, variation facts should target the doctrine's own
elements, defenses, exceptions, standards, or burden-shifting points.

## Escalation Rule

If the source is too thin, jurisdiction-specific, procedurally tangled, or
unsupported by the available instructions, the correct action is to preserve the
uncertainty and create an escalation packet. Do not fill the gap by forcing SOF
or any other familiar doctrine.
