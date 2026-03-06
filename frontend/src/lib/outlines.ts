import 'server-only';

import fs from 'fs';
import path from 'path';

const OUTLINE_FILE_PATTERN = /^[A-Za-z0-9._-]+\.pdf$/i;

export type OutlineFile = {
    id: string;
    fileName: string;
    title: string;
    sizeBytes: number;
    modifiedAt: string;
    viewUrl: string;
};

function toOutlineTitle(fileName: string) {
    const baseName = fileName.replace(/\.pdf$/i, '');
    return baseName
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveOutlinesDirectory() {
    const candidates = [
        path.resolve(process.cwd(), '../outlines'),
        path.resolve(process.cwd(), 'outlines'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || null;
}

export function isValidOutlineFileName(fileName: string) {
    return OUTLINE_FILE_PATTERN.test(fileName);
}

export function listOutlines(): OutlineFile[] {
    const outlinesDirectory = resolveOutlinesDirectory();
    if (!outlinesDirectory) {
        return [];
    }

    const entries = fs.readdirSync(outlinesDirectory, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && isValidOutlineFileName(entry.name))
        .map((entry) => {
            const fullPath = path.join(outlinesDirectory, entry.name);
            const stats = fs.statSync(fullPath);
            return {
                id: entry.name,
                fileName: entry.name,
                title: toOutlineTitle(entry.name),
                sizeBytes: stats.size,
                modifiedAt: stats.mtime.toISOString(),
                viewUrl: `/api/outlines/${encodeURIComponent(entry.name)}`,
            };
        })
        .sort((a, b) => a.title.localeCompare(b.title));
}

export function getOutlineFilePath(fileName: string) {
    if (!isValidOutlineFileName(fileName)) {
        return null;
    }
    const outlinesDirectory = resolveOutlinesDirectory();
    if (!outlinesDirectory) {
        return null;
    }
    const fullPath = path.join(outlinesDirectory, fileName);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        return null;
    }
    return fullPath;
}

export function readOutlineFileBuffer(fileName: string) {
    const fullPath = getOutlineFilePath(fileName);
    if (!fullPath) {
        return null;
    }
    return fs.readFileSync(fullPath);
}
