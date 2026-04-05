export type ModelProvider = 'openai' | 'replicate';

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export type ModelOption = {
    value: string;
    label: string;
};

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
    openai: 'OpenAI',
    replicate: 'Replicate',
};

export const MODEL_OPTIONS_BY_PROVIDER: Record<ModelProvider, ModelOption[]> = {
    openai: [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-5.4', label: 'GPT-5.4' },
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
        { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    ],
    replicate: [
        { value: 'anthropic/claude-4-sonnet', label: 'Claude 4 Sonnet' },
        { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
        { value: 'google/gemini-3-pro', label: 'Gemini 3 Pro' },
        { value: 'google/gemini-3-flash', label: 'Gemini 3 Flash' },
        { value: 'deepseek-ai/deepseek-v3', label: 'DeepSeek V3' },
        { value: 'moonshotai/kimi-k2-thinking', label: 'Kimi K2 Thinking' },
        { value: 'meta/llama-4-maverick-instruct', label: 'Llama 4 Maverick Instruct' },
        { value: 'meta/llama-4-scout-instruct', label: 'Llama 4 Scout Instruct' },
    ],
};

export const REASONING_OPTIONS: Array<{ value: ReasoningEffort; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'X-High' },
];

export function getModelOptions(provider: ModelProvider) {
    return MODEL_OPTIONS_BY_PROVIDER[provider];
}

export function getDefaultModelForProvider(provider: ModelProvider) {
    return MODEL_OPTIONS_BY_PROVIDER[provider][0]?.value || '';
}

export function supportsReasoningEffortControl(provider: ModelProvider, model: string) {
    if (provider === 'openai') {
        return model.startsWith('gpt-5');
    }
    return false;
}
