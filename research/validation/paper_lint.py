"""Static checks for the LaTeX research manuscript."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .utils import display_path, write_json


COMMAND_PATTERN = re.compile(r"\\(?P<command>input|includegraphics|bibliography|cite[a-zA-Z]*)\s*(?:\[[^\]]*\])?\s*\{(?P<arg>[^}]+)\}", re.DOTALL)
BIB_ENTRY_PATTERN = re.compile(r"@\w+\s*\{\s*([^,\s]+)", re.MULTILINE)
CONTENT_BLOCKERS = (
    ("absolute_local_path", re.compile(r"(/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Z]:\\\\Users\\\\[^\\s\"']+)"), "Manuscript contains an absolute local machine path."),
    ("provider_routing_name", re.compile(r"\bReplicate\b"), "Manuscript should discuss model identifiers, not provider-routing names."),
    ("stale_readiness_count", re.compile(r"\b(6\s+of\s+9|6/9|six\s+of\s+nine)\b", re.IGNORECASE), "Manuscript contains stale 6-of-9 readiness wording."),
    ("statute_of_frauds_typo", re.compile(r"\bStatue\s+of\s+Frauds\b", re.IGNORECASE), "Manuscript contains the typo 'Statue of Frauds'."),
    ("jd_review", re.compile(r"\bJD\s+review\b", re.IGNORECASE), "Manuscript should not depend on JD review at this stage."),
)


def _strip_comments(text: str) -> str:
    lines = []
    for line in text.splitlines():
        escaped = False
        kept = []
        for char in line:
            if char == "%" and not escaped:
                break
            kept.append(char)
            escaped = char == "\\" and not escaped
            if char != "\\":
                escaped = False
        lines.append("".join(kept))
    return "\n".join(lines)


def _tex_files(paper_root: Path) -> list[Path]:
    return sorted(paper_root.glob("**/*.tex"))


def _resolve_tex_path(paper_root: Path, argument: str) -> Path:
    candidate = paper_root / argument.strip()
    if candidate.suffix:
        return candidate
    return candidate.with_suffix(".tex")


def _resolve_graphics_path(paper_root: Path, argument: str) -> Path:
    candidate = paper_root / argument.strip()
    if candidate.suffix:
        return candidate
    for suffix in (".pdf", ".png", ".jpg", ".jpeg", ".svg"):
        if candidate.with_suffix(suffix).exists():
            return candidate.with_suffix(suffix)
    return candidate


def _bib_keys(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(BIB_ENTRY_PATTERN.findall(path.read_text(encoding="utf-8", errors="replace")))


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return display_path(path)


def lint_paper(paper_root: str | Path = "paper", output_path: str | Path | None = None) -> dict[str, Any]:
    """Check that manuscript references resolve without requiring a TeX engine."""

    root = Path(paper_root)
    tex_files = _tex_files(root)
    available_bib_keys: set[str] = set()
    missing_inputs = []
    missing_graphics = []
    missing_bibliographies = []
    missing_citations = []
    content_findings = []
    referenced_citations: set[str] = set()

    for tex_file in tex_files:
        text = _strip_comments(tex_file.read_text(encoding="utf-8", errors="replace"))
        for kind, pattern, message in CONTENT_BLOCKERS:
            for match in pattern.finditer(text):
                content_findings.append({
                    "path": _relative(tex_file, root),
                    "line": _line_number(text, match.start()),
                    "kind": kind,
                    "message": message,
                })
        for match in COMMAND_PATTERN.finditer(text):
            command = match.group("command")
            argument = re.sub(r"\s+", "", match.group("arg"))
            if command == "input":
                path = _resolve_tex_path(root, argument)
                if not path.exists():
                    missing_inputs.append({"from": _relative(tex_file, root), "target": argument})
            elif command == "includegraphics":
                path = _resolve_graphics_path(root, argument)
                if not path.exists():
                    missing_graphics.append({"from": _relative(tex_file, root), "target": argument})
            elif command == "bibliography":
                for item in argument.split(","):
                    bib_path = root / f"{item}.bib"
                    if bib_path.exists():
                        available_bib_keys |= _bib_keys(bib_path)
                    else:
                        missing_bibliographies.append({"from": _relative(tex_file, root), "target": item})
            elif command.startswith("cite"):
                for key in argument.split(","):
                    if key:
                        referenced_citations.add(key)

    for key in sorted(referenced_citations):
        if key not in available_bib_keys:
            missing_citations.append(key)

    errors = []
    errors.extend(f"Missing input {item['target']} referenced from {item['from']}" for item in missing_inputs)
    errors.extend(f"Missing graphic {item['target']} referenced from {item['from']}" for item in missing_graphics)
    errors.extend(f"Missing bibliography {item['target']} referenced from {item['from']}" for item in missing_bibliographies)
    errors.extend(f"Missing citation key {key}" for key in missing_citations)
    errors.extend(f"{item['message']} {item['path']}:{item['line']} ({item['kind']})" for item in content_findings)

    summary = {
        "schema_version": "research.paper_lint.v1",
        "status": "paper_lint_passed" if not errors else "needs_paper_lint_review",
        "paper_root": display_path(root),
        "tex_files": len(tex_files),
        "citation_keys": sorted(referenced_citations),
        "bib_keys": sorted(available_bib_keys),
        "missing_inputs": missing_inputs,
        "missing_graphics": missing_graphics,
        "missing_bibliographies": missing_bibliographies,
        "missing_citations": missing_citations,
        "content_findings": content_findings,
        "errors": errors,
    }
    if output_path:
        write_json(Path(output_path), summary)
    return summary
