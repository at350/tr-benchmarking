'use client';

import { useMemo, useRef, useState } from 'react';

import type { JudgeRubricTemplate } from '@/lib/judge-rubric-library';
import { getModelOptions, type ModelProvider, type ReasoningEffort, REASONING_OPTIONS } from '@/lib/model-options';
import { isBuiltinPromptTemplateId, type PromptTemplate } from '@/lib/prompt-library';
import { InfoTip } from '@/components/ui/InfoTip';
import type { DatasetQuestion, EditableSingleQuestion, MultiModelSelectionOption } from './SingleQuestionProbePanel';

export type RubricJudgeProbeConfig = {
    runScope: 'single' | 'dataset';
    runsPerQuestion: number;
    strictnessMode: 'strict' | 'best_effort';
    selectedGenerationPromptId: string;
    selectedJudgeRubricIds: string[];
    judgeProvider: ModelProvider;
    judgeModel: string;
    judgeReasoningEffort: ReasoningEffort;
    datasetSampleStrategy: 'random' | 'stratified';
    datasetSampleSize: number;
    sampleSeed: number;
    statValidationEnabled: boolean;
    statAlpha: number;
    statPower: number;
    statMinEffectSizeDz: number;
    statMaxQuestions: number;
    statPermutations: number;
    statBootstrapSamples: number;
    generationRepairRetries: number;
};

type RubricJudgeProbePanelProps = {
    config: RubricJudgeProbeConfig;
    setConfig: React.Dispatch<React.SetStateAction<RubricJudgeProbeConfig>>;
    availableQuestions: DatasetQuestion[];
    selectedDatasetQuestionId: string;
    onSelectDatasetQuestionId: (id: string) => void;
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
    judgeRubrics: JudgeRubricTemplate[];
    selectedJudgeRubricTemplateId: string;
    onSelectJudgeRubricTemplateId: (id: string) => void;
    selectedJudgeRubricTemplate: JudgeRubricTemplate | null;
    judgeRubricNameDraft: string;
    setJudgeRubricNameDraft: (value: string) => void;
    judgeRubricContentDraft: string;
    setJudgeRubricContentDraft: (value: string) => void;
    judgeRubricStatus: string | null;
    onSaveJudgeRubric: () => void;
    onCreateNewJudgeRubric: () => void;
    onDeleteJudgeRubric: () => void;
    onExportJudgeRubrics: () => void;
    onImportJudgeRubrics: (raw: string) => void;
    multiModelOptions: MultiModelSelectionOption[];
    selectedMultiModelKeys: string[];
    onToggleMultiModel: (key: string) => void;
    onSelectAllMultiModels: () => void;
    onClearAllMultiModels: () => void;
    onRun: () => void;
    isRunning: boolean;
    canRun: boolean;
    runDisabledReason?: string;
};

export function RubricJudgeProbePanel({
    config,
    setConfig,
    availableQuestions,
    selectedDatasetQuestionId,
    onSelectDatasetQuestionId,
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
    judgeRubrics,
    selectedJudgeRubricTemplateId,
    onSelectJudgeRubricTemplateId,
    selectedJudgeRubricTemplate,
    judgeRubricNameDraft,
    setJudgeRubricNameDraft,
    judgeRubricContentDraft,
    setJudgeRubricContentDraft,
    judgeRubricStatus,
    onSaveJudgeRubric,
    onCreateNewJudgeRubric,
    onDeleteJudgeRubric,
    onExportJudgeRubrics,
    onImportJudgeRubrics,
    multiModelOptions,
    selectedMultiModelKeys,
    onToggleMultiModel,
    onSelectAllMultiModels,
    onClearAllMultiModels,
    onRun,
    isRunning,
    canRun,
    runDisabledReason,
}: RubricJudgeProbePanelProps) {
    const promptImportRef = useRef<HTMLInputElement | null>(null);
    const rubricImportRef = useRef<HTMLInputElement | null>(null);
    const [datasetQuestionQuery, setDatasetQuestionQuery] = useState('');
    const selectedPromptIsBuiltin = selectedPrompt ? isBuiltinPromptTemplateId(selectedPrompt.id) : false;

    const filteredQuestions = useMemo(() => {
        const query = datasetQuestionQuery.trim().toLowerCase();
        if (!query) {
            return availableQuestions.slice(0, 40);
        }
        return availableQuestions
            .filter((question) => {
                const haystack = [
                    question.id,
                    question.question,
                    question.subfield,
                    question.difficulty,
                    ...question.choices,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(query);
            })
            .slice(0, 40);
    }, [availableQuestions, datasetQuestionQuery]);

    const toggleJudgeRubricSelection = (rubricId: string) => {
        setConfig((previous) => {
            if (previous.selectedJudgeRubricIds.includes(rubricId)) {
                return {
                    ...previous,
                    selectedJudgeRubricIds: previous.selectedJudgeRubricIds.filter((id) => id !== rubricId),
                };
            }
            return {
                ...previous,
                selectedJudgeRubricIds: [...previous.selectedJudgeRubricIds, rubricId],
            };
        });
    };

    const updateChoice = (index: number, value: string) => {
        setEditableQuestion((prev) => {
            const nextChoices = [...prev.choices];
            nextChoices[index] = value;
            return { ...prev, choices: nextChoices };
        });
    };

    return (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
                <h3 className="text-lg font-bold text-slate-900">Rubric-First Multi-Model Judge</h3>
                <p className="mt-1 text-sm text-slate-600">
                    Run all selected models with one generation prompt, force JSON normalization, then grade outputs with multiple judge rubrics.
                </p>
            </div>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Question Source</p>
                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Run Scope</span>
                    <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={config.runScope}
                        onChange={(event) => setConfig((prev) => ({ ...prev, runScope: event.target.value as 'single' | 'dataset' }))}
                    >
                        <option value="single">Single question</option>
                        <option value="dataset">Dataset sample</option>
                    </select>
                </label>

                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Dataset Question Search</span>
                    <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={datasetQuestionQuery}
                        onChange={(event) => setDatasetQuestionQuery(event.target.value)}
                        placeholder="Search and load a question into the editor"
                    />
                </label>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-300 bg-white">
                    {filteredQuestions.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-500">No matching questions.</p>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {filteredQuestions.map((question) => (
                                <button
                                    key={question.id}
                                    type="button"
                                    onClick={() => onSelectDatasetQuestionId(question.id)}
                                    className={`w-full px-3 py-2 text-left ${selectedDatasetQuestionId === question.id ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                                >
                                    <p className="text-xs font-mono text-slate-600">{question.id}</p>
                                    <p className="line-clamp-2 text-sm text-slate-800">{question.question}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onLoadDatasetQuestion}
                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100"
                >
                    Load Into Editable Question
                </button>

                {config.runScope === 'dataset' && (
                    <div className="grid gap-3 md:grid-cols-3">
                        <label className="space-y-1">
                            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Sampling Strategy</span>
                            <select
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                value={config.datasetSampleStrategy}
                                onChange={(event) => setConfig((prev) => ({ ...prev, datasetSampleStrategy: event.target.value as 'random' | 'stratified' }))}
                            >
                                <option value="random">Random</option>
                                <option value="stratified">Stratified</option>
                            </select>
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Sample Size</span>
                            <input
                                type="number"
                                min={1}
                                max={500}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                value={config.datasetSampleSize}
                                onChange={(event) => setConfig((prev) => ({ ...prev, datasetSampleSize: Math.min(500, Math.max(1, parseInt(event.target.value || '1', 10))) }))}
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Sample Seed</span>
                            <input
                                type="number"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                value={config.sampleSeed}
                                onChange={(event) => setConfig((prev) => ({ ...prev, sampleSeed: parseInt(event.target.value || '42', 10) }))}
                            />
                        </label>
                    </div>
                )}
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Editable Question</p>
                <textarea
                    className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={editableQuestion.question}
                    onChange={(event) => setEditableQuestion((prev) => ({ ...prev, question: event.target.value }))}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    {editableQuestion.choices.map((choice, index) => {
                        const letter = String.fromCharCode(65 + index);
                        return (
                            <label key={letter} className="space-y-1">
                                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Choice {letter}</span>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                    value={choice}
                                    onChange={(event) => updateChoice(index, event.target.value)}
                                />
                            </label>
                        );
                    })}
                </div>
                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Correct Answer Letter</span>
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
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Model Selection</p>
                    <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                        {selectedMultiModelKeys.length} selected
                    </span>
                </div>
                <div className="flex gap-2">
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
                </div>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-300 bg-white">
                    <div className="divide-y divide-slate-200">
                        {multiModelOptions.map((option) => {
                            const selected = selectedMultiModelKeys.includes(option.key);
                            return (
                                <label key={option.key} className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${selected ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => onToggleMultiModel(option.key)}
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                    />
                                    <span className="min-w-0">
                                        <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{option.providerLabel}</span>
                                        <span className="block text-sm text-slate-800">{option.modelLabel}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Runs Per Question</span>
                        <input
                            type="number"
                            min={1}
                            max={20}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.runsPerQuestion}
                            onChange={(event) => setConfig((prev) => ({
                                ...prev,
                                runsPerQuestion: Math.min(20, Math.max(1, parseInt(event.target.value || '1', 10))),
                            }))}
                        />
                    </label>
                </div>
                <p className="text-xs text-slate-500">
                    Total calls scale as models x questions x runs per question.
                </p>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Generation Prompt Library</p>
                    <InfoTip label="All models in this run use the selected generation prompt." />
                </div>
                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Selected Generation Prompt</span>
                    <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={config.selectedGenerationPromptId}
                        onChange={(event) => setConfig((prev) => ({ ...prev, selectedGenerationPromptId: event.target.value }))}
                    >
                        <option value="">Select prompt...</option>
                        {prompts.map((prompt) => (
                            <option key={prompt.id} value={prompt.id}>{prompt.name}</option>
                        ))}
                    </select>
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prompt Name</span>
                        <input
                            type="text"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={promptNameDraft}
                            onChange={(event) => setPromptNameDraft(event.target.value)}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Strictness Mode</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.strictnessMode}
                            onChange={(event) => setConfig((prev) => ({ ...prev, strictnessMode: event.target.value as 'strict' | 'best_effort' }))}
                        >
                            <option value="strict">Strict JSON + retries</option>
                            <option value="best_effort">Best effort</option>
                        </select>
                    </label>
                </div>
                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prompt Content</span>
                    <textarea
                        className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={promptContentDraft}
                        onChange={(event) => setPromptContentDraft(event.target.value)}
                    />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 block">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Generation Retry Cap</span>
                        <input
                            type="number"
                            min={0}
                            max={5}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.generationRepairRetries}
                            onChange={(event) => setConfig((prev) => ({ ...prev, generationRepairRetries: Math.min(5, Math.max(0, parseInt(event.target.value || '0', 10))) }))}
                        />
                    </label>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onCreateNewPrompt} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100">New Prompt</button>
                    <button type="button" onClick={onSavePrompt} className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100">Save Prompt</button>
                    <button type="button" onClick={onDeletePrompt} disabled={!selectedPrompt || selectedPromptIsBuiltin} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">Delete Selected</button>
                    <button type="button" onClick={() => promptImportRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Import JSON</button>
                    <button type="button" onClick={onExportPrompts} disabled={prompts.length === 0} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">Export JSON</button>
                    <input
                        ref={promptImportRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) {
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                                onImportPrompts(typeof reader.result === 'string' ? reader.result : '');
                                if (promptImportRef.current) {
                                    promptImportRef.current.value = '';
                                }
                            };
                            reader.readAsText(file);
                        }}
                    />
                </div>
                {promptStatus && <p className="text-xs text-teal-700">{promptStatus}</p>}
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Judge Configuration</p>
                <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Judge Provider</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.judgeProvider}
                            onChange={(event) => {
                                const provider = event.target.value as ModelProvider;
                                const options = getModelOptions(provider);
                                setConfig((prev) => ({
                                    ...prev,
                                    judgeProvider: provider,
                                    judgeModel: options[0]?.value || prev.judgeModel,
                                }));
                            }}
                        >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Gemini</option>
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Judge Model</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.judgeModel}
                            onChange={(event) => setConfig((prev) => ({ ...prev, judgeModel: event.target.value }))}
                        >
                            {getModelOptions(config.judgeProvider).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Judge Reasoning</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.judgeReasoningEffort}
                            onChange={(event) => setConfig((prev) => ({ ...prev, judgeReasoningEffort: event.target.value as ReasoningEffort }))}
                        >
                            {REASONING_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <p className="text-xs text-slate-500">
                    If the selected judge model does not support reasoning controls, the backend automatically retries without reasoning.
                </p>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Judge Rubric Library</p>
                <p className="text-xs text-slate-500">Select one or more rubrics for grading; all selected rubrics run in the same benchmark pass.</p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-300 bg-white">
                    {judgeRubrics.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-500">No judge rubric templates available.</p>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {judgeRubrics.map((rubric) => {
                                const selected = config.selectedJudgeRubricIds.includes(rubric.id);
                                return (
                                    <label key={rubric.id} className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${selected ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleJudgeRubricSelection(rubric.id)}
                                            className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onSelectJudgeRubricTemplateId(rubric.id)}
                                            className="min-w-0 text-left"
                                        >
                                            <span className="block text-sm font-semibold text-slate-800">{rubric.name}</span>
                                            <span className="block text-[11px] text-slate-500">{rubric.id}</span>
                                        </button>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Rubric Template</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={selectedJudgeRubricTemplateId}
                            onChange={(event) => onSelectJudgeRubricTemplateId(event.target.value)}
                        >
                            <option value="">New rubric template</option>
                            {judgeRubrics.map((rubric) => (
                                <option key={rubric.id} value={rubric.id}>{rubric.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Rubric Name</span>
                        <input
                            type="text"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={judgeRubricNameDraft}
                            onChange={(event) => setJudgeRubricNameDraft(event.target.value)}
                        />
                    </label>
                </div>
                <label className="space-y-1 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Rubric Content</span>
                    <textarea
                        className="min-h-[120px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={judgeRubricContentDraft}
                        onChange={(event) => setJudgeRubricContentDraft(event.target.value)}
                    />
                </label>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onCreateNewJudgeRubric} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100">New Rubric</button>
                    <button type="button" onClick={onSaveJudgeRubric} className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100">Save Rubric</button>
                    <button type="button" onClick={onDeleteJudgeRubric} disabled={!selectedJudgeRubricTemplate} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">Delete Selected</button>
                    <button type="button" onClick={() => rubricImportRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Import JSON</button>
                    <button type="button" onClick={onExportJudgeRubrics} disabled={judgeRubrics.length === 0} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">Export JSON</button>
                    <input
                        ref={rubricImportRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) {
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                                onImportJudgeRubrics(typeof reader.result === 'string' ? reader.result : '');
                                if (rubricImportRef.current) {
                                    rubricImportRef.current.value = '';
                                }
                            };
                            reader.readAsText(file);
                        }}
                    />
                </div>
                {judgeRubricStatus && <p className="text-xs text-teal-700">{judgeRubricStatus}</p>}
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Statistical Validation</p>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                            type="checkbox"
                            checked={config.statValidationEnabled}
                            onChange={(event) => setConfig((prev) => ({ ...prev, statValidationEnabled: event.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300"
                        />
                        Enable
                    </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Alpha</span>
                        <input
                            type="number"
                            step="0.01"
                            min={0.001}
                            max={0.2}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.statAlpha}
                            onChange={(event) => setConfig((prev) => ({ ...prev, statAlpha: Number(event.target.value) || 0.05 }))}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Power</span>
                        <input
                            type="number"
                            step="0.01"
                            min={0.5}
                            max={0.99}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.statPower}
                            onChange={(event) => setConfig((prev) => ({ ...prev, statPower: Number(event.target.value) || 0.8 }))}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Min Effect (dz)</span>
                        <input
                            type="number"
                            step="0.05"
                            min={0.1}
                            max={2}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.statMinEffectSizeDz}
                            onChange={(event) => setConfig((prev) => ({ ...prev, statMinEffectSizeDz: Number(event.target.value) || 0.35 }))}
                        />
                    </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Max Questions</span>
                        <input
                            type="number"
                            min={5}
                            max={500}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.statMaxQuestions}
                            onChange={(event) => setConfig((prev) => ({ ...prev, statMaxQuestions: Math.min(500, Math.max(5, parseInt(event.target.value || '120', 10))) }))}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Permutations</span>
                        <input
                            type="number"
                            min={100}
                            max={50000}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.statPermutations}
                            onChange={(event) => setConfig((prev) => ({ ...prev, statPermutations: Math.min(50000, Math.max(100, parseInt(event.target.value || '10000', 10))) }))}
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Bootstrap Samples</span>
                        <input
                            type="number"
                            min={200}
                            max={50000}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={config.statBootstrapSamples}
                            onChange={(event) => setConfig((prev) => ({ ...prev, statBootstrapSamples: Math.min(50000, Math.max(200, parseInt(event.target.value || '5000', 10))) }))}
                        />
                    </label>
                </div>
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
                {isRunning ? 'Running Rubric-First Benchmark...' : 'Run Rubric-First Multi-Model Judge Benchmark'}
            </button>
            {!isRunning && !canRun && runDisabledReason && <p className="text-xs text-rose-700">{runDisabledReason}</p>}
        </div>
    );
}
