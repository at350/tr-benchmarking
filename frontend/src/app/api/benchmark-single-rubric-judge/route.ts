import { NextResponse } from 'next/server';
import OpenAI from 'openai';

type Provider = 'openai' | 'anthropic' | 'gemini';
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
type StrictnessMode = 'strict' | 'best_effort';

type QuestionPayload = {
    id?: string;
    question: string;
    choices: string[];
    answerLetter: string;
    subfield?: string;
    difficulty?: string;
};

type JudgeRubricPayload = {
    id: string;
    name: string;
    content: string;
};

type RequestBody = {
    provider?: Provider;
    model?: string;
    temperature?: number;
    reasoningEffort?: ReasoningEffort;
    strictnessMode?: StrictnessMode;
    generationPrompt?: string;
    question?: QuestionPayload;
    judgeProvider?: Provider;
    judgeModel?: string;
    judgeReasoningEffort?: ReasoningEffort;
    judgeRubrics?: JudgeRubricPayload[];
    maxGenerationRetries?: number;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type NormalizedQuestion = {
    id: string;
    question: string;
    choices: string[];
    answerLetter: string;
    subfield?: string;
    difficulty?: string;
};

type GenerationParseResult = {
    parsedJson: Record<string, unknown> | null;
    parsedAnswer: string;
    schemaValid: boolean;
    parseErrors: string[];
    degradedControllability: boolean;
};

type JudgeNormalizedResult = {
    overallScore: number | null;
    criteriaScores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    issues: string[];
    summary: string;
    parseFailed: boolean;
    rawJudgeOutput: string;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const PROVIDERS = new Set<Provider>(['openai', 'anthropic', 'gemini']);

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        const provider = normalizeProvider(body.provider);
        const model = normalizeNonEmptyString(body.model);
        const judgeProvider = normalizeProvider(body.judgeProvider);
        const judgeModel = normalizeNonEmptyString(body.judgeModel);
        const question = normalizeQuestion(body.question);
        const generationPrompt = normalizeNonEmptyString(body.generationPrompt);
        const strictnessMode = normalizeStrictnessMode(body.strictnessMode);
        const judgeRubrics = normalizeJudgeRubrics(body.judgeRubrics);

        if (!provider) {
            return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 });
        }
        if (!model) {
            return NextResponse.json({ error: 'Model is required.' }, { status: 400 });
        }
        if (!question) {
            return NextResponse.json({ error: 'Question payload is invalid.' }, { status: 400 });
        }
        if (!generationPrompt) {
            return NextResponse.json({ error: 'generationPrompt is required.' }, { status: 400 });
        }
        if (!judgeProvider) {
            return NextResponse.json({ error: 'Invalid judge provider.' }, { status: 400 });
        }
        if (!judgeModel) {
            return NextResponse.json({ error: 'Judge model is required.' }, { status: 400 });
        }
        if (judgeRubrics.length === 0) {
            return NextResponse.json({ error: 'At least one judge rubric is required.' }, { status: 400 });
        }

        const temperature = clampTemperature(body.temperature ?? 0.2);
        const reasoningEffort = normalizeReasoningEffort(body.reasoningEffort);
        const judgeReasoningEffort = normalizeReasoningEffort(body.judgeReasoningEffort);
        const maxGenerationRetries = normalizeRetries(body.maxGenerationRetries);

        const validLetters = getValidLetters(question.choices.length);
        const generation = await runGenerationWithNormalization({
            provider,
            model,
            question,
            generationPrompt,
            strictnessMode,
            temperature,
            reasoningEffort,
            maxGenerationRetries,
            validLetters,
        });

        const isCorrect = generation.parsedAnswer === question.answerLetter;
        const judgeResults = await Promise.all(
            judgeRubrics.map(async (rubric) => {
                const rawJudgeOutput = await runJudge({
                    judgeProvider,
                    judgeModel,
                    judgeReasoningEffort,
                    rubric,
                    question,
                    generation,
                });
                const normalized = normalizeJudgeOutput(rawJudgeOutput);
                return {
                    rubricId: rubric.id,
                    rubricName: rubric.name,
                    ...normalized,
                };
            }),
        );

        return NextResponse.json({
            question: {
                id: question.id,
                answerLetter: question.answerLetter,
                subfield: question.subfield,
                difficulty: question.difficulty,
            },
            generation: {
                strictnessMode,
                attemptsUsed: generation.attemptsUsed,
                parseStatus: generation.parseStatus,
                parsedJson: generation.parsedJson,
                parsedAnswer: generation.parsedAnswer,
                schemaValid: generation.schemaValid,
                degradedControllability: generation.degradedControllability,
                parseErrors: generation.parseErrors,
                rawOutput: generation.rawOutput,
            },
            evaluation: {
                isCorrect,
                groundTruth: question.answerLetter,
            },
            judgeResults,
        });
    } catch (error) {
        console.error('Rubric judge benchmark failed:', error);
        const message = error instanceof Error ? error.message : 'Rubric judge benchmark failed.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function runGenerationWithNormalization(input: {
    provider: Provider;
    model: string;
    question: NormalizedQuestion;
    generationPrompt: string;
    strictnessMode: StrictnessMode;
    temperature: number;
    reasoningEffort: ReasoningEffort;
    maxGenerationRetries: number;
    validLetters: string[];
}) {
    const {
        provider,
        model,
        question,
        generationPrompt,
        strictnessMode,
        temperature,
        reasoningEffort,
        maxGenerationRetries,
        validLetters,
    } = input;

    const systemPrompt = 'You are a legal reasoning assistant. Follow output format requirements exactly.';
    const choicesText = question.choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join('\n');
    const maxAttempts = strictnessMode === 'strict' ? (maxGenerationRetries + 1) : 1;

    let lastOutput = '';
    let lastParsed: GenerationParseResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const repairBlock = attempt > 1
            ? [
                '',
                'Your previous answer failed strict JSON validation.',
                `Previous output:\n${lastOutput.slice(0, 4000)}`,
                'Return only one corrected JSON object that matches the exact schema.',
            ].join('\n')
            : '';

        const userPrompt = [
            'Generation prompt template:',
            generationPrompt,
            '',
            'Question:',
            question.question,
            '',
            'Choices:',
            choicesText,
            '',
            `Valid answer letters: ${validLetters.join(', ')}`,
            'You must choose exactly one final answer_letter from the valid set.',
            'Never output multiple letters or UNKNOWN; if uncertain, choose the single best-supported letter.',
            'Return strict JSON only and no markdown.',
            repairBlock,
        ].join('\n');

        const rawOutput = await generateModelResponse({
            provider,
            model,
            systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            temperature,
            reasoningEffort,
        });
        lastOutput = rawOutput;

        const parsed = await parseGenerationOutput(rawOutput, validLetters, strictnessMode);
        lastParsed = parsed;

        if (strictnessMode === 'best_effort') {
            return {
                ...parsed,
                rawOutput,
                parseStatus: parsed.schemaValid ? 'ok' : (parsed.parsedAnswer !== 'Unknown' ? 'degraded' : 'failed'),
                attemptsUsed: 1,
            };
        }

        if (parsed.schemaValid) {
            return {
                ...parsed,
                rawOutput,
                parseStatus: attempt === 1 ? 'ok' : 'repaired',
                attemptsUsed: attempt,
            };
        }
    }

    const fallback = lastParsed || {
        parsedJson: null,
        parsedAnswer: 'Unknown',
        schemaValid: false,
        parseErrors: ['Generation output could not be parsed.'],
        degradedControllability: true,
    };

    return {
        ...fallback,
        rawOutput: lastOutput,
        parseStatus: 'failed',
        attemptsUsed: maxAttempts,
    };
}

async function parseGenerationOutput(rawOutput: string, validLetters: string[], strictnessMode: StrictnessMode): Promise<GenerationParseResult> {
    const parsedJson = parseJsonObject(rawOutput);
    const errors: string[] = [];

    let answerLetter = 'Unknown';
    if (parsedJson) {
        const answerCandidate = extractAnswerLetterFromJson(parsedJson);
        if (answerCandidate && validLetters.includes(answerCandidate)) {
            answerLetter = answerCandidate;
        } else {
            errors.push('answer_letter missing or invalid.');
        }
    } else {
        errors.push('No JSON object found.');
    }

    if (answerLetter === 'Unknown') {
        const parsedFromText = await parseChoiceRobust(rawOutput, validLetters);
        if (parsedFromText) {
            answerLetter = parsedFromText;
        }
    }

    const normalizedParsedJson = (parsedJson && answerLetter !== 'Unknown')
        ? {
            ...parsedJson,
            answer_letter: answerLetter,
        }
        : parsedJson;

    const hasRequiredJsonShape = normalizedParsedJson
        ? hasRequiredGenerationJsonShape(normalizedParsedJson, validLetters)
        : false;
    const schemaValid = strictnessMode === 'strict'
        ? hasRequiredJsonShape
        : (normalizedParsedJson !== null && answerLetter !== 'Unknown');

    if (!hasRequiredJsonShape && strictnessMode === 'strict') {
        errors.push('Missing one or more required JSON keys: issue, rule, application, conclusion, answer_letter.');
    }

    return {
        parsedJson: normalizedParsedJson,
        parsedAnswer: answerLetter,
        schemaValid,
        parseErrors: errors,
        degradedControllability: !hasRequiredJsonShape,
    };
}

function hasRequiredGenerationJsonShape(parsedJson: Record<string, unknown>, validLetters: string[]) {
    const requiredStringKeys = ['issue', 'rule', 'application', 'conclusion'];
    for (const key of requiredStringKeys) {
        const value = parsedJson[key];
        if (typeof value !== 'string' || value.trim().length === 0) {
            return false;
        }
    }

    const answer = extractAnswerLetterFromJson(parsedJson);
    return Boolean(answer && validLetters.includes(answer));
}

function extractAnswerLetterFromJson(parsedJson: Record<string, unknown>) {
    const candidates = [
        parsedJson.answer_letter,
        parsedJson.answerLetter,
        parsedJson.final_answer_letter,
        parsedJson.finalAnswerLetter,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const normalized = candidate.trim().toUpperCase();
            if (/^[A-J]$/.test(normalized)) {
                return normalized;
            }
        }
    }
    return null;
}

async function runJudge(input: {
    judgeProvider: Provider;
    judgeModel: string;
    judgeReasoningEffort: ReasoningEffort;
    rubric: JudgeRubricPayload;
    question: NormalizedQuestion;
    generation: {
        parsedJson: Record<string, unknown> | null;
        parsedAnswer: string;
        rawOutput: string;
    };
}) {
    const {
        judgeProvider,
        judgeModel,
        judgeReasoningEffort,
        rubric,
        question,
        generation,
    } = input;

    const systemPrompt = [
        'You are an expert legal writing evaluator and strict rubric grader.',
        'Return strict JSON only, no markdown.',
    ].join('\n');

    const userPrompt = [
        'Evaluate the model answer using the rubric instructions below.',
        '',
        'Return JSON in this exact shape:',
        '{',
        '  "overall_score": 0,',
        '  "criteria_scores": { "criterion_a": 0 },',
        '  "strengths": ["..."],',
        '  "weaknesses": ["..."],',
        '  "issues": ["..."],',
        '  "summary": "..."',
        '}',
        '',
        'Rules:',
        '- overall_score and criteria_scores values must be numbers from 0 to 100.',
        '- strengths/weaknesses/issues must be arrays of concise strings.',
        '',
        'Question:',
        question.question,
        '',
        'Model generated JSON (if parseable):',
        JSON.stringify(generation.parsedJson ?? {}, null, 2),
        '',
        'Model parsed answer letter:',
        generation.parsedAnswer,
        '',
        'Model raw output:',
        generation.rawOutput.slice(0, 5000),
        '',
        'Judge rubric to apply:',
        rubric.content,
    ].join('\n');

    return generateModelResponse({
        provider: judgeProvider,
        model: judgeModel,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0,
        reasoningEffort: judgeReasoningEffort,
    });
}

function normalizeJudgeOutput(rawOutput: string): JudgeNormalizedResult {
    const parsed = parseJsonObject(rawOutput);
    const parseFailed = parsed === null;

    const overallScoreRaw = parsed ? firstNumber([
        parsed.overall_score,
        parsed.overallScore,
        parsed.score,
        parsed.finalScore,
    ]) : null;

    const criteriaScores = normalizeNumericRecord(parsed?.criteria_scores ?? parsed?.criteriaScores ?? parsed?.subscores);
    const strengths = normalizeStringArray(parsed?.strengths);
    const weaknesses = normalizeStringArray(parsed?.weaknesses);
    const issues = normalizeStringArray(parsed?.issues);
    const summary = normalizeString(parsed?.summary, parseFailed ? 'Judge JSON parsing failed.' : 'No summary provided.');

    return {
        overallScore: overallScoreRaw === null ? null : clampNumber(overallScoreRaw, 0, 100),
        criteriaScores,
        strengths,
        weaknesses,
        issues,
        summary,
        parseFailed,
        rawJudgeOutput: rawOutput,
    };
}

function parseJsonObject(output: string): Record<string, unknown> | null {
    const extracted = extractJsonObject(output.trim());
    if (!extracted) {
        return null;
    }
    try {
        const parsed = JSON.parse(extracted) as unknown;
        if (!isRecord(parsed)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function extractJsonObject(text: string) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }
    return text.slice(start, end + 1);
}

function normalizeNumericRecord(value: unknown) {
    if (!isRecord(value)) {
        return {} as Record<string, number>;
    }
    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value)) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
            result[key] = clampNumber(n, 0, 100);
        }
    }
    return result;
}

function firstNumber(values: unknown[]) {
    for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    return null;
}

function normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }
    return value
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0)
        .slice(0, 10);
}

function normalizeString(value: unknown, fallback: string) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

type GenerateModelOptions = {
    provider: Provider;
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort: ReasoningEffort;
};

async function generateModelResponse({ provider, model, systemPrompt, messages, temperature, reasoningEffort }: GenerateModelOptions) {
    if (provider === 'anthropic') {
        return generateAnthropicResponse({ model, systemPrompt, messages, temperature });
    }
    if (provider === 'gemini') {
        return generateGeminiResponse({ model, systemPrompt, messages, temperature, reasoningEffort });
    }

    const isGpt52ThinkingModel = model === 'gpt-5.2' || model === 'gpt-5.2-pro';
    const isResponsesModel = model === 'gpt-5-mini'
        || model === 'gpt-5-nano'
        || model === 'gpt-5.2-chat-latest'
        || isGpt52ThinkingModel;

    if (isResponsesModel) {
        const inputText = messages
            .filter((message) => message.content.trim().length > 0)
            .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
            .join('\n');

        const request: Record<string, unknown> = {
            model,
            input: inputText,
            instructions: systemPrompt,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
            tools: [],
            store: true,
            include: ['reasoning.encrypted_content'],
        };

        // Some models reject reasoning controls; fall back automatically if needed.
        request.reasoning = {
            effort: isGpt52ThinkingModel ? mapReasoningEffort(reasoningEffort) : 'medium',
            summary: 'auto',
        };

        if (!isGpt52ThinkingModel) {
            request.temperature = temperature;
        }

        const responsesClient = (openai as unknown as {
            responses: {
                create: (payload: Record<string, unknown>) => Promise<{
                    output_text?: string;
                    output?: Array<{
                        content?: Array<{ text?: string }>;
                    }>;
                }>;
            };
        }).responses;

        let response;
        try {
            response = await responsesClient.create(request);
        } catch (error) {
            if ('reasoning' in request && isUnsupportedReasoningError(error)) {
                delete request.reasoning;
                try {
                    response = await responsesClient.create(request);
                } catch (secondError) {
                    if ('temperature' in request && isUnsupportedTemperatureError(secondError)) {
                        delete request.temperature;
                        response = await responsesClient.create(request);
                    } else {
                        throw secondError;
                    }
                }
            } else if ('temperature' in request && isUnsupportedTemperatureError(error)) {
                delete request.temperature;
                response = await responsesClient.create(request);
            } else {
                throw error;
            }
        }

        return extractResponsesText(response);
    }

    const chatCompletion = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
        ],
        temperature,
    });

    return chatCompletion.choices[0]?.message?.content || '';
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 1300,
            system: systemPrompt,
            messages: messages
                .filter((message) => message.content.trim().length > 0)
                .map((message) => ({
                    role: message.role,
                    content: message.content,
                })),
            temperature,
        }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = extractProviderErrorMessage(json);
        throw new Error(error || `Anthropic request failed (${response.status}).`);
    }

    const content = isRecord(json) && Array.isArray(json.content) ? json.content : [];
    return content
        .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
        .join('');
}

type GeminiOptions = {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort: ReasoningEffort;
};

async function generateGeminiResponse({ model, systemPrompt, messages, temperature, reasoningEffort }: GeminiOptions) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set.');
    }

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    if (systemPrompt.trim()) {
        contents.push({ role: 'user', parts: [{ text: `System: ${systemPrompt}` }] });
    }
    for (const message of messages) {
        if (!message.content.trim()) {
            continue;
        }
        contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
        });
    }

    const thinkingLevel = mapGeminiThinkingLevel(reasoningEffort);
    const makeRequest = async (includeThinkingConfig: boolean) => {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature,
                    ...(includeThinkingConfig && thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
                },
            }),
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = extractProviderErrorMessage(json);
            throw new Error(error || `Gemini request failed (${response.status}).`);
        }
        return json;
    };

    let json: unknown;
    try {
        json = await makeRequest(Boolean(thinkingLevel));
    } catch (error) {
        if (!thinkingLevel || !isUnsupportedGeminiThinkingError(error)) {
            throw error;
        }
        json = await makeRequest(false);
    }

    if (!isRecord(json) || !Array.isArray(json.candidates) || json.candidates.length === 0) {
        return '';
    }
    const candidate = json.candidates[0];
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
        return '';
    }

    return candidate.content.parts
        .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
        .join('');
}

function parseChoiceDeterministic(output: string, validLetters: string[]) {
    const validSet = new Set(validLetters);
    const normalized = output.replace(/\r/g, '').trim();
    if (!normalized) {
        return null;
    }
    const tail = normalized.slice(-2200);

    const explicitAnswer = findLastValidCapturedLetter(
        tail,
        /(?:final\s*(?:answer|choice)|correct\s*answer|answer|therefore|thus|conclusion)\s*(?:is|:|=|-)?\s*\(?([A-J])\)?\b/gi,
        validSet,
    );
    if (explicitAnswer) {
        return explicitAnswer;
    }

    const lineAnswer = findLastValidCapturedLetter(
        tail,
        /^\s*(?:answer\s*(?:is|:)\s*)?\(?([A-J])\)?\s*$/gim,
        validSet,
    );
    if (lineAnswer) {
        return lineAnswer;
    }

    return findLastValidCapturedLetter(tail, /\b(?:option|choice)\s*([A-J])\b/gi, validSet);
}

function findLastValidCapturedLetter(text: string, pattern: RegExp, validSet: Set<string>) {
    let match: RegExpExecArray | null = null;
    let last: string | null = null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
        const candidate = (match[1] || '').toUpperCase();
        if (validSet.has(candidate)) {
            last = candidate;
        }
    }
    return last;
}

function normalizeQuestion(value: unknown): NormalizedQuestion | null {
    if (!isRecord(value)) {
        return null;
    }
    const question = typeof value.question === 'string' ? value.question.trim() : '';
    const choices = Array.isArray(value.choices)
        ? value.choices.map((choice) => (typeof choice === 'string' ? choice.trim() : '')).filter(Boolean)
        : [];
    const answerLetter = typeof value.answerLetter === 'string' ? value.answerLetter.trim().toUpperCase() : '';
    if (!question || choices.length < 2 || !answerLetter) {
        return null;
    }
    const validLetters = getValidLetters(choices.length);
    if (!validLetters.includes(answerLetter)) {
        return null;
    }
    return {
        id: typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : `single_${Date.now()}`,
        question,
        choices,
        answerLetter,
        subfield: typeof value.subfield === 'string' ? value.subfield : undefined,
        difficulty: typeof value.difficulty === 'string' ? value.difficulty : undefined,
    };
}

function normalizeJudgeRubrics(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as JudgeRubricPayload[];
    }
    return value
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }
            const id = normalizeNonEmptyString(entry.id);
            const name = normalizeNonEmptyString(entry.name);
            const content = normalizeNonEmptyString(entry.content);
            if (!id || !name || !content) {
                return null;
            }
            return { id, name, content };
        })
        .filter((entry): entry is JudgeRubricPayload => entry !== null);
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

function normalizeStrictnessMode(value: unknown): StrictnessMode {
    if (value === 'best_effort') {
        return 'best_effort';
    }
    return 'strict';
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
    if (value === 'none' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
        return value;
    }
    return 'medium';
}

function normalizeRetries(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 2;
    }
    return clampNumber(Math.round(value), 0, 5);
}

function normalizeNonEmptyString(value: unknown) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

function mapReasoningEffort(reasoningEffort: ReasoningEffort) {
    if (reasoningEffort === 'none') {
        return 'low';
    }
    if (reasoningEffort === 'xhigh') {
        return 'high';
    }
    return reasoningEffort;
}

function mapGeminiThinkingLevel(reasoningEffort: ReasoningEffort) {
    const mapped = mapReasoningEffort(reasoningEffort);
    if (mapped === 'low' || mapped === 'medium') {
        return mapped;
    }
    return 'high';
}

function extractResponsesText(response: {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
}) {
    if (typeof response.output_text === 'string' && response.output_text.length > 0) {
        return response.output_text;
    }

    const chunks = Array.isArray(response.output) ? response.output : [];
    for (const chunk of chunks) {
        const contentList = Array.isArray(chunk.content) ? chunk.content : [];
        for (const content of contentList) {
            if (typeof content.text === 'string' && content.text.length > 0) {
                return content.text;
            }
        }
    }
    return '';
}

function getValidLetters(numChoices: number) {
    const safeChoices = Math.max(2, Math.min(numChoices, 10));
    return Array.from({ length: safeChoices }, (_, index) => String.fromCharCode(65 + index));
}

function clampTemperature(value: number) {
    if (!Number.isFinite(value)) {
        return 0.2;
    }
    return clampNumber(value, 0, 1);
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function isUnsupportedTemperatureError(error: unknown) {
    if (!error) {
        return false;
    }
    const text = typeof error === 'string'
        ? error
        : (isRecord(error) && typeof error.message === 'string' ? error.message : '');
    return text.toLowerCase().includes('temperature');
}

function isUnsupportedReasoningError(error: unknown) {
    if (!error) {
        return false;
    }
    const text = typeof error === 'string'
        ? error
        : (isRecord(error) && typeof error.message === 'string' ? error.message : '');
    const normalized = text.toLowerCase();
    return normalized.includes('reasoning')
        && (
            normalized.includes('not supported')
            || normalized.includes('unsupported')
            || normalized.includes('does not support')
        );
}

function isUnsupportedGeminiThinkingError(error: unknown) {
    if (!error) {
        return false;
    }
    const text = typeof error === 'string'
        ? error
        : (isRecord(error) && typeof error.message === 'string' ? error.message : '');
    const normalized = text.toLowerCase();
    return normalized.includes('thinking') && normalized.includes('not supported');
}

function extractProviderErrorMessage(json: unknown) {
    if (!isRecord(json)) {
        return null;
    }
    if (isRecord(json.error) && typeof json.error.message === 'string') {
        return json.error.message;
    }
    if (typeof json.message === 'string') {
        return json.message;
    }
    return null;
}

async function parseChoiceRobust(output: string, validLetters: string[]) {
    const deterministic = parseChoiceDeterministic(output, validLetters);
    if (deterministic) {
        return deterministic;
    }

    const llmParsed = await parseChoiceWithTinyModel(output, validLetters);
    if (llmParsed) {
        return llmParsed;
    }

    return null;
}

async function parseChoiceWithTinyModel(output: string, validLetters: string[]) {
    if (!process.env.OPENAI_API_KEY) {
        return null;
    }

    const validSet = new Set(validLetters);

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0,
            messages: [
                {
                    role: 'system',
                    content: 'Extract the model\'s final selected answer letter from the text. Return ONLY one uppercase letter from the valid set, or UNKNOWN.',
                },
                {
                    role: 'user',
                    content: [
                        `Valid letters: ${validLetters.join(', ')}`,
                        '',
                        'Model output:',
                        '"""',
                        output.slice(-6000),
                        '"""',
                    ].join('\n'),
                },
            ],
        });

        const text = (completion.choices[0]?.message?.content || '').trim().toUpperCase();
        const direct = text.replace(/[^A-Z]/g, '');
        if (direct.length > 0 && validSet.has(direct[0])) {
            return direct[0];
        }

        const match = text.match(/\b([A-J])\b/);
        if (match && validSet.has(match[1])) {
            return match[1];
        }
    } catch (error) {
        console.error('Rubric fallback answer parsing failed:', error);
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
