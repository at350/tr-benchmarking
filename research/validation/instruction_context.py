"""Load canonical instruction context for live research agents."""

from __future__ import annotations

from pathlib import Path

from .utils import stable_hash


INSTRUCTION_FILES: dict[str, tuple[str, ...]] = {
    "frank": (
        "instructions/00_GENERAL_LEGAL_REASONING_PROTOCOL.md",
        "instructions/README.md",
        "instructions/frank/00_MAIN_GPT_INSTRUCTIONS.txt",
        "instructions/frank/01_CORE_WORKFLOW_TEMPLATE.txt",
        "instructions/frank/03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt",
        "instructions/frank/04_CORE_QUESTION_WRITING_CHECKLIST.txt",
        "instructions/frank/54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md",
    ),
    "karthic": (
        "instructions/00_GENERAL_LEGAL_REASONING_PROTOCOL.md",
        "instructions/README.md",
        "instructions/karthic/08_Karthic_Rubric_Build_Spec_v1.md",
        "instructions/karthic/09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md",
        "instructions/frank/03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt",
        "instructions/frank/54_Dual_Rubric_Protocol_Original_vs_Variation_v1.md",
    ),
    "dasha": (
        "instructions/00_GENERAL_LEGAL_REASONING_PROTOCOL.md",
        "instructions/README.md",
        "instructions/dasha/56_Dasha_Evaluation_Spec_v2.md",
        "instructions/dasha/57_Dasha_Evaluator_Instructions_v2.txt",
        "instructions/dasha/60_Centroid_Composition_Metadata_and_Simple_Zak_Rule_v1.md",
    ),
}


def load_agent_instruction_context(repo_root: Path, agent_name: str, max_chars: int = 16000) -> dict[str, str]:
    """Return bounded canonical context for an agent prompt."""

    parts = []
    loaded_files = []
    for relative_path in INSTRUCTION_FILES[agent_name]:
        path = repo_root / relative_path
        text = path.read_text(encoding="utf-8", errors="replace")
        remaining = max_chars - sum(len(part) for part in parts)
        if remaining <= 0:
            break
        excerpt = text[:remaining]
        parts.append(f"--- {relative_path} ---\n{excerpt}")
        loaded_files.append(relative_path)
    rendered = "\n\n".join(parts)
    return {
        "agent": agent_name,
        "loaded_files": "\n".join(loaded_files),
        "context": rendered,
        "context_hash": stable_hash({"agent": agent_name, "files": loaded_files, "context": rendered}),
    }
