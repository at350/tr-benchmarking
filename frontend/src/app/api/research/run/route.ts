import { execFile } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const runDir = path.join(repoRoot, "research/runs/tiny_offline");
  try {
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [
        "-m",
        "research.validation",
        "run",
        "--config",
        "research/fixtures/tiny_config.json",
        "--repo-root",
        repoRoot,
      ],
      {
        cwd: repoRoot,
        timeout: 120_000,
      },
    );
    const readJson = async (name: string) =>
      JSON.parse(await readFile(path.join(runDir, name), "utf8"));

    return Response.json({
      status: "internal_validation_ready",
      outputDir: "research/runs/tiny_offline",
      sourceCase: await readFile(path.join(repoRoot, "research/fixtures/tiny_source_case.txt"), "utf8"),
      artifacts: {
        manifest: await readJson("manifest.json"),
        frank: await readJson("frank_packet.json"),
        karthic: await readJson("karthic_rubric.json"),
        responses: await readJson("responses.json"),
        dasha: await readJson("dasha_clusters.json"),
        judge: await readJson("judge_scores.json"),
        zak: await readJson("zak_packets.json"),
      },
      stdout,
      stderr,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    return Response.json({ error: message }, { status: 500 });
  }
}
