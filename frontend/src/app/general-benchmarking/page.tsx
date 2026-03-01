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
import { RubricJudgeProbeConfig, RubricJudgeProbePanel } from '@/components/benchmarking/RubricJudgeProbePanel';
import { RubricJudgeProbeResults } from '@/components/benchmarking/RubricJudgeProbeResults';
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
import {
    createJudgeRubricTemplate,
    isBuiltinJudgeRubricTemplateId,
    judgeRubricLibraryToJson,
    JudgeRubricTemplate,
    mergeJudgeRubricLibraries,
    parseJudgeRubricLibraryImport,
    readJudgeRubricLibraryFromStorage,
    writeJudgeRubricLibraryToStorage,
} from '@/lib/judge-rubric-library';
import { computeRubricPairwiseComparisons, estimateRequiredSampleSizePaired, RubricScoreObservation } from '@/lib/statistics-rubric';
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
const GENERAL_UI_STATE_STORAGE_KEY = 'general-benchmarking.ui-state.v1';
const MAX_RUN_HISTORY_ENTRIES = 20;
const DEFAULT_MULTI_MODEL_KEYS = [
    'openai::gpt-5.2-chat-latest',
    'anthropic::claude-sonnet-4-5',
    'gemini::gemini-2.5-pro',
];

type GeneralBenchmarkUiState = {
    benchmarkMode: BenchmarkMode;
    isSidebarCollapsed: boolean;
    mainConfig: MainExperimentConfig;
    forcedConfig: ForcedExperimentConfig;
    singleProbeConfig: SingleProbeConfig;
    rubricJudgeConfig: RubricJudgeProbeConfig;
    selectedMultiModelKeys: string[];
    multiModelRunsPerArm: number;
    editableQuestion: EditableSingleQuestion;
    promptNameDraft: string;
    promptContentDraft: string;
    selectedJudgeRubricTemplateId: string;
    judgeRubricNameDraft: string;
    judgeRubricContentDraft: string;
};

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
    const [rubricJudgeConfig, setRubricJudgeConfig] = useState<RubricJudgeProbeConfig>({
        runScope: 'single',
        runsPerQuestion: 1,
        strictnessMode: 'strict',
        selectedGenerationPromptId: 'builtin_alan_irac_json_v1',
        selectedGenerationPromptIds: ['builtin_alan_irac_json_v1'],
        selectedJudgeRubricIds: ['builtin_rubric_balanced_v1'],
        judgeProvider: 'openai',
        judgeModel: getDefaultModelForProvider('openai'),
        judgeReasoningEffort: 'medium',
        datasetSampleStrategy: 'random',
        datasetSampleSize: 30,
        sampleSeed: 42,
        statValidationEnabled: true,
        statAlpha: 0.05,
        statPower: 0.8,
        statMinEffectSizeDz: 0.35,
        statMaxQuestions: 120,
        statPermutations: 10000,
        statBootstrapSamples: 5000,
        generationRepairRetries: 2,
    });
    const [selectedMultiModelKeys, setSelectedMultiModelKeys] = useState<string[]>(DEFAULT_MULTI_MODEL_KEYS);
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

    const [judgeRubricLibrary, setJudgeRubricLibrary] = useState<JudgeRubricTemplate[]>([]);
    const [selectedJudgeRubricTemplateId, setSelectedJudgeRubricTemplateId] = useState('');
    const [judgeRubricNameDraft, setJudgeRubricNameDraft] = useState('');
    const [judgeRubricContentDraft, setJudgeRubricContentDraft] = useState('');
    const [judgeRubricStatus, setJudgeRubricStatus] = useState<string | null>(null);
    const [hasHydratedUiState, setHasHydratedUiState] = useState(false);

    const activeGenerationPromptId = benchmarkMode === 'single_probe_multi_model_rubric_judge'
        ? rubricJudgeConfig.selectedGenerationPromptId
        : singleProbeConfig.selectedPromptId;
    const selectedPrompt = useMemo(
        () => promptLibrary.find((prompt) => prompt.id === activeGenerationPromptId) || null,
        [activeGenerationPromptId, promptLibrary],
    );
    const selectedGenerationPrompts = useMemo(
        () => promptLibrary.filter((prompt) => rubricJudgeConfig.selectedGenerationPromptIds.includes(prompt.id)),
        [promptLibrary, rubricJudgeConfig.selectedGenerationPromptIds],
    );
    const selectedJudgeRubricTemplate = useMemo(
        () => judgeRubricLibrary.find((rubric) => rubric.id === selectedJudgeRubricTemplateId) || null,
        [judgeRubricLibrary, selectedJudgeRubricTemplateId],
    );
    const selectedJudgeRubrics = useMemo(
        () => judgeRubricLibrary.filter((rubric) => rubricJudgeConfig.selectedJudgeRubricIds.includes(rubric.id)),
        [judgeRubricLibrary, rubricJudgeConfig.selectedJudgeRubricIds],
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
        setJudgeRubricLibrary(readJudgeRubricLibraryFromStorage());

        const persistedUiState = readGeneralBenchmarkUiStateFromStorage();
        if (persistedUiState) {
            setBenchmarkMode(persistedUiState.benchmarkMode);
            setIsSidebarCollapsed(persistedUiState.isSidebarCollapsed);
            setMainConfig({
                ...persistedUiState.mainConfig,
                perturbations: { ...persistedUiState.mainConfig.perturbations },
            });
            setForcedConfig({
                ...persistedUiState.forcedConfig,
                controlled: { ...persistedUiState.forcedConfig.controlled },
                perturbations: { ...persistedUiState.forcedConfig.perturbations },
            });
            setSingleProbeConfig(persistedUiState.singleProbeConfig);
            setRubricJudgeConfig(persistedUiState.rubricJudgeConfig);
            setSelectedMultiModelKeys(persistedUiState.selectedMultiModelKeys);
            setMultiModelRunsPerArm(persistedUiState.multiModelRunsPerArm);
            setEditableQuestion(persistedUiState.editableQuestion);
            setPromptNameDraft(persistedUiState.promptNameDraft);
            setPromptContentDraft(persistedUiState.promptContentDraft);
            setSelectedJudgeRubricTemplateId(persistedUiState.selectedJudgeRubricTemplateId);
            setJudgeRubricNameDraft(persistedUiState.judgeRubricNameDraft);
            setJudgeRubricContentDraft(persistedUiState.judgeRubricContentDraft);
        }

        setHasHydratedUiState(true);
    }, []);

    useEffect(() => {
        writePromptLibraryToStorage(promptLibrary);
    }, [promptLibrary]);

    useEffect(() => {
        writeJudgeRubricLibraryToStorage(judgeRubricLibrary);
    }, [judgeRubricLibrary]);

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
        if (!selectedJudgeRubricTemplate) {
            return;
        }
        setJudgeRubricNameDraft(selectedJudgeRubricTemplate.name);
        setJudgeRubricContentDraft(selectedJudgeRubricTemplate.content);
    }, [selectedJudgeRubricTemplate]);

    useEffect(() => {
        const validKeys = new Set(multiModelOptions.map((option) => option.key));
        setSelectedMultiModelKeys((previous) => previous.filter((key) => validKeys.has(key)));
    }, [multiModelOptions]);

    useEffect(() => {
        const validIds = new Set(judgeRubricLibrary.map((rubric) => rubric.id));
        setRubricJudgeConfig((previous) => ({
            ...previous,
            selectedJudgeRubricIds: previous.selectedJudgeRubricIds.filter((id) => validIds.has(id)),
        }));
        if (selectedJudgeRubricTemplateId && !validIds.has(selectedJudgeRubricTemplateId)) {
            setSelectedJudgeRubricTemplateId('');
            setJudgeRubricNameDraft('');
            setJudgeRubricContentDraft('');
        }
    }, [judgeRubricLibrary, selectedJudgeRubricTemplateId]);

    useEffect(() => {
        const validPromptIds = new Set(promptLibrary.map((prompt) => prompt.id));
        setRubricJudgeConfig((previous) => ({
            ...previous,
            selectedGenerationPromptId: validPromptIds.has(previous.selectedGenerationPromptId)
                ? previous.selectedGenerationPromptId
                : (previous.selectedGenerationPromptIds.find((id) => validPromptIds.has(id)) || ''),
            selectedGenerationPromptIds: previous.selectedGenerationPromptIds.filter((id) => validPromptIds.has(id)),
        }));
        setSingleProbeConfig((previous) => ({
            ...previous,
            selectedPromptId: validPromptIds.has(previous.selectedPromptId) ? previous.selectedPromptId : '',
        }));
    }, [promptLibrary]);

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

    useEffect(() => {
        if (!judgeRubricStatus) {
            return;
        }

        const timer = window.setTimeout(() => {
            setJudgeRubricStatus(null);
        }, 3500);

        return () => window.clearTimeout(timer);
    }, [judgeRubricStatus]);

    useEffect(() => {
        if (!hasHydratedUiState) {
            return;
        }

        writeGeneralBenchmarkUiStateToStorage({
            benchmarkMode,
            isSidebarCollapsed,
            mainConfig,
            forcedConfig,
            singleProbeConfig,
            rubricJudgeConfig,
            selectedMultiModelKeys,
            multiModelRunsPerArm,
            editableQuestion,
            promptNameDraft,
            promptContentDraft,
            selectedJudgeRubricTemplateId,
            judgeRubricNameDraft,
            judgeRubricContentDraft,
        });
    }, [
        benchmarkMode,
        editableQuestion,
        forcedConfig,
        hasHydratedUiState,
        isSidebarCollapsed,
        judgeRubricContentDraft,
        judgeRubricNameDraft,
        mainConfig,
        multiModelRunsPerArm,
        promptContentDraft,
        promptNameDraft,
        rubricJudgeConfig,
        selectedJudgeRubricTemplateId,
        selectedMultiModelKeys,
        singleProbeConfig,
    ]);

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
    const rubricJudgeRunValidation = useMemo(() => {
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
        if (selectedGenerationPrompts.length === 0) {
            return { canRun: false, reason: 'Select at least one generation prompt template.' };
        }
        if (selectedJudgeRubrics.length === 0) {
            return { canRun: false, reason: 'Select at least one judge rubric template.' };
        }
        if (!rubricJudgeConfig.judgeModel.trim()) {
            return { canRun: false, reason: 'Judge model is required.' };
        }
        if (rubricJudgeConfig.runScope === 'dataset' && rubricJudgeConfig.datasetSampleSize < 1) {
            return { canRun: false, reason: 'Dataset sample size must be at least 1.' };
        }
        if (!Number.isInteger(rubricJudgeConfig.runsPerQuestion) || rubricJudgeConfig.runsPerQuestion < 1 || rubricJudgeConfig.runsPerQuestion > 20) {
            return { canRun: false, reason: 'Runs per question must be between 1 and 20.' };
        }
        return { canRun: true, reason: undefined as string | undefined };
    }, [
        editableQuestion,
        rubricJudgeConfig.datasetSampleSize,
        rubricJudgeConfig.judgeModel,
        rubricJudgeConfig.runsPerQuestion,
        rubricJudgeConfig.runScope,
        selectedGenerationPrompts.length,
        selectedJudgeRubrics.length,
        selectedMultiModelKeys.length,
    ]);

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
        const tasks: Array<{
            option: MultiModelSelectionOption;
            useCustomPrompt: boolean;
            repeatIndex: number;
        }> = [];
        for (const option of selectedOptions) {
            for (const promptMode of ['without', 'with'] as const) {
                for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex += 1) {
                    tasks.push({
                        option,
                        useCustomPrompt: promptMode === 'with',
                        repeatIndex,
                    });
                }
            }
        }

        const aggregateResults: Record<string, unknown>[] = new Array(tasks.length);
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

        const MAX_PARALLEL_REQUESTS = 4;
        const workerCount = Math.min(MAX_PARALLEL_REQUESTS, Math.max(tasks.length, 1));
        let completed = 0;
        let started = 0;
        let nextTaskIndex = 0;
        const totalRuns = tasks.length;

        const executeTask = async (task: { option: MultiModelSelectionOption; useCustomPrompt: boolean; repeatIndex: number }, taskIndex: number) => {
            if (signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            setRunStatusText(
                `Running ${task.option.modelLabel} (${task.useCustomPrompt ? 'with prompt' : 'without prompt'}) repeat ${task.repeatIndex}/${repeatCount} (${started}/${totalRuns} started, ${completed}/${totalRuns} completed)...`
            );

            const json = await requestSingleProbe(signal, {
                provider: task.option.provider,
                model: task.option.model,
                useCustomPrompt: task.useCustomPrompt,
                customPrompt: selectedPrompt.content,
            });
            const responseResult = Array.isArray(json.results) && json.results.length > 0
                ? json.results[0]
                : null;
            const responseSummary = json.summary || {};
            const isCorrect = responseResult && typeof responseResult.isCorrect === 'boolean'
                ? responseResult.isCorrect
                : false;

            aggregateResults[taskIndex] = {
                modelProvider: task.option.provider,
                modelLabel: task.option.modelLabel,
                model: task.option.model,
                promptMode: task.useCustomPrompt ? 'with_custom_prompt' : 'without_custom_prompt',
                promptArmLabel: task.useCustomPrompt ? 'With Prompt' : 'Without Prompt',
                repeatIndex: task.repeatIndex,
                runsPerArm: repeatCount,
                questionId: responseResult && typeof responseResult.questionId === 'string' ? responseResult.questionId : editableQuestion.id,
                groundTruth: responseResult && typeof responseResult.groundTruth === 'string' ? responseResult.groundTruth : editableQuestion.answerLetter,
                parsedChoice: responseResult && typeof responseResult.parsedChoice === 'string' ? responseResult.parsedChoice : 'Unknown',
                isCorrect,
                modelOutput: responseResult && typeof responseResult.modelOutput === 'string' ? responseResult.modelOutput : '',
                accuracy: typeof responseSummary.accuracy === 'number' ? responseSummary.accuracy : (isCorrect ? 1 : 0),
            };

            const currentModelStats = perModelStats.get(task.option.key);
            if (currentModelStats) {
                if (task.useCustomPrompt) {
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

            if (task.useCustomPrompt) {
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
        };

        await Promise.all(
            Array.from({ length: workerCount }, async () => {
                while (true) {
                    if (signal.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }

                    const taskIndex = nextTaskIndex;
                    if (taskIndex >= tasks.length) {
                        return;
                    }

                    nextTaskIndex += 1;
                    started += 1;
                    await executeTask(tasks[taskIndex], taskIndex);
                }
            })
        );

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

    const requestRubricJudgeProbe = async (
        signal: AbortSignal,
        options: {
            provider: 'openai' | 'anthropic' | 'gemini';
            model: string;
            question: EditableSingleQuestion;
            generationPrompt: string;
        }
    ) => {
        const response = await fetch('/api/benchmark-single-rubric-judge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                provider: options.provider,
                model: options.model,
                temperature: singleProbeConfig.temperature,
                reasoningEffort: singleProbeConfig.reasoningEffort,
                strictnessMode: rubricJudgeConfig.strictnessMode,
                generationPrompt: options.generationPrompt,
                maxGenerationRetries: rubricJudgeConfig.generationRepairRetries,
                question: {
                    id: options.question.id,
                    question: options.question.question,
                    choices: options.question.choices,
                    answerLetter: options.question.answerLetter,
                    subfield: options.question.subfield,
                    difficulty: options.question.difficulty,
                },
                judgeProvider: rubricJudgeConfig.judgeProvider,
                judgeModel: rubricJudgeConfig.judgeModel,
                judgeReasoningEffort: rubricJudgeConfig.judgeReasoningEffort,
                judgeRubrics: selectedJudgeRubrics.map((rubric) => ({
                    id: rubric.id,
                    name: rubric.name,
                    content: rubric.content,
                })),
            }),
        });

        const json = (await response.json()) as {
            generation?: Record<string, unknown>;
            evaluation?: Record<string, unknown>;
            judgeResults?: Array<Record<string, unknown>>;
            error?: string;
        };

        if (!response.ok) {
            throw new Error(json.error || `Rubric judge request failed (${response.status}).`);
        }

        return json;
    };

    const runRubricJudgeMultiModelProbe = async (signal: AbortSignal) => {
        const selectedOptions = multiModelOptions.filter((option) => selectedMultiModelKeys.includes(option.key));
        if (selectedOptions.length === 0) {
            throw new Error('No models selected.');
        }
        const promptVariants: Array<{
            promptArm: string;
            promptId: string;
            promptName: string;
            promptContent: string;
        }> = selectedGenerationPrompts.map((prompt, index) => ({
            promptArm: `Prompt ${index + 1}`,
            promptId: prompt.id,
            promptName: prompt.name,
            promptContent: prompt.content,
        }));
        if (promptVariants.length === 0) {
            throw new Error('Select at least one generation prompt template before running rubric benchmark.');
        }

        const runsPerQuestion = Math.min(20, Math.max(1, Math.floor(rubricJudgeConfig.runsPerQuestion)));
        const requiredObservationCount = rubricJudgeConfig.statValidationEnabled
            ? estimateRequiredSampleSizePaired(
                rubricJudgeConfig.statAlpha,
                rubricJudgeConfig.statPower,
                rubricJudgeConfig.statMinEffectSizeDz,
            )
            : 0;
        const requiredQuestionCountForPower = rubricJudgeConfig.statValidationEnabled
            ? Math.max(1, Math.ceil(requiredObservationCount / runsPerQuestion))
            : 1;

        const targetQuestionCount = rubricJudgeConfig.runScope === 'dataset'
            ? Math.min(
                rubricJudgeConfig.statValidationEnabled
                    ? rubricJudgeConfig.statMaxQuestions
                    : rubricJudgeConfig.datasetSampleSize,
                Math.max(rubricJudgeConfig.datasetSampleSize, rubricJudgeConfig.statValidationEnabled ? requiredQuestionCountForPower : 0),
            )
            : 1;

        const questions = rubricJudgeConfig.runScope === 'single'
            ? [editableQuestion]
            : sampleDatasetQuestionsForRubricRun(
                singleDatasetRows,
                targetQuestionCount,
                rubricJudgeConfig.datasetSampleStrategy,
                rubricJudgeConfig.sampleSeed,
            );

        if (questions.length === 0) {
            throw new Error('No questions selected for rubric benchmark run.');
        }

        const tasks: Array<{
            option: MultiModelSelectionOption;
            question: EditableSingleQuestion;
            repeatIndex: number;
            observationId: string;
            promptArm: string;
            promptId: string;
            promptName: string;
            promptContent: string;
            modelArmKey: string;
            modelArmLabel: string;
        }> = [];
        for (const question of questions) {
            for (const option of selectedOptions) {
                for (const promptVariant of promptVariants) {
                    for (let repeatIndex = 1; repeatIndex <= runsPerQuestion; repeatIndex += 1) {
                        tasks.push({
                            question,
                            option,
                            repeatIndex,
                            observationId: `${question.id}::r${repeatIndex}`,
                            promptArm: promptVariant.promptArm,
                            promptId: promptVariant.promptId,
                            promptName: promptVariant.promptName,
                            promptContent: promptVariant.promptContent,
                            modelArmKey: `${option.key}::prompt_${promptVariant.promptId}`,
                            modelArmLabel: `${option.modelLabel} [Prompt ${promptVariant.promptArm}]`,
                        });
                    }
                }
            }
        }

        const aggregateResults: Record<string, unknown>[] = new Array(tasks.length);
        const MAX_PARALLEL_REQUESTS = 4;
        const workerCount = Math.min(MAX_PARALLEL_REQUESTS, Math.max(1, tasks.length));
        let completed = 0;
        let nextTaskIndex = 0;

        const executeTask = async (
            task: {
                option: MultiModelSelectionOption;
                question: EditableSingleQuestion;
                repeatIndex: number;
                observationId: string;
                promptArm: string;
                promptId: string;
                promptName: string;
                promptContent: string;
                modelArmKey: string;
                modelArmLabel: string;
            },
            taskIndex: number,
        ) => {
            if (signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            setRunStatusText(
                `Running ${task.option.modelLabel} ${task.promptArm} on ${task.question.id} [run ${task.repeatIndex}/${runsPerQuestion}] (${completed + 1}/${tasks.length})...`
            );

            const json = await requestRubricJudgeProbe(signal, {
                provider: task.option.provider,
                model: task.option.model,
                question: task.question,
                generationPrompt: task.promptContent,
            });

            const generation = isRecord(json.generation) ? json.generation : {};
            const evaluation = isRecord(json.evaluation) ? json.evaluation : {};
            const judgeResults = Array.isArray(json.judgeResults)
                ? json.judgeResults.filter((entry): entry is Record<string, unknown> => isRecord(entry))
                : [];

            aggregateResults[taskIndex] = {
                modelProvider: task.option.provider,
                modelLabel: task.option.modelLabel,
                model: task.option.model,
                modelKey: task.option.key,
                modelArmKey: task.modelArmKey,
                modelArmLabel: task.modelArmLabel,
                questionId: task.question.id,
                observationId: task.observationId,
                repeatIndex: task.repeatIndex,
                generationPromptArm: task.promptArm,
                generationPromptId: task.promptId,
                generationPromptName: task.promptName,
                questionText: task.question.question,
                parsedChoice: typeof generation.parsedAnswer === 'string' ? generation.parsedAnswer : 'Unknown',
                groundTruth: task.question.answerLetter,
                isCorrect: typeof evaluation.isCorrect === 'boolean' ? evaluation.isCorrect : false,
                generationParseStatus: typeof generation.parseStatus === 'string' ? generation.parseStatus : 'unknown',
                generationSchemaValid: Boolean(generation.schemaValid),
                generationDegraded: Boolean(generation.degradedControllability),
                generationRawOutput: typeof generation.rawOutput === 'string' ? generation.rawOutput : '',
                generationParsedJson: isRecord(generation.parsedJson) ? generation.parsedJson : null,
                judgeResults,
            };

            completed += 1;
        };

        await Promise.all(
            Array.from({ length: workerCount }, async () => {
                while (true) {
                    if (signal.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }
                    const taskIndex = nextTaskIndex;
                    if (taskIndex >= tasks.length) {
                        return;
                    }
                    nextTaskIndex += 1;
                    await executeTask(tasks[taskIndex], taskIndex);
                }
            })
        );

        const generationCompliantCount = aggregateResults.filter((row) => isRecord(row) && row.generationSchemaValid === true).length;
        const judgeRows = aggregateResults
            .filter((row): row is Record<string, unknown> => isRecord(row))
            .flatMap((row) => (Array.isArray(row.judgeResults) ? row.judgeResults : []))
            .filter((judgeRow): judgeRow is Record<string, unknown> => isRecord(judgeRow));
        const judgeParseSuccessCount = judgeRows.filter((judgeRow) => judgeRow.parseFailed !== true).length;

        const observations: RubricScoreObservation[] = [];
        const modelRubricBuckets = new Map<string, {
            rubricId: string;
            rubricName: string;
            modelKey: string;
            modelLabel: string;
            sum: number;
            n: number;
        }>();
        const strengthCounts = new Map<string, number>();
        const weaknessCounts = new Map<string, number>();

        for (const row of aggregateResults) {
            if (!isRecord(row)) {
                continue;
            }
            const baseModelKey = typeof row.modelKey === 'string' ? row.modelKey : '';
            const modelKey = typeof row.modelArmKey === 'string' && row.modelArmKey.length > 0
                ? row.modelArmKey
                : baseModelKey;
            const modelLabel = typeof row.modelArmLabel === 'string' && row.modelArmLabel.length > 0
                ? row.modelArmLabel
                : (typeof row.modelLabel === 'string' ? row.modelLabel : modelKey);
            const questionId = typeof row.questionId === 'string' ? row.questionId : '';
            const repeatIndex = typeof row.repeatIndex === 'number' && Number.isFinite(row.repeatIndex)
                ? Math.max(1, Math.floor(row.repeatIndex))
                : 1;
            const observationId = typeof row.observationId === 'string' && row.observationId.length > 0
                ? row.observationId
                : `${questionId}::r${repeatIndex}`;
            const judgeResultRows = Array.isArray(row.judgeResults)
                ? row.judgeResults.filter((entry): entry is Record<string, unknown> => isRecord(entry))
                : [];

            for (const judgeRow of judgeResultRows) {
                const rubricId = typeof judgeRow.rubricId === 'string' ? judgeRow.rubricId : '';
                const rubricName = typeof judgeRow.rubricName === 'string' ? judgeRow.rubricName : rubricId;
                const overallScore = typeof judgeRow.overallScore === 'number' ? judgeRow.overallScore : null;

                if (typeof overallScore === 'number' && Number.isFinite(overallScore)) {
                    observations.push({
                        rubricId,
                        rubricName,
                        modelKey,
                        modelLabel,
                        questionId: observationId,
                        score: overallScore,
                    });

                    const key = `${rubricId}::${modelKey}`;
                    if (!modelRubricBuckets.has(key)) {
                        modelRubricBuckets.set(key, {
                            rubricId,
                            rubricName,
                            modelKey,
                            modelLabel,
                            sum: 0,
                            n: 0,
                        });
                    }
                    const bucket = modelRubricBuckets.get(key);
                    if (bucket) {
                        bucket.sum += overallScore;
                        bucket.n += 1;
                    }
                }

                const strengths = Array.isArray(judgeRow.strengths) ? judgeRow.strengths : [];
                const weaknesses = Array.isArray(judgeRow.weaknesses) ? judgeRow.weaknesses : [];
                for (const item of strengths) {
                    const key = String(item).trim();
                    if (!key) {
                        continue;
                    }
                    strengthCounts.set(key, (strengthCounts.get(key) || 0) + 1);
                }
                for (const item of weaknesses) {
                    const key = String(item).trim();
                    if (!key) {
                        continue;
                    }
                    weaknessCounts.set(key, (weaknessCounts.get(key) || 0) + 1);
                }
            }
        }

        const pairwiseByRubric = computeRubricPairwiseComparisons(observations, {
            alpha: rubricJudgeConfig.statAlpha,
            permutations: rubricJudgeConfig.statPermutations,
            bootstrapSamples: rubricJudgeConfig.statBootstrapSamples,
            seed: rubricJudgeConfig.sampleSeed,
        });

        const modelRubricMeans = Array.from(modelRubricBuckets.values())
            .map((bucket) => ({
                rubricId: bucket.rubricId,
                rubricName: bucket.rubricName,
                modelKey: bucket.modelKey,
                modelLabel: bucket.modelLabel,
                n: bucket.n,
                meanScore: bucket.n > 0 ? bucket.sum / bucket.n : 0,
            }))
            .sort((a, b) => a.rubricName.localeCompare(b.rubricName) || a.modelLabel.localeCompare(b.modelLabel));

        const scoreBuckets = new Map<string, number[]>();
        for (const obs of observations) {
            const key = `${obs.rubricId}::${obs.modelKey}`;
            if (!scoreBuckets.has(key)) {
                scoreBuckets.set(key, []);
            }
            scoreBuckets.get(key)?.push(obs.score);
        }

        const rubricLeaderboardMap = new Map<string, {
            rubricId: string;
            rubricName: string;
            rows: Array<{
                modelKey: string;
                modelLabel: string;
                meanScore: number;
                ciLow: number;
                ciHigh: number;
                n: number;
            }>;
        }>();
        for (const entry of modelRubricMeans) {
            const key = `${entry.rubricId}::${entry.rubricName}`;
            const scoreKey = `${entry.rubricId}::${entry.modelKey}`;
            const scores = scoreBuckets.get(scoreKey) || [];
            const ci = bootstrapCiForScores(scores, rubricJudgeConfig.statBootstrapSamples, rubricJudgeConfig.sampleSeed + scores.length + entry.modelKey.length);
            if (!rubricLeaderboardMap.has(key)) {
                rubricLeaderboardMap.set(key, {
                    rubricId: entry.rubricId,
                    rubricName: entry.rubricName,
                    rows: [],
                });
            }
            rubricLeaderboardMap.get(key)?.rows.push({
                modelKey: entry.modelKey,
                modelLabel: entry.modelLabel,
                meanScore: entry.meanScore,
                ciLow: ci.low,
                ciHigh: ci.high,
                n: entry.n,
            });
        }

        const rubricLeaderboards = Array.from(rubricLeaderboardMap.values()).map((bucket) => ({
            rubricId: bucket.rubricId,
            rubricName: bucket.rubricName,
            rows: bucket.rows.sort((a, b) => b.meanScore - a.meanScore || a.modelLabel.localeCompare(b.modelLabel)),
        }));

        const overallMeanJudgeScore = observations.length > 0
            ? observations.reduce((sum, row) => sum + row.score, 0) / observations.length
            : 0;
        const actualObservationCount = questions.length * runsPerQuestion;

        const topStrengths = Array.from(strengthCounts.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
            .slice(0, 12);
        const topWeaknesses = Array.from(weaknessCounts.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
            .slice(0, 12);

        setResults(aggregateResults);
        setSummary({
            dataset: 'single_probe_multi_model_rubric_judge',
            totalCalls: aggregateResults.length,
            questionCount: questions.length,
            runsPerQuestion,
            generationPromptCount: promptVariants.length,
            effectiveObservationCount: actualObservationCount,
            modelCount: selectedOptions.length,
            generationJsonComplianceRate: aggregateResults.length > 0 ? generationCompliantCount / aggregateResults.length : 0,
            judgeJsonComplianceRate: judgeRows.length > 0 ? judgeParseSuccessCount / judgeRows.length : 0,
            meanJudgeScore: overallMeanJudgeScore,
            scoredJudgeCount: observations.length,
            statValidationEnabled: rubricJudgeConfig.statValidationEnabled,
            requiredQuestionCount: rubricJudgeConfig.statValidationEnabled ? requiredQuestionCountForPower : questions.length,
            requiredObservationCount: rubricJudgeConfig.statValidationEnabled ? requiredObservationCount : actualObservationCount,
            actualQuestionCount: questions.length,
            actualObservationCount,
            underpowered: rubricJudgeConfig.statValidationEnabled && actualObservationCount < requiredObservationCount,
            modelRubricMeans,
            rubricLeaderboards,
            pairwiseByRubric,
            topStrengths,
            topWeaknesses,
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
        } else if (benchmarkMode === 'single_probe_multi_model_rubric_judge') {
            if (!rubricJudgeRunValidation.canRun) {
                alert(rubricJudgeRunValidation.reason || 'Cannot run rubric-first multi-model judge test with current inputs.');
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
            } else if (benchmarkMode === 'single_probe_multi_model_rubric_judge') {
                await runRubricJudgeMultiModelProbe(abortController.signal);
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
        if (benchmarkMode === 'single_probe_multi_model_rubric_judge') {
            setRubricJudgeConfig((previous) => ({
                ...previous,
                selectedGenerationPromptId: created.id,
                selectedGenerationPromptIds: previous.selectedGenerationPromptIds.includes(created.id)
                    ? previous.selectedGenerationPromptIds
                    : [...previous.selectedGenerationPromptIds, created.id],
            }));
        } else {
            setSingleProbeConfig((previous) => ({ ...previous, selectedPromptId: created.id }));
        }
        setPromptStatus('Prompt saved.');
    };

    const createNewPromptDraft = () => {
        if (benchmarkMode === 'single_probe_multi_model_rubric_judge') {
            setRubricJudgeConfig((previous) => ({ ...previous, selectedGenerationPromptId: '' }));
        } else {
            setSingleProbeConfig((previous) => ({ ...previous, selectedPromptId: '' }));
        }
        setPromptNameDraft('');
        setPromptContentDraft('');
        setPromptStatus('Started a new prompt draft.');
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
        setRubricJudgeConfig((previous) => ({
            ...previous,
            selectedGenerationPromptId: previous.selectedGenerationPromptId === selectedPrompt.id ? '' : previous.selectedGenerationPromptId,
            selectedGenerationPromptIds: previous.selectedGenerationPromptIds.filter((id) => id !== selectedPrompt.id),
        }));
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

    const saveJudgeRubricTemplate = () => {
        const content = judgeRubricContentDraft.trim();
        if (!content) {
            setJudgeRubricStatus('Judge rubric content is required.');
            return;
        }

        const name = judgeRubricNameDraft.trim() || 'Untitled judge rubric';
        if (selectedJudgeRubricTemplate) {
            if (isBuiltinJudgeRubricTemplateId(selectedJudgeRubricTemplate.id)) {
                setJudgeRubricStatus('Built-in judge rubric templates cannot be overwritten.');
                return;
            }

            setJudgeRubricLibrary((previous) => previous.map((rubric) => (
                rubric.id === selectedJudgeRubricTemplate.id
                    ? { ...rubric, name, content, updatedAt: new Date().toISOString() }
                    : rubric
            )));
            setJudgeRubricStatus('Judge rubric updated.');
            return;
        }

        const created = createJudgeRubricTemplate(name, content);
        setJudgeRubricLibrary((previous) => [created, ...previous]);
        setSelectedJudgeRubricTemplateId(created.id);
        setJudgeRubricStatus('Judge rubric saved.');
    };

    const createNewJudgeRubricDraft = () => {
        setSelectedJudgeRubricTemplateId('');
        setJudgeRubricNameDraft('');
        setJudgeRubricContentDraft('');
        setJudgeRubricStatus('Started a new judge rubric draft.');
    };

    const deleteSelectedJudgeRubric = () => {
        if (!selectedJudgeRubricTemplate) {
            setJudgeRubricStatus('Select a judge rubric to delete.');
            return;
        }
        if (isBuiltinJudgeRubricTemplateId(selectedJudgeRubricTemplate.id)) {
            setJudgeRubricStatus('Built-in judge rubric templates cannot be deleted.');
            return;
        }

        setJudgeRubricLibrary((previous) => previous.filter((rubric) => rubric.id !== selectedJudgeRubricTemplate.id));
        setRubricJudgeConfig((previous) => ({
            ...previous,
            selectedJudgeRubricIds: previous.selectedJudgeRubricIds.filter((id) => id !== selectedJudgeRubricTemplate.id),
        }));
        setSelectedJudgeRubricTemplateId('');
        setJudgeRubricNameDraft('');
        setJudgeRubricContentDraft('');
        setJudgeRubricStatus('Judge rubric deleted.');
    };

    const importJudgeRubricLibrary = (raw: string) => {
        const parsed = parseJudgeRubricLibraryImport(raw);
        if (parsed.error) {
            setJudgeRubricStatus(parsed.error);
            return;
        }
        setJudgeRubricLibrary((previous) => mergeJudgeRubricLibraries(previous, parsed.rubrics));
        setJudgeRubricStatus(`Imported ${parsed.rubrics.length} judge rubric${parsed.rubrics.length === 1 ? '' : 's'}.`);
    };

    const exportJudgeRubricLibrary = () => {
        if (judgeRubricLibrary.length === 0) {
            setJudgeRubricStatus('No judge rubrics to export.');
            return;
        }

        const blob = new Blob([judgeRubricLibraryToJson(judgeRubricLibrary)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `judge-rubric-library-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setJudgeRubricStatus('Judge rubric library exported.');
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
            rubricJudgeConfig,
            selectedMultiModelKeys,
            multiModelRunsPerArm,
            editableQuestion,
            selectedPrompt,
            selectedGenerationPrompts,
            selectedJudgeRubrics,
        });

        const runTitle = buildSavedRunTitle(
            benchmarkMode,
            mainConfig,
            forcedConfig,
            singleProbeConfig,
            rubricJudgeConfig,
            multiModelRunsPerArm,
            selectedJudgeRubrics.length,
        );

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
                                actions={<InfoTip label="Use the left benchmark selector to switch between main benchmarking, forced-test benchmarking, single-question probing, multi-model single-question A/B, and rubric-first multi-model judging." />}
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
                                onCreateNewPrompt={createNewPromptDraft}
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
                        ) : benchmarkMode === 'single_probe_multi_model_rubric_judge' ? (
                            <RubricJudgeProbePanel
                                config={rubricJudgeConfig}
                                setConfig={setRubricJudgeConfig}
                                availableQuestions={singleDatasetRows}
                                selectedDatasetQuestionId={singleProbeConfig.selectedDatasetQuestionId}
                                onSelectDatasetQuestionId={(id) => setSingleProbeConfig((prev) => ({ ...prev, selectedDatasetQuestionId: id }))}
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
                                onCreateNewPrompt={createNewPromptDraft}
                                onDeletePrompt={deleteSelectedPrompt}
                                onExportPrompts={exportPromptLibrary}
                                onImportPrompts={importPromptLibrary}
                                judgeRubrics={judgeRubricLibrary}
                                selectedJudgeRubricTemplateId={selectedJudgeRubricTemplateId}
                                onSelectJudgeRubricTemplateId={setSelectedJudgeRubricTemplateId}
                                selectedJudgeRubricTemplate={selectedJudgeRubricTemplate}
                                judgeRubricNameDraft={judgeRubricNameDraft}
                                setJudgeRubricNameDraft={setJudgeRubricNameDraft}
                                judgeRubricContentDraft={judgeRubricContentDraft}
                                setJudgeRubricContentDraft={setJudgeRubricContentDraft}
                                judgeRubricStatus={judgeRubricStatus}
                                onSaveJudgeRubric={saveJudgeRubricTemplate}
                                onCreateNewJudgeRubric={createNewJudgeRubricDraft}
                                onDeleteJudgeRubric={deleteSelectedJudgeRubric}
                                onExportJudgeRubrics={exportJudgeRubricLibrary}
                                onImportJudgeRubrics={importJudgeRubricLibrary}
                                multiModelOptions={multiModelOptions}
                                selectedMultiModelKeys={selectedMultiModelKeys}
                                onToggleMultiModel={toggleMultiModelSelection}
                                onSelectAllMultiModels={selectAllMultiModels}
                                onClearAllMultiModels={clearAllMultiModels}
                                onRun={runExperiment}
                                isRunning={isRunning}
                                canRun={rubricJudgeRunValidation.canRun}
                                runDisabledReason={rubricJudgeRunValidation.reason}
                            />
                        ) : (
                            <SingleQuestionProbePanel
                                config={singleProbeConfig}
                                setConfig={setSingleProbeConfig}
                                availableQuestions={singleDatasetRows}
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
                                onCreateNewPrompt={createNewPromptDraft}
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
                            ) : benchmarkMode === 'single_probe_multi_model_rubric_judge' ? (
                                isRunning ? (
                                    <LoadingRunState status={runStatusText} />
                                ) : summary ? (
                                    <RubricJudgeProbeResults summary={summary} results={results} />
                                ) : (
                                    <EmptyState
                                        title="No rubric-first results yet"
                                        description="Run the rubric-first multi-model judge benchmark to view rubric strengths, weaknesses, and significance."
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
    if (mode === 'single_probe_multi_model_rubric_judge') {
        return 'Run all selected models with one or more generation prompts and evaluate outputs with multi-select judge rubrics plus significance testing.';
    }
    return 'Probe any single question with optional custom prompt templates and save runs for cross-run comparison.';
}

function buildSavedRunConfigSnapshot({
    benchmarkMode,
    mainConfig,
    forcedConfig,
    singleProbeConfig,
    rubricJudgeConfig,
    selectedMultiModelKeys,
    multiModelRunsPerArm,
    editableQuestion,
    selectedPrompt,
    selectedGenerationPrompts,
    selectedJudgeRubrics,
}: {
    benchmarkMode: BenchmarkMode;
    mainConfig: MainExperimentConfig;
    forcedConfig: ForcedExperimentConfig;
    singleProbeConfig: SingleProbeConfig;
    rubricJudgeConfig: RubricJudgeProbeConfig;
    selectedMultiModelKeys: string[];
    multiModelRunsPerArm: number;
    editableQuestion: EditableSingleQuestion;
    selectedPrompt: PromptTemplate | null;
    selectedGenerationPrompts: PromptTemplate[];
    selectedJudgeRubrics: JudgeRubricTemplate[];
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
    if (benchmarkMode === 'single_probe_multi_model_rubric_judge') {
        return {
            mode: 'single_probe_multi_model_rubric_judge',
            ...rubricJudgeConfig,
            selectedModels: selectedMultiModelKeys,
            question: editableQuestion,
            generationPrompts: selectedGenerationPrompts.map((prompt) => ({ id: prompt.id, name: prompt.name })),
            judgeRubrics: selectedJudgeRubrics.map((rubric) => ({ id: rubric.id, name: rubric.name })),
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
    rubricJudgeConfig: RubricJudgeProbeConfig,
    multiModelRunsPerArm: number,
    selectedJudgeRubricCount: number,
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
    if (benchmarkMode === 'single_probe_multi_model_rubric_judge') {
        const scope = rubricJudgeConfig.runScope === 'dataset' ? 'dataset' : 'single';
        const promptCount = Math.max(1, rubricJudgeConfig.selectedGenerationPromptIds.length);
        return `Rubric-first multi-model (${scope}, ${promptCount} prompt${promptCount === 1 ? '' : 's'}, x${rubricJudgeConfig.runsPerQuestion}/q, ${selectedJudgeRubricCount} rubric${selectedJudgeRubricCount === 1 ? '' : 's'})`;
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

function sampleDatasetQuestionsForRubricRun(
    questions: DatasetQuestion[],
    limit: number,
    strategy: 'random' | 'stratified',
    seed: number,
) {
    const safeLimit = Math.max(1, Math.min(limit, questions.length));
    if (safeLimit <= 0) {
        return [] as EditableSingleQuestion[];
    }

    const sorted = [...questions].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const chosen = strategy === 'stratified'
        ? selectStratifiedDatasetQuestions(sorted, safeLimit)
        : deterministicShuffle(sorted, seed).slice(0, safeLimit);

    return chosen
        .map((question) => toEditableQuestion(question))
        .filter((item): item is EditableSingleQuestion => item !== null);
}

function selectStratifiedDatasetQuestions(questions: DatasetQuestion[], limit: number) {
    const groups = new Map<string, DatasetQuestion[]>();
    for (const question of questions) {
        const key = question.subfield || 'Unknown';
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)?.push(question);
    }

    const keys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
        groups.get(key)?.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    const selected: DatasetQuestion[] = [];
    const indices = new Map<string, number>(keys.map((key) => [key, 0]));
    while (selected.length < limit) {
        let pickedAny = false;
        for (const key of keys) {
            if (selected.length >= limit) {
                break;
            }
            const group = groups.get(key) || [];
            const index = indices.get(key) || 0;
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

function toEditableQuestion(question: DatasetQuestion): EditableSingleQuestion | null {
    const normalizedChoices = question.choices
        .map((choice) => choice.trim())
        .filter((choice) => choice.length > 0)
        .slice(0, 10);
    if (normalizedChoices.length < 2) {
        return null;
    }

    const validLetters = getChoiceLetters(normalizedChoices.length);
    const incoming = typeof question.answer_letter === 'string' ? question.answer_letter.trim().toUpperCase() : '';
    const answerLetter = validLetters.includes(incoming) ? incoming : validLetters[0];

    return {
        id: question.id,
        question: question.question,
        choices: normalizedChoices,
        answerLetter,
        subfield: question.subfield,
        difficulty: question.difficulty,
    };
}

function bootstrapCiForScores(scores: number[], samples: number, seed: number) {
    if (scores.length === 0) {
        return { low: 0, high: 0 };
    }

    const sampleCount = Math.max(200, Math.floor(samples));
    const means: number[] = new Array(sampleCount);
    let state = normalizeSeed(seed);

    for (let i = 0; i < sampleCount; i += 1) {
        let sum = 0;
        for (let j = 0; j < scores.length; j += 1) {
            state = nextSeed(state);
            const idx = state % scores.length;
            sum += scores[idx];
        }
        means[i] = sum / scores.length;
    }

    means.sort((a, b) => a - b);
    const lowIndex = Math.max(0, Math.floor(0.025 * sampleCount));
    const highIndex = Math.min(sampleCount - 1, Math.ceil(0.975 * sampleCount) - 1);
    return {
        low: means[lowIndex],
        high: means[highIndex],
    };
}

function isAbortError(error: unknown) {
    return (
        (error instanceof DOMException && error.name === 'AbortError')
        || (typeof error === 'object' && error !== null && 'name' in error && String((error as { name?: unknown }).name) === 'AbortError')
    );
}

function readGeneralBenchmarkUiStateFromStorage(): GeneralBenchmarkUiState | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(GENERAL_UI_STATE_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) {
            return null;
        }

        if (!isBenchmarkMode(parsed.benchmarkMode)) {
            return null;
        }
        if (typeof parsed.isSidebarCollapsed !== 'boolean') {
            return null;
        }
        if (!isRecord(parsed.mainConfig) || !isMainConfig(parsed.mainConfig as HistoryConfig)) {
            return null;
        }
        if (!isRecord(parsed.forcedConfig) || !isForcedConfig(parsed.forcedConfig as HistoryConfig)) {
            return null;
        }
        if (!isSingleProbeConfig(parsed.singleProbeConfig)) {
            return null;
        }
        const normalizedRubricJudgeConfig = normalizeRubricJudgeProbeConfig(parsed.rubricJudgeConfig);
        if (!normalizedRubricJudgeConfig) {
            return null;
        }
        if (!Array.isArray(parsed.selectedMultiModelKeys) || !parsed.selectedMultiModelKeys.every((key) => typeof key === 'string')) {
            return null;
        }
        const runsPerArm = parsed.multiModelRunsPerArm;
        if (typeof runsPerArm !== 'number' || !Number.isInteger(runsPerArm) || runsPerArm < 1 || runsPerArm > 20) {
            return null;
        }
        if (!isEditableSingleQuestion(parsed.editableQuestion)) {
            return null;
        }
        if (
            typeof parsed.promptNameDraft !== 'string'
            || typeof parsed.promptContentDraft !== 'string'
            || typeof parsed.selectedJudgeRubricTemplateId !== 'string'
            || typeof parsed.judgeRubricNameDraft !== 'string'
            || typeof parsed.judgeRubricContentDraft !== 'string'
        ) {
            return null;
        }

        return {
            benchmarkMode: parsed.benchmarkMode,
            isSidebarCollapsed: parsed.isSidebarCollapsed,
            mainConfig: parsed.mainConfig as MainExperimentConfig,
            forcedConfig: parsed.forcedConfig as ForcedExperimentConfig,
            singleProbeConfig: parsed.singleProbeConfig,
            rubricJudgeConfig: normalizedRubricJudgeConfig,
            selectedMultiModelKeys: parsed.selectedMultiModelKeys,
            multiModelRunsPerArm: runsPerArm,
            editableQuestion: parsed.editableQuestion,
            promptNameDraft: parsed.promptNameDraft,
            promptContentDraft: parsed.promptContentDraft,
            selectedJudgeRubricTemplateId: parsed.selectedJudgeRubricTemplateId,
            judgeRubricNameDraft: parsed.judgeRubricNameDraft,
            judgeRubricContentDraft: parsed.judgeRubricContentDraft,
        };
    } catch (error) {
        console.error('Failed to read general benchmarking UI state:', error);
        return null;
    }
}

function writeGeneralBenchmarkUiStateToStorage(state: GeneralBenchmarkUiState) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(GENERAL_UI_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Failed to persist general benchmarking UI state:', error);
    }
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

    if (!id || !savedAt || !title || (
        mode !== 'main'
        && mode !== 'forced_tests'
        && mode !== 'single_probe'
        && mode !== 'single_probe_multi_model'
        && mode !== 'single_probe_multi_model_rubric_judge'
    )) {
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

function isBenchmarkMode(value: unknown): value is BenchmarkMode {
    return value === 'main'
        || value === 'forced_tests'
        || value === 'single_probe'
        || value === 'single_probe_multi_model'
        || value === 'single_probe_multi_model_rubric_judge';
}

function isSingleProbeConfig(value: unknown): value is SingleProbeConfig {
    if (!isRecord(value)) {
        return false;
    }

    const providerValid = value.provider === 'openai' || value.provider === 'anthropic' || value.provider === 'gemini';
    const reasoningValid = value.reasoningEffort === 'none'
        || value.reasoningEffort === 'low'
        || value.reasoningEffort === 'medium'
        || value.reasoningEffort === 'high'
        || value.reasoningEffort === 'xhigh';

    return (
        providerValid
        && typeof value.model === 'string'
        && reasoningValid
        && typeof value.temperature === 'number'
        && Number.isFinite(value.temperature)
        && typeof value.subjectFilter === 'string'
        && typeof value.difficultyFilter === 'string'
        && typeof value.selectedDatasetQuestionId === 'string'
        && typeof value.useCustomPrompt === 'boolean'
        && typeof value.selectedPromptId === 'string'
    );
}

function isRubricJudgeProbeConfig(value: unknown): value is RubricJudgeProbeConfig {
    if (!isRecord(value)) {
        return false;
    }

    const runScopeValid = value.runScope === 'single' || value.runScope === 'dataset';
    const strictnessValid = value.strictnessMode === 'strict' || value.strictnessMode === 'best_effort';
    const providerValid = value.judgeProvider === 'openai' || value.judgeProvider === 'anthropic' || value.judgeProvider === 'gemini';
    const reasoningValid = value.judgeReasoningEffort === 'none'
        || value.judgeReasoningEffort === 'low'
        || value.judgeReasoningEffort === 'medium'
        || value.judgeReasoningEffort === 'high'
        || value.judgeReasoningEffort === 'xhigh';

    return (
        runScopeValid
        && strictnessValid
        && providerValid
        && reasoningValid
        && typeof value.selectedGenerationPromptId === 'string'
        && Array.isArray(value.selectedGenerationPromptIds)
        && value.selectedGenerationPromptIds.every((id) => typeof id === 'string')
        && Array.isArray(value.selectedJudgeRubricIds)
        && value.selectedJudgeRubricIds.every((id) => typeof id === 'string')
        && typeof value.runsPerQuestion === 'number'
        && Number.isFinite(value.runsPerQuestion)
        && typeof value.judgeModel === 'string'
        && (value.datasetSampleStrategy === 'random' || value.datasetSampleStrategy === 'stratified')
        && typeof value.datasetSampleSize === 'number'
        && Number.isFinite(value.datasetSampleSize)
        && typeof value.sampleSeed === 'number'
        && Number.isFinite(value.sampleSeed)
        && typeof value.statValidationEnabled === 'boolean'
        && typeof value.statAlpha === 'number'
        && Number.isFinite(value.statAlpha)
        && typeof value.statPower === 'number'
        && Number.isFinite(value.statPower)
        && typeof value.statMinEffectSizeDz === 'number'
        && Number.isFinite(value.statMinEffectSizeDz)
        && typeof value.statMaxQuestions === 'number'
        && Number.isFinite(value.statMaxQuestions)
        && typeof value.statPermutations === 'number'
        && Number.isFinite(value.statPermutations)
        && typeof value.statBootstrapSamples === 'number'
        && Number.isFinite(value.statBootstrapSamples)
        && typeof value.generationRepairRetries === 'number'
        && Number.isFinite(value.generationRepairRetries)
    );
}

function normalizeRubricJudgeProbeConfig(value: unknown): RubricJudgeProbeConfig | null {
    if (!isRecord(value)) {
        return null;
    }

    const candidate = {
        ...value,
        runsPerQuestion: typeof value.runsPerQuestion === 'number' ? value.runsPerQuestion : 1,
        selectedGenerationPromptIds: Array.isArray(value.selectedGenerationPromptIds)
            ? value.selectedGenerationPromptIds.filter((id): id is string => typeof id === 'string')
            : [
                ...(typeof value.selectedGenerationPromptId === 'string' && value.selectedGenerationPromptId.length > 0
                    ? [value.selectedGenerationPromptId]
                    : []),
                ...(typeof value.selectedGenerationPromptIdB === 'string' && value.selectedGenerationPromptIdB.length > 0
                    ? [value.selectedGenerationPromptIdB]
                    : []),
            ],
    };
    if (!isRubricJudgeProbeConfig(candidate)) {
        return null;
    }
    const uniquePromptIds = Array.from(new Set(candidate.selectedGenerationPromptIds));
    return {
        ...candidate,
        runsPerQuestion: Math.min(20, Math.max(1, Math.floor(candidate.runsPerQuestion))),
        selectedGenerationPromptIds: uniquePromptIds,
    };
}

function isEditableSingleQuestion(value: unknown): value is EditableSingleQuestion {
    if (!isRecord(value)) {
        return false;
    }

    if (typeof value.id !== 'string' || typeof value.question !== 'string' || typeof value.answerLetter !== 'string') {
        return false;
    }
    if (!Array.isArray(value.choices) || value.choices.length < 1 || value.choices.length > 10) {
        return false;
    }
    if (!value.choices.every((choice) => typeof choice === 'string')) {
        return false;
    }
    if (!/^[A-J]$/.test(value.answerLetter.toUpperCase())) {
        return false;
    }

    return true;
}

function getChoiceLetters(choiceCount: number) {
    const safeCount = Math.min(Math.max(choiceCount, 1), 10);
    return Array.from({ length: safeCount }, (_, index) => String.fromCharCode(65 + index));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
