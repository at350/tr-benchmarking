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
  "stage_assessment.tex",
  "reproducibility.tex",
  "discussion.tex",
  "limitations.tex",
  "review_readiness.tex",
  "instruction_context_appendix.tex",
  "artifact_examples.tex",
];

type ReferenceEntry = {
  key: string;
  fields: Record<string, string>;
};

type RenderMetadata = {
  citationNumbers: Record<string, number>;
  refLabels: Record<string, string>;
  references: ReferenceEntry[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toRoman(value: number) {
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let result = "";
  for (const [amount, symbol] of numerals) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }
  return result;
}

function formatCitation(keys: string, metadata: RenderMetadata) {
  const labels = keys
    .split(",")
    .map((key) => metadata.citationNumbers[key.trim()])
    .filter((value): value is number => typeof value === "number")
    .map((value) => `[${value}]`);
  return `<span class="citation">${labels.length ? labels.join(", ") : `[${escapeHtml(keys)}]`}</span>`;
}

function inlineLatex(value: string, metadata: RenderMetadata) {
  let text = escapeHtml(value)
    .replaceAll("``", "“")
    .replaceAll("''", "”")
    .replaceAll("\\_", "_")
    .replaceAll("--", "–")
    .replace(/\\texttt\{([^}]+)\}/g, "<code>$1</code>")
    .replace(/\\ref\{([^}]+)\}/g, (_match, label: string) => metadata.refLabels[label] ?? label)
    .replace(/\\cite[a-zA-Z]*(?:\[[^\]]+\])?\{([^}]+)\}/g, (_match, keys: string) => formatCitation(keys, metadata));
  text = text.replace(/\\[a-zA-Z]+\{([^}]+)\}/g, "$1");
  return text.trim();
}

function captionHtml(kind: "figure" | "table", caption: string | null, displayLabel: string | null, metadata: RenderMetadata) {
  if (!caption) {
    return "";
  }
  const label = displayLabel ?? (kind === "figure" ? "Fig." : "TABLE");
  const body = inlineLatex(caption, metadata);
  return kind === "figure"
    ? `<figcaption><span class="caption-label">${escapeHtml(label)}.</span> ${body}</figcaption>`
    : `<figcaption><span class="caption-label">${escapeHtml(label.toUpperCase())}.</span> ${body}</figcaption>`;
}

async function renderTable(
  repoRoot: string,
  includePath: string,
  caption: string | null,
  displayLabel: string | null,
  metadata: RenderMetadata,
) {
  const tablePath = path.join(repoRoot, "paper", `${includePath}.tex`);
  const raw = await readFile(tablePath, "utf8");
  return renderTableFromLatex(raw, caption, displayLabel, metadata);
}

async function renderFigure(
  repoRoot: string,
  includePath: string | null,
  caption: string | null,
  displayLabel: string | null,
  metadata: RenderMetadata,
) {
  if (!includePath) {
    return "";
  }
  const figurePath = path.join(repoRoot, "paper", includePath);
  const image = await readFile(figurePath);
  const extension = path.extname(figurePath).replace(".", "").toLowerCase();
  const mime = extension === "svg" ? "image/svg+xml" : `image/${extension || "png"}`;
  const dataUrl = `data:${mime};base64,${image.toString("base64")}`;
  const alt = caption ? inlineLatex(caption, metadata).replace(/<[^>]+>/g, "") : path.basename(includePath);
  return `<figure class="paper-figure"><img src="${dataUrl}" alt="${escapeHtml(alt)}" />${
    captionHtml("figure", caption, displayLabel, metadata)
  }</figure>`;
}

function renderTableFromLatex(
  raw: string,
  caption: string | null,
  displayLabel: string | null,
  metadata: RenderMetadata,
) {
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("&") && line.endsWith("\\\\"))
    .map((line) =>
      line
        .replace(/\\\\$/, "")
        .split("&")
        .map((cell) => inlineLatex(cell.trim(), metadata)),
    );

  const [header, ...body] = rows;
  const headerHtml = header
    ? `<thead><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>`
    : "";
  const bodyHtml = `<tbody>${body
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<figure class="paper-table">${
    captionHtml("table", caption, displayLabel, metadata)
  }<table>${headerHtml}${bodyHtml}</table></figure>`;
}

function parseBibFields(body: string) {
  const fields: Record<string, string> = {};
  const fieldPattern = /(\w+)\s*=\s*\{([\s\S]*?)\}\s*,?/g;
  for (const match of body.matchAll(fieldPattern)) {
    fields[match[1].toLowerCase()] = match[2].replace(/\s+/g, " ").trim();
  }
  return fields;
}

function parseBibliography(raw: string) {
  const entries: ReferenceEntry[] = [];
  const entryPattern = /@\w+\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n@|\s*$)/g;
  for (const match of raw.matchAll(entryPattern)) {
    entries.push({ key: match[1], fields: parseBibFields(match[2]) });
  }
  return entries;
}

async function collectRenderMetadata(repoRoot: string) {
  const citationNumbers: Record<string, number> = {};
  const refLabels: Record<string, string> = {};
  const sectionTexts = await Promise.all(
    sectionFiles.map((fileName) => readFile(path.join(repoRoot, "paper", "sections", fileName), "utf8")),
  );

  for (const raw of sectionTexts) {
    for (const citation of raw.matchAll(/\\cite[a-zA-Z]*(?:\[[^\]]+\])?\{([^}]+)\}/g)) {
      for (const key of citation[1].split(",")) {
        const trimmed = key.trim();
        if (trimmed && !citationNumbers[trimmed]) {
          citationNumbers[trimmed] = Object.keys(citationNumbers).length + 1;
        }
      }
    }
  }

  let figureCount = 0;
  let tableCount = 0;
  for (const raw of sectionTexts) {
    for (const environment of raw.matchAll(/\\begin\{(figure\*?|table\*?)\}(?:\[[^\]]+\])?([\s\S]*?)\\end\{\1\}/g)) {
      const kind = environment[1].replace("*", "");
      const body = environment[2];
      const label = body.match(/\\label\{([^}]+)\}/)?.[1];
      if (!label) {
        continue;
      }
      if (kind === "figure") {
        figureCount += 1;
        refLabels[label] = `Fig. ${figureCount}`;
      } else {
        tableCount += 1;
        refLabels[label] = `Table ${toRoman(tableCount)}`;
      }
    }
  }

  const references = parseBibliography(await readFile(path.join(repoRoot, "paper", "references.bib"), "utf8"));
  return { citationNumbers, refLabels, references };
}

function formatReference(entry: ReferenceEntry) {
  const authors = entry.fields.author?.replaceAll(" and ", ", ") ?? "";
  const title = entry.fields.title ? `"${entry.fields.title}",` : "";
  const venue = entry.fields.journal ?? entry.fields.booktitle ?? entry.fields.howpublished ?? "";
  const year = entry.fields.year ? `${entry.fields.year}.` : "";
  const doi = entry.fields.doi ? ` DOI: ${entry.fields.doi}.` : "";
  return [authors, title, venue, year].filter(Boolean).join(" ") + doi;
}

function renderReferences(metadata: RenderMetadata) {
  const ordered = Object.entries(metadata.citationNumbers).sort((a, b) => a[1] - b[1]);
  const byKey = Object.fromEntries(metadata.references.map((entry) => [entry.key, entry]));
  if (!ordered.length) {
    return "";
  }
  return [
    "<h2>References</h2>",
    `<ol class="paper-references">${ordered
      .map(([key, number]) => `<li value="${number}">${inlineLatex(formatReference(byKey[key] ?? { key, fields: { title: key } }), metadata)}</li>`)
      .join("")}</ol>`,
  ].join("\n");
}

async function renderLatexSection(repoRoot: string, fileName: string, metadata: RenderMetadata) {
  const raw = await readFile(path.join(repoRoot, "paper", "sections", fileName), "utf8");
  const lines = raw.split("\n");
  const blocks: string[] = [];
  const paragraph: string[] = [];
  let inTable = false;
  let inFigure = false;
  let inTabular = false;
  const tabularLines: string[] = [];
  let pendingCaption: string | null = null;
  let pendingFigurePath: string | null = null;
  let pendingDisplayLabel: string | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    blocks.push(`<p>${inlineLatex(paragraph.join(" "), metadata)}</p>`);
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
      blocks.push(renderTableFromLatex(tabularLines.join("\n"), pendingCaption, pendingDisplayLabel, metadata));
      pendingCaption = null;
      pendingDisplayLabel = null;
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
      blocks.push(`<h2>${inlineLatex(section[1], metadata)}</h2>`);
      continue;
    }

    const subsection = trimmed.match(/^\\subsection\{(.+)\}$/);
    if (subsection) {
      flushParagraph();
      blocks.push(`<h3>${inlineLatex(subsection[1], metadata)}</h3>`);
      continue;
    }

    const caption = trimmed.match(/^\\caption\{(.+)\}$/);
    if (caption) {
      pendingCaption = caption[1];
      continue;
    }

    const label = trimmed.match(/^\\label\{(.+)\}$/);
    if (label) {
      pendingDisplayLabel = metadata.refLabels[label[1]] ?? null;
      continue;
    }

    const includeGraphics = trimmed.match(/^\\includegraphics(?:\[[^\]]+\])?\{(.+)\}$/);
    if (includeGraphics) {
      if (inFigure) {
        pendingFigurePath = includeGraphics[1];
      }
      continue;
    }

    const input = trimmed.match(/^\\input\{(.+)\}$/);
    if (input) {
      flushParagraph();
      blocks.push(await renderTable(repoRoot, input[1], pendingCaption, pendingDisplayLabel, metadata));
      pendingCaption = null;
      pendingDisplayLabel = null;
      continue;
    }

    if (/^\\begin\{table\*?\}(?:\[[^\]]+\])?$/.test(trimmed)) {
      flushParagraph();
      inTable = true;
      continue;
    }

    if (/^\\end\{table\*?\}$/.test(trimmed)) {
      inTable = false;
      continue;
    }

    if (trimmed.startsWith("\\begin{figure}")) {
      flushParagraph();
      inFigure = true;
      pendingFigurePath = null;
      pendingCaption = null;
      continue;
    }

    if (trimmed === "\\end{figure}") {
      blocks.push(await renderFigure(repoRoot, pendingFigurePath, pendingCaption, pendingDisplayLabel, metadata));
      pendingFigurePath = null;
      pendingCaption = null;
      pendingDisplayLabel = null;
      inFigure = false;
      continue;
    }

    if (inTable || inFigure || trimmed === "\\centering") {
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks.join("\n");
}

export default async function PaperPreviewPage() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const metadata = await collectRenderMetadata(repoRoot);
  const renderedSections = await Promise.all(
    sectionFiles.map((fileName) => renderLatexSection(repoRoot, fileName, metadata)),
  );
  const references = renderReferences(metadata);

  return (
    <main className="bg-[#f3f5f7] px-5 py-8 text-slate-950">
      <article className="mx-auto max-w-4xl bg-white px-10 py-12 shadow-sm ring-1 ring-slate-200 md:px-16">
        <header className="border-b border-slate-200 pb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Legal Reasoning Evaluation Manuscript
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            A Source-Grounded Pipeline for Evaluating Legal Reasoning in Large Language Models
          </h1>
          <p className="mt-4 text-sm text-slate-600">Legal Reasoning Evaluation Research Team</p>
        </header>

        <div
          className="paper-preview mt-10"
          dangerouslySetInnerHTML={{ __html: `${renderedSections.join("\n")}\n${references}` }}
        />
      </article>
    </main>
  );
}
