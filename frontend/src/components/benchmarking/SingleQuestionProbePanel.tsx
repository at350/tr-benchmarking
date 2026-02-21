'use client';

import { useRef } from 'react';

import { InfoTip } from '@/components/ui/InfoTip';
import { getModelOptions, ModelProvider, ReasoningEffort, REASONING_OPTIONS, supportsReasoningEffortControl } from '@/lib/model-options';
import type { PromptTemplate } from '@/lib/prompt-library';

export type DatasetQuestion = {
    id: string;
    question: string;
    choices: string[];
    answer_letter: string;
    subfield?: string;
    difficulty?: string;
};

export type EditableSingleQuestion = {
    id: string;
    question: string;
    choices: string[];
    answerLetter: string;
    subfield?: string;
    difficulty?: string;
};

export type SingleProbeConfig = {
    provider: ModelProvider;
    model: string;
    reasoningEffort: ReasoningEffort;
    temperature: number;
    subjectFilter: string;
    difficultyFilter: string;
    selectedDatasetQuestionId: string;
    useCustomPrompt: boolean;
    selectedPromptId: string;
};

type SingleQuestionProbePanelProps = {
    config: SingleProbeConfig;
    setConfig: React.Dispatch<React.SetStateAction<SingleProbeConfig>>;
    availableQuestions: DatasetQuestion[];
    editableQuestion: EditableSingleQuestion;
    setEditableQuestion: React.Dispatch<React.SetStateAction<EditableSingleQuestion>>;
    prompts: PromptTemplate[];
    selectedPrompt: PromptTemplate | null;
    promptNameDraft: string;
    setPromptNameDraft: (value: string) => void;
    promptContentDraft: string;
    setPromptContentDraft: (value: string) => void;
    promptStatus: string | null;
    onLoadDatasetQuestion: () => void;
    onSavePrompt: () => void;
    onDeletePrompt: () => void;
    onExportPrompts: () => void;
    onImportPrompts: (raw: string) => void;
    onRun: () => void;
    isRunning: boolean;
    canRun: boolean;
    runDisabledReason?: string;
};

export function SingleQuestionProbePanel({
    config,
    setConfig,
    availableQuestions,
    editableQuestion,
    setEditableQuestion,
    prompts,
    selectedPrompt,
    promptNameDraft,
    setPromptNameDraft,
    promptContentDraft,
    setPromptContentDraft,
    promptStatus,
    onLoadDatasetQuestion,
    onSavePrompt,
    onDeletePrompt,
    onExportPrompts,
    onImportPrompts,
    onRun,
    isRunning,
    canRun,
    runDisabledReason,
}: SingleQuestionProbePanelProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const filteredQuestions = availableQuestions.filter((row) => {
        const matchesSubject = config.subjectFilter === 'All' || (row.subfield || 'Unknown') === config.subjectFilter;
        const matchesDifficulty = config.difficultyFilter === 'All' || (row.difficulty || 'Unknown') === config.difficultyFilter;
        return matchesSubject && matchesDifficulty;
    });

    const subjectOptions = ['All', ...Array.from(new Set(availableQuestions.map((row) => row.subfield || 'Unknown'))).sort()];
    const difficultyOptions = ['All', ...Array.from(new Set(availableQuestions.map((row) => row.difficulty || 'Unknown'))).sort()];
    const supportsReasoningControl = supportsReasoningEffortControl(config.provider, config.model);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const raw = typeof reader.result === 'string' ? reader.result : '';
            onImportPrompts(raw);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const updateChoice = (index: number, value: string) => {
        setEditableQuestion((prev) => {
            const nextChoices = [...prev.choices];
            nextChoices[index] = value;
            return {
                ...prev,
                choices: nextChoices,
            };
        });
    };

    return (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
                <h3 className="text-lg font-bold text-slate-900">Single Question Probe</h3>
                <p className="mt-1 text-sm text-slate-600">Select one dataset question or edit a custom question, then benchmark a single model response with optional prompt injection.</p>
            </div>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Question Source</p>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Subfield Filter
                            <InfoTip label="Filter dataset questions by subfield before selecting one to load into the editor." />
                        </span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.subjectFilter}
                            onChange={(event) => setConfig((prev) => ({ ...prev, subjectFilter: event.target.value }))}
                        >
                            {subjectOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Difficulty Filter
                            <InfoTip label="Narrow dataset questions to easy/middle/hard before loading one into the editable probe form." />
                        </span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.difficultyFilter}
                            onChange={(event) => setConfig((prev) => ({ ...prev, difficultyFilter: event.target.value }))}
                        >
                            {difficultyOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <label className="space-y-1 block">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Dataset Question
                        <InfoTip label="Pick an existing dataset question and load it into the editor. You can modify text, options, and answer before running." />
                    </span>
                    <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={config.selectedDatasetQuestionId}
                        onChange={(event) => setConfig((prev) => ({ ...prev, selectedDatasetQuestionId: event.target.value }))}
                    >
                        <option value="">Select a question...</option>
                        {filteredQuestions.map((question) => (
                            <option key={question.id} value={question.id}>
                                {question.id.slice(0, 12)}... - {(question.subfield || 'Unknown')} - {(question.difficulty || 'Unknown')}
                            </option>
                        ))}
                    </select>
                </label>

                <button
                    type="button"
                    onClick={onLoadDatasetQuestion}
                    disabled={!config.selectedDatasetQuestionId}
                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Load Into Editable Question
                </button>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Editable Question</p>
                <label className="space-y-1 block">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Question Text
                        <InfoTip label="This exact text is sent to the benchmark API. Edit freely after loading from dataset." />
                    </span>
                    <textarea
                        className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={editableQuestion.question}
                        onChange={(event) => setEditableQuestion((prev) => ({ ...prev, question: event.target.value }))}
                    />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                    {editableQuestion.choices.map((choice, index) => (
                        <label key={index} className="space-y-1 block">
                            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Choice {String.fromCharCode(65 + index)}</span>
                            <input
                                type="text"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                value={choice}
                                onChange={(event) => updateChoice(index, event.target.value)}
                            />
                        </label>
                    ))}
                </div>

                <label className="space-y-1 block">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Correct Answer Letter
                        <InfoTip label="Used for scoring correctness. Keep aligned with your edited choice options." />
                    </span>
                    <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={editableQuestion.answerLetter}
                        onChange={(event) => setEditableQuestion((prev) => ({ ...prev, answerLetter: event.target.value }))}
                    >
                        {editableQuestion.choices.map((_, index) => {
                            const letter = String.fromCharCode(65 + index);
                            return <option key={letter} value={letter}>{letter}</option>;
                        })}
                    </select>
                </label>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Model Settings</p>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Provider
                            <InfoTip label="Choose the model provider for the single-question benchmark run." />
                        </span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.provider}
                            onChange={(event) => {
                                const provider = event.target.value as ModelProvider;
                                const options = getModelOptions(provider);
                                setConfig((prev) => ({
                                    ...prev,
                                    provider,
                                    model: options[0]?.value || prev.model,
                                }));
                            }}
                        >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Gemini</option>
                        </select>
                    </label>

                    <label className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Model
                            <InfoTip label="Select which frontier model to evaluate on this single question." />
                        </span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.model}
                            onChange={(event) => setConfig((prev) => ({ ...prev, model: event.target.value }))}
                        >
                            {getModelOptions(config.provider).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                </div>

                {supportsReasoningControl && (
                    <label className="space-y-1 block">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Thinking Effort
                            <InfoTip label="Controls reasoning effort for models that expose an explicit thinking dial." />
                        </span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.reasoningEffort}
                            onChange={(event) => setConfig((prev) => ({ ...prev, reasoningEffort: event.target.value as ReasoningEffort }))}
                        >
                            {REASONING_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                )}

                <label className="space-y-1 block">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                        Temperature ({config.temperature.toFixed(1)})
                        <InfoTip label="Higher values increase variability. Lower values are more deterministic." />
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        className="w-full accent-teal-600"
                        value={config.temperature}
                        onChange={(event) => setConfig((prev) => ({ ...prev, temperature: parseFloat(event.target.value) }))}
                    />
                </label>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Prompt Library</p>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                            type="checkbox"
                            checked={config.useCustomPrompt}
                            onChange={(event) => setConfig((prev) => ({ ...prev, useCustomPrompt: event.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300"
                        />
                        Use custom user prompt
                    </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 block">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Saved Prompt
                            <InfoTip label="When custom prompt mode is enabled, this prompt is prepended before the question payload." />
                        </span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.selectedPromptId}
                            onChange={(event) => setConfig((prev) => ({ ...prev, selectedPromptId: event.target.value }))}
                        >
                            <option value="">Select prompt...</option>
                            {prompts.map((prompt) => (
                                <option key={prompt.id} value={prompt.id}>{prompt.name}</option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-1 block">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prompt Name</span>
                        <input
                            type="text"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            placeholder="e.g. IRAC strict answer prompt"
                            value={promptNameDraft}
                            onChange={(event) => setPromptNameDraft(event.target.value)}
                        />
                    </label>
                </div>

                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prompt Content</span>
                    <textarea
                        className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={promptContentDraft}
                        onChange={(event) => setPromptContentDraft(event.target.value)}
                        placeholder="Write or edit the reusable user prompt template."
                    />
                </label>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onSavePrompt}
                        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                    >
                        Save Prompt
                    </button>
                    <button
                        type="button"
                        onClick={onDeletePrompt}
                        disabled={!selectedPrompt}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Delete Selected
                    </button>
                    <button
                        type="button"
                        onClick={handleImportClick}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                        Import JSON
                    </button>
                    <button
                        type="button"
                        onClick={onExportPrompts}
                        disabled={prompts.length === 0}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Export JSON
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={handleImportFile}
                    />
                </div>

                {promptStatus && <p className="text-xs text-teal-700">{promptStatus}</p>}
            </section>

            <button
                type="button"
                onClick={onRun}
                disabled={isRunning || !canRun}
                className={`w-full rounded-xl py-3 text-sm font-bold transition-colors ${isRunning || !canRun
                    ? 'cursor-not-allowed bg-slate-300 text-slate-600'
                    : 'bg-gradient-to-r from-teal-600 to-blue-600 text-white hover:from-teal-500 hover:to-blue-500'
                    }`}
            >
                {isRunning ? 'Running Single Probe...' : 'Run Single Question Probe'}
            </button>

            {!isRunning && !canRun && runDisabledReason && <p className="text-xs text-rose-700">{runDisabledReason}</p>}

            {config.useCustomPrompt && !selectedPrompt && (
                <p className="text-xs text-amber-700">Custom prompt mode is enabled. Select or save a prompt template before running.</p>
            )}
        </div>
    );
}
