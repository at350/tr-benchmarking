"""Report generation for research runs and the LaTeX paper scaffold."""

from __future__ import annotations

from pathlib import Path


def build_markdown_report(run_id: str, manifest: dict, frank: dict, rubric: dict, clusters: dict, judge: dict, zak: dict) -> str:
    return "\n".join([
        f"# Research Pipeline Run: {run_id}",
        "",
        "## Pipeline Status",
        f"- Status: `{manifest['pipeline_status']}`",
        f"- Source hash: `{frank['source']['sha256_16']}`",
        f"- Rubric rows: {len(rubric['rows'])}",
        f"- Dasha clusters: {len(clusters['clusters'])}",
        f"- Zak packets: {len(zak['packets'])}",
        "",
        "## Frank",
        f"- Selected pack: `{frank['selected_pack']}`",
        f"- Doctrine family: {frank['doctrine_family']}",
        "",
        "## Karthic",
        *[f"- `{row['id']}` ({row['category']}): {row['criterion']}" for row in rubric["rows"]],
        "",
        "## Dasha",
        *[f"- `{cluster['id']}` {cluster['legal_signal']} size={cluster['size']} representative={cluster['representative_response_id']}" for cluster in clusters["clusters"]],
        "",
        "## Judge / Zak",
        f"- Agreement score: {judge['agreement_score']}",
        f"- Needs Zak: {judge['needs_zak']}",
        "",
    ])


def ensure_paper_scaffold(repo_root: Path) -> None:
    paper = repo_root / "paper"
    (paper / "sections").mkdir(parents=True, exist_ok=True)
    (paper / "tables").mkdir(parents=True, exist_ok=True)
    (paper / "figures").mkdir(parents=True, exist_ok=True)

    main = paper / "main.tex"
    if not main.exists():
        main.write_text(r"""\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{booktabs}
\usepackage{graphicx}
\usepackage{hyperref}
\title{A Source-Grounded Pipeline for Evaluating Legal Reasoning in Large Language Models}
\author{TR Benchmarking Research Team}
\date{\today}
\begin{document}
\maketitle
\input{sections/abstract}
\input{sections/methods}
\input{sections/validation}
\input{sections/limitations}
\bibliographystyle{plain}
\bibliography{references}
\end{document}
""", encoding="utf-8")

    defaults = {
        "abstract.tex": "We present a source-grounded pipeline for generating legal benchmarks, rubrics, clustered model-response analyses, and escalation packets for expert review.\n",
        "methods.tex": "The final paper will describe the frozen Frank, Karthic, Dasha, judge, and Zak stages. Engineering calibration is excluded from the research protocol.\n",
        "validation.tex": "Validation results will be populated from frozen internal research runs and, later, expert labels.\n",
        "limitations.tex": "Limitations include Statute of Frauds scope, model-provider drift, and the need for future held-out expert review.\n",
    }
    for filename, text in defaults.items():
        path = paper / "sections" / filename
        if not path.exists():
            path.write_text(text, encoding="utf-8")

    references = paper / "references.bib"
    if not references.exists():
        references.write_text("""@misc{trbenchmarking2026,
  title = {TR Benchmarking Research Pipeline},
  author = {TR Benchmarking Research Team},
  year = {2026},
  note = {Internal research scaffold}
}
""", encoding="utf-8")
