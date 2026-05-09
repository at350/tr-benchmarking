# H1: Source-Derived Gate Aliasing For Dasha

Status: EXPLORATORY. This protocol records a change identified during an audit,
not a pre-registered confirmatory experiment.

## Hypothesis

If Dasha receives Frank's detected doctrine gates, it can cluster non-SOF
responses by source-derived legal gates rather than by hard-coded
Statute-of-Frauds labels or exact signature strings.

## Prediction

For a contract-interpretation packet with gates such as `plain_meaning` and
`contra_proferentem`, two paraphrased signatures using ordinary-meaning language
should bucket together, while a response using ambiguity-against-drafter
reasoning should remain separate.

## Measurement

- Unit-level cluster assignment on three synthetic non-SOF signatures.
- Expected clusters: `{r1, r2}` for plain meaning and `{r3}` for contra
  proferentem.
- The Dasha cluster artifact should record that source gate aliases were used.

## Risk

This is not enough to prove broad doctrine transfer. It only closes a concrete
implementation gap and gives the next live non-SOF run a more doctrine-general
normalization path.
