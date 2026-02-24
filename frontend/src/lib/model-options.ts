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
        { value: 'gpt-5.2', label: 'GPT-5.2 (Thinking)' },
        { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro (Thinking)' },
        { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Instant' },
        { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
        { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'gpt-4.1', label: 'GPT-4.1' },
        { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
        { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
        { value: 'o3', label: 'o3' },
        { value: 'o4-mini', label: 'o4-mini' },
    ],
    anthropic: [
        { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (20251101)' },
        { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (20250929)' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (20251001)' },
        { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 (Alias)' },
        { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Alias)' },
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Alias)' },
        { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
    ],
    gemini: [
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
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
        return model === 'gpt-5.2' || model === 'gpt-5.2-pro';
    }
    if (provider === 'gemini') {
        return model.startsWith('gemini-');
    }
    return false;
}
