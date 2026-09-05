import path from 'path';

/** Uploads are buffered in memory and written to disk; keep them bounded and to known text formats. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_UPLOAD_BYTES = 100 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.pdf', '.txt', '.md']);

/** Returns an error message for a rejected upload set, or null when every file is acceptable. */
export function validateUploads(entries: FormDataEntryValue[]): { error: string; status: number } | null {
    let total = 0;
    for (const entry of entries) {
        if (!(entry instanceof File)) {
            return { error: 'Invalid file upload.', status: 400 };
        }
        const extension = path.extname(entry.name).toLowerCase();
        if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
            return { error: `Unsupported file type "${extension || 'none'}"; upload .pdf, .txt, or .md.`, status: 400 };
        }
        if (entry.size > MAX_UPLOAD_BYTES) {
            return { error: `"${entry.name}" is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`, status: 413 };
        }
        total += entry.size;
        if (total > MAX_TOTAL_UPLOAD_BYTES) {
            return { error: `Uploads total more than ${MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024)} MB.`, status: 413 };
        }
    }
    return null;
}
