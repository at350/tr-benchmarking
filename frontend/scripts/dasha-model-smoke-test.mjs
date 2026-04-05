import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { smokeTestDashaModels } from '../src/lib/dasha-model-runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../../lsh/.env'),
];

for (const envFile of envCandidates) {
    if (fs.existsSync(envFile)) {
        process.loadEnvFile(envFile);
    }
}

const selectedModels = [
    { provider: 'replicate', model: 'anthropic/claude-4-sonnet', temperature: 0.7 },
    { provider: 'replicate', model: 'anthropic/claude-3.5-haiku', temperature: 0.7 },
    { provider: 'replicate', model: 'google/gemini-3-pro', temperature: 0.7 },
    { provider: 'replicate', model: 'google/gemini-3-flash', temperature: 0.7 },
    { provider: 'replicate', model: 'deepseek-ai/deepseek-v3', temperature: 0.7 },
    { provider: 'replicate', model: 'moonshotai/kimi-k2-thinking', temperature: 0.7 },
    { provider: 'replicate', model: 'meta/llama-4-maverick-instruct', temperature: 0.7 },
    { provider: 'replicate', model: 'meta/llama-4-scout-instruct', temperature: 0.7 },
    { provider: 'openai', model: 'gpt-4o', temperature: 0.7, reasoningEffort: 'none' },
    { provider: 'openai', model: 'gpt-5.4', temperature: 0.7, reasoningEffort: 'medium' },
    { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7, reasoningEffort: 'medium' },
    { provider: 'openai', model: 'gpt-4.1-nano', temperature: 0.7, reasoningEffort: 'none' },
];

const questionText = [
    'Merchant A mailed Buyer B a signed letter on January 1 offering to sell 500 widgets for $10 each and stating the offer would remain open until March 31.',
    'On February 1, Merchant A called Buyer B and said the offer was revoked.',
    'On February 5, Buyer B mailed an acceptance.',
    'Is there an enforceable contract? Answer briefly with the governing rule and conclusion.',
].join(' ');

if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.');
    process.exit(1);
}

if (!process.env.REPLICATE_API_TOKEN) {
    console.error('REPLICATE_API_TOKEN is not set.');
    process.exit(1);
}

console.log(`Running Dasha model smoke test for ${selectedModels.length} models...`);
const results = await smokeTestDashaModels(selectedModels, questionText);

let failures = 0;
for (const result of results) {
    if (result.ok) {
        console.log(`PASS ${result.provider} ${result.model} (${result.durationMs} ms)`);
        console.log(`  ${result.responsePreview}`);
        continue;
    }

    failures += 1;
    console.log(`FAIL ${result.provider} ${result.model} (${result.durationMs} ms)`);
    console.log(`  ${result.error ?? 'No output returned.'}`);
}

if (failures > 0) {
    console.error(`Smoke test finished with ${failures} failure(s).`);
    process.exit(1);
}

console.log('Smoke test passed for all requested Dasha models.');
