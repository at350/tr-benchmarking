"""Text cleaning and embedding helpers shared by every pipeline and command.

Progress and warnings go to stderr so that commands which emit JSON on stdout
(``trbench bridge``) are never corrupted.
"""
import os
import re
import sys
from typing import List, Optional

import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # surfaced as a clear error in get_embedding_model
    SentenceTransformer = None

DEFAULT_EMBEDDING_MODEL = "hkunlp/instructor-large"
EMBEDDING_DIM = 768

# Set LSH_MOCK_EMBEDDINGS=1 to use random vectors instead of a model (tests only).
MOCK_EMBEDDINGS = os.getenv("LSH_MOCK_EMBEDDINGS", "").strip().lower() in {"1", "true", "yes"}

_EMBEDDING_MODEL = None
_EMBEDDING_NAME: Optional[str] = None


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def clean_text(text: Optional[str]) -> str:
    """Strip whitespace, collapse runs of spaces, and drop leading "As an AI..." boilerplate."""
    if not isinstance(text, str):
        return ""
    text = text.strip()
    text = re.sub(r"^(As an AI|I am an AI)[^.]*\.", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def get_embedding_model(model_name: str = DEFAULT_EMBEDDING_MODEL):
    """Load (once) and return the sentence-transformers model. Raises if it cannot be loaded."""
    global _EMBEDDING_MODEL, _EMBEDDING_NAME
    if SentenceTransformer is None:
        raise RuntimeError(
            "sentence-transformers is not installed. Run `pip install -e .` "
            "(or set LSH_MOCK_EMBEDDINGS=1 for a test run with random vectors)."
        )
    if _EMBEDDING_MODEL is None or _EMBEDDING_NAME != model_name:
        _log(f"Loading embedding model: {model_name}...")
        try:
            _EMBEDDING_MODEL = SentenceTransformer(model_name)
        except Exception as exc:
            raise RuntimeError(f"Could not load embedding model {model_name!r}: {exc}") from exc
        _EMBEDDING_NAME = model_name
    return _EMBEDDING_MODEL


def encode_responses(
    texts: List[str],
    model_name: str = DEFAULT_EMBEDDING_MODEL,
    instruction: Optional[str] = None,
) -> np.ndarray:
    """Encode texts into dense vectors.

    Instruction-tuned models (hkunlp/instructor-*) take ``[instruction, text]`` pairs; if the
    installed wrapper rejects pairs, the instruction is prepended to the text instead. Other
    models get the instruction prepended, or the raw text when no instruction is given.
    """
    if MOCK_EMBEDDINGS:
        _log("LSH_MOCK_EMBEDDINGS is set: using random embeddings.")
        return np.random.default_rng(0).standard_normal((len(texts), EMBEDDING_DIM))

    model = get_embedding_model(model_name)
    if instruction and "instructor" in model_name.lower():
        _log(f"Encoding with instruction: {instruction!r}")
        try:
            return model.encode([[instruction, text] for text in texts])
        except Exception:
            return model.encode([f"{instruction} {text}" for text in texts])
    if instruction:
        return model.encode([f"{instruction} {text}" for text in texts])
    return model.encode(texts)
