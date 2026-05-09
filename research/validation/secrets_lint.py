"""Secret-scanning checks for shareable research artifacts."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .utils import write_json


SECRET_PATTERNS = (
    ("openai_project_key", re.compile(r"sk-proj-[A-Za-z0-9_-]{20,}")),
    ("openai_key", re.compile(r"sk-(?!test|placeholder)[A-Za-z0-9_-]{20,}")),
    ("anthropic_key", re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}")),
    ("replicate_token", re.compile(r"r8_[A-Za-z0-9]{20,}")),
    (
        "env_assignment",
        re.compile(
            r"\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|REPLICATE_API_TOKEN|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)\s*=\s*['\"]?([^'\"\s#]+)",
        ),
    ),
    ("absolute_local_path", re.compile(r"(/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Z]:\\\\Users\\\\[^\\s\"']+)")),
)
PLACEHOLDER_VALUES = {
    "",
    "changeme",
    "example",
    "placeholder",
    "test",
    "sk-test-local",
    "google-test-key",
    "dummy",
    "none",
}
EXCLUDED_DIRS = {
    ".git",
    ".next",
    ".venv",
    "node_modules",
    "__pycache__",
}
EXCLUDED_FILENAMES = {
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
}
MAX_SCAN_BYTES = 2_000_000


def _is_excluded(path: Path, root: Path) -> bool:
    relative = path.relative_to(root)
    if path.name in EXCLUDED_FILENAMES:
        return True
    return any(part in EXCLUDED_DIRS for part in relative.parts)


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _redact(value: str) -> str:
    if len(value) <= 10:
        return "***"
    return value[:4] + "..." + value[-4:]


def _scan_text(path: Path, root: Path, text: str) -> list[dict[str, Any]]:
    findings = []
    for name, pattern in SECRET_PATTERNS:
        for match in pattern.finditer(text):
            value = match.group(0)
            if name == "env_assignment":
                assigned = match.group(2).strip()
                if assigned.lower() in PLACEHOLDER_VALUES or assigned.startswith("sk-test"):
                    continue
                value = f"{match.group(1)}={assigned}"
            findings.append({
                "path": str(path.relative_to(root)),
                "line": _line_number(text, match.start()),
                "kind": name,
                "match": _redact(value),
            })
    return findings


def lint_secrets(repo_root: str | Path = ".", output_path: str | Path | None = None) -> dict[str, Any]:
    """Scan shareable repo files for likely API keys or token assignments."""

    root = Path(repo_root).resolve()
    findings: list[dict[str, Any]] = []
    scanned_files = 0
    skipped_large_files = []
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        if _is_excluded(path, root):
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size > MAX_SCAN_BYTES:
            skipped_large_files.append(str(path.relative_to(root)))
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        scanned_files += 1
        findings.extend(_scan_text(path, root, text))

    summary = {
        "schema_version": "research.secrets_lint.v1",
        "status": "secrets_lint_passed" if not findings else "needs_secret_review",
        "repo_root": ".",
        "scanned_files": scanned_files,
        "skipped_large_files": skipped_large_files,
        "findings": findings,
        "errors": [
            f"Potential secret in {item['path']}:{item['line']} ({item['kind']})"
            for item in findings
        ],
    }
    if output_path:
        write_json(Path(output_path), summary)
    return summary
