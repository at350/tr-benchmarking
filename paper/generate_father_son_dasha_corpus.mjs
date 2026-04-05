import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { generateModelResponse } from '../frontend/src/lib/dasha-model-runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

for (const envFile of [
    path.resolve(projectRoot, 'frontend/.env'),
    path.resolve(projectRoot, 'frontend/.env.local'),
    path.resolve(projectRoot, 'lsh/.env'),
    path.resolve(projectRoot, '.env'),
]) {
    if (fs.existsSync(envFile)) {
        process.loadEnvFile(envFile);
    }
}

if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.');
}
if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN is not set.');
}

const frankPacket = JSON.parse(
    fs.readFileSync(path.resolve(projectRoot, 'rubric-automation/question_golden_input.json'), 'utf8'),
);
const questionText = String(frankPacket.legal_question || '').trim();
if (!questionText) {
    throw new Error('Frank packet does not contain a legal_question.');
}

const systemPrompt = [
    'You are an expert legal assistant.',
    'You must formulate your response using the IRAC method: Issue, Rule, Application, Conclusion.',
    'You must return only a strictly formatted JSON object.',
    'Do not include markdown wrappers or conversational prefatory text.',
    'Spell out legal terms fully instead of using unexplained abbreviations.',
    'Your JSON must match this schema exactly:',
    JSON.stringify({
        issue: 'A concise statement of the core legal question.',
        rule: 'The relevant legal doctrine or rules governing the issue.',
        application: 'How the rule directly applies to the specific facts provided.',
        conclusion: 'A direct, definitive answer to the legal question.',
    }),
].join(' ');

const selectedModels = [
    { provider: 'openai', model: 'gpt-4o', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'openai', model: 'gpt-5.4', temperature: 0.7, reasoningEffort: 'medium' },
    { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7, reasoningEffort: 'medium' },
    { provider: 'openai', model: 'gpt-4.1-nano', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'anthropic/claude-4-sonnet', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'anthropic/claude-3.5-haiku', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'google/gemini-3-pro', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'google/gemini-3-flash', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'deepseek-ai/deepseek-v3', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'moonshotai/kimi-k2-thinking', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'meta/llama-4-maverick-instruct', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'replicate', model: 'meta/llama-4-scout-instruct', temperature: 0.7, reasoningEffort: 'none' },
];

const totalSamples = 240;
const basePerModel = Math.floor(totalSamples / selectedModels.length);
const remainder = totalSamples % selectedModels.length;
const temperatureOffsets = [0, 0.08, -0.08, 0.14, -0.14];
const tasks = [];

selectedModels.forEach((selectedModel, modelIndex) => {
    const count = basePerModel + (modelIndex < remainder ? 1 : 0);
    for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
        const temperature = clamp(
            roundToTwo((selectedModel.temperature ?? 0.7) + temperatureOffsets[sampleIndex % temperatureOffsets.length]),
            0.2,
            1.0,
        );
        tasks.push({ selectedModel, sampleIndex, temperature });
    }
});

function extractJson(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    try {
        return JSON.parse(candidate);
    } catch {}

    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(candidate.slice(start, end + 1));
        } catch {}
    }
    return null;
}

function normalizeIrac(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const issue = cleanString(payload.issue ?? payload.Issue);
    const rule = cleanString(payload.rule ?? payload.Rule);
    const application = cleanString(payload.application ?? payload.Application);
    const conclusion = cleanString(payload.conclusion ?? payload.Conclusion);
    if (!issue || !rule || !application || !conclusion) {
        return null;
    }
    return { issue, rule, application, conclusion };
}

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function inferFamily(model) {
    const normalized = model.toLowerCase();
    if (normalized.includes('gpt')) return 'GPT';
    if (normalized.includes('claude')) return 'Claude';
    if (normalized.includes('gemini')) return 'Gemini';
    if (normalized.includes('llama')) return 'LLAMA';
    if (normalized.includes('deepseek')) return 'DeepSeek';
    if (normalized.includes('kimi')) return 'Kimi';
    return 'Unknown';
}

function displayModelName(model) {
    return model.includes('/') ? model.split('/').at(-1) : model;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function roundToTwo(value) {
    return Math.round(value * 100) / 100;
}

async function runTask(task) {
    const displayModel = displayModelName(task.selectedModel.model);
    const id = `${displayModel}_${task.sampleIndex}`;
    try {
        const rawText = await generateModelResponse({
            provider: task.selectedModel.provider,
            model: task.selectedModel.model,
            systemPrompt,
            messages: [{ role: 'user', content: questionText }],
            temperature: task.temperature,
            reasoningEffort: task.selectedModel.reasoningEffort,
        });
        const parsed = normalizeIrac(extractJson(rawText));
        if (!parsed) {
            return {
                id,
                model: displayModel,
                family: inferFamily(displayModel),
                prompt: questionText,
                raw_text: rawText,
                error: 'Failed to parse strict IRAC JSON.',
            };
        }
        return {
            id,
            model: displayModel,
            family: inferFamily(displayModel),
            prompt: questionText,
            raw_text: rawText,
            response: parsed,
        };
    } catch (error) {
        return {
            id,
            model: displayModel,
            family: inferFamily(displayModel),
            prompt: questionText,
            raw_text: '',
            error: error instanceof Error ? error.message : 'Model generation failed.',
        };
    }
}

async function runWithConcurrency(inputTasks, concurrency) {
    const results = new Array(inputTasks.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= inputTasks.length) {
                return;
            }
            results[currentIndex] = await runTask(inputTasks[currentIndex]);
        }
    }

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    return results;
}

const openAiTasks = tasks.filter((task) => task.selectedModel.provider === 'openai');
const replicateTasks = tasks.filter((task) => task.selectedModel.provider === 'replicate');

console.log(`Running father-son Dasha generation for ${tasks.length} samples across ${selectedModels.length} models...`);
const [openAiResults, replicateResults] = await Promise.all([
    runWithConcurrency(openAiTasks, 4),
    runWithConcurrency(replicateTasks, 1),
]);

const results = [...openAiResults, ...replicateResults];
const valid = results.filter((item) => !item.error && item.response);
const failures = results.filter((item) => item.error);

const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const outputPath = path.resolve(projectRoot, `paper/data/father_son_responses_${timestamp}.json`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(valid, null, 2));

console.log(`Saved ${valid.length} valid responses to ${outputPath}`);
if (failures.length > 0) {
    const failureSummary = failures.reduce((acc, item) => {
        acc[item.model] = (acc[item.model] || 0) + 1;
        return acc;
    }, {});
    console.log('Failures by model:');
    for (const [model, count] of Object.entries(failureSummary)) {
        console.log(`  ${model}: ${count}`);
    }
}

if (valid.length !== totalSamples) {
    process.exitCode = 1;
}
