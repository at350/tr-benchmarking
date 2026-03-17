import type { JudgeRubricTemplate } from '@/lib/judge-rubric-library';
import type { PromptTemplate } from '@/lib/prompt-library';

export type PromptLibraryKind = 'generation' | 'judge';

type PromptFileResponse<T> = {
    items?: T[];
    item?: T;
    directory?: string;
    error?: string;
};

type SavePromptFileInput = {
    kind: PromptLibraryKind;
    existingId?: string;
    name?: string;
    content: string;
    sourceFileName?: string;
};

type PromptRecordMap = {
    generation: PromptTemplate;
    judge: JudgeRubricTemplate;
};

export async function fetchPromptFiles<K extends PromptLibraryKind>(kind: K) {
    const response = await fetch(`/api/prompt-files?kind=${encodeURIComponent(kind)}`, { cache: 'no-store' });
    const json = (await response.json()) as PromptFileResponse<PromptRecordMap[K]>;

    if (!response.ok) {
        throw new Error(json.error || 'Failed to load prompt files.');
    }

    return {
        items: Array.isArray(json.items) ? json.items : [],
        directory: typeof json.directory === 'string' ? json.directory : '',
    };
}

export async function savePromptFile<K extends PromptLibraryKind>(input: SavePromptFileInput) {
    const response = await fetch('/api/prompt-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    const json = (await response.json()) as PromptFileResponse<PromptRecordMap[K]>;

    if (!response.ok || !json.item) {
        throw new Error(json.error || 'Failed to save prompt file.');
    }

    return {
        item: json.item,
        directory: typeof json.directory === 'string' ? json.directory : '',
    };
}

export async function uploadPromptFile<K extends PromptLibraryKind>(kind: K, file: File) {
    const content = await file.text();
    return savePromptFile<K>({
        kind,
        name: file.name.replace(/\.[^.]+$/, ''),
        content,
        sourceFileName: file.name,
    });
}

export async function deletePromptFile(kind: PromptLibraryKind, id: string) {
    const response = await fetch('/api/prompt-files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id }),
    });
    const json = (await response.json()) as { error?: string };

    if (!response.ok) {
        throw new Error(json.error || 'Failed to delete prompt file.');
    }
}
