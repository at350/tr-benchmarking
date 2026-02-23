'use client';

import { useMemo, useRef, useState } from 'react';

import { InfoTip } from '@/components/ui/InfoTip';
import { getModelOptions, ModelProvider, ReasoningEffort, REASONING_OPTIONS, supportsReasoningEffortControl } from '@/lib/model-options';
import { isBuiltinPromptTemplateId, type PromptTemplate } from '@/lib/prompt-library';

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

export type MultiModelSelectionOption = {
    key: string;
    provider: ModelProvider;
    providerLabel: string;
    model: string;
    modelLabel: string;
};

type SingleQuestionProbePanelProps = {
    mode?: 'single' | 'multi_model';
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
    onCreateNewPrompt: () => void;
    onDeletePrompt: () => void;
    onExportPrompts: () => void;
    onImportPrompts: (raw: string) => void;
    onRun: () => void;
    isRunning: boolean;
    canRun: boolean;
    runDisabledReason?: string;
    multiModelOptions?: MultiModelSelectionOption[];
    selectedMultiModelKeys?: string[];
    multiModelRunsPerArm?: number;
    onToggleMultiModel?: (key: string) => void;
    onSelectAllMultiModels?: () => void;
    onClearAllMultiModels?: () => void;
    onMultiModelRunsPerArmChange?: (value: number) => void;
};

export function SingleQuestionProbePanel({
    mode = 'single',
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
    onCreateNewPrompt,
    onDeletePrompt,
    onExportPrompts,
    onImportPrompts,
    onRun,
    isRunning,
    canRun,
    runDisabledReason,
    multiModelOptions = [],
    selectedMultiModelKeys = [],
    multiModelRunsPerArm = 1,
    onToggleMultiModel,
    onSelectAllMultiModels,
    onClearAllMultiModels,
    onMultiModelRunsPerArmChange,
}: SingleQuestionProbePanelProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [datasetQuestionQuery, setDatasetQuestionQuery] = useState('');

    const filteredQuestions = availableQuestions.filter((row) => {
        const matchesSubject = config.subjectFilter === 'All' || (row.subfield || 'Unknown') === config.subjectFilter;
        const matchesDifficulty = config.difficultyFilter === 'All' || (row.difficulty || 'Unknown') === config.difficultyFilter;
        return matchesSubject && matchesDifficulty;
    });
    const searchableQuestions = useMemo(() => {
        const query = datasetQuestionQuery.trim().toLowerCase();
        if (!query) {
            return filteredQuestions;
        }

        return filteredQuestions.filter((question) => {
            const haystack = [
                question.id,
                question.question,
                question.subfield,
                question.difficulty,
                question.answer_letter,
                ...question.choices,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(query);
        });
    }, [datasetQuestionQuery, filteredQuestions]);
    const visibleQuestionRows = searchableQuestions.slice(0, 30);

    const subjectOptions = ['All', ...Array.from(new Set(availableQuestions.map((row) => row.subfield || 'Unknown'))).sort()];
    const difficultyOptions = ['All', ...Array.from(new Set(availableQuestions.map((row) => row.difficulty || 'Unknown'))).sort()];
    const supportsReasoningControl = supportsReasoningEffortControl(config.provider, config.model);
    const selectedPromptIsBuiltin = selectedPrompt ? isBuiltinPromptTemplateId(selectedPrompt.id) : false;
    const isMultiMode = mode === 'multi_model';
    const promptInputsDisabled = isMultiMode ? false : !config.useCustomPrompt;

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
                <h3 className="text-lg font-bold text-slate-900">
                    {isMultiMode ? 'Single Question Multi-Model A/B' : 'Single Question Probe'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                    {isMultiMode
                        ? 'Select one question, pick multiple models, then run each model multiple times per arm: without custom prompt and with custom prompt.'
                        : 'Select one dataset question or edit a custom question, then benchmark a single model response with optional prompt injection.'}
                </p>
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
                        Dataset Question Search
                        <InfoTip label="Search dataset questions by ID, text, choice text, subfield, or difficulty, then select from the results list." />
                    </span>
                    <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        placeholder="Search questions..."
                        value={datasetQuestionQuery}
                        onChange={(event) => setDatasetQuestionQuery(event.target.value)}
                    />
                </label>

                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white">
                    {visibleQuestionRows.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-500">No questions match your filters/search.</p>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {visibleQuestionRows.map((question) => {
                                const selected = config.selectedDatasetQuestionId === question.id;
                                return (
                                    <button
                                        key={question.id}
                                        type="button"
                                        onClick={() => setConfig((prev) => ({ ...prev, selectedDatasetQuestionId: question.id }))}
                                        className={`w-full px-3 py-2 text-left transition-colors ${selected ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                                    >
                                        <p className="text-xs font-mono text-slate-600">{question.id}</p>
                                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-800">{question.question}</p>
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            {(question.subfield || 'Unknown')} | {(question.difficulty || 'Unknown')} | Ans {question.answer_letter || '?'}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

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
                        (() => {
                            const letter = String.fromCharCode(65 + index);
                            const isCorrectChoice = editableQuestion.answerLetter === letter;
                            return (
                        <label key={index} className="space-y-1 block">
                            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                                <span>Choice {letter}</span>
                                {isCorrectChoice && (
                                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                        Correct
                                    </span>
                                )}
                            </span>
                            <input
                                type="text"
                                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${isCorrectChoice ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-300'}`}
                                value={choice}
                                onChange={(event) => updateChoice(index, event.target.value)}
                            />
                        </label>
                            );
                        })()
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

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <span className="font-semibold">Current correct answer:</span>{' '}
                    {editableQuestion.answerLetter}
                    {editableQuestion.choices[(editableQuestion.answerLetter.charCodeAt(0) - 65)]?.trim()
                        ? ` — ${editableQuestion.choices[(editableQuestion.answerLetter.charCodeAt(0) - 65)].trim()}`
                        : ' (choice text is blank)'}
                </div>
            </section>

            {isMultiMode ? (
                <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Model Selection</p>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <label className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                                Runs Per Arm
                                <InfoTip label="How many times to call each selected model for each arm. Total calls = selected models x 2 arms x runs per arm." />
                            </span>
                            <input
                                type="number"
                                min={1}
                                max={20}
                                step={1}
                                value={multiModelRunsPerArm}
                                onChange={(event) => {
                                    const parsed = Number.parseInt(event.target.value, 10);
                                    const safeValue = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 20) : 1;
                                    onMultiModelRunsPerArmChange?.(safeValue);
                                }}
                                className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            />
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onSelectAllMultiModels}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            onClick={onClearAllMultiModels}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            Clear
                        </button>
                        <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                            {selectedMultiModelKeys.length} selected
                        </span>
                        </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white">
                        {multiModelOptions.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-slate-500">No model options available.</p>
                        ) : (
                            <div className="divide-y divide-slate-200">
                                {multiModelOptions.map((option) => {
                                    const selected = selectedMultiModelKeys.includes(option.key);
                                    return (
                                        <label key={option.key} className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${selected ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => onToggleMultiModel?.(option.key)}
                                                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{option.providerLabel}</span>
                                                <span className="block text-sm text-slate-800">{option.modelLabel}</span>
                                                <span className="block text-[11px] text-slate-500">{option.model}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
            ) : (
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
            )}

            <section className={`space-y-3 rounded-xl border border-slate-200 p-4 ${promptInputsDisabled ? 'bg-slate-100' : 'bg-white'}`}>
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Prompt Library</p>
                    {isMultiMode ? (
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Runs both: no prompt + custom prompt
                        </span>
                    ) : (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input
                                type="checkbox"
                                checked={config.useCustomPrompt}
                                onChange={(event) => setConfig((prev) => ({ ...prev, useCustomPrompt: event.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300"
                            />
                            Use custom user prompt
                        </label>
                    )}
                </div>
                <p className={`text-xs ${promptInputsDisabled ? 'text-slate-500' : 'text-teal-700'}`}>
                    {isMultiMode
                        ? 'This test always runs both arms: without custom prompt and with the selected custom prompt.'
                        : promptInputsDisabled
                        ? 'Custom user prompt is OFF. Prompt template content will not be sent in the run payload.'
                        : 'Custom user prompt is ON. The selected prompt content will be sent in the run payload.'}
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 block">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                            Saved Prompt
                            <InfoTip label="When custom prompt mode is enabled, this prompt is prepended before the question payload." />
                        </span>
                        <select
                            disabled={promptInputsDisabled}
                            className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${promptInputsDisabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white'}`}
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
                            disabled={promptInputsDisabled}
                            className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${promptInputsDisabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white'}`}
                            placeholder="e.g. IRAC strict answer prompt"
                            value={promptNameDraft}
                            onChange={(event) => setPromptNameDraft(event.target.value)}
                        />
                    </label>
                </div>

                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prompt Content</span>
                    <textarea
                        disabled={promptInputsDisabled}
                        className={`min-h-[110px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${promptInputsDisabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white'}`}
                        value={promptContentDraft}
                        onChange={(event) => setPromptContentDraft(event.target.value)}
                        placeholder="Write or edit the reusable user prompt template."
                    />
                </label>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onCreateNewPrompt}
                        disabled={promptInputsDisabled}
                        className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        New Prompt
                    </button>
                    <button
                        type="button"
                        onClick={onSavePrompt}
                        disabled={promptInputsDisabled}
                        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Save Prompt
                    </button>
                    <button
                        type="button"
                        onClick={onDeletePrompt}
                        disabled={promptInputsDisabled || !selectedPrompt || selectedPromptIsBuiltin}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Delete Selected
                    </button>
                    <button
                        type="button"
                        onClick={handleImportClick}
                        disabled={promptInputsDisabled}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Import JSON
                    </button>
                    <button
                        type="button"
                        onClick={onExportPrompts}
                        disabled={promptInputsDisabled || prompts.length === 0}
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
                {selectedPromptIsBuiltin && (
                    <p className="text-xs text-slate-600">This is a built-in prompt template and cannot be deleted.</p>
                )}
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
                {isRunning
                    ? (isMultiMode ? 'Running Multi-Model A/B Test...' : 'Running Single Probe...')
                    : (isMultiMode ? 'Run Multi-Model Single Question A/B' : 'Run Single Question Probe')}
            </button>

            {!isRunning && !canRun && runDisabledReason && <p className="text-xs text-rose-700">{runDisabledReason}</p>}

            {!isMultiMode && config.useCustomPrompt && !selectedPrompt && (
                <p className="text-xs text-amber-700">Custom prompt mode is enabled. Select or save a prompt template before running.</p>
            )}
            {isMultiMode && !selectedPrompt && (
                <p className="text-xs text-amber-700">Select or save a prompt template. The custom-prompt arm uses this template.</p>
            )}
        </div>
    );
}
