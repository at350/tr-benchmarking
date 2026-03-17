import fs from 'fs/promises';
import path from 'path';

import type { JudgeRubricTemplate } from '@/lib/judge-rubric-library';
import type { PromptTemplate } from '@/lib/prompt-library';

export type PromptLibraryKind = 'generation' | 'judge';

type PromptRecord = PromptTemplate | JudgeRubricTemplate;

type SavePromptFileInput = {
    existingId?: string | null;
    name?: string | null;
    content: string;
    sourceFileName?: string | null;
};

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.text']);

export async function listLocalPromptFiles(kind: PromptLibraryKind): Promise<PromptRecord[]> {
    const directory = await ensurePromptLibraryDirectory(kind);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = entries
        .filter((entry) => entry.isFile() && isSupportedPromptFile(entry.name))
        .map((entry) => entry.name);

    const records = await Promise.all(files.map(async (fileName) => readPromptFileRecord(kind, fileName)));
    return records
        .filter((record): record is PromptRecord => record !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveLocalPromptFile(
    kind: PromptLibraryKind,
    input: SavePromptFileInput,
): Promise<PromptRecord> {
    const directory = await ensurePromptLibraryDirectory(kind);
    const existingId = normalizeExistingId(input.existingId);
    const currentFileName = existingId && isSupportedPromptFile(existingId) ? existingId : null;
    const targetFileName = await chooseTargetFileName(directory, {
        existingFileName: currentFileName,
        desiredName: input.name,
        sourceFileName: input.sourceFileName,
        kind,
    });
    const targetPath = path.join(directory, targetFileName);

    await fs.writeFile(targetPath, normalizePromptContent(input.content), 'utf8');

    if (currentFileName && currentFileName !== targetFileName) {
        const currentPath = path.join(directory, currentFileName);
        await fs.unlink(currentPath).catch((error: unknown) => {
            if (!isMissingFileError(error)) {
                throw error;
            }
        });
    }

    const saved = await readPromptFileRecord(kind, targetFileName);
    if (!saved) {
        throw new Error('Saved prompt file could not be reloaded.');
    }

    return saved;
}

export async function deleteLocalPromptFile(kind: PromptLibraryKind, fileName: string) {
    if (!isSupportedPromptFile(fileName)) {
        throw new Error('Invalid prompt file name.');
    }

    const directory = await ensurePromptLibraryDirectory(kind);
    const targetPath = path.join(directory, fileName);
    await fs.unlink(targetPath);
}

export function getPromptLibraryDirectory(kind: PromptLibraryKind) {
    const cwd = process.cwd();
    const cwdBase = path.basename(cwd);

    const preferredCandidates = cwdBase === 'frontend'
        ? [
            path.resolve(cwd, '../prompt-libraries', kind),
            path.resolve(cwd, 'prompt-libraries', kind),
        ]
        : [
            path.resolve(cwd, 'prompt-libraries', kind),
            path.resolve(cwd, 'frontend/prompt-libraries', kind),
        ];

    return preferredCandidates[0];
}

export function isValidPromptLibraryKind(value: string): value is PromptLibraryKind {
    return value === 'generation' || value === 'judge';
}

async function ensurePromptLibraryDirectory(kind: PromptLibraryKind) {
    const directory = getPromptLibraryDirectory(kind);
    await fs.mkdir(directory, { recursive: true });
    return directory;
}

async function readPromptFileRecord(kind: PromptLibraryKind, fileName: string): Promise<PromptRecord | null> {
    if (!isSupportedPromptFile(fileName)) {
        return null;
    }

    const directory = await ensurePromptLibraryDirectory(kind);
    const fullPath = path.join(directory, fileName);

    try {
        const [content, stats] = await Promise.all([
            fs.readFile(fullPath, 'utf8'),
            fs.stat(fullPath),
        ]);

        return {
            id: fileName,
            fileName,
            name: path.basename(fileName, path.extname(fileName)),
            content,
            createdAt: stats.birthtime.toISOString(),
            updatedAt: stats.mtime.toISOString(),
        };
    } catch (error) {
        if (isMissingFileError(error)) {
            return null;
        }
        throw error;
    }
}

async function chooseTargetFileName(
    directory: string,
    input: {
        existingFileName: string | null;
        desiredName?: string | null;
        sourceFileName?: string | null;
        kind: PromptLibraryKind;
    },
) {
    const requestedBaseName = buildRequestedBaseName(input.desiredName, input.sourceFileName, input.existingFileName, input.kind);
    const extension = chooseExtension(input.sourceFileName, input.existingFileName);
    const candidate = `${requestedBaseName}${extension}`;

    if (!input.existingFileName || candidate !== input.existingFileName) {
        return ensureUniqueFileName(directory, candidate, input.existingFileName);
    }

    return candidate;
}

async function ensureUniqueFileName(directory: string, candidate: string, ignoreFileName: string | null) {
    const parsed = path.parse(candidate);
    let attempt = 0;
    let nextCandidate = candidate;

    while (true) {
        const exists = await fileExists(path.join(directory, nextCandidate));
        if (!exists || nextCandidate === ignoreFileName) {
            return nextCandidate;
        }
        attempt += 1;
        nextCandidate = `${parsed.name} ${attempt + 1}${parsed.ext}`;
    }
}

function buildRequestedBaseName(
    desiredName: string | null | undefined,
    sourceFileName: string | null | undefined,
    existingFileName: string | null,
    kind: PromptLibraryKind,
) {
    const rawName = desiredName?.trim()
        || getBaseName(sourceFileName)
        || getBaseName(existingFileName)
        || (kind === 'generation' ? 'Untitled Prompt' : 'Untitled Judge Rubric');

    const sanitized = rawName
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return sanitized || (kind === 'generation' ? 'Untitled Prompt' : 'Untitled Judge Rubric');
}

function chooseExtension(sourceFileName: string | null | undefined, existingFileName: string | null) {
    const sourceExtension = sourceFileName ? path.extname(sourceFileName).toLowerCase() : '';
    if (ALLOWED_EXTENSIONS.has(sourceExtension)) {
        return sourceExtension;
    }

    const existingExtension = existingFileName ? path.extname(existingFileName).toLowerCase() : '';
    if (ALLOWED_EXTENSIONS.has(existingExtension)) {
        return existingExtension;
    }

    return '.txt';
}

function getBaseName(fileName: string | null | undefined) {
    if (!fileName) {
        return '';
    }

    const parsed = path.parse(fileName);
    return parsed.name.trim();
}

function isSupportedPromptFile(fileName: string) {
    if (!fileName || fileName !== path.basename(fileName)) {
        return false;
    }

    return ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function normalizePromptContent(content: string) {
    return content.replace(/\r\n/g, '\n');
}

function normalizeExistingId(existingId: string | null | undefined) {
    if (!existingId || !existingId.trim()) {
        return null;
    }

    return existingId.trim();
}

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function isMissingFileError(error: unknown) {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ENOENT';
}
