import { NextResponse } from 'next/server';
import OpenAI from 'openai';

import { getLshClusterJudgePayload } from '@/lib/lsh-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type Provider = 'openai' | 'anthropic' | 'gemini';
type ReasoningEffort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh';
type RowKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';
type CapKey = 'none' | 'cap_60' | 'cap_70';

const ROW_ORDER: RowKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

const ROW_WEIGHTS: Record<RowKey, number> = {
    A: 15,
    B: 11,
    C: 15,
    D: 5,
    E: 9,
    F: 7,
    G: 7,
    H: 5,
    I: 5,
    J: 5,
    K: 8,
    L: 4,
    M: 4,
};

const PENALTY_DEFINITIONS = {
    controlling_doctrine_omitted: { points: 15, label: 'Controlling doctrine omitted' },
    material_rule_misstatement: { points: 10, label: 'Material rule or test misstatement' },
    material_fact_timeline_error: { points: 10, label: 'Material fact or timeline error' },
    exception_bleed_over: { points: 10, label: 'Exception bleed-over across barriers' },
    irrelevant_doctrine_invoked: { points: 5, label: 'Irrelevant doctrine invoked' },
    excessive_hedging: { points: 5, label: 'Excessive hedging replacing analysis' },
    reliance_by_performance_only: { points: 5, label: 'Reliance-by-performance assertion without inducement and detriment' },
    jurisdiction_drift: { points: 5, label: 'Jurisdiction drift or foreign doctrine import without assumption' },
} as const;

type PenaltyKey = keyof typeof PENALTY_DEFINITIONS;

const PROVIDERS = new Set<Provider>(['openai', 'anthropic', 'gemini']);
const CAP_KEYS = new Set<CapKey>(['none', 'cap_60', 'cap_70']);

const OUTCOME_OPTIONS = {
    bottomLineOutcome: ['Enforceable', 'Not enforceable', 'Mixed / depends', 'No clear conclusion'],
    outcomeCorrectness: ['Correct', 'Arguably correct / jurisdiction-dependent', 'Incorrect', 'Indeterminate (insufficient info)'],
    reasoningAlignment: [
        'Right result / right reason',
        'Right result / wrong or incomplete reason',
        'Wrong result / plausible reasoning',
        'Wrong result / poor reasoning',
    ],
} as const;

const BASE_RUBRIC = `
Outcome tags (metadata only):
- Bottom-line outcome: Enforceable | Not enforceable | Mixed / depends | No clear conclusion
- Outcome correctness: Correct | Arguably correct / jurisdiction-dependent | Incorrect | Indeterminate (insufficient info)
- Reasoning alignment: Right result / right reason | Right result / wrong or incomplete reason | Wrong result / plausible reasoning | Wrong result / poor reasoning
- Jurisdiction assumption if prompt is silent

Scoring anchors for each row A-M:
0 = absent or materially wrong
1 = mentioned but incorrect/superficial
2 = partially correct
3 = mostly correct
4 = strong

Points formula:
row_points = row_weight * (row_score / 4)

Core rubric rows and weights:
A Issue spotting + prioritization (15)
B Formation framing + consideration vs conditional gift (11)
C SoF categories + triggers and enforceability vs proof distinction (15)
D One-year SoF test + application (5)
E Suretyship nuance + main purpose prerequisites (9)
F SoF exceptions/workarounds + limits (7)
G Promissory estoppel alternative + reliance rigor (7)
H Defenses/conditions/mistake: motive vs condition precedent (5)
I Factual fidelity + internal consistency (5)
J Clear bottom line + structured reasoning (5)
K Barrier stacking + exception mapping (8)
L Scope calibration / claim discipline (4)
M Relevance discipline / prompt adherence (4)

Penalty options (subtract after subtotal):
- controlling_doctrine_omitted (-15)
- material_rule_misstatement (-10)
- material_fact_timeline_error (-10)
- exception_bleed_over (-10)
- irrelevant_doctrine_invoked (-5)
- excessive_hedging (-5)
- reliance_by_performance_only (-5)
- jurisdiction_drift (-5)

Optional caps:
- cap_60 if most dispositive SoF category / controlling doctrine omitted
- cap_70 if key doctrines are mentioned but no bottom-line conclusion
`;

type RequestBody = {
    runFile?: string;
    clusterId?: string;
    judgeProvider?: Provider;
    judgeModel?: string;
    reasoningEffort?: ReasoningEffort;
    customInstructions?: string;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type GenerateModelOptions = {
    provider: Provider;
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort?: ReasoningEffort;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        const runFile = toRequiredString(body.runFile, 'runFile');
        const clusterId = toRequiredString(body.clusterId, 'clusterId');
        const judgeModel = toRequiredString(body.judgeModel, 'judgeModel');
        const judgeProvider = normalizeProvider(body.judgeProvider);
        const reasoningEffort = normalizeReasoningEffort(body.reasoningEffort);

        if (!judgeProvider) {
            return NextResponse.json({ error: 'Invalid judge provider.' }, { status: 400 });
        }

        const cluster = getLshClusterJudgePayload(runFile, clusterId);
        if (!cluster) {
            return NextResponse.json({ error: 'Cluster not found.' }, { status: 404 });
        }

        const customInstructions = typeof body.customInstructions === 'string'
            ? body.customInstructions.trim()
            : '';

        const clusterContext = buildClusterContext(cluster);
        const systemPrompt = [
            'You are an expert legal writing evaluator and strict rubric grader.',
            'Apply the provided rubric exactly.',
            'Return only strict JSON with no markdown and no extra text.',
            'Do not omit required keys.',
        ].join('\n');

        const userPrompt = [
            'Grade this cluster of LLM responses using the rubric below.',
            '',
            'Return JSON in this exact shape:',
            '{',
            '  "outcomes": {',
            '    "bottomLineOutcome": "...",',
            '    "outcomeCorrectness": "...",',
            '    "reasoningAlignment": "...",',
            '    "jurisdictionAssumption": "..."',
            '  },',
            '  "rowScores": { "A": 0, "B": 0, "C": 0, "D": 0, "E": 0, "F": 0, "G": 0, "H": 0, "I": 0, "J": 0, "K": 0, "L": 0, "M": 0 },',
            '  "penaltiesApplied": ["controlling_doctrine_omitted"],',
            '  "cap": "none",',
            '  "summary": "...",',
            '  "strengths": ["..."],',
            '  "weaknesses": ["..."],',
            '  "improvementSuggestions": ["..."]',
            '}',
            '',
            'Rules:',
            '- rowScores must be integers from 0 to 4.',
            '- penaltiesApplied must use only allowed penalty keys.',
            '- cap must be one of: none, cap_60, cap_70.',
            '- summary must be concise and specific to this cluster.',
            '',
            'Rubric:',
            BASE_RUBRIC,
            '',
            customInstructions ? `Additional judge instructions:\n${customInstructions}` : 'Additional judge instructions: none',
            '',
            'Cluster data to grade:',
            clusterContext,
        ].join('\n');

        const rawOutput = await generateModelResponse({
            provider: judgeProvider,
            model: judgeModel,
            systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            temperature: 0,
            reasoningEffort,
        });

        const scoring = parseAndScoreJudgeOutput(rawOutput);

        return NextResponse.json({
            grading: scoring,
            cluster: {
                runFile: cluster.fileName,
                clusterId: cluster.clusterId,
                memberCount: cluster.members.length,
                representative: cluster.representative,
                modelBreakdown: cluster.modelBreakdown,
            },
            judgeConfig: {
                provider: judgeProvider,
                model: judgeModel,
                reasoningEffort,
                customInstructions,
            },
        });
    } catch (error) {
        console.error('Cluster judging failed:', error);
        const message = error instanceof Error ? error.message : 'Cluster judging failed.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function toRequiredString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} is required.`);
    }
    return value.trim();
}

function normalizeProvider(value: unknown): Provider | null {
    if (typeof value !== 'string') {
        return null;
    }
    if (!PROVIDERS.has(value as Provider)) {
        return null;
    }
    return value as Provider;
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
    if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'auto') {
        return value;
    }
    return 'auto';
}

function buildClusterContext(cluster: NonNullable<ReturnType<typeof getLshClusterJudgePayload>>) {
    const sampledMembers = sampleMembersEvenly(cluster.members, 22).map((member, index) => ({
        ...member,
        text: limitText(member.text, 900),
        index: index + 1,
    }));

    const modelLine = cluster.modelBreakdown.map((entry) => `${entry.model}: ${entry.count}`).join(', ');

    return [
        `Run file: ${cluster.fileName}`,
        `Cluster ID: ${cluster.clusterId}`,
        `Cluster size: ${cluster.members.length}`,
        `Model breakdown: ${modelLine}`,
        '',
        'Representative response:',
        `id=${cluster.representative.id}; model=${cluster.representative.model}`,
        cluster.representative.text || '[empty]',
        '',
        `Sampled cluster members (${sampledMembers.length}/${cluster.members.length}):`,
        ...sampledMembers.map((member) => (
            `[${member.index}] id=${member.id}; model=${member.model}\n${member.text || '[empty]'}`
        )),
    ].join('\n');
}

function sampleMembersEvenly<T>(items: T[], maxItems: number) {
    if (items.length <= maxItems) {
        return items;
    }

    const result: T[] = [];
    const used = new Set<number>();

    for (let i = 0; i < maxItems; i += 1) {
        const index = Math.round((i * (items.length - 1)) / Math.max(maxItems - 1, 1));
        if (!used.has(index)) {
            used.add(index);
            result.push(items[index]);
        }
    }

    if (result.length < maxItems) {
        for (let i = 0; i < items.length && result.length < maxItems; i += 1) {
            if (used.has(i)) {
                continue;
            }
            used.add(i);
            result.push(items[i]);
        }
    }

    return result;
}

function limitText(text: string, limit: number) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= limit) {
        return cleaned;
    }
    return `${cleaned.slice(0, limit - 3)}...`;
}

function parseAndScoreJudgeOutput(rawOutput: string) {
    const parsed = parseJsonObject(rawOutput);
    const parseFailed = parsed === null;

    const rowScores = normalizeRowScores(parsed?.rowScores);
    const rowPoints = computeRowPoints(rowScores);
    const subtotal = roundToTwo(
        ROW_ORDER.reduce((total, row) => total + rowPoints[row], 0)
    );

    const penaltiesApplied = normalizePenaltyKeys(parsed);
    const penaltyItems = penaltiesApplied.map((key) => ({
        key,
        label: PENALTY_DEFINITIONS[key].label,
        points: PENALTY_DEFINITIONS[key].points,
    }));
    const penaltyTotal = penaltyItems.reduce((sum, item) => sum + item.points, 0);

    const cap = normalizeCap(parsed?.cap);
    let finalScore = clampNumber(subtotal - penaltyTotal, 0, 100);
    if (cap === 'cap_60') {
        finalScore = Math.min(finalScore, 60);
    } else if (cap === 'cap_70') {
        finalScore = Math.min(finalScore, 70);
    }

    return {
        outcomes: normalizeOutcomes(parsed?.outcomes),
        rowScores,
        rowPoints,
        subtotal,
        penaltiesApplied: penaltyItems,
        penaltyTotal,
        cap,
        finalScore: roundToTwo(finalScore),
        summary: normalizeString(parsed?.summary, parseFailed ? 'Judge response parsing failed.' : 'No summary provided.'),
        strengths: normalizeStringArray(parsed?.strengths),
        weaknesses: normalizeStringArray(parsed?.weaknesses),
        improvementSuggestions: normalizeStringArray(parsed?.improvementSuggestions),
        parseFailed,
        rawJudgeOutput: rawOutput,
    };
}

function parseJsonObject(output: string): Record<string, unknown> | null {
    const trimmed = output.trim();
    const extracted = extractJsonObject(trimmed);
    if (!extracted) {
        return null;
    }

    try {
        const parsed = JSON.parse(extracted) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function extractJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }
    return text.slice(start, end + 1);
}

function normalizeRowScores(value: unknown): Record<RowKey, number> {
    const source = (value && typeof value === 'object')
        ? (value as Record<string, unknown>)
        : {};

    const result = {} as Record<RowKey, number>;
    for (const row of ROW_ORDER) {
        const candidate = Number(source[row]);
        if (!Number.isFinite(candidate)) {
            result[row] = 0;
            continue;
        }
        result[row] = clampNumber(Math.round(candidate), 0, 4);
    }
    return result;
}

function computeRowPoints(rowScores: Record<RowKey, number>): Record<RowKey, number> {
    const result = {} as Record<RowKey, number>;
    for (const row of ROW_ORDER) {
        result[row] = roundToTwo(ROW_WEIGHTS[row] * (rowScores[row] / 4));
    }
    return result;
}

function normalizePenaltyKeys(parsed: Record<string, unknown> | null): PenaltyKey[] {
    if (!parsed) {
        return [];
    }

    const keys = new Set<PenaltyKey>();

    const penaltiesApplied = parsed.penaltiesApplied;
    if (Array.isArray(penaltiesApplied)) {
        for (const item of penaltiesApplied) {
            if (typeof item !== 'string') {
                continue;
            }
            if (item in PENALTY_DEFINITIONS) {
                keys.add(item as PenaltyKey);
            }
        }
    }

    const penaltyFlags = parsed.penalties;
    if (penaltyFlags && typeof penaltyFlags === 'object') {
        const asRecord = penaltyFlags as Record<string, unknown>;
        for (const key of Object.keys(PENALTY_DEFINITIONS)) {
            if (asRecord[key] === true) {
                keys.add(key as PenaltyKey);
            }
        }
    }

    return Array.from(keys);
}

function normalizeCap(value: unknown): CapKey {
    if (typeof value !== 'string') {
        return 'none';
    }
    if (!CAP_KEYS.has(value as CapKey)) {
        return 'none';
    }
    return value as CapKey;
}

function normalizeOutcomes(value: unknown) {
    const source = (value && typeof value === 'object')
        ? (value as Record<string, unknown>)
        : {};

    return {
        bottomLineOutcome: normalizeAllowed(
            source.bottomLineOutcome,
            OUTCOME_OPTIONS.bottomLineOutcome,
            'No clear conclusion'
        ),
        outcomeCorrectness: normalizeAllowed(
            source.outcomeCorrectness,
            OUTCOME_OPTIONS.outcomeCorrectness,
            'Indeterminate (insufficient info)'
        ),
        reasoningAlignment: normalizeAllowed(
            source.reasoningAlignment,
            OUTCOME_OPTIONS.reasoningAlignment,
            'Wrong result / poor reasoning'
        ),
        jurisdictionAssumption: normalizeString(source.jurisdictionAssumption, 'US common law / Restatement-style'),
    };
}

function normalizeAllowed<T extends readonly string[]>(
    value: unknown,
    options: T,
    fallback: T[number]
): T[number] {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim();
    if (!options.includes(normalized as T[number])) {
        return fallback;
    }
    return normalized as T[number];
}

function normalizeString(value: unknown, fallback: string) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }
    return value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 8);
}

function roundToTwo(value: number) {
    return Math.round(value * 100) / 100;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

async function generateModelResponse({ provider, model, systemPrompt, messages, temperature, reasoningEffort }: GenerateModelOptions) {
    if (provider === 'anthropic') {
        return await generateAnthropicResponse({ model, systemPrompt, messages, temperature });
    }
    if (provider === 'gemini') {
        return await generateGeminiResponse({ model, systemPrompt, messages, temperature, reasoningEffort });
    }

    const isGpt52InstantModel = model === 'gpt-5.2-chat-latest';
    const isResponsesApi = model === 'gpt-5-mini' || model === 'gpt-5-nano' || model === 'gpt-5.2' || model === 'gpt-5.2-pro' || isGpt52InstantModel;

    if (isResponsesApi) {
        const input = toResponsesInputText(messages);
        const request: {
            model: string;
            input: string;
            instructions: string;
            text: { format: { type: 'text' }; verbosity: 'medium' };
            reasoning?: { effort: 'low' | 'medium' | 'high'; summary: 'auto' };
        } = {
            model,
            input,
            instructions: systemPrompt,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
        };

        const mappedEffort = mapReasoningEffort(reasoningEffort);
        if (mappedEffort) {
            request.reasoning = {
                effort: mappedEffort,
                summary: 'auto',
            };
        }

        const response = await openai.responses.create(request);
        return extractResponsesText(response);
    }

    const response = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
        ],
        temperature,
    });

    return response.choices[0]?.message?.content || '';
}

function toResponsesInputText(messages: ChatMessage[]) {
    return messages
        .filter((message) => message.content && message.content.trim().length > 0)
        .map((message) => {
            const role = message.role === 'assistant' ? 'Assistant' : 'User';
            return `${role}: ${message.content}`;
        })
        .join('\n');
}

function extractResponsesText(response: unknown) {
    if (!response || typeof response !== 'object') {
        return '';
    }

    const responseRecord = response as {
        output_text?: string;
        output?: Array<{
            content?: Array<{ type?: string; text?: string }>;
        }>;
    };

    if (typeof responseRecord.output_text === 'string' && responseRecord.output_text.length > 0) {
        return responseRecord.output_text;
    }

    const chunks = responseRecord.output || [];
    for (const chunk of chunks) {
        const contents = chunk.content || [];
        for (const content of contents) {
            if (content.type === 'output_text' && typeof content.text === 'string') {
                return content.text;
            }
            if (typeof content.text === 'string' && content.text.length > 0) {
                return content.text;
            }
        }
    }

    return '';
}

type AnthropicOptions = {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
};

async function generateAnthropicResponse({ model, systemPrompt, messages, temperature }: AnthropicOptions) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set.');
    }

    const body: {
        model: string;
        max_tokens: number;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        temperature: number;
        system?: string;
    } = {
        model,
        max_tokens: 2200,
        messages: messages
            .filter((message) => message.content && message.content.trim().length > 0)
            .map((message) => ({ role: message.role, content: message.content })),
        temperature,
    };

    if (systemPrompt.trim().length > 0) {
        body.system = systemPrompt;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = (json as { error?: { message?: string } })?.error?.message
            || `Anthropic request failed with status ${response.status}`;
        throw new Error(message);
    }

    const parts = Array.isArray((json as { content?: unknown[] })?.content)
        ? ((json as { content: Array<{ text?: string }> }).content)
        : [];

    return parts.map((part) => part?.text).filter(Boolean).join('');
}

type GeminiOptions = {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort?: ReasoningEffort;
};

async function generateGeminiResponse({ model, systemPrompt, messages, temperature, reasoningEffort }: GeminiOptions) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set.');
    }

    const contents = messages
        .filter((message) => message.content && message.content.trim().length > 0)
        .map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
        }));

    if (systemPrompt.trim().length > 0) {
        contents.unshift({
            role: 'user',
            parts: [{ text: `System: ${systemPrompt}` }],
        });
    }

    const generationConfig: Record<string, unknown> = { temperature };
    const thinkingLevel = mapGeminiThinkingLevel(reasoningEffort);
    if (thinkingLevel) {
        generationConfig.thinkingConfig = { thinkingLevel };
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            contents,
            generationConfig,
        }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = (json as { error?: { message?: string } })?.error?.message
            || `Gemini request failed with status ${response.status}`;
        throw new Error(message);
    }

    const candidate = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
    const parts = candidate?.content?.parts || [];
    return parts.map((part) => part?.text).filter(Boolean).join('');
}

function mapReasoningEffort(reasoningEffort?: ReasoningEffort) {
    if (!reasoningEffort || reasoningEffort === 'auto') {
        return null;
    }
    if (reasoningEffort === 'xhigh') {
        return 'high';
    }
    return reasoningEffort;
}

function mapGeminiThinkingLevel(reasoningEffort?: ReasoningEffort) {
    const mapped = mapReasoningEffort(reasoningEffort);
    if (!mapped) {
        return null;
    }
    if (mapped === 'low' || mapped === 'medium') {
        return mapped;
    }
    return 'high';
}
