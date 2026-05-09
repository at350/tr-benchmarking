# Contextual Dasha Canonical IDs

## Question

Can Dasha cluster legal reasoning without doctrine-specific deterministic legal
rules in the live path?

## Prediction

If Dasha emits canonical identifiers for doctrine, trigger, outcome, exception
or defense, primary reasoning, and material secondary paths, then the clustering
code can group exact identifiers while leaving the semantic legal judgment to
Dasha. The same mechanism should work for Statute of Frauds, contract
interpretation, administrative law, or any other area where Frank provides a
source packet and Dasha receives bounded instruction context.

## Method

1. Update the Dasha prompt to require:
   - `doctrine_id`
   - `rule_trigger_id`
   - `outcome_id`
   - `exception_or_defense_id`
   - `primary_reasoning_id`
   - `secondary_paths[].path_id`
2. Update clustering to prefer those agent-emitted ids.
3. Retain legacy keyword normalization only for archived/offline fixtures that
   lack canonical ids.
4. Add a non-SOF regression showing administrative-law signatures cluster by
   agent ids without SOF labels.
5. Rerun the live Anglemire Dasha signatures and Judge bundle before treating
   the active scored run as v5 contextual-id evidence.

