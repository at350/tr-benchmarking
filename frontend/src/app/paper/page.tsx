import { readFile } from "fs/promises";
import path from "path";

const sectionFiles = [
  "abstract.tex",
  "introduction.tex",
  "contributions.tex",
  "related_work.tex",
  "methods.tex",
  "validation.tex",
  "results.tex",
  "discussion.tex",
  "limitations.tex",
  "artifact_examples.tex",
];

const citationLabels: Record<string, string> = {
  zheng2023judging: "Zheng et al., 2023",
  liu2023geval: "Liu et al., 2023",
  kim2023prometheus: "Kim et al., 2024a",
  kim2024prometheus2: "Kim et al., 2024b",
  wang2024positionbias: "Wang et al., 2024",
  panickssery2024selfpreference: "Panickssery et al., 2024",
  lemaj2025: "LeMAJ, 2025",
  lexam2025: "LEXam, 2025",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inlineLatex(value: string) {
  let text = escapeHtml(value)
    .replaceAll("``", "“")
    .replaceAll("''", "”")
    .replaceAll("\\_", "_")
    .replaceAll("--", "–")
    .replace(/\\texttt\{([^}]+)\}/g, "<code>$1</code>")
    .replace(/\\ref\{([^}]+)\}/g, "$1")
    .replace(/\\cite\{([^}]+)\}/g, (_match, keys: string) => {
      const labels = keys
        .split(",")
        .map((key) => citationLabels[key.trim()] ?? key.trim())
        .join("; ");
      return `<span class="citation">${labels}</span>`;
    });
  text = text.replace(/\\[a-zA-Z]+\{([^}]+)\}/g, "$1");
  return text.trim();
}

async function renderTable(repoRoot: string, includePath: string, caption: string | null) {
  const tablePath = path.join(repoRoot, "paper", `${includePath}.tex`);
  const raw = await readFile(tablePath, "utf8");
  return renderTableFromLatex(raw, caption);
}

function renderTableFromLatex(raw: string, caption: string | null) {
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("&") && line.endsWith("\\\\"))
    .map((line) =>
      line
        .replace(/\\\\$/, "")
        .split("&")
        .map((cell) => inlineLatex(cell.trim())),
    );

  const [header, ...body] = rows;
  const headerHtml = header
    ? `<thead><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>`
    : "";
  const bodyHtml = `<tbody>${body
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<figure class="paper-table">${
    caption ? `<figcaption>${inlineLatex(caption)}</figcaption>` : ""
  }<table>${headerHtml}${bodyHtml}</table></figure>`;
}

async function renderLatexSection(repoRoot: string, fileName: string) {
  const raw = await readFile(path.join(repoRoot, "paper", "sections", fileName), "utf8");
  const lines = raw.split("\n");
  const blocks: string[] = [];
  const paragraph: string[] = [];
  let inTable = false;
  let inTabular = false;
  const tabularLines: string[] = [];
  let pendingCaption: string | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    blocks.push(`<p>${inlineLatex(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "\\begin{abstract}" || trimmed === "\\end{abstract}") {
      flushParagraph();
      continue;
    }

    if (trimmed.startsWith("\\begin{tabular}")) {
      flushParagraph();
      inTabular = true;
      tabularLines.length = 0;
      continue;
    }

    if (trimmed === "\\end{tabular}") {
      blocks.push(renderTableFromLatex(tabularLines.join("\n"), pendingCaption));
      pendingCaption = null;
      inTabular = false;
      continue;
    }

    if (inTabular) {
      tabularLines.push(trimmed);
      continue;
    }

    const section = trimmed.match(/^\\section\{(.+)\}$/);
    if (section) {
      flushParagraph();
      blocks.push(`<h2>${inlineLatex(section[1])}</h2>`);
      continue;
    }

    const subsection = trimmed.match(/^\\subsection\{(.+)\}$/);
    if (subsection) {
      flushParagraph();
      blocks.push(`<h3>${inlineLatex(subsection[1])}</h3>`);
      continue;
    }

    const caption = trimmed.match(/^\\caption\{(.+)\}$/);
    if (caption) {
      pendingCaption = caption[1];
      continue;
    }

    const input = trimmed.match(/^\\input\{(.+)\}$/);
    if (input) {
      flushParagraph();
      blocks.push(await renderTable(repoRoot, input[1], pendingCaption));
      pendingCaption = null;
      continue;
    }

    if (trimmed === "\\begin{table}[h]" || trimmed === "\\begin{table}") {
      flushParagraph();
      inTable = true;
      continue;
    }

    if (trimmed === "\\end{table}") {
      inTable = false;
      continue;
    }

    if (inTable || trimmed === "\\centering" || trimmed.startsWith("\\label{")) {
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks.join("\n");
}

export default async function PaperPreviewPage() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const renderedSections = await Promise.all(
    sectionFiles.map((fileName) => renderLatexSection(repoRoot, fileName)),
  );

  return (
    <main className="bg-[#f3f5f7] px-5 py-8 text-slate-950">
      <article className="mx-auto max-w-4xl bg-white px-10 py-12 shadow-sm ring-1 ring-slate-200 md:px-16">
        <header className="border-b border-slate-200 pb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            TR Benchmarking Internal Manuscript
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            A Source-Grounded Pipeline for Evaluating Legal Reasoning in Large Language Models
          </h1>
          <p className="mt-4 text-sm text-slate-600">TR Benchmarking Research Team</p>
        </header>

        <div
          className="paper-preview mt-10"
          dangerouslySetInnerHTML={{ __html: renderedSections.join("\n") }}
        />
      </article>
    </main>
  );
}
