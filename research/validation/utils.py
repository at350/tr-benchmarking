"""Small shared helpers for validation runs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def stable_hash(value: Any) -> str:
    """Return a short content hash for provenance and prompt/version tracking."""

    if isinstance(value, str):
        payload = value.encode("utf-8")
    else:
        payload = json.dumps(value, sort_keys=True, ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    except FileNotFoundError:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def display_path(path: str | Path, root: str | Path = ".") -> str:
    """Return a repo-relative path when possible for shareable artifacts."""

    root_path = Path(root).resolve()
    path_obj = Path(path)
    resolved = path_obj.resolve() if path_obj.exists() or path_obj.is_absolute() else (root_path / path_obj).resolve()
    try:
        return str(resolved.relative_to(root_path))
    except ValueError:
        return str(path_obj)


def tokenize(text: str) -> set[str]:
    cleaned = "".join(ch.lower() if ch.isalnum() else " " for ch in text)
    return {token for token in cleaned.split() if len(token) > 2}


def jaccard(a: str, b: str) -> float:
    left = tokenize(a)
    right = tokenize(b)
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)
