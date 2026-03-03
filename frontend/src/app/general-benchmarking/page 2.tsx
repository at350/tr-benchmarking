/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
'use client';

import { Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BenchmarkSidebar, BenchmarkMode } from '@/components/benchmarking/BenchmarkSidebar';
import { SavedRunComparisonPanel } from '@/components/benchmarking/SavedRunComparisonPanel';
import {
    DatasetQuestion,
    EditableSingleQuestion,
    MultiModelSelectionOption,
    SingleProbeConfig,
    SingleQuestionProbePanel
} from '@/components/benchmarking/SingleQuestionProbePanel';
import { ConfigPanel as ForcedConfigPanel, ExperimentConfig as ForcedExperimentConfig } from '@/components/ConfigPanel';
import { ConfigPanel as MainConfigPanel, ExperimentConfig as MainExperimentConfig } from '@/components/ConfigPanelMain';
import { ResultsDashboard as ForcedResultsDashboard } from '@/components/ResultsDashboard';
import { ResultsDashboard as MainResultsDashboard } from '@/components/ResultsDashboardMain';
import { AppShell } from '@/components/ui/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoTip } from '@/components/ui/InfoTip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getDefaultModelForProvider, MODEL_OPTIONS_BY_PROVIDER, PROVIDER_LABELS } from '@/lib/model-options';
import {
    createPromptTemplate,
    isBuiltinPromptTemplateId,
    mergePromptLibraries,
    parsePromptLibraryImport,
    PromptTemplate,
    promptLibraryToJson,
    readPromptLibraryFromStorage,
    writePromptLibraryToStorage,
} from '@/lib/prompt-library';
import { SavedBenchmarkRun } from '@/lib/run-comparison';

type SuiteMode = 'main' | 'forced_tests';

type DatasetRow = {
    id: string;
    question?: string;
    choices?: string[];
    answer_letter?: string;
    subfield?: string;
    discipline?: string;
    difficulty?: string;
    topic?: string;
    field?: string;
};

type SavedSingleBenchmark = {
    id: string;
    name: string;
    description?: string;
    question: EditableSingleQuestion;
};

type SelectionPreview = {
    mode: 'auto' | 'manual';
    filteredCount: number;
    selectedCount: number;
    selectedIds: string[];
    missingIds: string[];
    bucketCounts: Array<{ label: string; count: number }>;
};

type HistoryConfig = MainExperimentConfig | ForcedExperimentConfig;

type RunHistoryEntry = {
    id: string;
    createdAt: string;
    suiteMode: SuiteMode;
    config: HistoryConfig;
    results: Record<string, unknown>[];
    summary: Record<string, unknown> | null;
};

const RUN_HISTORY_STORAGE_KEY = 'benchmarkdemo.runHistory.v1';
const SAVED_RUN_STORAGE_KEY = 'general-benchmarking.saved-runs.v1';
const MAX_RUN_HISTORY_ENTRIES = 20;
const DEFAULT_MULTI_MODEL_KEYS = [
    'openai::gpt-5.2-chat-latest',
    'anthropic::claude-sonnet-4-5',
    'gemini::gemini-2.5-pro',
];
const SINGLE_QUESTION_SAVED_BENCHMARKS: SavedSingleBenchmark[] = [
    {
        id: 'lsh-ucc-firm-offer',
        name: 'LSH Custom: UCC Firm Offer',
        description: 'Copied from lsh/run_robust_benchmark_v2.py TEST_QUESTION. Single fixed legal question used in the LSH robust benchmark.',
        question: {
            id: 'lsh_ucc_firm_offer',
            question: 'Merchant A, a manufacturer of widgets, sent a signed letter to Buyer B on January 1st stating: "We offer to sell you 1,000 widgets at $10 each. This offer will remain open until March 31st." Buyer B did not pay anything to keep the offer open. On February 1st, Merchant A called Buyer B and said, "The price of widgets has gone up. I am revoking my offer of January 1st." On February 5th, Buyer B sent a letter accepting the January 1st offer.\nIs there an enforceable contract between Merchant A and Buyer B?',
            choices: [
                'Yes, there is an enforceable contract.',
                'No, there is not an enforceable contract.',
            ],
            answerLetter: 'A',
            subfield: 'Contracts',
            difficulty: 'Unknown',
        },
    },
];

export default function GeneralBenchmarkingPage() {
    const [benchmarkMode, setBenchmarkMode] = useState<BenchmarkMode>('forced_tests');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const [subjects, setSubjects] = useState<string[]>([]);
    const [datasetRows, setDatasetRows] = useState<DatasetRow[]>([]);
    const [singleDatasetRows, setSingleDatasetRows] = useState<DatasetQuestion[]>([]);

    const [mainConfig, setMainConfig] = useState<MainExperimentConfig>({
        dataset: 'supergpqa',
        provider: 'openai',
        model: 'gpt-4o-mini',
        judgeProvider: 'openai',
        judgeModel: 'gpt-4o-mini',
        judgeReasoningEffort: 'low',
        promptTemplate: 'baseline',
        temperature: 0.2,
        reasoningEffort: 'medium',
        perturbations: {
            adversarialText: false,
            labelNoise: 0,
        },
        judgePrompt: '',
        limit: 5,
        subject: 'All',
        difficulty: 'All',
        questionSelectionMode: 'auto',
        autoSelectionOrder: 'random',
        sampleSeed: 42,
        manualQuestionIds: '',
    });

    const [forcedConfig, setForcedConfig] = useState<ForcedExperimentConfig>({
        evaluationMode: 'controlled_eval',
        model: 'gpt-4o-mini',
        compareModel: '',
        promptTemplate: 'baseline',
        temperature: 0,
        benchmarkProfile: 'controlled',
        samplingStrategy: 'ordered',
        controlled: {
            deterministicSplit: true,
            stochasticTemperature: 0.7,
        },
        perturbations: {
            adversarialText: false,
            labelNoise: 0,
        },
        limit: 5,
        subject: 'All',
        difficulty: 'All',
        questionSelectionMode: 'auto',
        autoSelectionOrder: 'ordered',
        sampleSeed: 42,
        manualQuestionIds: '',
    });

    const [singleProbeConfig, setSingleProbeConfig] = useState<SingleProbeConfig>({
        provider: 'openai',
        model: getDefaultModelForProvider('openai'),
        reasoningEffort: 'medium',
        temperature: 0.2,
        subjectFilter: 'All',
        difficultyFilter: 'All',
        selectedDatasetQuestionId: '',
        useCustomPrompt: false,
        selectedPromptId: '',
    });
    const [selectedMultiModelKeys, setSelectedMultiModelKeys] = useState<string[]>(DEFAULT_MULTI_MODEL_KEYS);
    const [selectedSavedBenchmarkId, setSelectedSavedBenchmarkId] = useState('');
    const [multiModelRunsPerArm, setMultiModelRunsPerArm] = useState(1);

    const [editableQuestion, setEditableQuestion] = useState<EditableSingleQuestion>({
        id: 'custom-question',
        question: '',
        choices: ['', '', '', ''],
        answerLetter: 'A',
    });

    const [isRunning, setIsRunning] = useState(false);
    const [runStatusText, setRunStatusText] = useState('Preparing experiment...');
    const [results, setResults] = useState<Record<string, unknown>[]>([]);
    const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
    const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const runAbortRef = useRef<AbortController | null>(null);

    const [savedRuns, setSavedRuns] = useState<SavedBenchmarkRun[]>([]);
    const [selectedSavedRunIds, setSelectedSavedRunIds] = useState<string[]>([]);
    const [comparisonRunIds, setComparisonRunIds] = useState<string[]>([]);
    const [savedRunStatus, setSavedRunStatus] = useState<string | null>(null);

    const [promptLibrary, setPromptLibrary] = useState<PromptTemplate[]>([]);
    const [promptNameDraft, setPromptNameDraft] = useState('');
    const [promptContentDraft, setPromptContentDraft] = useState('');
    const [promptStatus, setPromptStatus] = useState<string | null>(null);

    const selectedPrompt = useMemo(
        () => promptLibrary.find((prompt) => prompt.id === singleProbeConfig.selectedPromptId) || null,
        [promptLibrary, singleProbeConfig.selectedPromptId],
    );
    const multiModelOptions = useMemo<MultiModelSelectionOption[]>(() => {
        return (Object.keys(MODEL_OPTIONS_BY_PROVIDER) as Array<keyof typeof MODEL_OPTIONS_BY_PROVIDER>)
            .flatMap((provider) => MODEL_OPTIONS_BY_PROVIDER[provider].map((option) => ({
                key: `${provider}::${option.value}`,
                provider,
                providerLabel: PROVIDER_LABELS[provider],
                model: option.value,
                modelLabel: option.label,
            })));
    }, []);

    useEffect(() => {
        setRunHistory(readRunHistoryFromStorage());
        setSavedRuns(readSavedRunsFromStorage());
        setPromptLibrary(readPromptLibraryFromStorage());
    }, []);

    useEffect(() => {
        writePromptLibraryToStorage(promptLibrary);
    }, [promptLibrary]);

    useEffect(() => {
        writeSavedRunsToStorage(savedRuns);
    }, [savedRuns]);

    useEffect(() => {
        if (!selectedPrompt) {
            return;
        }
        setPromptNameDraft(selectedPrompt.name);
        setPromptContentDraft(selectedPrompt.content);
    }, [selectedPrompt]);

    useEffect(() => {
        const validKeys = new Set(multiModelOptions.map((option) => option.key));
        setSelectedMultiModelKeys((previous) => previous.filter((key) => validKeys.has(key)));
    }, [multiModelOptions]);

    useEffect(() => {
        async function loadSingleDataset() {
            try {
                const res = await fetch('/api/dataset?dataset=supergpqa');
                const json = (await res.json()) as { data?: DatasetQuestion[] };
                if (!Array.isArray(json.data)) {
                    setSingleDatasetRows([]);
                    return;
                }
                setSingleDatasetRows(json.data);
            } catch (error) {
                console.error('Failed to load single-question dataset', error);
                setSingleDatasetRows([]);
            }
        }

        loadSingleDataset();
    }, []);

    useEffect(() => {
        async function loadMainOrForcedDataset() {
            if (benchmarkMode !== 'main' && benchmarkMode !== 'forced_tests') {
                return;
            }

            try {
                const endpoint = benchmarkMode === 'main'
                    ? `/api/dataset-main?dataset=${mainConfig.dataset}`
                    : '/api/dataset';
                const res = await fetch(endpoint);
                const json = (await res.json()) as { data?: DatasetRow[] };

                if (!Array.isArray(json.data)) {
                    setSubjects([]);
                    setDatasetRows([]);
                    return;
                }

                setDatasetRows(json.data);

                const uniqueSubjects = benchmarkMode === 'main' && mainConfig.dataset === 'prbench'
                    ? Array.from(new Set(json.data.map((d) => d.topic || d.field).filter((value): value is string => Boolean(value)))).sort()
                    : Array.from(new Set(json.data.map((d) => d.subfield || d.discipline).filter((value): value is string => Boolean(value)))).sort();
                setSubjects(uniqueSubjects);
            } catch (error) {
                console.error('Failed to load dataset', error);
                setSubjects([]);
                setDatasetRows([]);
            }
        }

        loadMainOrForcedDataset();
    }, [benchmarkMode, mainConfig.dataset]);

    useEffect(() => {
        if (!savedRunStatus) {
            return;
        }

        const timer = window.setTimeout(() => {
            setSavedRunStatus(null);
        }, 3500);

        return () => window.clearTimeout(timer);
    }, [savedRunStatus]);

    useEffect(() => {
        if (!promptStatus) {
            return;
        }

        const timer = window.setTimeout(() => {
            setPromptStatus(null);
        }, 3500);

        return () => window.clearTimeout(timer);
    }, [promptStatus]);

    const currentSelectionPreview = useMemo<SelectionPreview>(() => {
        if (benchmarkMode === 'main') {
            return buildMainSelectionPreview(datasetRows, mainConfig);
        }
        if (benchmarkMode === 'forced_tests') {
            return buildForcedSelectionPreview(datasetRows, forcedConfig);
        }
        return {
            mode: 'auto',
            filteredCount: 0,
            selectedCount: 0,
            selectedIds: [],
            missingIds: [],
            bucketCounts: [],
        };
    }, [benchmarkMode, datasetRows, mainConfig, forcedConfig]);

    const canRunCurrentSelection = currentSelectionPreview.selectedCount > 0 && currentSelectionPreview.missingIds.length === 0;
    const runDisabledReason = currentSelectionPreview.missingIds.length > 0
        ? `Unknown IDs: ${currentSelectionPreview.missingIds.slice(0, 3).join(', ')}${currentSelectionPreview.missingIds.length > 3 ? '...' : ''}`
        : currentSelectionPreview.selectedCount === 0
            ? 'No questions/items selected for this run.'
            : undefined;

    const singleRunValidation = useMemo(() => {
        if (!editableQuestion.question.trim()) {
            return { canRun: false, reason: 'Question text is required.' };
        }

        const hasBlankChoice = editableQuestion.choices.some((choice) => !choice.trim());
        if (hasBlankChoice) {
            return { canRun: false, reason: 'All answer choices must be filled in.' };
        }

        const answerIndex = editableQuestion.answerLetter.charCodeAt(0) - 65;
        if (answerIndex < 0 || answerIndex >= editableQuestion.choices.length) {
            return { canRun: false, reason: 'Select a valid correct answer letter.' };
        }

        if (singleProbeConfig.useCustomPrompt && !selectedPrompt) {
            return { canRun: false, reason: 'Enable a saved prompt template or disable custom prompt mode.' };
        }

        return { canRun: true, reason: undefined as string | undefined };
    }, [editableQuestion, selectedPrompt, singleProbeConfig.useCustomPrompt]);
    const multiModelRunValidation = useMemo(() => {
        if (!editableQuestion.question.trim()) {
            return { canRun: false, reason: 'Question text is required.' };
        }
        const hasBlankChoice = editableQuestion.choices.some((choice) => !choice.trim());
        if (hasBlankChoice) {
            return { canRun: false, reason: 'All answer choices must be filled in.' };
        }
        if (selectedMultiModelKeys.length === 0) {
            return { canRun: false, reason: 'Select at least one model.' };
        }
        if (!Number.isInteger(multiModelRunsPerArm) || multiModelRunsPerArm < 1 || multiModelRunsPerArm > 20) {
            return { canRun: false, reason: 'Runs per arm must be between 1 and 20.' };
        }
        if (!selectedPrompt) {
            return { canRun: false, reason: 'Select a saved prompt for the custom-prompt arm.' };
        }
        return { canRun: true, reason: undefined as string | undefined };
    }, [editableQuestion, multiModelRunsPerArm, selectedMultiModelKeys, selectedPrompt]);

    const mainDashboardResults = results as Parameters<typeof MainResultsDashboard>[0]['results'];
    const mainDashboardSummary = summary as Parameters<typeof MainResultsDashboard>[0]['summary'];
    const forcedDashboardResults = results as Parameters<typeof ForcedResultsDashboard>[0]['results'];
    const forcedDashboardSummary = summary as Parameters<typeof ForcedResultsDashboard>[0]['summary'];

    const addRunToHistory = (entry: Omit<RunHistoryEntry, 'id' | 'createdAt'>) => {
        const nextEntry: RunHistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            createdAt: new Date().toISOString(),
            ...entry,
        };

        setRunHistory((prev) => {
            const nextHistory = [nextEntry, ...prev].slice(0, MAX_RUN_HISTORY_ENTRIES);
            writeRunHistoryToStorage(nextHistory);
            return nextHistory;
        });
        setActiveRunId(nextEntry.id);
    };

    const clearRunHistory = () => {
        setRunHistory([]);
        setActiveRunId(null);
        clearRunHistoryInStorage();
    };

    const loadRunFromHistory = (entry: RunHistoryEntry) => {
        if (isRunning) {
            return;
        }

        setBenchmarkMode(entry.suiteMode);
        setResults(entry.results);
        setSummary(entry.summary);
        setRunStatusText('Preparing experiment...');
        setActiveRunId(entry.id);

        if (isMainConfig(entry.config)) {
            setMainConfig({
                ...entry.config,
                perturbations: { ...entry.config.perturbations },
                questionSelectionMode: entry.config.questionSelectionMode || 'auto',
                autoSelectionOrder: entry.config.autoSelectionOrder || 'random',
                sampleSeed: typeof entry.config.sampleSeed === 'number' ? entry.config.sampleSeed : 42,
                manualQuestionIds: entry.config.manualQuestionIds || '',
            });
        } else if (isForcedConfig(entry.config)) {
            setForcedConfig({
                ...entry.config,
                controlled: { ...entry.config.controlled },
                perturbations: { ...entry.config.perturbations },
                questionSelectionMode: entry.config.questionSelectionMode || 'auto',
                autoSelectionOrder: entry.config.autoSelectionOrder || 'ordered',
                sampleSeed: typeof entry.config.sampleSeed === 'number' ? entry.config.sampleSeed : 42,
                manualQuestionIds: entry.config.manualQuestionIds || '',
            });
        }
    };

    const runMainExperiment = async (signal: AbortSignal, configSnapshot: MainExperimentConfig) => {
        setRunStatusText('Loading dataset...');
        const dataRes = await fetch(`/api/dataset-main?dataset=${configSnapshot.dataset}`, { signal });
        const dataJson = (await dataRes.json()) as { data?: DatasetRow[] };
        const selection = resolveMainSelection(dataJson.data || [], configSnapshot);
        const sample = selection.selected;

        if (sample.length === 0) {
            throw new Error('No questions/items selected for this run.');
        }
        if (selection.missingIds.length > 0) {
            throw new Error(`Unknown manual IDs: ${selection.missingIds.join(', ')}`);
        }

        setRunStatusText(`Running ${sample.length} ${configSnapshot.dataset === 'prbench' ? 'items' : 'questions'}...`);
        const res = await fetch('/api/experiment-main', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                questions: sample,
                ...configSnapshot,
            }),
        });

        const json = (await res.json()) as { results?: Record<string, unknown>[]; summary?: Record<string, unknown> };
        if (json.results && json.summary) {
            setResults(json.results);
            setSummary(json.summary);
            addRunToHistory({
                suiteMode: 'main',
                config: configSnapshot,
                results: json.results,
                summary: json.summary,
            });
        }
    };

    const runForcedExperiment = async (signal: AbortSignal, configSnapshot: ForcedExperimentConfig) => {
        setRunStatusText('Loading dataset...');
        const dataRes = await fetch('/api/dataset', { signal });
        const dataJson = (await dataRes.json()) as { data?: DatasetRow[] };
        const selection = resolveForcedSelection(dataJson.data || [], configSnapshot);
        const sample = selection.selected;

        if (sample.length === 0) {
            throw new Error('No questions selected for this run.');
        }
        if (selection.missingIds.length > 0) {
            throw new Error(`Unknown manual IDs: ${selection.missingIds.join(', ')}`);
        }

        const models = configSnapshot.evaluationMode === 'controlled_eval'
            ? Array.from(new Set([configSnapshot.model, configSnapshot.compareModel].filter((model): model is string => Boolean(model))))
            : [configSnapshot.model];
        setRunStatusText(`Running ${sample.length} questions across ${models.length} model${models.length === 1 ? '' : 's'}...`);

        const res = await fetch('/api/experiment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                questions: sample,
                models,
                ...configSnapshot,
            }),
        });

        const json = (await res.json()) as { results?: Record<string, unknown>[]; summary?: Record<string, unknown> };
        if (json.results && json.summary) {
            setResults(json.results);
            setSummary(json.summary);
            addRunToHistory({
                suiteMode: 'forced_tests',
                config: configSnapshot,
                results: json.results,
                summary: json.summary,
            });
        }
    };

    const requestSingleProbe = async (
        signal: AbortSignal,
        options: {
            provider: 'openai' | 'anthropic' | 'gemini';
            model: string;
            useCustomPrompt: boolean;
            customPrompt: string;
        }
    ) => {
        const response = await fetch('/api/benchmark-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                provider: options.provider,
                model: options.model,
                temperature: singleProbeConfig.temperature,
                reasoningEffort: singleProbeConfig.reasoningEffort,
                useCustomPrompt: options.useCustomPrompt,
                customPrompt: options.useCustomPrompt ? options.customPrompt : '',
                question: {
                    id: editableQuestion.id,
                    question: editableQuestion.question,
                    choices: editableQuestion.choices,
                    answerLetter: editableQuestion.answerLetter,
                    subfield: editableQuestion.subfield,
                    difficulty: editableQuestion.difficulty,
                },
            }),
        });

        const json = (await response.json()) as {
            results?: Record<string, unknown>[];
            summary?: Record<string, unknown>;
            error?: string;
        };

        if (!response.ok) {
            throw new Error(json.error || `Single probe failed (${response.status}).`);
        }

        return json;
    };

    const runSingleProbe = async (signal: AbortSignal) => {
        setRunStatusText('Running single question probe...');
        const json = await requestSingleProbe(signal, {
            provider: singleProbeConfig.provider,
            model: singleProbeConfig.model,
            useCustomPrompt: singleProbeConfig.useCustomPrompt,
            customPrompt: selectedPrompt?.content || '',
        });

        if (json.results && json.summary) {
            setResults(json.results);
            setSummary(json.summary);
        }
    };
    const runMultiModelSingleProbe = async (signal: AbortSignal) => {
        if (!selectedPrompt?.content) {
            throw new Error('Select a saved custom prompt before running multi-model A/B.');
        }

        const selectedOptions = multiModelOptions.filter((option) => selectedMultiModelKeys.includes(option.key));
        const repeatCount = Math.min(Math.max(multiModelRunsPerArm, 1), 20);
        const aggregateResults: Record<string, unknown>[] = [];
        const armStats = {
            withPrompt: { correct: 0, total: 0 },
            withoutPrompt: { correct: 0, total: 0 },
        };
        const perModelStats = new Map(
            selectedOptions.map((option) => [
                option.key,
                {
                    provider: option.provider,
                    modelLabel: option.modelLabel,
                    model: option.model,
                    withPrompt: { correct: 0, total: 0 },
                    withoutPrompt: { correct: 0, total: 0 },
                },
            ]),
        );

        let completed = 0;
        const totalRuns = selectedOptions.length * 2 * repeatCount;

        for (const option of selectedOptions) {
            for (const promptMode of ['without', 'with'] as const) {
                for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex += 1) {
                    if (signal.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }

                    const useCustomPrompt = promptMode === 'with';
                    setRunStatusText(
                        `Running ${option.modelLabel} (${useCustomPrompt ? 'with prompt' : 'without prompt'}) repeat ${repeatIndex}/${repeatCount} (${completed + 1}/${totalRuns})...`
                    );

                    const json = await requestSingleProbe(signal, {
                        provider: option.provider,
                        model: option.model,
                        useCustomPrompt,
                        customPrompt: selectedPrompt.content,
                    });
                    const responseResult = Array.isArray(json.results) && json.results.length > 0
                        ? json.results[0]
                        : null;
                    const responseSummary = json.summary || {};
                    const isCorrect = responseResult && typeof responseResult.isCorrect === 'boolean'
                        ? responseResult.isCorrect
                        : false;

                    aggregateResults.push({
                        modelProvider: option.provider,
                        modelLabel: option.modelLabel,
                        model: option.model,
                        promptMode: useCustomPrompt ? 'with_custom_prompt' : 'without_custom_prompt',
                        promptArmLabel: useCustomPrompt ? 'With Prompt' : 'Without Prompt',
                        repeatIndex,
                        runsPerArm: repeatCount,
                        questionId: responseResult && typeof responseResult.questionId === 'string' ? responseResult.questionId : editableQuestion.id,
                        groundTruth: responseResult && typeof responseResult.groundTruth === 'string' ? responseResult.groundTruth : editableQuestion.answerLetter,
                        parsedChoice: responseResult && typeof responseResult.parsedChoice === 'string' ? responseResult.parsedChoice : 'Unknown',
                        isCorrect,
                        modelOutput: responseResult && typeof responseResult.modelOutput === 'string' ? responseResult.modelOutput : '',
                        accuracy: typeof responseSummary.accuracy === 'number' ? responseSummary.accuracy : (isCorrect ? 1 : 0),
                    });

                    const currentModelStats = perModelStats.get(option.key);
                    if (currentModelStats) {
                        if (useCustomPrompt) {
                            currentModelStats.withPrompt.total += 1;
                            if (isCorrect) {
                                currentModelStats.withPrompt.correct += 1;
                            }
                        } else {
                            currentModelStats.withoutPrompt.total += 1;
                            if (isCorrect) {
                                currentModelStats.withoutPrompt.correct += 1;
                            }
                        }
                    }

                    if (useCustomPrompt) {
                        armStats.withPrompt.total += 1;
                        if (isCorrect) {
                            armStats.withPrompt.correct += 1;
                        }
                    } else {
                        armStats.withoutPrompt.total += 1;
                        if (isCorrect) {
                            armStats.withoutPrompt.correct += 1;
                        }
                    }

                    completed += 1;
                }
            }
        }

        const totalCorrect = armStats.withPrompt.correct + armStats.withoutPrompt.correct;
        const total = armStats.withPrompt.total + armStats.withoutPrompt.total;
        const perModel = selectedOptions.map((option) => {
            const modelStats = perModelStats.get(option.key);
            const withoutPrompt = modelStats?.withoutPrompt || { correct: 0, total: 0 };
            const withPrompt = modelStats?.withPrompt || { correct: 0, total: 0 };
            const withoutPromptAccuracy = withoutPrompt.total > 0 ? withoutPrompt.correct / withoutPrompt.total : 0;
            const withPromptAccuracy = withPrompt.total > 0 ? withPrompt.correct / withPrompt.total : 0;
            return {
                provider: option.provider,
                modelLabel: option.modelLabel,
                model: option.model,
                withoutPrompt: {
                    correct: withoutPrompt.correct,
                    total: withoutPrompt.total,
                    accuracy: withoutPromptAccuracy,
                },
                withPrompt: {
                    correct: withPrompt.correct,
                    total: withPrompt.total,
                    accuracy: withPromptAccuracy,
                },
                delta: withPromptAccuracy - withoutPromptAccuracy,
            };
        });

        setResults(aggregateResults);
        setSummary({
            dataset: 'single_probe_multi_model',
            runsPerArm: repeatCount,
            totalRuns: total,
            modelCount: selectedOptions.length,
            totalCorrect,
            accuracyOverall: total > 0 ? totalCorrect / total : 0,
            perModel,
            withPrompt: {
                total: armStats.withPrompt.total,
                correct: armStats.withPrompt.correct,
                accuracy: armStats.withPrompt.total > 0 ? armStats.withPrompt.correct / armStats.withPrompt.total : 0,
            },
            withoutPrompt: {
                total: armStats.withoutPrompt.total,
                correct: armStats.withoutPrompt.correct,
                accuracy: armStats.withoutPrompt.total > 0 ? armStats.withoutPrompt.correct / armStats.withoutPrompt.total : 0,
            },
        });
    };

    const runExperiment = async () => {
        if (isRunning) {
            return;
        }

        if (benchmarkMode === 'single_probe') {
            if (!singleRunValidation.canRun) {
                alert(singleRunValidation.reason || 'Cannot run single probe with current inputs.');
                return;
            }
        } else if (benchmarkMode === 'single_probe_multi_model') {
            if (!multiModelRunValidation.canRun) {
                alert(multiModelRunValidation.reason || 'Cannot run multi-model single-question test with current inputs.');
                return;
            }
        } else if (!canRunCurrentSelection) {
            alert(runDisabledReason || 'Cannot run with the current selection.');
            return;
        }

        const mainConfigSnapshot: MainExperimentConfig = {
            ...mainConfig,
            perturbations: { ...mainConfig.perturbations },
        };
        const forcedConfigSnapshot: ForcedExperimentConfig = {
            ...forcedConfig,
            controlled: { ...forcedConfig.controlled },
            perturbations: { ...forcedConfig.perturbations },
        };

        const abortController = new AbortController();
        runAbortRef.current = abortController;
        setIsRunning(true);
        setResults([]);
        setSummary(null);
        setActiveRunId(null);

        try {
            if (benchmarkMode === 'main') {
                await runMainExperiment(abortController.signal, mainConfigSnapshot);
            } else if (benchmarkMode === 'forced_tests') {
                await runForcedExperiment(abortController.signal, forcedConfigSnapshot);
            } else if (benchmarkMode === 'single_probe_multi_model') {
                await runMultiModelSingleProbe(abortController.signal);
            } else {
                await runSingleProbe(abortController.signal);
            }
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }
            console.error(error);
            alert('Benchmark run failed. Check console for details.');
        } finally {
            runAbortRef.current = null;
            setIsRunning(false);
            setRunStatusText('Preparing experiment...');
        }
    };

    const cancelExperiment = () => {
        if (!runAbortRef.current) {
            return;
        }
        setRunStatusText('Cancelling experiment...');
        runAbortRef.current.abort();
    };

    const handleBenchmarkChange = (nextMode: BenchmarkMode) => {
        setBenchmarkMode(nextMode);
        setResults([]);
        setSummary(null);
        setActiveRunId(null);

        if (nextMode === 'forced_tests') {
            setForcedConfig((prev) => ({
                ...prev,
                evaluationMode: 'controlled_eval',
                benchmarkProfile: 'controlled',
                samplingStrategy: 'ordered',
                promptTemplate: 'baseline',
                temperature: 0,
                perturbations: {
                    adversarialText: false,
                    labelNoise: 0,
                },
                questionSelectionMode: 'auto',
                autoSelectionOrder: 'ordered',
                sampleSeed: prev.sampleSeed,
                manualQuestionIds: '',
            }));
        }
    };
    const toggleMultiModelSelection = (modelKey: string) => {
        setSelectedMultiModelKeys((previous) => {
            if (previous.includes(modelKey)) {
                return previous.filter((key) => key !== modelKey);
            }
            return [...previous, modelKey];
        });
    };
    const selectAllMultiModels = () => {
        setSelectedMultiModelKeys(multiModelOptions.map((option) => option.key));
    };
    const clearAllMultiModels = () => {
        setSelectedMultiModelKeys([]);
    };
    const loadSavedBenchmarkIntoEditor = () => {
        if (!selectedSavedBenchmarkId) {
            return;
        }

        const selected = SINGLE_QUESTION_SAVED_BENCHMARKS.find((benchmark) => benchmark.id === selectedSavedBenchmarkId);
        if (!selected) {
            setPromptStatus('Selected saved benchmark was not found.');
            return;
        }

        const normalizedChoices = selected.question.choices
            .map((choice) => choice.trim())
            .filter((choice) => choice.length > 0)
            .slice(0, 10);
        const validLetters = getChoiceLetters(normalizedChoices.length);
        const incomingAnswerLetter = selected.question.answerLetter.trim().toUpperCase();
        const answerLetter = validLetters.includes(incomingAnswerLetter)
            ? incomingAnswerLetter
            : (validLetters[0] || 'A');

        setEditableQuestion({
            id: selected.question.id,
            question: selected.question.question,
            choices: normalizedChoices.length > 0 ? normalizedChoices : ['', ''],
            answerLetter,
            subfield: selected.question.subfield,
            difficulty: selected.question.difficulty,
        });

        setPromptStatus(`Loaded saved benchmark "${selected.name}" into editor.`);
    };

    const loadDatasetQuestionIntoEditor = () => {
        if (!singleProbeConfig.selectedDatasetQuestionId) {
            return;
        }

        const selected = singleDatasetRows.find((row) => row.id === singleProbeConfig.selectedDatasetQuestionId);
        if (!selected) {
            setPromptStatus('Selected dataset question was not found.');
            return;
        }

        const normalizedChoices = selected.choices
            .map((choice) => choice.trim())
            .filter((choice) => choice.length > 0)
            .slice(0, 10);
        const validLetters = getChoiceLetters(normalizedChoices.length);

        const incomingAnswerLetter = typeof selected.answer_letter === 'string' && selected.answer_letter.trim().length > 0
            ? selected.answer_letter.trim().toUpperCase()
            : '';
        const answerLetter = validLetters.includes(incomingAnswerLetter)
            ? incomingAnswerLetter
            : (validLetters[0] || 'A');

        setEditableQuestion({
            id: selected.id,
            question: selected.question,
            choices: normalizedChoices.length > 0 ? normalizedChoices : ['', ''],
            answerLetter,
            subfield: selected.subfield,
            difficulty: selected.difficulty,
        });

        setPromptStatus(`Loaded dataset question ${selected.id.slice(0, 12)}... into editor.`);
    };

    const savePromptTemplate = () => {
        const content = promptContentDraft.trim();
        if (!content) {
            setPromptStatus('Prompt content is required.');
            return;
        }

        const name = promptNameDraft.trim() || 'Untitled prompt';

        if (selectedPrompt) {
            setPromptLibrary((previous) => previous.map((prompt) => (
                prompt.id === selectedPrompt.id
                    ? { ...prompt, name, content, updatedAt: new Date().toISOString() }
                    : prompt
            )));
            setPromptStatus('Prompt updated.');
            return;
        }

        const created = createPromptTemplate(name, content);
        setPromptLibrary((previous) => [created, ...previous]);
        setSingleProbeConfig((previous) => ({ ...previous, selectedPromptId: created.id }));
        setPromptStatus('Prompt saved.');
    };

    const deleteSelectedPrompt = () => {
        if (!selectedPrompt) {
            setPromptStatus('Select a prompt to delete.');
            return;
        }
        if (isBuiltinPromptTemplateId(selectedPrompt.id)) {
            setPromptStatus('Built-in prompt templates cannot be deleted.');
            return;
        }

        setPromptLibrary((previous) => previous.filter((prompt) => prompt.id !== selectedPrompt.id));
        setSingleProbeConfig((previous) => ({ ...previous, selectedPromptId: '' }));
        setPromptNameDraft('');
        setPromptContentDraft('');
        setPromptStatus('Prompt deleted.');
    };

    const importPromptLibrary = (raw: string) => {
        const parsed = parsePromptLibraryImport(raw);
        if (parsed.error) {
            setPromptStatus(parsed.error);
            return;
        }

        setPromptLibrary((previous) => mergePromptLibraries(previous, parsed.prompts));
        setPromptStatus(`Imported ${parsed.prompts.length} prompt${parsed.prompts.length === 1 ? '' : 's'}.`);
    };

    const exportPromptLibrary = () => {
        if (promptLibrary.length === 0) {
            setPromptStatus('No prompts to export.');
            return;
        }

        const blob = new Blob([promptLibraryToJson(promptLibrary)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `prompt-library-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setPromptStatus('Prompt library exported.');
    };

    const saveCurrentRun = () => {
        if (!summary || results.length === 0) {
            setSavedRunStatus('Run a benchmark first, then save the run.');
            return;
        }

        const configSnapshot = buildSavedRunConfigSnapshot({
            benchmarkMode,
            mainConfig,
            forcedConfig,
            singleProbeConfig,
            selectedMultiModelKeys,
            multiModelRunsPerArm,
            editableQuestion,
            selectedPrompt,
        });

        const runTitle = buildSavedRunTitle(benchmarkMode, mainConfig, forcedConfig, singleProbeConfig, multiModelRunsPerArm);

        const nextRun: SavedBenchmarkRun = {
            id: `saved_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            savedAt: new Date().toISOString(),
            mode: benchmarkMode,
            title: runTitle,
            config: configSnapshot,
            summary,
            results,
        };

        setSavedRuns((previous) => [nextRun, ...previous]);
        setSelectedSavedRunIds((previous) => [nextRun.id, ...previous.filter((id) => id !== nextRun.id)]);
        setSavedRunStatus('Run saved for comparison.');
    };

    const toggleSavedRunSelection = (runId: string) => {
        setSelectedSavedRunIds((previous) => {
            if (previous.includes(runId)) {
                return previous.filter((id) => id !== runId);
            }
            return [...previous, runId];
        });
    };

    const selectAllSavedRuns = () => {
        setSelectedSavedRunIds(savedRuns.map((run) => run.id));
    };

    const clearSavedRunSelection = () => {
        setSelectedSavedRunIds([]);
    };

    const deleteSelectedSavedRuns = () => {
        if (selectedSavedRunIds.length === 0) {
            return;
        }

        setSavedRuns((previous) => previous.filter((run) => !selectedSavedRunIds.includes(run.id)));
        setComparisonRunIds((previous) => previous.filter((id) => !selectedSavedRunIds.includes(id)));
        setSelectedSavedRunIds([]);
        setSavedRunStatus('Selected saved runs removed.');
    };

    const clearAllSavedRuns = () => {
        setSavedRuns([]);
        setSelectedSavedRunIds([]);
        setComparisonRunIds([]);
        setSavedRunStatus('All saved runs removed.');
    };

    const compareSelectedSavedRuns = () => {
        if (selectedSavedRunIds.length === 0) {
            setSavedRunStatus('Select at least one saved run to compare.');
            return;
        }

        setComparisonRunIds(selectedSavedRunIds);
        setSavedRunStatus(`Comparing ${selectedSavedRunIds.length} saved run${selectedSavedRunIds.length === 1 ? '' : 's'}.`);
    };

    const hideComparison = () => {
        setComparisonRunIds([]);
    };

    return (
        <AppShell
            eyebrow="General Benchmarking"
            title="Benchmark Suite Runner"
            subtitle="Choose a benchmark profile, configure model settings with contextual guidance, run evaluations, and compare saved runs in one workspace."
        >
            <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
                <BenchmarkSidebar
                    collapsed={isSidebarCollapsed}
                    onToggle={() => setIsSidebarCollapsed((previous) => !previous)}
                    mode={benchmarkMode}
                    onModeChange={handleBenchmarkChange}
                />

                <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
                    <div className="space-y-5">
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <SectionHeader
                                title="Active Benchmark"
                                description={buildBenchmarkDescription(benchmarkMode)}
                                actions={<InfoTip label="Use the left benchmark selector to switch between main benchmarking, forced-test benchmarking, single-question probing, and multi-model single-question A/B testing." />}
                            />
                        </section>

                        {benchmarkMode === 'main' ? (
                            <MainConfigPanel
                                config={mainConfig}
                                setConfig={setMainConfig}
                                onRun={runExperiment}
                                isLoading={isRunning}
                                subjects={subjects}
                                selectionPreview={currentSelectionPreview}
                                canRun={canRunCurrentSelection}
                                runDisabledReason={runDisabledReason}
                            />
                        ) : benchmarkMode === 'forced_tests' ? (
                            <ForcedConfigPanel
                                config={forcedConfig}
                                setConfig={setForcedConfig}
                                onRun={runExperiment}
                                onCancel={cancelExperiment}
                                isLoading={isRunning}
                                subjects={subjects}
                                selectionPreview={currentSelectionPreview}
                                canRun={canRunCurrentSelection}
                                runDisabledReason={runDisabledReason}
                            />
                        ) : benchmarkMode === 'single_probe_multi_model' ? (
                            <SingleQuestionProbePanel
                                mode="multi_model"
                                config={singleProbeConfig}
                                setConfig={setSingleProbeConfig}
                                availableQuestions={singleDatasetRows}
                                savedBenchmarks={SINGLE_QUESTION_SAVED_BENCHMARKS}
                                selectedSavedBenchmarkId={selectedSavedBenchmarkId}
                                onSelectSavedBenchmark={setSelectedSavedBenchmarkId}
                                onLoadSavedBenchmark={loadSavedBenchmarkIntoEditor}
                                editableQuestion={editableQuestion}
                                setEditableQuestion={setEditableQuestion}
                                prompts={promptLibrary}
                                selectedPrompt={selectedPrompt}
                                promptNameDraft={promptNameDraft}
                                setPromptNameDraft={setPromptNameDraft}
                                promptContentDraft={promptContentDraft}
                                setPromptContentDraft={setPromptContentDraft}
                                promptStatus={promptStatus}
                                onLoadDatasetQuestion={loadDatasetQuestionIntoEditor}
                                onSavePrompt={savePromptTemplate}
                                onDeletePrompt={deleteSelectedPrompt}
                                onExportPrompts={exportPromptLibrary}
                                onImportPrompts={importPromptLibrary}
                                onRun={runExperiment}
                                isRunning={isRunning}
                                canRun={multiModelRunValidation.canRun}
                                runDisabledReason={multiModelRunValidation.reason}
                                multiModelOptions={multiModelOptions}
                                selectedMultiModelKeys={selectedMultiModelKeys}
                                multiModelRunsPerArm={multiModelRunsPerArm}
                                onToggleMultiModel={toggleMultiModelSelection}
                                onSelectAllMultiModels={selectAllMultiModels}
                                onClearAllMultiModels={clearAllMultiModels}
                                onMultiModelRunsPerArmChange={setMultiModelRunsPerArm}
                            />
                        ) : (
                            <SingleQuestionProbePanel
                                config={singleProbeConfig}
                                setConfig={setSingleProbeConfig}
                                availableQuestions={singleDatasetRows}
                                savedBenchmarks={SINGLE_QUESTION_SAVED_BENCHMARKS}
                                selectedSavedBenchmarkId={selectedSavedBenchmarkId}
                                onSelectSavedBenchmark={setSelectedSavedBenchmarkId}
                                onLoadSavedBenchmark={loadSavedBenchmarkIntoEditor}
                                editableQuestion={editableQuestion}
                                setEditableQuestion={setEditableQuestion}
                                prompts={promptLibrary}
                                selectedPrompt={selectedPrompt}
                                promptNameDraft={promptNameDraft}
                                setPromptNameDraft={setPromptNameDraft}
                                promptContentDraft={promptContentDraft}
                                setPromptContentDraft={setPromptContentDraft}
                                promptStatus={promptStatus}
                                onLoadDatasetQuestion={loadDatasetQuestionIntoEditor}
                                onSavePrompt={savePromptTemplate}
                                onDeletePrompt={deleteSelectedPrompt}
                                onExportPrompts={exportPromptLibrary}
                                onImportPrompts={importPromptLibrary}
                                onRun={runExperiment}
                                isRunning={isRunning}
                                canRun={singleRunValidation.canRun}
                                runDisabledReason={singleRunValidation.reason}
                            />
                        )}
                    </div>

                    <div className="space-y-5">
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Recent Runs</h2>
                                    <p className="mt-1 text-xs text-slate-500">Loads recent Main/Forced run results in this browser session.</p>
                                </div>
                                {runHistory.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearRunHistory}
                                        disabled={isRunning}
                                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            {runHistory.length === 0 ? (
                                <p className="mt-3 text-sm text-slate-500">No recent runs yet.</p>
                            ) : (
                                <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {runHistory.map((entry) => {
                                        const isActive = activeRunId === entry.id;
                                        return (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                onClick={() => loadRunFromHistory(entry)}
                                                disabled={isRunning}
                                                className={`w-full rounded-lg border p-2.5 text-left transition-colors ${isActive ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'} disabled:cursor-not-allowed disabled:opacity-60`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                                        {entry.suiteMode === 'main' ? 'Main' : 'Forced'}
                                                    </span>
                                                    <span className="text-xs text-slate-500">{formatHistoryTimestamp(entry.createdAt)}</span>
                                                </div>
                                                <p className="mt-1 text-sm font-semibold text-slate-800">{buildHistoryTitle(entry)}</p>
                                                <p className="text-xs text-slate-500">{buildHistorySubtitle(entry)}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Run Results</h2>
                                    <p className="mt-1 text-xs text-slate-500">Review detailed outputs and save this run for comparison.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={saveCurrentRun}
                                    disabled={!summary || results.length === 0}
                                    className="inline-flex items-center gap-1.5 rounded border border-teal-300 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Save className="h-3.5 w-3.5" />
                                    Save Run
                                </button>
                            </div>

                            {benchmarkMode === 'main' ? (
                                isRunning ? (
                                    <LoadingRunState status={runStatusText} />
                                ) : (
                                    <MainResultsDashboard results={mainDashboardResults} summary={mainDashboardSummary} />
                                )
                            ) : benchmarkMode === 'forced_tests' ? (
                                <ForcedResultsDashboard
                                    results={forcedDashboardResults}
                                    summary={forcedDashboardSummary}
                                    isLoading={isRunning}
                                    loadingStatus={runStatusText}
                                />
                            ) : benchmarkMode === 'single_probe_multi_model' ? (
                                isRunning ? (
                                    <LoadingRunState status={runStatusText} />
                                ) : summary ? (
                                    <MultiModelProbeResults summary={summary} results={results} />
                                ) : (
                                    <EmptyState
                                        title="No multi-model A/B results yet"
                                        description="Choose models and run the multi-model single-question test to compare outputs with and without custom prompt."
                                    />
                                )
                            ) : isRunning ? (
                                <LoadingRunState status={runStatusText} />
                            ) : summary ? (
                                <SingleProbeResults summary={summary} results={results} />
                            ) : (
                                <EmptyState
                                    title="No single-question results yet"
                                    description="Configure the probe settings and run a benchmark to see outcomes here."
                                />
                            )}
                        </section>

                        <SavedRunComparisonPanel
                            savedRuns={savedRuns}
                            selectedRunIds={selectedSavedRunIds}
                            comparisonRunIds={comparisonRunIds}
                            statusMessage={savedRunStatus}
                            onToggleRun={toggleSavedRunSelection}
                            onSelectAll={selectAllSavedRuns}
                            onClearSelection={clearSavedRunSelection}
                            onDeleteSelected={deleteSelectedSavedRuns}
                            onClearAll={clearAllSavedRuns}
                            onCompareSelected={compareSelectedSavedRuns}
                            onHideComparison={hideComparison}
                        />
                    </div>
                </div>
            </div>
        </AppShell>
    );
}

function LoadingRunState({ status }: { status: string }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/65 to-teal-50/65 p-10">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-200 border-t-teal-700" />
            <p className="mt-4 text-lg font-semibold text-slate-800">Running benchmark</p>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
        </div>
    );
}

function SingleProbeResults({ summary, results }: { summary: Record<string, unknown>; results: Record<string, unknown>[] }) {
    const result = results[0] || null;
    const accuracy = typeof summary.accuracy === 'number' ? summary.accuracy : 0;
    const isCorrect = result && typeof result.isCorrect === 'boolean' ? result.isCorrect : false;

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Accuracy" value={`${(accuracy * 100).toFixed(1)}%`} />
                <MetricCard label="Outcome" value={isCorrect ? 'Correct' : 'Incorrect'} />
                <MetricCard label="Model Choice" value={typeof result?.parsedChoice === 'string' ? result.parsedChoice : 'N/A'} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Single Result Details</p>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <p><span className="font-semibold">Question ID:</span> {typeof result?.questionId === 'string' ? result.questionId : 'N/A'}</p>
                    <p><span className="font-semibold">Ground Truth:</span> {typeof result?.groundTruth === 'string' ? result.groundTruth : 'N/A'}</p>
                    <p><span className="font-semibold">Parsed Choice:</span> {typeof result?.parsedChoice === 'string' ? result.parsedChoice : 'N/A'}</p>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Prompt Sent</p>
                        <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-xs whitespace-pre-wrap text-slate-700">
                            {typeof result?.questionText === 'string' ? result.questionText : ''}
                        </pre>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Model Output</p>
                        <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-xs whitespace-pre-wrap text-slate-700">
                            {typeof result?.modelOutput === 'string' ? result.modelOutput : ''}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MultiModelProbeResults({ summary, results }: { summary: Record<string, unknown>; results: Record<string, unknown>[] }) {
    const modelRows = results
        .filter((row) => isRecord(row))
        .map((row) => ({
            provider: typeof row.modelProvider === 'string' ? row.modelProvider : 'unknown',
            modelLabel: typeof row.modelLabel === 'string' ? row.modelLabel : 'Unknown Model',
            model: typeof row.model === 'string' ? row.model : 'unknown',
            promptMode: typeof row.promptMode === 'string' ? row.promptMode : 'unknown',
            parsedChoice: typeof row.parsedChoice === 'string' ? row.parsedChoice : 'Unknown',
            groundTruth: typeof row.groundTruth === 'string' ? row.groundTruth : 'Unknown',
            isCorrect: typeof row.isCorrect === 'boolean' ? row.isCorrect : false,
            repeatIndex: typeof row.repeatIndex === 'number' ? row.repeatIndex : 1,
            modelOutput: typeof row.modelOutput === 'string' ? row.modelOutput : '',
        }));
    const modelStatsFromSummary = Array.isArray(summary.perModel)
        ? summary.perModel
            .filter((item) => isRecord(item))
            .map((item) => {
                const withoutPrompt = isRecord(item.withoutPrompt) ? item.withoutPrompt : {};
                const withPrompt = isRecord(item.withPrompt) ? item.withPrompt : {};
                const withoutPromptTotal = typeof withoutPrompt.total === 'number' ? withoutPrompt.total : 0;
                const withoutPromptCorrect = typeof withoutPrompt.correct === 'number' ? withoutPrompt.correct : 0;
                const withPromptTotal = typeof withPrompt.total === 'number' ? withPrompt.total : 0;
                const withPromptCorrect = typeof withPrompt.correct === 'number' ? withPrompt.correct : 0;
                const withoutPromptAccuracy = withoutPromptTotal > 0 ? withoutPromptCorrect / withoutPromptTotal : 0;
                const withPromptAccuracy = withPromptTotal > 0 ? withPromptCorrect / withPromptTotal : 0;

                return {
                    key: `${typeof item.provider === 'string' ? item.provider : 'unknown'}::${typeof item.model === 'string' ? item.model : 'unknown'}`,
                    provider: typeof item.provider === 'string' ? item.provider : 'unknown',
                    model: typeof item.model === 'string' ? item.model : 'unknown',
                    modelLabel: typeof item.modelLabel === 'string' ? item.modelLabel : 'Unknown Model',
                    withoutPrompt: {
                        total: withoutPromptTotal,
                        correct: withoutPromptCorrect,
                        accuracy: withoutPromptAccuracy,
                    },
                    withPrompt: {
                        total: withPromptTotal,
                        correct: withPromptCorrect,
                        accuracy: withPromptAccuracy,
                    },
                    delta: withPromptAccuracy - withoutPromptAccuracy,
                };
            })
        : [];
    const modelStats = modelStatsFromSummary.length > 0
        ? modelStatsFromSummary
        : buildModelStatsFromRows(modelRows);

    const withPrompt = isRecord(summary.withPrompt) ? summary.withPrompt : {};
    const withoutPrompt = isRecord(summary.withoutPrompt) ? summary.withoutPrompt : {};
    const runsPerArm = typeof summary.runsPerArm === 'number'
        ? summary.runsPerArm
        : inferRunsPerArmFromModelStats(modelStats);
    const totalRuns = typeof summary.totalRuns === 'number' ? summary.totalRuns : modelRows.length;
    const modelCount = typeof summary.modelCount === 'number' ? summary.modelCount : modelStats.length;
    const overallAccuracy = typeof summary.accuracyOverall === 'number'
        ? summary.accuracyOverall
        : (totalRuns > 0 ? modelRows.filter((row) => row.isCorrect).length / totalRuns : 0);

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard
                    label="Overall Accuracy"
                    value={formatPercent(overallAccuracy)}
                />
                <MetricCard label="Models" value={`${modelCount}`} />
                <MetricCard label="Runs / Arm" value={`${runsPerArm}`} />
                <MetricCard label="Total Calls" value={`${totalRuns}`} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Grouped Accuracy Bars By Model</p>
                <p className="mt-1 text-xs text-slate-500">Each model is shown with two bars so you can compare prompt effect directly.</p>
                {modelStats.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No model comparison rows returned.</p>
                ) : (
                    <div className="mt-3 space-y-3">
                        {modelStats.map((row) => (
                            <div key={row.key} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-800">{row.modelLabel}</p>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                        {row.delta >= 0 ? '+' : ''}{formatPercent(row.delta)}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-500">{row.provider}</p>
                                <div className="mt-3 space-y-2">
                                    <AccuracyBar
                                        label="Without Prompt"
                                        accuracy={row.withoutPrompt.accuracy}
                                        detail={`${row.withoutPrompt.correct}/${row.withoutPrompt.total}`}
                                        colorClass="bg-slate-500"
                                    />
                                    <AccuracyBar
                                        label="With Prompt"
                                        accuracy={row.withPrompt.accuracy}
                                        detail={`${row.withPrompt.correct}/${row.withPrompt.total}`}
                                        colorClass="bg-teal-600"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Prompt Arm Summary</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <MetricCard
                    label="Without Prompt"
                    value={formatPercent(typeof withoutPrompt.accuracy === 'number' ? withoutPrompt.accuracy : 0)}
                />
                <MetricCard
                    label="With Prompt"
                    value={formatPercent(typeof withPrompt.accuracy === 'number' ? withPrompt.accuracy : 0)}
                />
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Model Prompt Impact Table</p>
                {modelStats.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No rows returned.</p>
                ) : (
                    <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white">
                        <table className="min-w-full text-left text-xs">
                            <thead className="sticky top-0 bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-2 py-1.5">Provider</th>
                                    <th className="px-2 py-1.5">Model</th>
                                    <th className="px-2 py-1.5">Without Prompt</th>
                                    <th className="px-2 py-1.5">With Prompt</th>
                                    <th className="px-2 py-1.5">Delta</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {modelStats.map((row) => (
                                    <tr key={row.key}>
                                        <td className="px-2 py-1.5 text-slate-700">{row.provider}</td>
                                        <td className="px-2 py-1.5 text-slate-700">{row.modelLabel}</td>
                                        <td className="px-2 py-1.5 text-slate-700">
                                            {formatPercent(row.withoutPrompt.accuracy)} ({row.withoutPrompt.correct}/{row.withoutPrompt.total})
                                        </td>
                                        <td className="px-2 py-1.5 text-slate-700">
                                            {formatPercent(row.withPrompt.accuracy)} ({row.withPrompt.correct}/{row.withPrompt.total})
                                        </td>
                                        <td className={`px-2 py-1.5 font-semibold ${row.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {row.delta >= 0 ? '+' : ''}{formatPercent(row.delta)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Attempt-Level Results</p>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
                    <table className="min-w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-100 text-slate-600">
                            <tr>
                                <th className="px-2 py-1.5">Model</th>
                                <th className="px-2 py-1.5">Prompt Arm</th>
                                <th className="px-2 py-1.5">Repeat</th>
                                <th className="px-2 py-1.5">Choice</th>
                                <th className="px-2 py-1.5">Truth</th>
                                <th className="px-2 py-1.5">Correct</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {modelRows.map((row, index) => (
                                <tr key={`${row.provider}-${row.model}-${row.promptMode}-${row.repeatIndex}-${index}`}>
                                    <td className="px-2 py-1.5 text-slate-700">{row.modelLabel}</td>
                                    <td className="px-2 py-1.5 text-slate-700">{row.promptMode === 'with_custom_prompt' ? 'With Prompt' : 'Without Prompt'}</td>
                                    <td className="px-2 py-1.5 text-slate-700">{row.repeatIndex}</td>
                                    <td className="px-2 py-1.5 text-slate-700">{row.parsedChoice}</td>
                                    <td className="px-2 py-1.5 text-slate-700">{row.groundTruth}</td>
                                    <td className={`px-2 py-1.5 font-semibold ${row.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                        {row.isCorrect ? 'Yes' : 'No'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Raw Outputs</p>
                <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
                    {modelRows.map((row, index) => (
                        <details key={`raw-${row.provider}-${row.model}-${row.promptMode}-${index}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                                {row.modelLabel} - {row.promptMode === 'with_custom_prompt' ? 'With Prompt' : 'Without Prompt'} - repeat {row.repeatIndex} - {row.parsedChoice}/{row.groundTruth}
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                                {row.modelOutput}
                            </pre>
                        </details>
                    ))}
                </div>
            </div>
        </div>
    );
}

function AccuracyBar({
    label,
    accuracy,
    detail,
    colorClass,
}: {
    label: string;
    accuracy: number;
    detail: string;
    colorClass: string;
}) {
    const clampedPercent = Math.min(Math.max(accuracy, 0), 1) * 100;
    return (
        <div className="grid items-center gap-2 sm:grid-cols-[108px_minmax(0,1fr)_90px]">
            <span className="text-xs font-semibold text-slate-600">{label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${clampedPercent}%` }} />
            </div>
            <span className="text-right text-xs text-slate-700">{formatPercent(accuracy)} ({detail})</span>
        </div>
    );
}

function buildModelStatsFromRows(rows: Array<{
    provider: string;
    modelLabel: string;
    model: string;
    promptMode: string;
    isCorrect: boolean;
}>) {
    const stats = new Map<string, {
        key: string;
        provider: string;
        modelLabel: string;
        model: string;
        withoutPrompt: { correct: number; total: number; accuracy: number };
        withPrompt: { correct: number; total: number; accuracy: number };
        delta: number;
    }>();

    for (const row of rows) {
        const key = `${row.provider}::${row.model}`;
        if (!stats.has(key)) {
            stats.set(key, {
                key,
                provider: row.provider,
                modelLabel: row.modelLabel,
                model: row.model,
                withoutPrompt: { correct: 0, total: 0, accuracy: 0 },
                withPrompt: { correct: 0, total: 0, accuracy: 0 },
                delta: 0,
            });
        }

        const entry = stats.get(key);
        if (!entry) {
            continue;
        }

        const isWithPrompt = row.promptMode === 'with_custom_prompt';
        if (isWithPrompt) {
            entry.withPrompt.total += 1;
            if (row.isCorrect) {
                entry.withPrompt.correct += 1;
            }
        } else {
            entry.withoutPrompt.total += 1;
            if (row.isCorrect) {
                entry.withoutPrompt.correct += 1;
            }
        }
    }

    return Array.from(stats.values()).map((entry) => {
        entry.withoutPrompt.accuracy = entry.withoutPrompt.total > 0
            ? entry.withoutPrompt.correct / entry.withoutPrompt.total
            : 0;
        entry.withPrompt.accuracy = entry.withPrompt.total > 0
            ? entry.withPrompt.correct / entry.withPrompt.total
            : 0;
        entry.delta = entry.withPrompt.accuracy - entry.withoutPrompt.accuracy;
        return entry;
    });
}

function inferRunsPerArmFromModelStats(rows: Array<{
    withoutPrompt: { total: number };
    withPrompt: { total: number };
}>) {
    if (rows.length === 0) {
        return 0;
    }
    return Math.max(
        0,
        ...rows.map((row) => Math.max(row.withPrompt.total, row.withoutPrompt.total)),
    );
}

function formatPercent(value: number) {
    return `${(value * 100).toFixed(1)}%`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{value}</p>
        </div>
    );
}

function buildBenchmarkDescription(mode: BenchmarkMode) {
    if (mode === 'main') {
        return 'Main benchmark flow for SuperGPQA/PRBench with provider, prompt, and perturbation controls.';
    }
    if (mode === 'forced_tests') {
        return 'Forced-test benchmark flow for legacy vs controlled profiles and model split comparisons.';
    }
    if (mode === 'single_probe_multi_model') {
        return 'Run multiple models on one question in two arms: without custom prompt and with custom prompt.';
    }
    return 'Probe any single question with optional custom prompt templates and save runs for cross-run comparison.';
}

function buildSavedRunConfigSnapshot({
    benchmarkMode,
    mainConfig,
    forcedConfig,
    singleProbeConfig,
    selectedMultiModelKeys,
    multiModelRunsPerArm,
    editableQuestion,
    selectedPrompt,
}: {
    benchmarkMode: BenchmarkMode;
    mainConfig: MainExperimentConfig;
    forcedConfig: ForcedExperimentConfig;
    singleProbeConfig: SingleProbeConfig;
    selectedMultiModelKeys: string[];
    multiModelRunsPerArm: number;
    editableQuestion: EditableSingleQuestion;
    selectedPrompt: PromptTemplate | null;
}) {
    if (benchmarkMode === 'main') {
        return {
            ...mainConfig,
            perturbations: { ...mainConfig.perturbations },
        };
    }

    if (benchmarkMode === 'forced_tests') {
        return {
            ...forcedConfig,
            controlled: { ...forcedConfig.controlled },
            perturbations: { ...forcedConfig.perturbations },
        };
    }
    if (benchmarkMode === 'single_probe_multi_model') {
        return {
            mode: 'single_probe_multi_model',
            selectedModels: selectedMultiModelKeys,
            runsPerArm: Math.min(Math.max(multiModelRunsPerArm, 1), 20),
            question: editableQuestion,
            prompt: selectedPrompt
                ? { id: selectedPrompt.id, name: selectedPrompt.name }
                : null,
        };
    }

    return {
        ...singleProbeConfig,
        question: editableQuestion,
        prompt: selectedPrompt
            ? { id: selectedPrompt.id, name: selectedPrompt.name }
            : null,
    };
}

function buildSavedRunTitle(
    benchmarkMode: BenchmarkMode,
    mainConfig: MainExperimentConfig,
    forcedConfig: ForcedExperimentConfig,
    singleProbeConfig: SingleProbeConfig,
    multiModelRunsPerArm: number
) {
    if (benchmarkMode === 'main') {
        return `${mainConfig.dataset.toUpperCase()} - ${mainConfig.model}`;
    }
    if (benchmarkMode === 'forced_tests') {
        return forcedConfig.compareModel
            ? `${forcedConfig.model} vs ${forcedConfig.compareModel}`
            : `${forcedConfig.model} (forced)`;
    }
    if (benchmarkMode === 'single_probe_multi_model') {
        return `Multi-model single-question A/B (x${Math.min(Math.max(multiModelRunsPerArm, 1), 20)}/arm)`;
    }
    return `${singleProbeConfig.provider}/${singleProbeConfig.model} - single probe`;
}

function buildMainSelectionPreview(rows: DatasetRow[], config: MainExperimentConfig): SelectionPreview {
    const selection = resolveMainSelection(rows, config);
    return {
        mode: config.questionSelectionMode,
        filteredCount: selection.filtered.length,
        selectedCount: selection.selected.length,
        selectedIds: selection.selected.map((row) => String(row.id)),
        missingIds: selection.missingIds,
        bucketCounts: buildBucketCounts(
            selection.selected,
            (row) => config.dataset === 'prbench'
                ? (row.topic || row.field || 'Unknown')
                : (row.subfield || row.discipline || 'Unknown')
        ),
    };
}

function buildForcedSelectionPreview(rows: DatasetRow[], config: ForcedExperimentConfig): SelectionPreview {
    const selection = resolveForcedSelection(rows, config);
    return {
        mode: config.questionSelectionMode,
        filteredCount: selection.filtered.length,
        selectedCount: selection.selected.length,
        selectedIds: selection.selected.map((row) => String(row.id)),
        missingIds: selection.missingIds,
        bucketCounts: buildBucketCounts(selection.selected, (row) => row.subfield || row.discipline || 'Unknown'),
    };
}

function resolveMainSelection(rows: DatasetRow[], config: MainExperimentConfig) {
    let filtered = rows;
    if (config.subject !== 'All') {
        if (config.dataset === 'prbench') {
            filtered = filtered.filter((row) => (row.topic === config.subject) || (row.field === config.subject));
        } else {
            filtered = filtered.filter((row) => (row.subfield === config.subject) || (row.discipline === config.subject));
        }
    }
    if (config.dataset !== 'prbench' && config.difficulty !== 'All') {
        filtered = filtered.filter((row) => row.difficulty === config.difficulty);
    }

    if (config.questionSelectionMode === 'manual') {
        const manualSelection = selectByManualIds(filtered, config.manualQuestionIds);
        return {
            filtered,
            selected: manualSelection.selected,
            missingIds: manualSelection.missingIds,
        };
    }

    const ordered = orderRowsForAutoSelection(filtered, config.autoSelectionOrder, config.sampleSeed);
    return {
        filtered,
        selected: ordered.slice(0, config.limit),
        missingIds: [] as string[],
    };
}

function resolveForcedSelection(rows: DatasetRow[], config: ForcedExperimentConfig) {
    let filtered = rows;
    if (config.subject !== 'All') {
        filtered = filtered.filter((row) => (row.subfield === config.subject) || (row.discipline === config.subject));
    }
    if (config.difficulty !== 'All') {
        filtered = filtered.filter((row) => row.difficulty === config.difficulty);
    }

    if (config.questionSelectionMode === 'manual') {
        const manualSelection = selectByManualIds(filtered, config.manualQuestionIds);
        return {
            filtered,
            selected: manualSelection.selected,
            missingIds: manualSelection.missingIds,
        };
    }

    let selected: DatasetRow[] = [];
    if (config.benchmarkProfile === 'controlled') {
        if (config.samplingStrategy === 'stratified') {
            selected = selectStratifiedSample(filtered, config.limit);
        } else {
            selected = [...filtered]
                .sort((a, b) => String(a.id).localeCompare(String(b.id)))
                .slice(0, config.limit);
        }
    } else {
        selected = orderRowsForAutoSelection(filtered, config.autoSelectionOrder, config.sampleSeed).slice(0, config.limit);
    }

    return {
        filtered,
        selected,
        missingIds: [] as string[],
    };
}

function buildBucketCounts(rows: DatasetRow[], getLabel: (row: DatasetRow) => string) {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const label = getLabel(row);
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function selectByManualIds(rows: DatasetRow[], manualQuestionIds: string) {
    const ids = parseManualIds(manualQuestionIds);
    const rowById = new Map<string, DatasetRow>();
    for (const row of rows) {
        rowById.set(String(row.id), row);
    }

    const selected: DatasetRow[] = [];
    const missingIds: string[] = [];
    const seen = new Set<string>();

    for (const id of ids) {
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        const matched = rowById.get(id);
        if (matched) {
            selected.push(matched);
        } else {
            missingIds.push(id);
        }
    }

    return { selected, missingIds };
}

function parseManualIds(input: string) {
    return input
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
}

function orderRowsForAutoSelection(rows: DatasetRow[], selectionOrder: 'random' | 'ordered', sampleSeed: number) {
    const ordered = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (selectionOrder === 'ordered') {
        return ordered;
    }
    return deterministicShuffle(ordered, sampleSeed);
}

function deterministicShuffle<T>(items: T[], seed: number) {
    const shuffled = [...items];
    let state = normalizeSeed(seed);
    for (let i = shuffled.length - 1; i > 0; i--) {
        state = nextSeed(state);
        const j = state % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function normalizeSeed(seed: number) {
    if (!Number.isFinite(seed)) {
        return 1;
    }
    const normalized = Math.abs(Math.floor(seed)) >>> 0;
    return normalized === 0 ? 1 : normalized;
}

function nextSeed(seed: number) {
    return (seed * 1664525 + 1013904223) >>> 0;
}

function selectStratifiedSample(questions: DatasetRow[], limit: number) {
    if (limit <= 0 || questions.length === 0) {
        return [];
    }

    const groups = new Map<string, DatasetRow[]>();
    for (const question of questions) {
        const key = question.subfield || question.discipline || 'Unknown';
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)?.push(question);
    }

    const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    for (const key of sortedGroupKeys) {
        groups.get(key)?.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    const selected: DatasetRow[] = [];
    const indices = new Map<string, number>(sortedGroupKeys.map((key) => [key, 0]));

    while (selected.length < limit) {
        let pickedAny = false;
        for (const key of sortedGroupKeys) {
            if (selected.length >= limit) {
                break;
            }

            const index = indices.get(key) ?? 0;
            const group = groups.get(key) ?? [];
            if (index < group.length) {
                selected.push(group[index]);
                indices.set(key, index + 1);
                pickedAny = true;
            }
        }

        if (!pickedAny) {
            break;
        }
    }

    return selected;
}

function isAbortError(error: unknown) {
    return (
        (error instanceof DOMException && error.name === 'AbortError')
        || (typeof error === 'object' && error !== null && 'name' in error && String((error as { name?: unknown }).name) === 'AbortError')
    );
}

function readRunHistoryFromStorage(): RunHistoryEntry[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(isRunHistoryEntry).slice(0, MAX_RUN_HISTORY_ENTRIES);
    } catch (error) {
        console.error('Failed to read run history from storage', error);
        return [];
    }
}

function writeRunHistoryToStorage(history: RunHistoryEntry[]) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('Failed to persist run history', error);
    }
}

function clearRunHistoryInStorage() {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
}

function isRunHistoryEntry(value: unknown): value is RunHistoryEntry {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.id === 'string'
        && typeof value.createdAt === 'string'
        && (value.suiteMode === 'main' || value.suiteMode === 'forced_tests')
        && Array.isArray(value.results)
        && 'summary' in value
        && isRecord(value.config)
    );
}

function readSavedRunsFromStorage(): SavedBenchmarkRun[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(SAVED_RUN_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => normalizeSavedRun(entry))
            .filter((entry): entry is SavedBenchmarkRun => entry !== null)
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch (error) {
        console.error('Failed to read saved runs from storage', error);
        return [];
    }
}

function writeSavedRunsToStorage(savedRuns: SavedBenchmarkRun[]) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(SAVED_RUN_STORAGE_KEY, JSON.stringify(savedRuns));
    } catch (error) {
        console.error('Failed to persist saved runs', error);
    }
}

function normalizeSavedRun(value: unknown): SavedBenchmarkRun | null {
    if (!isRecord(value)) {
        return null;
    }

    const id = typeof value.id === 'string' ? value.id : '';
    const savedAt = typeof value.savedAt === 'string' ? value.savedAt : '';
    const mode = value.mode;
    const title = typeof value.title === 'string' ? value.title : '';

    if (!id || !savedAt || !title || (mode !== 'main' && mode !== 'forced_tests' && mode !== 'single_probe' && mode !== 'single_probe_multi_model')) {
        return null;
    }

    const config = isRecord(value.config) ? value.config : {};
    const summary = isRecord(value.summary) ? value.summary : null;
    const results = Array.isArray(value.results)
        ? value.results.filter((item): item is Record<string, unknown> => isRecord(item))
        : [];

    return {
        id,
        savedAt,
        mode,
        title,
        config,
        summary,
        results,
    };
}

function isMainConfig(config: HistoryConfig): config is MainExperimentConfig {
    return 'dataset' in config && 'judgeModel' in config;
}

function isForcedConfig(config: HistoryConfig): config is ForcedExperimentConfig {
    return 'evaluationMode' in config && 'benchmarkProfile' in config && 'controlled' in config;
}

function buildHistoryTitle(entry: RunHistoryEntry) {
    if (isMainConfig(entry.config)) {
        return `${entry.config.dataset.toUpperCase()} - ${entry.config.model}`;
    }
    if (isForcedConfig(entry.config)) {
        if (entry.config.compareModel) {
            return `${entry.config.model} vs ${entry.config.compareModel}`;
        }
        return entry.config.model;
    }
    return `${entry.suiteMode === 'main' ? 'Main' : 'Forced'} Run`;
}

function buildHistorySubtitle(entry: RunHistoryEntry) {
    const summary = isRecord(entry.summary) ? entry.summary : null;
    if (summary) {
        const total = typeof summary.total === 'number' ? summary.total : entry.results.length;
        if (typeof summary.accuracy === 'number') {
            const correct = typeof summary.correct === 'number'
                ? `${summary.correct}/${total}`
                : `${Math.round(summary.accuracy * total)}/${total}`;
            return `Accuracy ${(summary.accuracy * 100).toFixed(1)}% (${correct})`;
        }
        if (typeof summary.meanScore === 'number') {
            return `Mean score ${summary.meanScore.toFixed(1)} across ${total} item${total === 1 ? '' : 's'}`;
        }
        return `${total} result${total === 1 ? '' : 's'}`;
    }

    return `${entry.results.length} result${entry.results.length === 1 ? '' : 's'}`;
}

function formatHistoryTimestamp(isoDate: string) {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
        return isoDate;
    }
    return parsed.toLocaleString();
}

function getChoiceLetters(choiceCount: number) {
    const safeCount = Math.min(Math.max(choiceCount, 1), 10);
    return Array.from({ length: safeCount }, (_, index) => String.fromCharCode(65 + index));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
