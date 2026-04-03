export type ModelProvider = 'openai' | 'anthropic' | 'gemini';

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export type ModelOption = {
    value: string;
    label: string;
};

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
};

export const MODEL_OPTIONS_BY_PROVIDER: Record<ModelProvider, ModelOption[]> = {
    openai: [
        { value: 'gpt-5.4', label: 'GPT-5.4' },
        { value: 'gpt-5.4-pro', label: 'GPT-5.4 Pro' },
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
        { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
        { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
        { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    ],
    anthropic: [
        { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
        { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    ],
    gemini: [
        { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
        { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
        { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
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
    if (provider === 'gemini') {
        return model.startsWith('gemini-');
    }
    return false;
}
