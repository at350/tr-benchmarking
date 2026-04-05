import OpenAI from 'openai';

function getOpenAiClient() {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
}

export function extractResponsesText(response) {
    if (!response || typeof response !== 'object') {
        return '';
    }
    const responseRecord = response;
    if (typeof responseRecord.output_text === 'string') {
        return responseRecord.output_text;
    }
    for (const block of responseRecord.output ?? []) {
        for (const content of block.content ?? []) {
            if (typeof content.text === 'string') {
                return content.text;
            }
        }
    }
    return '';
}

export async function generateModelResponse({ provider, model, systemPrompt, messages, temperature, reasoningEffort }) {
    if (provider === 'replicate') {
        return await generateReplicateResponse({ model, systemPrompt, messages, temperature });
    }

    const openai = getOpenAiClient();
    const isResponsesApi = model.startsWith('gpt-5');
    if (isResponsesApi) {
        const request = {
            model,
            input: messages.map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`).join('\n'),
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

export async function smokeTestDashaModels(selectedModels, questionText, options = {}) {
    const systemPrompt = options.systemPrompt
        ?? 'You are generating a free-form legal answer for benchmark evaluation. Write a concise legal analysis with a clear conclusion.';
    const promptMessages = [{
        role: 'user',
        content: [
            'Answer the following legal question in a structured but natural free-form analysis.',
            'Do not use bullet points.',
            '',
            questionText,
        ].join('\n'),
    }];

    const results = [];
    for (const selectedModel of selectedModels) {
        const startedAt = Date.now();
        try {
            const responseText = await generateModelResponse({
                provider: selectedModel.provider,
                model: selectedModel.model,
                systemPrompt,
                messages: promptMessages,
                temperature: selectedModel.temperature ?? 0.7,
                reasoningEffort: selectedModel.reasoningEffort ?? 'medium',
            });
            results.push({
                provider: selectedModel.provider,
                model: selectedModel.model,
                ok: responseText.trim().length > 0,
                responsePreview: responseText.trim().slice(0, 160),
                durationMs: Date.now() - startedAt,
            });
        } catch (error) {
            results.push({
                provider: selectedModel.provider,
                model: selectedModel.model,
                ok: false,
                error: error instanceof Error ? error.message : 'Model generation failed.',
                durationMs: Date.now() - startedAt,
            });
        }
    }

    return results;
}

function mapReasoningEffort(reasoningEffort) {
    if (!reasoningEffort || reasoningEffort === 'none') {
        return null;
    }
    return reasoningEffort === 'xhigh' ? 'high' : reasoningEffort;
}

async function generateReplicateResponse(input) {
    if (!process.env.REPLICATE_API_TOKEN) {
        throw new Error('REPLICATE_API_TOKEN is not set.');
    }

    const [owner, name] = input.model.split('/');
    if (!owner || !name) {
        throw new Error(`Replicate model "${input.model}" must use the format owner/name.`);
    }

    let prediction = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                'content-type': 'application/json',
                Prefer: 'wait=55',
                'Cancel-After': '2m',
            },
            body: JSON.stringify({
                input: buildReplicateInput(input),
            }),
        });
        const json = await response.json().catch(() => ({}));
        if (response.ok) {
            prediction = json;
            break;
        }

        const errorMessage = extractReplicateError(json, 'Replicate request failed.');
        if (!shouldRetryReplicateRateLimit(response.status, errorMessage) || attempt === 7) {
            throw new Error(errorMessage);
        }
        await sleep(buildReplicateRetryDelayMs(errorMessage, attempt));
    }

    if (!prediction) {
        throw new Error('Replicate request failed before a prediction was created.');
    }

    if (!isReplicateTerminalStatus(prediction.status)) {
        const getUrl = prediction.urls?.get;
        if (!getUrl) {
            throw new Error('Replicate prediction did not return a poll URL.');
        }
        prediction = await pollReplicatePrediction(getUrl);
    }

    if (prediction.error) {
        throw new Error(prediction.error);
    }
    if (!isReplicateSuccessStatus(prediction.status)) {
        throw new Error(`Replicate prediction ended with status "${prediction.status ?? 'unknown'}".`);
    }
    return normalizeReplicateOutput(prediction.output);
}

function buildReplicateInput(input) {
    const userPrompt = input.messages
        .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
        .join('\n\n')
        .trim();
    const model = input.model.toLowerCase();
    const mergedPrompt = [
        `System Instruction: ${input.systemPrompt.trim()}`,
        '',
        userPrompt,
    ].join('\n').trim();

    if (model.includes('deepseek')) {
        return {
            prompt: mergedPrompt,
            max_tokens: 2200,
            temperature: input.temperature,
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            thinking: 'None',
        };
    }

    if (model.includes('claude') || model.includes('gemini')) {
        return {
            prompt: mergedPrompt,
            max_tokens: 2200,
            temperature: input.temperature,
        };
    }

    return {
        prompt: userPrompt,
        system_prompt: input.systemPrompt,
        max_tokens: 2200,
        temperature: input.temperature,
    };
}

async function pollReplicatePrediction(url) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
        await sleep(attempt < 15 ? 1200 : 2000);
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
            },
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(extractReplicateError(json, 'Failed to refresh Replicate prediction.'));
        }
        if (isReplicateTerminalStatus(json.status)) {
            return json;
        }
    }

    throw new Error('Replicate prediction timed out before reaching a terminal status.');
}

function isReplicateTerminalStatus(status) {
    return status === 'succeeded' || status === 'successful' || status === 'failed' || status === 'canceled';
}

function isReplicateSuccessStatus(status) {
    return status === 'succeeded' || status === 'successful';
}

function normalizeReplicateOutput(output) {
    if (typeof output === 'string') {
        return output.trim();
    }
    if (Array.isArray(output)) {
        return output
            .flatMap((item) => {
                if (typeof item === 'string') {
                    return [item];
                }
                if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
                    return [item.text];
                }
                return [JSON.stringify(item)];
            })
            .join('')
            .trim();
    }
    if (output && typeof output === 'object') {
        if ('text' in output && typeof output.text === 'string') {
            return output.text.trim();
        }
        return JSON.stringify(output);
    }
    return '';
}

function extractReplicateError(value, fallback) {
    if (!value || typeof value !== 'object') {
        return fallback;
    }
    if (typeof value.detail === 'string' && value.detail.trim()) {
        return value.detail;
    }
    if (typeof value.error === 'string' && value.error.trim()) {
        return value.error;
    }
    if (value.error && typeof value.error === 'object' && typeof value.error.message === 'string' && value.error.message.trim()) {
        return value.error.message;
    }
    return fallback;
}

function shouldRetryReplicateRateLimit(status, message) {
    if (status === 429) {
        return true;
    }
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('throttled') || normalized.includes('rate limit');
}

function buildReplicateRetryDelayMs(message, attempt) {
    const match = String(message || '').match(/resets in ~(\d+)s/i);
    const resetSeconds = match ? Number.parseInt(match[1], 10) : 0;
    const floorSeconds = 10;
    return Math.max(resetSeconds + 1, floorSeconds + attempt) * 1000;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
