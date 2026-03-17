export type JudgeRubricTemplate = {
    id: string;
    name: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    fileName?: string;
};

export const JUDGE_RUBRIC_LIBRARY_STORAGE_KEY = 'general-benchmarking.judge-rubric-library.v1';
const BUILTIN_RUBRIC_TIMESTAMP = '2026-02-24T00:00:00.000Z';

export const BUILTIN_JUDGE_RUBRIC_TEMPLATES: JudgeRubricTemplate[] = [
    {
        id: 'builtin_rubric_balanced_v1',
        name: 'Judge Rubric: Balanced IRAC',
        createdAt: BUILTIN_RUBRIC_TIMESTAMP,
        updatedAt: BUILTIN_RUBRIC_TIMESTAMP,
        content: [
            'You are a strict legal evaluator.',
            'Evaluate the provided model answer against the user question and return JSON only.',
            'Focus on legal correctness, rule fidelity, factual application, and clarity.',
            '',
            'Return JSON exactly in this shape:',
            '{',
            '  "overall_score": 0,',
            '  "criteria_scores": {',
            '    "legal_correctness": 0,',
            '    "rule_fidelity": 0,',
            '    "application_quality": 0,',
            '    "clarity": 0',
            '  },',
            '  "strengths": ["..."],',
            '  "weaknesses": ["..."],',
            '  "issues": ["..."],',
            '  "summary": "..."',
            '}',
            '',
            'Scoring rules:',
            '- overall_score and criteria_scores values must be numbers from 0 to 100.',
            '- strengths, weaknesses, and issues should each have 1-5 concise items.',
            '- summary should be one concise sentence.',
        ].join('\n'),
    },
    {
        id: 'builtin_rubric_strict_sof_v1',
        name: 'Judge Rubric: SoF-Strict',
        createdAt: BUILTIN_RUBRIC_TIMESTAMP,
        updatedAt: BUILTIN_RUBRIC_TIMESTAMP,
        content: [
            'You are a strict legal evaluator focused on Statute of Frauds and contract enforceability doctrine.',
            'Return JSON only and do not include markdown.',
            '',
            'Return JSON exactly in this shape:',
            '{',
            '  "overall_score": 0,',
            '  "criteria_scores": {',
            '    "sof_issue_spotting": 0,',
            '    "exception_analysis": 0,',
            '    "conclusion_quality": 0,',
            '    "factual_fidelity": 0',
            '  },',
            '  "strengths": ["..."],',
            '  "weaknesses": ["..."],',
            '  "issues": ["..."],',
            '  "summary": "..."',
            '}',
            '',
            'Scoring rules:',
            '- overall_score and each criterion score must be 0-100.',
            '- Penalize omission of controlling SoF doctrine heavily.',
            '- Be explicit about strengths and weaknesses.',
        ].join('\n'),
    },
];

export function createJudgeRubricTemplate(name: string, content: string): JudgeRubricTemplate {
    const now = new Date().toISOString();
    return {
        id: `judge_rubric_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || 'Untitled judge rubric',
        content,
        createdAt: now,
        updatedAt: now,
    };
}

type JudgeRubricLibraryStorageOptions = {
    storageKey?: string;
    builtinTemplates?: JudgeRubricTemplate[];
};

export function readJudgeRubricLibraryFromStorage(options: JudgeRubricLibraryStorageOptions = {}) {
    const storageKey = options.storageKey ?? JUDGE_RUBRIC_LIBRARY_STORAGE_KEY;
    const builtinTemplates = options.builtinTemplates ?? BUILTIN_JUDGE_RUBRIC_TEMPLATES;

    if (typeof window === 'undefined') {
        return builtinTemplates;
    }

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return builtinTemplates;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return builtinTemplates;
        }

        const userRubrics = parsed
            .map((item) => normalizeJudgeRubricTemplate(item))
            .filter((item): item is JudgeRubricTemplate => item !== null)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        return mergeJudgeRubricLibraries(builtinTemplates, userRubrics);
    } catch (error) {
        console.error('Failed to read judge rubric library:', error);
        return builtinTemplates;
    }
}

export function writeJudgeRubricLibraryToStorage(
    rubrics: JudgeRubricTemplate[],
    storageKey = JUDGE_RUBRIC_LIBRARY_STORAGE_KEY,
) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(storageKey, JSON.stringify(rubrics));
    } catch (error) {
        console.error('Failed to persist judge rubric library:', error);
    }
}

export function parseJudgeRubricLibraryImport(raw: string) {
    try {
        const parsed = JSON.parse(raw) as unknown;
        const list = Array.isArray(parsed)
            ? parsed
            : (isRecord(parsed) && Array.isArray(parsed.rubrics) ? parsed.rubrics : null);

        if (!list) {
            return {
                rubrics: [] as JudgeRubricTemplate[],
                error: 'Invalid import format. Expected an array or { "rubrics": [...] }.',
            };
        }

        const rubrics = list
            .map((item) => normalizeJudgeRubricTemplate(item))
            .filter((item): item is JudgeRubricTemplate => item !== null)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        if (rubrics.length === 0) {
            return {
                rubrics,
                error: 'No valid judge rubric templates found in import file.',
            };
        }

        return { rubrics, error: null as string | null };
    } catch {
        return {
            rubrics: [] as JudgeRubricTemplate[],
            error: 'Invalid JSON file.',
        };
    }
}

export function mergeJudgeRubricLibraries(existing: JudgeRubricTemplate[], incoming: JudgeRubricTemplate[]) {
    const byId = new Map<string, JudgeRubricTemplate>();
    for (const rubric of existing) {
        byId.set(rubric.id, rubric);
    }
    for (const rubric of incoming) {
        const previous = byId.get(rubric.id);
        if (!previous || rubric.updatedAt > previous.updatedAt) {
            byId.set(rubric.id, rubric);
        }
    }
    return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function judgeRubricLibraryToJson(rubrics: JudgeRubricTemplate[]) {
    return JSON.stringify({ rubrics }, null, 2);
}

export function isBuiltinJudgeRubricTemplateId(
    id: string,
    builtinTemplates: JudgeRubricTemplate[] = BUILTIN_JUDGE_RUBRIC_TEMPLATES,
) {
    return builtinTemplates.some((template) => template.id === id);
}

function normalizeJudgeRubricTemplate(value: unknown): JudgeRubricTemplate | null {
    if (!isRecord(value)) {
        return null;
    }

    const id = typeof value.id === 'string' && value.id.trim().length > 0
        ? value.id
        : `judge_rubric_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const name = typeof value.name === 'string' && value.name.trim().length > 0
        ? value.name.trim()
        : 'Untitled judge rubric';
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
