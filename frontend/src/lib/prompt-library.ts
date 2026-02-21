export type PromptTemplate = {
    id: string;
    name: string;
    content: string;
    createdAt: string;
    updatedAt: string;
};

export const PROMPT_LIBRARY_STORAGE_KEY = 'general-benchmarking.prompt-library.v1';
const BUILTIN_PROMPT_TIMESTAMP = '2026-02-21T00:00:00.000Z';

export const BUILTIN_PROMPT_TEMPLATES: PromptTemplate[] = [
    {
        id: 'builtin_irac_parsed_v1',
        name: 'IRAC+Gates (Parsed)',
        createdAt: BUILTIN_PROMPT_TIMESTAMP,
        updatedAt: BUILTIN_PROMPT_TIMESTAMP,
        content: [
            'You are a legal reasoning assistant.',
            'Do not fabricate cases, statutes, quotes, or facts.',
            'If jurisdiction or time is missing, state a reasonable assumption briefly.',
            'If the premise is impossible or false, say so and stop.',
            '',
            'Use IRAC+Gates internally:',
            '1. Issue: identify the dispositive legal issue first.',
            '2. Rule/Test: state controlling rule elements and key exceptions.',
            '3. Application: apply each rule element to the provided facts using explicit because/since reasoning.',
            '4. Conclusion: state likely legal outcome and strongest counterargument.',
            '',
            'Treat independent legal requirements as separate gates.',
            'Map each exception/defense to the specific gate it modifies.',
            '',
            'For this benchmark question, after reasoning, output ONLY the final answer letter (A-J).',
            'No explanation in the final output.',
        ].join('\n'),
    },
];

export function createPromptTemplate(name: string, content: string): PromptTemplate {
    const now = new Date().toISOString();
    return {
        id: `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || 'Untitled prompt',
        content,
        createdAt: now,
        updatedAt: now,
    };
}

export function readPromptLibraryFromStorage() {
    if (typeof window === 'undefined') {
        return BUILTIN_PROMPT_TEMPLATES;
    }

    try {
        const raw = window.localStorage.getItem(PROMPT_LIBRARY_STORAGE_KEY);
        if (!raw) {
            return BUILTIN_PROMPT_TEMPLATES;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        const parsedPrompts = parsed
            .map((item) => normalizePromptTemplate(item))
            .filter((item): item is PromptTemplate => item !== null)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return mergePromptLibraries(BUILTIN_PROMPT_TEMPLATES, parsedPrompts);
    } catch (error) {
        console.error('Failed to read prompt library:', error);
        return BUILTIN_PROMPT_TEMPLATES;
    }
}

export function writePromptLibraryToStorage(prompts: PromptTemplate[]) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(PROMPT_LIBRARY_STORAGE_KEY, JSON.stringify(prompts));
    } catch (error) {
        console.error('Failed to persist prompt library:', error);
    }
}

export function parsePromptLibraryImport(raw: string) {
    try {
        const parsed = JSON.parse(raw) as unknown;
        const list = Array.isArray(parsed)
            ? parsed
            : (isRecord(parsed) && Array.isArray(parsed.prompts) ? parsed.prompts : null);

        if (!list) {
            return {
                prompts: [] as PromptTemplate[],
                error: 'Invalid import format. Expected an array or { "prompts": [...] }.',
            };
        }

        const prompts = list
            .map((item) => normalizePromptTemplate(item))
            .filter((item): item is PromptTemplate => item !== null)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        if (prompts.length === 0) {
            return {
                prompts,
                error: 'No valid prompts found in import file.',
            };
        }

        return { prompts, error: null as string | null };
    } catch {
        return {
            prompts: [] as PromptTemplate[],
            error: 'Invalid JSON file.',
        };
    }
}

export function mergePromptLibraries(existing: PromptTemplate[], incoming: PromptTemplate[]) {
    const byId = new Map<string, PromptTemplate>();

    for (const prompt of existing) {
        byId.set(prompt.id, prompt);
    }
    for (const prompt of incoming) {
        const previous = byId.get(prompt.id);
        if (!previous || prompt.updatedAt > previous.updatedAt) {
            byId.set(prompt.id, prompt);
        }
    }

    return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function promptLibraryToJson(prompts: PromptTemplate[]) {
    return JSON.stringify({ prompts }, null, 2);
}

export function isBuiltinPromptTemplateId(id: string) {
    return BUILTIN_PROMPT_TEMPLATES.some((template) => template.id === id);
}

function normalizePromptTemplate(value: unknown): PromptTemplate | null {
    if (!isRecord(value)) {
        return null;
    }

    const id = typeof value.id === 'string' && value.id.trim().length > 0
        ? value.id
        : `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const name = typeof value.name === 'string' && value.name.trim().length > 0
        ? value.name.trim()
        : 'Untitled prompt';
    const content = typeof value.content === 'string' ? value.content : '';

    if (!content.trim()) {
        return null;
    }

    const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim().length > 0
        ? value.createdAt
        : new Date().toISOString();
    const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt.trim().length > 0
        ? value.updatedAt
        : createdAt;

    return { id, name, content, createdAt, updatedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
