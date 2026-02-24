import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question } = body;

    if (!question || typeof question !== "string" || question.trim() === "") {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 },
      );
    }

    const projectRoot = path.resolve(process.cwd(), "../");
    const questionsDir = path.join(
      projectRoot,
      "lsh-IRAC",
      "data",
      "questions",
    );
    const tempFilePath = path.join(
      questionsDir,
      `temp_frontend_question_${Date.now()}.txt`,
    );

    // Ensure questions directory exists
    await fs.mkdir(questionsDir, { recursive: true });

    // Write the question to a temp file
    await fs.writeFile(tempFilePath, question, "utf8");

    console.log(`Starting benchmark run for question at ${tempFilePath}`);

    // Run the python script
    const pythonCommand = `lsh/.venv/bin/python3 lsh-IRAC/run_irac_benchmark.py --question '${tempFilePath}'`;

    // Use a generous timeout since these models might take a while
    const { stdout, stderr } = await execAsync(pythonCommand, {
      cwd: projectRoot,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for output
    });

    console.log(
      `Benchmark completed with stdout: ${stdout.substring(0, 100)}...`,
    );

    // Clean up temp file
    await fs
      .unlink(tempFilePath)
      .catch((e) => console.error("Failed to clean up temp file:", e));

    return NextResponse.json({ success: true, stdout });
  } catch (error) {
    console.error("Failed to run benchmark:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 },
    );
  }
}
