from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REPO_ROOT = Path("/Users/david/Desktop/Courses/COMP_SCI 397_497_Technologies_for_the_Law/Code/tr-benchmarking")
SOURCE_MD = REPO_ROOT / "instructions" / "LEGAL_AUTOEVAL_LIVE_DEMO_BLUEPRINT.md"
OUTPUT_PDF = REPO_ROOT / "output" / "pdf" / "Legal Auto-Eval Live Demo Blueprint.pdf"
COURSE_PDF = Path("/Users/david/Desktop/Courses/COMP_SCI 397_497_Technologies_for_the_Law/Legal Auto-Eval Live Demo Blueprint.pdf")


@dataclass
class ScriptStep:
    heading: str
    action_lines: list[str] = field(default_factory=list)
    script_lines: list[str] = field(default_factory=list)


def inline_markdown(text: str) -> str:
    text = escape(text)
    text = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def parse_lines() -> tuple[list[str], list[str], list[str]]:
    lines = SOURCE_MD.read_text().splitlines()
    split_index = next(
        (i for i, line in enumerate(lines) if re.match(r"^##\s+.*script\s*$", line.strip(), re.IGNORECASE)),
        len(lines),
    )
    if split_index == len(lines):
        return lines, [], []

    next_section_index = next(
        (i for i in range(split_index + 1, len(lines)) if lines[i].startswith("## ")),
        len(lines),
    )
    return lines[:split_index], lines[split_index:next_section_index], lines[next_section_index:]


def parse_step_block(block_lines: list[str], heading: str) -> ScriptStep:
    step = ScriptStep(heading=heading)
    current_label: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer, current_label
        if current_label is None:
            buffer = []
            return
        items = normalize_block(current_label, buffer)
        if current_label in {"Click", "Point out", "Action", "If there is time"}:
            step.action_lines.extend(items)
        elif current_label in {"Say", "Handoff line", "Short close", "If there is not time, skip Zak and end with"}:
            step.script_lines.extend(items)
        buffer = []

    for raw_line in block_lines:
        stripped = raw_line.strip()
        label_match = re.match(r"^(Click|Point out|Action|Say|Handoff line|If there is time|Short close|If there is not time, skip Zak and end with):$", stripped)
        if label_match:
            flush()
            current_label = label_match.group(1)
            continue
        buffer.append(raw_line)
    flush()
    return step


def normalize_block(label: str, lines: list[str]) -> list[str]:
    cleaned = [line.rstrip() for line in lines if line.strip()]
    if not cleaned:
        return []
    bullet_items = [line.strip()[2:].strip() for line in cleaned if line.strip().startswith("- ")]
    if bullet_items:
        prefix = {
            "Click": "Click",
            "Point out": "Point out",
            "Action": "Action",
            "If there is time": "If time",
        }.get(label, label)
        return [f"{prefix}: {item}" for item in bullet_items]
    text = " ".join(line.strip() for line in cleaned)
    text = text.strip('"')
    prefix = {
        "Say": "",
        "Handoff line": "Handoff: ",
        "Short close": "Close: ",
        "If there is not time, skip Zak and end with": "Short close: ",
    }.get(label, "")
    return [f"{prefix}{text}".strip()]


def parse_script(script_lines: list[str]) -> tuple[list[str], list[tuple[str, list[str], list[ScriptStep]]]]:
    intro: list[str] = []
    segments: list[tuple[str, list[str], list[ScriptStep]]] = []

    i = 0
    while i < len(script_lines) and not script_lines[i].startswith("### "):
        intro.append(script_lines[i])
        i += 1

    while i < len(script_lines):
        if not script_lines[i].startswith("### "):
            i += 1
            continue
        segment_title = script_lines[i][4:].strip()
        i += 1
        segment_intro: list[str] = []
        steps: list[ScriptStep] = []

        while i < len(script_lines) and not script_lines[i].startswith("### "):
            line = script_lines[i]
            if line.startswith("#### "):
                heading = line[5:].strip()
                i += 1
                step_block: list[str] = []
                while i < len(script_lines) and not script_lines[i].startswith("#### ") and not script_lines[i].startswith("### "):
                    step_block.append(script_lines[i])
                    i += 1
                steps.append(parse_step_block(step_block, heading))
            else:
                segment_intro.append(line)
                i += 1

        if not steps:
            step = parse_step_block(segment_intro, segment_title)
            segments.append(("", [], [step]))
        else:
            segments.append((segment_title, segment_intro, steps))

    return intro, segments


def build_styles() -> dict[str, ParagraphStyle]:
    styles = getSampleStyleSheet()
    custom = {
        "title": ParagraphStyle(
            "DocTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=24,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#111827"),
            spaceAfter=6,
        ),
        "heading1": ParagraphStyle(
            "Heading1Doc",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=13.5,
            leading=14.5,
            textColor=colors.HexColor("#0f172a"),
            spaceBefore=5,
            spaceAfter=2,
        ),
        "heading2": ParagraphStyle(
            "Heading2Doc",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=13,
            textColor=colors.HexColor("#111827"),
            spaceBefore=4,
            spaceAfter=2,
        ),
        "heading3": ParagraphStyle(
            "Heading3Doc",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.8,
            leading=11.6,
            textColor=colors.HexColor("#111827"),
            spaceBefore=2,
            spaceAfter=1,
        ),
        "body": ParagraphStyle(
            "BodyTight",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.6,
            leading=11.5,
            textColor=colors.HexColor("#334155"),
            spaceAfter=1,
        ),
        "bullet": ParagraphStyle(
            "BulletTight",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.6,
            leading=11.3,
            leftIndent=12,
            bulletIndent=0,
            textColor=colors.HexColor("#334155"),
            spaceAfter=0.5,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10.8,
            leading=11.2,
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.8,
            leading=11.4,
            textColor=colors.HexColor("#1f2937"),
            spaceAfter=0,
        ),
    }
    return custom


def render_list(items: Iterable[str], style: ParagraphStyle) -> Paragraph:
    text = "<br/>".join(f"• {inline_markdown(item)}" for item in items) if items else " "
    return Paragraph(text, style)


def render_intro(lines: list[str], story: list, styles: dict[str, ParagraphStyle]) -> None:
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            story.append(Spacer(1, 0.03 * inch))
            i += 1
            continue
        if stripped.startswith("# "):
            story.append(Paragraph(inline_markdown(stripped[2:]), styles["title"]))
            i += 1
            continue
        if stripped.startswith("## "):
            story.append(Paragraph(inline_markdown(stripped[3:]), styles["heading1"]))
            i += 1
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(inline_markdown(stripped[4:]), styles["heading2"]))
            i += 1
            continue
        if re.match(r"^\d+\.\s+", stripped):
            while i < len(lines):
                match = re.match(r"^(\d+)\.\s+(.*)", lines[i].strip())
                if not match:
                    break
                story.append(Paragraph(inline_markdown(match.group(2)), styles["bullet"], bulletText=f"{match.group(1)}."))
                i += 1
            continue
        if stripped.startswith("- "):
            while i < len(lines) and lines[i].strip().startswith("- "):
                story.append(Paragraph(inline_markdown(lines[i].strip()[2:]), styles["bullet"], bulletText="•"))
                i += 1
            continue
        paragraph_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt.startswith(("## ", "### ", "- ")) or re.match(r"^\d+\.\s+", nxt):
                break
            paragraph_lines.append(nxt)
            i += 1
        story.append(Paragraph(inline_markdown(" ".join(paragraph_lines)), styles["body"]))


def build_story() -> list:
    intro_lines, script_lines, tail_lines = parse_lines()
    script_intro, segments = parse_script(script_lines)
    styles = build_styles()
    story: list = []

    render_intro(intro_lines, story, styles)
    render_intro(script_intro, story, styles)

    for segment_title, segment_intro, steps in segments:
        if segment_title:
            story.append(Paragraph(inline_markdown(segment_title), styles["heading1"]))
        if segment_intro:
            render_intro(segment_intro, story, styles)

        for step in steps:
            story.append(Paragraph(inline_markdown(step.heading), styles["heading3"]))
            table = Table(
                [
                    [
                        Paragraph("Action", styles["table_header"]),
                        Paragraph("Script", styles["table_header"]),
                    ],
                    [
                        render_list(step.action_lines, styles["table_body"]),
                        render_list(step.script_lines, styles["table_body"]),
                    ],
                ],
                colWidths=[2.45 * inch, 4.0 * inch],
                repeatRows=1,
            )
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                        ("LEFTPADDING", (0, 0), (-1, -1), 5),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ]
                )
            )
            story.append(table)
            story.append(Spacer(1, 0.05 * inch))

    if tail_lines:
        render_intro(tail_lines, story, styles)

    return story


def add_page_number(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 0.32 * inch, f"{canvas.getPageNumber()}")
    canvas.restoreState()


def main() -> None:
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    story = build_story()
    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=letter,
        leftMargin=0.45 * inch,
        rightMargin=0.45 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.42 * inch,
        title="Legal Auto-Eval Live Demo Blueprint",
        author="OpenAI Codex",
    )
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    COURSE_PDF.write_bytes(OUTPUT_PDF.read_bytes())


if __name__ == "__main__":
    main()
