"""Source-case metadata helpers for reproducible research runs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .utils import display_path, stable_hash


REQUIRED_SOURCE_METADATA_FIELDS = (
    "case_id",
    "title",
    "jurisdiction",
    "doctrine_family",
    "source_type",
    "provenance",
    "calibration_role",
    "summary",
    "material_facts",
    "limitations",
)


def source_metadata_path(source_case_path: Path) -> Path:
    """Return the canonical sidecar metadata path for a source-case file."""

    return source_case_path.with_name(f"{source_case_path.stem}.metadata.json")


def load_source_metadata(source_case_path: Path) -> dict[str, Any]:
    """Load sidecar metadata for a source case, returning an empty dict if absent."""

    path = source_metadata_path(source_case_path)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def read_source_text(source_case_path: Path) -> str:
    """Read text source cases and extract text from PDF source cases."""

    if source_case_path.suffix.lower() == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("PDF source cases require the `pypdf` package for text extraction.") from exc
        reader = PdfReader(str(source_case_path))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    return source_case_path.read_text(encoding="utf-8")


def validate_source_metadata(source_case_path: Path) -> list[str]:
    """Return validation errors for missing or underspecified source metadata."""

    path = source_metadata_path(source_case_path)
    if not path.exists():
        return [f"Source case metadata sidecar is missing: {path.name}"]
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"Source case metadata sidecar is not valid JSON: {exc}"]

    errors = []
    for field in REQUIRED_SOURCE_METADATA_FIELDS:
        value = metadata.get(field)
        if value in (None, "", []):
            errors.append(f"Source case metadata missing {field}")
    if metadata.get("source_path") and Path(str(metadata["source_path"])).name != source_case_path.name:
        errors.append("Source case metadata source_path does not match configured source case filename")
    return errors


def source_case_record(source_case_path: Path, repo_root: Path) -> dict[str, Any]:
    """Build a shareable provenance record for a source case and its sidecar metadata."""

    raw_bytes = source_case_path.read_bytes()
    extracted_text = read_source_text(source_case_path)
    metadata_path = source_metadata_path(source_case_path)
    metadata = load_source_metadata(source_case_path)
    record: dict[str, Any] = {
        "path": display_path(source_case_path, repo_root),
        "sha256_16": stable_hash(raw_bytes.hex()),
        "bytes": len(raw_bytes),
        "source_format": source_case_path.suffix.lower().lstrip(".") or "text",
        "extracted_text_sha256_16": stable_hash(extracted_text),
        "extracted_text_chars": len(extracted_text),
    }
    if metadata:
        metadata_text = metadata_path.read_text(encoding="utf-8", errors="replace")
        record["metadata_path"] = display_path(metadata_path, repo_root)
        record["metadata_sha256_16"] = stable_hash(metadata_text)
        record["metadata"] = metadata
    return record
