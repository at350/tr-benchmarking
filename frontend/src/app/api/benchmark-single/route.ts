import { NextResponse } from 'next/server';
import OpenAI from 'openai';

type Provider = 'openai' | 'anthropic' | 'gemini';
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

type SingleQuestionPayload = {
    id?: string;
    question: string;
    choices: string[];
    answerLetter: string;
    subfield?: string;
    difficulty?: string;
};

type SingleBenchmarkRequest = {
    provider?: Provider;
    model?: string;
    temperature?: number;
    reasoningEffort?: ReasoningEffort;
    useCustomPrompt?: boolean;
    customPrompt?: string;
    question?: SingleQuestionPayload;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SingleBenchmarkRequest;
        const provider = normalizeProvider(body.provider);
        const model = typeof body.model === 'string' ? body.model.trim() : '';
        const question = normalizeQuestion(body.question);

        if (!provider) {
            return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 });
        }
        if (!model) {
            return NextResponse.json({ error: 'Model is required.' }, { status: 400 });
        }
        if (!question) {
            return NextResponse.json({ error: 'Question payload is invalid.' }, { status: 400 });
        }

        const temperature = clampTemperature(body.temperature ?? 0.2);
        const reasoningEffort = normalizeReasoningEffort(body.reasoningEffort);
        const useCustomPrompt = Boolean(body.useCustomPrompt);
        const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt.trim() : '';

        const systemPrompt = 'You are a legal expert. Answer the multiple-choice question and follow format constraints exactly.';
        const validLetters = getValidLetters(question.choices.length);
        const choicesText = question.choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join('\n');

        const userMessageParts: string[] = [];
        if (useCustomPrompt && customPrompt) {
            userMessageParts.push('Custom prompt template:', customPrompt, '');
        }
        userMessageParts.push(
            'Question:',
            question.question,
            '',
            'Choices:',
            choicesText,
            '',
            `Valid answer letters: ${validLetters.join(', ')}`,
            'Provide your full analysis, then on the final line write exactly: FINAL ANSWER: <LETTER>.'
        );

        const output = await generateModelResponse({
            provider,
            model,
            systemPrompt,
            messages: [{ role: 'user', content: userMessageParts.join('\n') }],
            temperature,
            reasoningEffort,
        });

        const parsedChoice = await parseChoiceRobust(output, validLetters);
        const isCorrect = parsedChoice === question.answerLetter;

        return NextResponse.json({
            summary: {
                dataset: 'single_probe',
                total: 1,
                correct: isCorrect ? 1 : 0,
                accuracy: isCorrect ? 1 : 0,
            },
            results: [
                {
                    dataset: 'single_probe',
                    questionId: question.id,
                    questionText: question.question,
                    modelOutput: output,
                    parsedChoice,
                    groundTruth: question.answerLetter,
                    isCorrect,
                    choices: question.choices,
                    subfield: question.subfield,
                    difficulty: question.difficulty,
                    provider,
                    model,
                    usedCustomPrompt: useCustomPrompt,
                },
            ],
        });
    } catch (error) {
        console.error('Single benchmark request failed:', error);
        const message = error instanceof Error ? error.message : 'Single benchmark request failed.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
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
            reasoning: {
                effort: isGpt52ThinkingModel ? mapReasoningEffort(reasoningEffort) : 'medium',
                summary: 'auto',
            },
            tools: [],
            store: true,
            include: ['reasoning.encrypted_content'],
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
            if (!('temperature' in request) || !isUnsupportedTemperatureError(error)) {
                throw error;
            }
            delete request.temperature;
            response = await responsesClient.create(request);
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
            max_tokens: 1024,
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
    const output = content
        .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
        .join('');

    return output;
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
    let json: unknown;
    try {
        json = await runGeminiGenerateContentRequest({
            apiKey,
            model,
            contents,
            temperature,
            thinkingLevel,
            includeThinkingConfig: Boolean(thinkingLevel),
        });
    } catch (error) {
        if (!thinkingLevel || !isUnsupportedGeminiThinkingError(error)) {
            throw error;
        }

        json = await runGeminiGenerateContentRequest({
            apiKey,
            model,
            contents,
            temperature,
            thinkingLevel,
            includeThinkingConfig: false,
        });
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

type GeminiGenerateContentRequestOptions = {
    apiKey: string;
    model: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    temperature: number;
    thinkingLevel: 'low' | 'medium' | 'high' | null;
    includeThinkingConfig: boolean;
};

async function runGeminiGenerateContentRequest({
    apiKey,
    model,
    contents,
    temperature,
    thinkingLevel,
    includeThinkingConfig,
}: GeminiGenerateContentRequestOptions) {
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
                ...(includeThinkingConfig && thinkingLevel
                    ? { thinkingConfig: { thinkingLevel } }
                    : {}),
            },
        }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = extractProviderErrorMessage(json);
        throw new Error(error || `Gemini request failed (${response.status}).`);
    }

    return json;
}

function normalizeQuestion(value: unknown): SingleQuestionPayload | null {
    if (!isRecord(value)) {
        return null;
    }

    const question = typeof value.question === 'string' ? value.question.trim() : '';
    const choices = Array.isArray(value.choices)
        ? value.choices
            .map((choice) => (typeof choice === 'string' ? choice.trim() : ''))
            .filter((choice) => choice.length > 0)
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
        id: typeof value.id === 'string' && value.id.trim().length > 0
            ? value.id
            : `single_${Date.now()}`,
        question,
        choices,
        answerLetter,
        subfield: typeof value.subfield === 'string' ? value.subfield : undefined,
        difficulty: typeof value.difficulty === 'string' ? value.difficulty : undefined,
    };
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

    return 'Unknown';
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

    const trailingStandalone = findLastValidCapturedLetter(
        tail,
        /\b(?:option|choice)\s*([A-J])\b/gi,
        validSet,
    );
    if (trailingStandalone) {
        return trailingStandalone;
    }

    return null;
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

async function parseChoiceWithTinyModel(output: string, validLetters: string[]) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
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
        console.error('Fallback answer parsing failed:', error);
    }

    return null;
}

function getValidLetters(numChoices: number) {
    const safeChoices = Math.max(2, Math.min(numChoices, 10));
    return Array.from({ length: safeChoices }, (_, index) => String.fromCharCode(65 + index));
}

function normalizeProvider(value: unknown): Provider | null {
    if (value === 'openai' || value === 'anthropic' || value === 'gemini') {
        return value;
    }
    return null;
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
    if (value === 'none' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
        return value;
    }
    return 'medium';
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
    if (reasoningEffort === 'none') {
        return null;
    }
    if (reasoningEffort === 'low') {
        return 'low';
    }
    if (reasoningEffort === 'medium') {
        return 'medium';
    }
    return 'high';
}

function clampTemperature(value: number) {
    return Math.min(Math.max(value, 0), 1);
}

function extractResponsesText(response: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
    if (typeof response.output_text === 'string' && response.output_text.length > 0) {
        return response.output_text;
    }

    const chunks: string[] = [];
    for (const outputItem of response.output || []) {
        for (const contentItem of outputItem.content || []) {
            if (typeof contentItem.text === 'string' && contentItem.text.length > 0) {
                chunks.push(contentItem.text);
            }
        }
    }

    return chunks.join('\n');
}

function extractProviderErrorMessage(value: unknown) {
    if (!isRecord(value)) {
        return null;
    }

    if (isRecord(value.error) && typeof value.error.message === 'string') {
        return value.error.message;
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isUnsupportedTemperatureError(error: unknown) {
    if (!isRecord(error)) {
        return false;
    }

    const param = error.param;
    if (param === 'temperature') {
        return true;
    }

    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    return message.includes('unsupported parameter') && message.includes('temperature');
}

function isUnsupportedGeminiThinkingError(error: unknown) {
    if (!isRecord(error)) {
        return false;
    }

    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    return message.includes('thinking') && message.includes('not supported');
}
