
import React from 'react';

export type ExperimentConfig = {
    dataset: 'supergpqa' | 'prbench';
    provider: 'openai' | 'anthropic' | 'gemini';
    model: string;
    judgeProvider: 'openai' | 'anthropic' | 'gemini';
    judgeModel: string;
    judgeReasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    promptTemplate: 'baseline' | 'cot';
    temperature: number;
    reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    perturbations: {
        adversarialText: boolean;
        labelNoise: number;
    };
    judgePrompt: string;
    limit: number;
    subject: string;
    difficulty: string;
    questionSelectionMode: 'auto' | 'manual';
    autoSelectionOrder: 'random' | 'ordered';
    sampleSeed: number;
    manualQuestionIds: string;
};

type SelectionPreview = {
    mode: 'auto' | 'manual';
    filteredCount: number;
    selectedCount: number;
    selectedIds: string[];
    missingIds: string[];
    bucketCounts: Array<{ label: string; count: number }>;
};

interface ConfigPanelProps {
    config: ExperimentConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExperimentConfig>>;
    onRun: () => void;
    isLoading: boolean;
    subjects: string[];
    selectionPreview: SelectionPreview;
    canRun: boolean;
    runDisabledReason?: string;
}

export function ConfigPanel({ config, setConfig, onRun, isLoading, subjects, selectionPreview, canRun, runDisabledReason }: ConfigPanelProps) {
    const handleChange = (field: keyof ExperimentConfig, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handlePerturbationChange = (field: keyof ExperimentConfig['perturbations'], value: any) => {
        setConfig(prev => ({
            ...prev,
            perturbations: {
                ...prev.perturbations,
                [field]: value
            }
        }));
    };

    const supportsGpt52Thinking = config.provider === 'openai' && (config.model === 'gpt-5.2' || config.model === 'gpt-5.2-pro');
    const supportsJudgeThinking = config.judgeProvider === 'openai' && (config.judgeModel === 'gpt-5.2' || config.judgeModel === 'gpt-5.2-pro');
    const isPrbench = config.dataset === 'prbench';
    const openAiModels = [
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
        { value: 'o4-mini', label: 'o4-mini' }
    ];
    const anthropicModels = [
        { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (20251101)' },
        { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (20250929)' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (20251001)' },
        { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 (Alias)' },
        { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Alias)' },
        { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Alias)' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (20241022)' },
        { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (20240620)' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (20241022)' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (20240229)' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet (20240229)' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (20240307)' }
    ];
    const geminiModels = [
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { value: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (Stable 001)' },
        { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' },
        { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' }
    ];
    const getDefaultModel = (provider: ExperimentConfig['provider']) => {
        if (provider === 'anthropic') return anthropicModels[0].value;
        if (provider === 'gemini') return geminiModels[0].value;
        return openAiModels[6].value;
    };
    const thinkingModes: Array<{ value: ExperimentConfig['reasoningEffort']; label: string }> = [
        { value: 'none', label: 'None' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'xhigh', label: 'X-High' }
    ];

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-6 h-full">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                Experiment Configuration
            </h2>

            {/* Dataset Selection */}
            <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Dataset</label>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.dataset === 'supergpqa' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        onClick={() => setConfig(prev => ({ ...prev, dataset: 'supergpqa', subject: 'All', difficulty: 'All' }))}
                        type="button"
                    >
                        SuperGPQA
                    </button>
                    <button
                        className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.dataset === 'prbench' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        onClick={() => setConfig(prev => ({ ...prev, dataset: 'prbench', subject: 'All', difficulty: 'All', promptTemplate: 'baseline' }))}
                        type="button"
                    >
                        PRBench
                    </button>
                </div>

                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {isPrbench ? 'Topic Filter' : 'Dataset Filter'}
                </label>

                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                    value={config.subject}
                    onChange={(e) => handleChange('subject', e.target.value)}
                >
                    <option value="All">{isPrbench ? 'All Topics' : 'All Subfields'}</option>
                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {!isPrbench && (
                    <select
                        className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                        value={config.difficulty}
                        onChange={(e) => handleChange('difficulty', e.target.value)}
                    >
                        <option value="All">All Difficulties</option>
                        <option value="easy">Easy</option>
                        <option value="middle">Middle</option>
                        <option value="hard">Hard</option>
                    </select>
                )}

                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Max {isPrbench ? 'Items' : 'Questions'}:</span>
                    <select
                        className="p-1 border rounded bg-white text-sm"
                        value={config.limit}
                        onChange={(e) => handleChange('limit', parseInt(e.target.value))}
                    >
                        <option value="5">5 (Demo)</option>
                        <option value="10">10</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Question Selection</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => handleChange('questionSelectionMode', 'auto')}
                            className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.questionSelectionMode === 'auto' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Auto Sample
                        </button>
                        <button
                            type="button"
                            onClick={() => handleChange('questionSelectionMode', 'manual')}
                            className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.questionSelectionMode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Manual IDs
                        </button>
                    </div>
                </div>

                {config.questionSelectionMode === 'auto' ? (
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Auto Order</label>
                        <select
                            className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                            value={config.autoSelectionOrder}
                            onChange={(e) => handleChange('autoSelectionOrder', e.target.value as ExperimentConfig['autoSelectionOrder'])}
                        >
                            <option value="ordered">Ordered by ID</option>
                            <option value="random">Random (Seeded)</option>
                        </select>
                        {config.autoSelectionOrder === 'random' && (
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sample Seed</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                                    value={config.sampleSeed}
                                    onChange={(e) => handleChange('sampleSeed', Number(e.target.value) || 0)}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{isPrbench ? 'Item IDs' : 'Question IDs'} (comma or newline separated)</label>
                        <textarea
                            className="w-full min-h-[88px] p-2 border rounded-lg bg-gray-50 text-sm font-mono"
                            placeholder="e.g. 01ac..., 17bd..., 22ff..."
                            value={config.manualQuestionIds}
                            onChange={(e) => handleChange('manualQuestionIds', e.target.value)}
                        />
                        <p className="text-xs text-gray-500">Manual mode ignores Max {isPrbench ? 'Items' : 'Questions'} and runs exactly the IDs you list (after filters).</p>
                    </div>
                )}

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Selection Preview</p>
                    <p className="text-sm text-gray-700">Filtered pool: <span className="font-semibold">{selectionPreview.filteredCount}</span></p>
                    <p className="text-sm text-gray-700">Selected for run: <span className="font-semibold">{selectionPreview.selectedCount}</span></p>
                    {selectionPreview.missingIds.length > 0 && (
                        <p className="text-xs text-red-600">Missing IDs: {selectionPreview.missingIds.slice(0, 6).join(', ')}{selectionPreview.missingIds.length > 6 ? '...' : ''}</p>
                    )}
                    {selectionPreview.bucketCounts.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{isPrbench ? 'Topic mix' : 'Subfield mix'}</p>
                            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                                {selectionPreview.bucketCounts.slice(0, 8).map((item) => (
                                    <div key={item.label} className="flex items-center justify-between text-xs text-gray-600">
                                        <span className="truncate pr-2">{item.label}</span>
                                        <span className="font-semibold">{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {selectionPreview.selectedIds.length > 0 && (
                        <p className="text-xs text-gray-600">
                            IDs: <span className="font-mono">{selectionPreview.selectedIds.slice(0, 4).join(', ')}{selectionPreview.selectedIds.length > 4 ? ', ...' : ''}</span>
                        </p>
                    )}
                </div>
            </div>

            <hr className="border-gray-100" />

            {/* Model Selection */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Provider</label>
                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={config.provider}
                    onChange={(e) => {
                        const provider = e.target.value as ExperimentConfig['provider'];
                        setConfig(prev => ({
                            ...prev,
                            provider,
                            model: getDefaultModel(provider)
                        }));
                    }}
                >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                </select>

                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Model</label>
                {config.provider === 'openai' ? (
                    <select
                        className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={config.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                    >
                        {openAiModels.map(model => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
                    </select>
                ) : config.provider === 'anthropic' ? (
                    <select
                        className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={config.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                    >
                        {anthropicModels.map(model => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
                    </select>
                ) : (
                    <select
                        className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={config.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                    >
                        {geminiModels.map(model => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
                    </select>
                )}
            </div>

            {supportsGpt52Thinking && (
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">GPT-5.2 Thinking</label>
                    <div className="grid grid-cols-5 gap-2">
                        {thinkingModes.map(mode => (
                            <button
                                key={mode.value}
                                className={`p-2 rounded-lg text-xs font-semibold transition-colors ${config.reasoningEffort === mode.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                onClick={() => handleChange('reasoningEffort', mode.value)}
                                type="button"
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {isPrbench && (
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Judge Provider</label>
                    <select
                        className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={config.judgeProvider}
                        onChange={(e) => {
                            const provider = e.target.value as ExperimentConfig['judgeProvider'];
                            setConfig(prev => ({
                                ...prev,
                                judgeProvider: provider,
                                judgeModel: getDefaultModel(provider)
                            }));
                        }}
                    >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="gemini">Gemini</option>
                    </select>

                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Judge Model</label>
                    {config.judgeProvider === 'openai' ? (
                        <select
                            className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={config.judgeModel}
                            onChange={(e) => handleChange('judgeModel', e.target.value)}
                        >
                            {openAiModels.map(model => (
                                <option key={model.value} value={model.value}>{model.label}</option>
                            ))}
                        </select>
                    ) : config.judgeProvider === 'anthropic' ? (
                        <select
                            className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={config.judgeModel}
                            onChange={(e) => handleChange('judgeModel', e.target.value)}
                        >
                            {anthropicModels.map(model => (
                                <option key={model.value} value={model.value}>{model.label}</option>
                            ))}
                        </select>
                    ) : (
                        <select
                            className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={config.judgeModel}
                            onChange={(e) => handleChange('judgeModel', e.target.value)}
                        >
                            {geminiModels.map(model => (
                                <option key={model.value} value={model.value}>{model.label}</option>
                            ))}
                        </select>
                    )}
                </div>
            )}

            {isPrbench && supportsJudgeThinking && (
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Judge Thinking</label>
                    <div className="grid grid-cols-5 gap-2">
                        {thinkingModes.map(mode => (
                            <button
                                key={mode.value}
                                className={`p-2 rounded-lg text-xs font-semibold transition-colors ${config.judgeReasoningEffort === mode.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                onClick={() => handleChange('judgeReasoningEffort', mode.value)}
                                type="button"
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Prompt Template */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Prompt Template</label>
                <div className={`grid ${isPrbench ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
                    <button
                        className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.promptTemplate === 'baseline' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        onClick={() => handleChange('promptTemplate', 'baseline')}
                    >
                        Baseline
                    </button>
                    {!isPrbench && (
                        <button
                            className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.promptTemplate === 'cot' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            onClick={() => handleChange('promptTemplate', 'cot')}
                        >
                            Chain of Thought
                        </button>
                    )}
                </div>
            </div>

            {/* Temperature */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Temperature: {config.temperature}
                </label>
                <input
                    type="range"
                    min="0" max="1" step="0.1"
                    className="w-full accent-blue-600"
                    value={config.temperature}
                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                />
            </div>

            <hr className="border-gray-100" />

            {/* Perturbations */}
            <div className="space-y-4">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Perturbations</label>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Adversarial Text</span>
                    <input
                        type="checkbox"
                        className="w-5 h-5 accent-red-500"
                        checked={config.perturbations.adversarialText}
                        onChange={(e) => handlePerturbationChange('adversarialText', e.target.checked)}
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-sm text-gray-700">Label Noise</span>
                        <span className="text-sm font-bold text-red-500">{config.perturbations.labelNoise}%</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="50" step="10"
                        className="w-full accent-red-500"
                        value={config.perturbations.labelNoise}
                        onChange={(e) => handlePerturbationChange('labelNoise', parseInt(e.target.value))}
                    />
                </div>
            </div>

            {isPrbench && (
                <>
                    <hr className="border-gray-100" />
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Judge Prompt (Optional)</label>
                        <textarea
                            className="w-full min-h-[120px] p-3 border rounded-lg bg-gray-50 text-sm resize-vertical focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Add custom judge instructions to steer scoring (optional)."
                            value={config.judgePrompt}
                            onChange={(e) => handleChange('judgePrompt', e.target.value)}
                        />
                        <p className="text-xs text-gray-500">
                            Leave blank to use the built-in judge rubric. When provided, this is appended to the baseline judge instructions.
                        </p>
                    </div>
                </>
            )}

            <div className="mt-auto">
                <div className="space-y-2">
                    <button
                        onClick={onRun}
                        disabled={isLoading || !canRun}
                        className={`w-full py-3 rounded-lg font-bold text-lg shadow-lg transition-all ${isLoading || !canRun ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'transform hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-500/30'}`}
                    >
                        {isLoading ? 'Running Experiment...' : 'Run Experiment'}
                    </button>
                    {!isLoading && !canRun && runDisabledReason && (
                        <p className="text-xs text-red-600">{runDisabledReason}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
