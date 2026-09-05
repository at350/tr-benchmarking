import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs/promises";

import { resolvePythonExecutable, resolveRepoRoot } from "@/lib/python-bridge";

const execFileAsync = promisify(execFile);

/** A full benchmark queries every model 20 times; give up after this long. */
const BENCHMARK_TIMEOUT_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  let tempFilePath: string | null = null;
  try {
    const body = await req.json();
    const { question } = body;

    if (!question || typeof question !== "string" || question.trim() === "") {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const root = resolveRepoRoot();
    const scriptPath = path.join(root, "lsh-IRAC", "run_irac_benchmark.py");
    const pythonExecutable = await resolvePythonExecutable({ fallbackToPath: true });

    // The benchmark script takes the question as a file path.
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "tr-benchmark-"));
    tempFilePath = path.join(tempDirectory, "question.txt");
    await fs.writeFile(tempFilePath, question, "utf8");

    // execFile passes arguments directly (no shell), so the path is never interpolated into a command string.
    const { stdout } = await execFileAsync(
      pythonExecutable,
      [scriptPath, "--question", tempFilePath],
      {
        cwd: root,
        maxBuffer: 1024 * 1024 * 10, // model runs produce a lot of output
        timeout: BENCHMARK_TIMEOUT_MS,
        killSignal: "SIGTERM",
      },
    );

    return NextResponse.json({ success: true, stdout });
  } catch (error) {
    console.error("Failed to run benchmark:", error);
    const timedOut = typeof error === "object" && error !== null && (error as { killed?: boolean }).killed === true;
    const message = timedOut
      ? `Benchmark exceeded ${BENCHMARK_TIMEOUT_MS / 60000} minutes and was stopped.`
      : error instanceof Error ? error.message : "Unknown error occurred.";
    return NextResponse.json({ error: message, success: false }, { status: timedOut ? 504 : 500 });
  } finally {
    if (tempFilePath) {
      await fs.rm(path.dirname(tempFilePath), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
