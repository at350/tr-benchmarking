'use client';

import { Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BenchmarkSidebar, BenchmarkMode } from '@/components/benchmarking/BenchmarkSidebar';
import { SavedRunComparisonPanel } from '@/components/benchmarking/SavedRunComparisonPanel';
import { DatasetQuestion, EditableSingleQuestion, SingleProbeConfig, SingleQuestionProbePanel } from '@/components/benchmarking/SingleQuestionProbePanel';
import { ConfigPanel as ForcedConfigPanel, ExperimentConfig as ForcedExperimentConfig } from '@/components/ConfigPanel';
import { ConfigPanel as MainConfigPanel, ExperimentConfig as MainExperimentConfig } from '@/components/ConfigPanelMain';
import { ResultsDashboard as ForcedResultsDashboard } from '@/components/ResultsDashboard';
import { ResultsDashboard as MainResultsDashboard } from '@/components/ResultsDashboardMain';
import { AppShell } from '@/components/ui/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoTip } from '@/components/ui/InfoTip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getDefaultModelForProvider } from '@/lib/model-options';
import {
    createPromptTemplate,
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
            if (benchmarkMode === 'single_probe') {
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

    const runSingleProbe = async (signal: AbortSignal) => {
        setRunStatusText('Running single question probe...');

        const response = await fetch('/api/benchmark-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
                provider: singleProbeConfig.provider,
                model: singleProbeConfig.model,
                temperature: singleProbeConfig.temperature,
                reasoningEffort: singleProbeConfig.reasoningEffort,
                useCustomPrompt: singleProbeConfig.useCustomPrompt,
                customPrompt: selectedPrompt?.content || '',
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

        if (json.results && json.summary) {
            setResults(json.results);
            setSummary(json.summary);
        }
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

    const loadDatasetQuestionIntoEditor = () => {
        if (!singleProbeConfig.selectedDatasetQuestionId) {
            return;
        }

        const selected = singleDatasetRows.find((row) => row.id === singleProbeConfig.selectedDatasetQuestionId);
        if (!selected) {
            setPromptStatus('Selected dataset question was not found.');
            return;
        }

        const normalizedChoices = selected.choices.length >= 4
            ? selected.choices.slice(0, 4)
            : [...selected.choices, ...Array.from({ length: 4 - selected.choices.length }, () => '')];

        const answerLetter = typeof selected.answer_letter === 'string' && selected.answer_letter.trim().length > 0
            ? selected.answer_letter.trim().toUpperCase()
            : 'A';

        setEditableQuestion({
            id: selected.id,
            question: selected.question,
            choices: normalizedChoices,
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
            editableQuestion,
            selectedPrompt,
        });

        const runTitle = buildSavedRunTitle(benchmarkMode, mainConfig, forcedConfig, singleProbeConfig);

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
                                actions={<InfoTip label="Use the left benchmark selector to switch between main dataset benchmarking, forced-test benchmarking, and the new single-question probe flow." />}
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
    return 'Probe any single question with optional custom prompt templates and save runs for cross-run comparison.';
}

function buildSavedRunConfigSnapshot({
    benchmarkMode,
    mainConfig,
    forcedConfig,
    singleProbeConfig,
    editableQuestion,
    selectedPrompt,
}: {
    benchmarkMode: BenchmarkMode;
    mainConfig: MainExperimentConfig;
    forcedConfig: ForcedExperimentConfig;
    singleProbeConfig: SingleProbeConfig;
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
) {
    if (benchmarkMode === 'main') {
        return `${mainConfig.dataset.toUpperCase()} - ${mainConfig.model}`;
    }
    if (benchmarkMode === 'forced_tests') {
        return forcedConfig.compareModel
            ? `${forcedConfig.model} vs ${forcedConfig.compareModel}`
            : `${forcedConfig.model} (forced)`;
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

    if (!id || !savedAt || !title || (mode !== 'main' && mode !== 'forced_tests' && mode !== 'single_probe')) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
