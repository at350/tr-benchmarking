import { createRequire } from "module";
import { writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const width = 1600;
const font = "Arial, Helvetica, sans-serif";

function textLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function multiline(text, x, y, maxChars, options = {}) {
  const size = options.size ?? 24;
  const fill = options.fill ?? "#1F2937";
  const weight = options.weight ?? 400;
  const anchor = options.anchor ?? "middle";
  const lineHeight = options.lineHeight ?? Math.round(size * 1.25);
  return textLines(text, maxChars)
    .map((line, index) => {
      const dy = index * lineHeight;
      return `<text x="${x}" y="${y + dy}" text-anchor="${anchor}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
    })
    .join("\n");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function arrow(x1, y1, x2, y2, color = "#475569", dashed = false) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="4" stroke-linecap="round" ${dashed ? 'stroke-dasharray="12 10"' : ""} marker-end="url(#arrow-${color.slice(1)})"/>`;
}

function markerDefs(colors) {
  return `<defs>${colors
    .map(
      (color) => `<marker id="arrow-${color.slice(1)}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`,
    )
    .join("")}</defs>`;
}

function box({ x, y, w, h, title, body, fill = "#FFFFFF", stroke = "#CBD5E1", accent = "#2563EB" }) {
  const titleChars = Math.max(14, Math.floor(w / 12));
  const bodyChars = Math.max(18, Math.floor(w / 11.5));
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="12" height="${h}" rx="6" fill="${accent}"/>
    ${multiline(title, x + w / 2 + 6, y + 40, titleChars, { size: 27, weight: 700, fill: "#0F172A" })}
    ${multiline(body, x + w / 2 + 6, y + 88, bodyChars, { size: 20, fill: "#334155", lineHeight: 27 })}
  `;
}

function svgShell(height, title, subtitle, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${markerDefs(["#475569", "#2563EB", "#059669", "#D97706", "#B91C1C"])}
  <rect width="${width}" height="${height}" fill="#F8FAFC"/>
  <text x="80" y="76" font-family="${font}" font-size="40" font-weight="700" fill="#0F172A">${escapeXml(title)}</text>
  <text x="80" y="116" font-family="${font}" font-size="23" fill="#475569">${escapeXml(subtitle)}</text>
  ${body}
</svg>`;
}

async function saveFigure(name, svg) {
  const svgPath = path.join(here, `${name}.svg`);
  const pngPath = path.join(here, `${name}.png`);
  await writeFile(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png({ quality: 100 }).toFile(pngPath);
}

function pipelineOverview() {
  const w = 340;
  const h = 148;
  const top = 178;
  const bottom = 390;
  const xs = [110, 630, 1150];
  let body = "";
  body += box({ x: xs[0], y: top, w, h, title: "Source Case", body: "Legal authority, facts, and procedural posture", accent: "#64748B" });
  body += box({ x: xs[1], y: top, w, h, title: "Frank", body: "Doctrine gates, gold answer, neutral question, variations", accent: "#2563EB" });
  body += box({ x: xs[2], y: top, w, h, title: "Karthic", body: "Fresh source-grounded row rubric and quality gates", accent: "#059669" });
  body += box({ x: xs[0], y: bottom, w, h, title: "Responses", body: "Natural model answers to each executable question track", accent: "#D97706" });
  body += box({ x: xs[1], y: bottom, w, h, title: "Dasha", body: "Reasoning signatures and track-aware clusters", accent: "#7C3AED" });
  body += box({ x: xs[2], y: bottom, w, h, title: "Judge + Zak", body: "Rubric scoring, projected rankings, escalation packets", accent: "#B91C1C" });
  body += arrow(xs[0] + w + 15, top + h / 2, xs[1] - 20, top + h / 2);
  body += arrow(xs[1] + w + 15, top + h / 2, xs[2] - 20, top + h / 2);
  body += arrow(xs[2] + w / 2, top + h + 15, xs[0] + w / 2, bottom - 20, "#475569");
  body += arrow(xs[0] + w + 15, bottom + h / 2, xs[1] - 20, bottom + h / 2);
  body += arrow(xs[1] + w + 15, bottom + h / 2, xs[2] - 20, bottom + h / 2);
  body += `
    <rect x="250" y="610" width="1100" height="115" rx="22" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
    <text x="300" y="654" font-family="${font}" font-size="25" font-weight="700" fill="#0F172A">Serialized research artifacts</text>
    ${multiline("Every boundary is written as JSON with hashes: Frank packet, Karthic rubric, responses, Dasha clusters, judge scores, Zak packets, manifest, and paper tables.", 800, 695, 98, { size: 22, fill: "#334155" })}
    ${arrow(1320, bottom + h + 10, 1320, 602, "#2563EB", true)}
  `;
  return svgShell(
    790,
    "End-to-End Source-to-Score Pipeline",
    "A source case becomes benchmark artifacts, clustered reasoning paths, rubric scores, rankings, and escalation records.",
    body,
  );
}

function perturbationTracks() {
  const body = `
    ${box({ x: 90, y: 205, w: 320, h: 160, title: "Frank Base Question", body: "Original neutral legal question from the source case", accent: "#2563EB" })}
    ${box({ x: 565, y: 150, w: 350, h: 150, title: "Invariant Track", body: "Surface edit: party or company name changes", accent: "#059669", fill: "#F0FDF4" })}
    ${box({ x: 565, y: 380, w: 350, h: 150, title: "Material Track", body: "Legal edit: duration, writing, land, goods, suretyship, or marriage", accent: "#D97706", fill: "#FFFBEB" })}
    ${box({ x: 1080, y: 150, w: 380, h: 150, title: "Expected Stable", body: "Dominant Dasha outcome and reasoning path should match base", accent: "#059669" })}
    ${box({ x: 1080, y: 380, w: 380, h: 150, title: "Expected Shift", body: "Dominant outcome or reasoning path should change when doctrine requires it", accent: "#D97706" })}
    ${arrow(395, 245, 560, 212, "#475569")}
    ${arrow(395, 310, 560, 455, "#475569")}
    ${arrow(920, 225, 1075, 225, "#059669")}
    ${arrow(920, 455, 1075, 455, "#D97706")}
    <rect x="220" y="610" width="1160" height="98" rx="18" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
    ${multiline("Perturbation validation is a minimal-pair robustness test: irrelevant edits should not move the answer; legally operative edits should move the answer or reasoning signature.", 800, 662, 105, { size: 24, fill: "#334155" })}
  `;
  return svgShell(
    780,
    "Question Perturbation Validation",
    "Frank variations are executed as separate benchmark tracks rather than treated as prose examples.",
    body,
  );
}

function clusteringJudging() {
  const body = `
    ${box({ x: 80, y: 220, w: 310, h: 155, title: "Natural Answers", body: "Raw responses from GPT, Claude, Gemini, Llama, and others", accent: "#64748B" })}
    ${box({ x: 510, y: 220, w: 310, h: 155, title: "Dasha Extractor", body: "Doctrine, trigger, outcome, exception, reasoning path", accent: "#2563EB" })}
    ${box({ x: 940, y: 165, w: 300, h: 145, title: "Cluster A", body: "Same legal reasoning path", accent: "#059669", fill: "#F0FDF4" })}
    ${box({ x: 940, y: 375, w: 300, h: 145, title: "Cluster B", body: "Different legal reasoning path", accent: "#D97706", fill: "#FFFBEB" })}
    ${box({ x: 1320, y: 260, w: 250, h: 155, title: "Centroid Score", body: "Judge applies Karthic rows to representative", accent: "#B91C1C" })}
    ${arrow(395, 297, 505, 297, "#475569")}
    ${arrow(825, 270, 935, 235, "#2563EB")}
    ${arrow(825, 325, 935, 445, "#2563EB")}
    ${arrow(1245, 235, 1315, 310, "#059669")}
    ${arrow(1245, 445, 1315, 355, "#D97706")}
    <rect x="390" y="610" width="820" height="98" rx="18" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
    ${multiline("Projection rule: the centroid's row-level score is copied to every response in that cluster, enabling model rankings without judging every answer independently.", 800, 662, 94, { size: 23, fill: "#334155" })}
    ${arrow(1450, 420, 1210, 657, "#B91C1C", true)}
  `;
  return svgShell(
    780,
    "Dasha Clustering and Rubric-Based Projection",
    "The scored unit is a legal-reasoning centroid; member responses inherit the centroid's rubric score.",
    body,
  );
}

await saveFigure("fig_pipeline_overview", pipelineOverview());
await saveFigure("fig_perturbation_tracks", perturbationTracks());
await saveFigure("fig_clustering_judging", clusteringJudging());
