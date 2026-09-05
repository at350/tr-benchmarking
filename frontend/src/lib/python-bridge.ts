import 'server-only';

import fs from 'fs/promises';
import path from 'path';

/** Repository root, whether the server was started from `frontend/` or the root. */
export function resolveRepoRoot() {
    return path.basename(process.cwd()) === 'frontend' ? path.resolve(process.cwd(), '..') : process.cwd();
}

/**
 * Python interpreter with the `trbench` package installed. Checked in order: the TRBENCH_PYTHON
 * environment variable (for conda, uv, pyenv or system installs), the repository's `.venv`, and
 * then `python3` from PATH when `fallbackToPath` is set; otherwise `null` so the caller can skip
 * the Python step.
 */
export async function resolvePythonExecutable(options: { fallbackToPath: true }): Promise<string>;
export async function resolvePythonExecutable(options?: { fallbackToPath?: boolean }): Promise<string | null>;
export async function resolvePythonExecutable(options?: { fallbackToPath?: boolean }): Promise<string | null> {
    const configured = process.env.TRBENCH_PYTHON?.trim();
    if (configured) {
        return configured;
    }
    const root = resolveRepoRoot();
    const candidates = [
        path.join(root, '.venv', 'bin', 'python3'),
        path.join(root, '.venv', 'Scripts', 'python.exe'),
    ];
    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // try the next candidate
        }
    }
    return options?.fallbackToPath ? 'python3' : null;
}
