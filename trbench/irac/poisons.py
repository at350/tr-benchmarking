"""Deliberately wrong IRAC answers used by ``trbench poison`` to check that clustering isolates them."""

POISONS = {
    "poison-nonsense": {
        "issue": "Whether the space aliens correctly abducted the cow from the farmland before the $10,000 check was printed.",
        "rule": "The intergalactic treaty of 1994 states that all cows are property of the mothership and cannot be sold for Earth dollars.",
        "application": "Because the woman attempted to sell the cow-adjacent land to a human man, the extraterrestrial police intervened and caused the check to bounce using mind beams.",
        "conclusion": "The trial court judge will be incorrect because the jurisdiction is actually Mars.",
    },
    "poison-wrong-standard": {
        "issue": "Whether the trial court judge should sustain the man's objection to the woman's testimony about the non-payment under the rule against perpetuities.",
        "rule": "The rule against perpetuities prevents property interests from vesting too far into the future, specifically stating that no interest is good unless it must vest, if at all, not later than twenty-one years after some life in being at the creation of the interest.",
        "application": "In this case, the woman is attempting to introduce evidence of non-payment. However, because the payment was meant to vest immediately upon the transfer of the 10-acre tract, and there are no validating lives that would cause the interest to violate the 21-year period, the rule against perpetuities is satisfied. The bounced check does not create a contingent remainder that violates this property rule.",
        "conclusion": "The trial court judge will be correct in sustaining the man's objection because the rule against perpetuities has not been violated.",
    },
    "poison-criminal-law": {
        "issue": "Whether the man is guilty of first-degree murder for giving the woman a bounced check for the farmland.",
        "rule": "First-degree murder requires the unlawful killing of a human being with malice aforethought, deliberation, and premeditation.",
        "application": "The man wrote a check for $10,000 that bounced due to insufficient funds. While this may constitute fraud or a bad check offense, there is no evidence that the man caused the death of the woman, let alone with malice aforethought or premeditation. A financial dispute over real estate does not meet the elements of homicide.",
        "conclusion": "The trial court judge will be correct, as the man cannot be convicted of murder for a bounced check.",
    },
}


def poison_records(question: str, copies: int):
    """``copies`` identical copies of each poison with distinct ids, so each can meet min_cluster_size."""
    records = []
    for index in range(copies):
        for label, response in POISONS.items():
            records.append({"model": label, "prompt": question, "response": dict(response),
                            "raw_text": "...", "id": f"{label}_{index}"})
    return records
