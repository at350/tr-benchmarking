'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfigPanel as ForcedConfigPanel, ExperimentConfig as ForcedExperimentConfig } from '@/components/ConfigPanel';
import { ConfigPanel as MainConfigPanel, ExperimentConfig as MainExperimentConfig } from '@/components/ConfigPanelMain';
import { ResultsDashboard as ForcedResultsDashboard } from '@/components/ResultsDashboard';
import { ResultsDashboard as MainResultsDashboard } from '@/components/ResultsDashboardMain';

type SuiteMode = 'main' | 'forced_tests';

type DatasetRow = {
    id: string;
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
    results: any[];
    summary: any;
};

const RUN_HISTORY_STORAGE_KEY = 'benchmarkdemo.runHistory.v1';
const MAX_RUN_HISTORY_ENTRIES = 20;

export default function Home() {
    const [suiteMode, setSuiteMode] = useState<SuiteMode>('forced_tests');
    const [subjects, setSubjects] = useState<string[]>([]);
    const [datasetRows, setDatasetRows] = useState<DatasetRow[]>([]);

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

    const [isRunning, setIsRunning] = useState(false);
    const [runStatusText, setRunStatusText] = useState('Preparing experiment...');
    const [results, setResults] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const runAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setRunHistory(readRunHistoryFromStorage());
    }, []);

    useEffect(() => {
        async function loadData() {
            try {
                const endpoint = suiteMode === 'main'
                    ? `/api/dataset-main?dataset=${mainConfig.dataset}`
                    : '/api/dataset';
                const res = await fetch(endpoint);
                const json = (await res.json()) as { data?: DatasetRow[] };

                if (!json.data) {
                    setSubjects([]);
                    setDatasetRows([]);
                    return;
                }

                setDatasetRows(json.data);

                const uniqueSubjects = suiteMode === 'main' && mainConfig.dataset === 'prbench'
                    ? Array.from(new Set(json.data.map((d) => d.topic || d.field).filter((value): value is string => Boolean(value)))).sort()
                    : Array.from(new Set(json.data.map((d) => d.subfield || d.discipline).filter((value): value is string => Boolean(value)))).sort();
                setSubjects(uniqueSubjects);
            } catch (error) {
                console.error('Failed to load dataset', error);
                setSubjects([]);
                setDatasetRows([]);
            }
        }

        loadData();
    }, [suiteMode, mainConfig.dataset]);

    const currentSelectionPreview = useMemo<SelectionPreview>(() => {
        if (suiteMode === 'main') {
            return buildMainSelectionPreview(datasetRows, mainConfig);
        }
        return buildForcedSelectionPreview(datasetRows, forcedConfig);
    }, [suiteMode, datasetRows, mainConfig, forcedConfig]);

    const canRunCurrentSelection = currentSelectionPreview.selectedCount > 0 && currentSelectionPreview.missingIds.length === 0;
    const runDisabledReason = currentSelectionPreview.missingIds.length > 0
        ? `Unknown IDs: ${currentSelectionPreview.missingIds.slice(0, 3).join(', ')}${currentSelectionPreview.missingIds.length > 3 ? '...' : ''}`
        : currentSelectionPreview.selectedCount === 0
            ? 'No questions/items selected for this run.'
            : undefined;

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

        setSuiteMode(entry.suiteMode);
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

        const json = (await res.json()) as { results?: any[]; summary?: any };
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

        const json = (await res.json()) as { results?: any[]; summary?: any };
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

    const runExperiment = async () => {
        if (isRunning) {
            return;
        }
        if (!canRunCurrentSelection) {
            alert(runDisabledReason || 'Cannot run with the current selection.');
            return;
        }

        const currentSuiteMode = suiteMode;
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
            if (currentSuiteMode === 'main') {
                await runMainExperiment(abortController.signal, mainConfigSnapshot);
            } else {
                await runForcedExperiment(abortController.signal, forcedConfigSnapshot);
            }
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }
            console.error(error);
            alert('Experiment failed. Check console.');
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

    const handleSuiteChange = (nextMode: SuiteMode) => {
        setSuiteMode(nextMode);
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

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col font-sans text-slate-900">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
                            BenchmarkDemo <span className="font-light text-gray-400">AI Evaluator</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="md:hidden">
                            <select
                                className="text-xs border border-gray-200 rounded-md p-1 bg-white text-gray-700"
                                value={suiteMode}
                                onChange={(e) => handleSuiteChange(e.target.value as SuiteMode)}
                            >
                                <option value="main">Main Branch</option>
                                <option value="forced_tests">Forced Tests</option>
                            </select>
                        </div>
                        <div className="hidden md:flex items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Suite</span>
                            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                                <button
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${suiteMode === 'main' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                                    onClick={() => handleSuiteChange('main')}
                                >
                                    Main Branch
                                </button>
                                <button
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${suiteMode === 'forced_tests' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                                    onClick={() => handleSuiteChange('forced_tests')}
                                >
                                    Forced Tests
                                </button>
                            </div>
                        </div>
                        <div className="text-xs font-mono text-gray-400">
                            v0.1.0-sprint1
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 max-w-[1600px] mx-auto w-full p-6 grid grid-cols-12 gap-8">
                <div className="col-span-12 lg:col-span-3">
                    {suiteMode === 'main' ? (
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
                    ) : (
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
                    )}
                </div>

                <div className="col-span-12 lg:col-span-9 flex flex-col gap-6">
                    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600">Run History</h2>
                                <p className="text-xs text-gray-500 mt-1">Saved in this browser. Click any run to load those results.</p>
                            </div>
                            {runHistory.length > 0 && (
                                <button
                                    type="button"
                                    onClick={clearRunHistory}
                                    disabled={isRunning}
                                    className="text-xs font-semibold text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Clear History
                                </button>
                            )}
                        </div>

                        {runHistory.length === 0 ? (
                            <p className="text-sm text-gray-400 mt-4">No runs saved yet.</p>
                        ) : (
                            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
                                {runHistory.map((entry) => {
                                    const isActive = activeRunId === entry.id;
                                    return (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            onClick={() => loadRunFromHistory(entry)}
                                            disabled={isRunning}
                                            className={`w-full text-left rounded-lg border p-3 transition-colors ${isActive ? 'border-blue-300 bg-blue-50/70' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                                                    {entry.suiteMode === 'main' ? 'Main Branch' : 'Forced Tests'}
                                                </span>
                                                <span className="text-xs text-gray-500">{formatHistoryTimestamp(entry.createdAt)}</span>
                                            </div>
                                            <p className="text-sm font-semibold text-gray-800 mt-1">{buildHistoryTitle(entry)}</p>
                                            <p className="text-xs text-gray-500 mt-1">{buildHistorySubtitle(entry)}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {suiteMode === 'main' ? (
                        isRunning ? (
                            <div className="h-full flex flex-col items-center justify-center p-10 border border-blue-100 rounded-xl bg-gradient-to-br from-blue-50/60 to-indigo-50/60">
                                <div className="h-12 w-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                <p className="text-xl font-semibold text-gray-800 mt-5">Running Experiment</p>
                                <p className="text-sm text-gray-500 mt-2">{runStatusText}</p>
                            </div>
                        ) : (
                            <MainResultsDashboard results={results} summary={summary} />
                        )
                    ) : (
                        <ForcedResultsDashboard
                            results={results}
                            summary={summary}
                            isLoading={isRunning}
                            loadingStatus={runStatusText}
                        />
                    )}
                </div>
            </div>
        </main>
    );
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
        groups.get(key)!.push(question);
    }

    const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    for (const key of sortedGroupKeys) {
        groups.get(key)!.sort((a, b) => String(a.id).localeCompare(String(b.id)));
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

function isMainConfig(config: HistoryConfig): config is MainExperimentConfig {
    return 'dataset' in config && 'judgeModel' in config;
}

function isForcedConfig(config: HistoryConfig): config is ForcedExperimentConfig {
    return 'evaluationMode' in config && 'benchmarkProfile' in config && 'controlled' in config;
}

function buildHistoryTitle(entry: RunHistoryEntry) {
    if (isMainConfig(entry.config)) {
        return `${entry.config.dataset.toUpperCase()} • ${entry.config.model}`;
    }
    if (isForcedConfig(entry.config)) {
        if (entry.config.compareModel) {
            return `${entry.config.model} vs ${entry.config.compareModel}`;
        }
        return entry.config.model;
    }
    return `${entry.suiteMode === 'main' ? 'Main Branch' : 'Forced Tests'} Run`;
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
