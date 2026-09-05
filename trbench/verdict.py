"""Keyword heuristic that reads a yes/no verdict off the opening of a legal answer.

Used for colouring figures and flagging clusters whose members disagree. It is crude
by design (it looks at the first 300 characters) and is never used to score models.
"""
import re

NO_PATTERNS = (
    "not enforceable", "unenforceable", "probably not", "likely not",
    "unlikely", "no, the", "no. the", "no the", "short answer: no", "answer: no",
)
YES_PATTERNS = (
    "is enforceable", "are enforceable", "likely enforceable",
    "probably yes", "likely yes", "very likely yes", "short answer: yes",
    "answer: yes", "potentially enforceable", "may be enforceable",
)


def verdict_hint(text: str) -> str:
    """Return "YES", "NO", or "AMBIGUOUS" for the opening of an answer."""
    clean = " ".join(re.sub(r"[*_]", "", (text or "")[:300]).split()).lower()
    if any(p in clean for p in NO_PATTERNS):
        return "NO"
    if any(p in clean for p in YES_PATTERNS):
        return "YES"
    return "AMBIGUOUS"
