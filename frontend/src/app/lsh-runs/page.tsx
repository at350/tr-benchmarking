'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LshRunSummary = {
    fileName: string;
    runId: string;
    timestamp: string | null;
    modifiedAt: string;
    method: string;
    schema: string;
    totalItems: number;
    numClusters: number;
    largestClusterSize: number;
};

type ModelBreakdownEntry = {
    model: string;
    count: number;
};

type LshClusterSummary = {
    id: string;
    size: number;
    representative: {
        id: string;
        model: string;
        textPreview: string;
    };
    modelBreakdown: ModelBreakdownEntry[];
    membersPreview?: Array<{
        id: string;
        model: string;
        textPreview: string;
    }>;
};

type LshRunDetails = {
    fileName: string;
    runId: string;
    timestamp: string | null;
    modifiedAt: string;
    schema: string;
    metadata: Record<string, unknown>;
    totalClusters: number;
    totalMembers: number;
    clusters: LshClusterSummary[];
};

type ClusterMapPoint = {
    x: number;
    y: number;
    model: string;
    clusterId: string;
};

type ClusterMapRegion = {
    clusterId: string;
    centerX: number;
    centerY: number;
    radius: number;
    visibleMembers: number;
    totalMembers: number;
    dominantModel: string;
    note: string;
};

type AxisDomain = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

type ClusterSeed = {
    clusterId: string;
    radius: number;
    visibleMembers: number;
    totalMembers: number;
    dominantModel: string;
    note: string;
    visibleBreakdown: ModelBreakdownEntry[];
};

type ModelStat = {
    model: string;
    count: number;
};

type JudgeProvider = 'openai' | 'anthropic' | 'gemini';
type JudgeReasoningEffort = 'auto' | 'low' | 'medium' | 'high';
type JudgeCap = 'none' | 'cap_60' | 'cap_70';

type JudgeConfig = {
    provider: JudgeProvider;
    model: string;
    reasoningEffort: JudgeReasoningEffort;
    customInstructions: string;
};

type ClusterJudgeResult = {
    outcomes: {
        bottomLineOutcome: string;
        outcomeCorrectness: string;
        reasoningAlignment: string;
        jurisdictionAssumption: string;
    };
    rowScores: Record<string, number>;
    rowPoints: Record<string, number>;
    subtotal: number;
    penaltiesApplied: Array<{
        key: string;
        label: string;
        points: number;
    }>;
    penaltyTotal: number;
    cap: JudgeCap;
    finalScore: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
    parseFailed: boolean;
    rawJudgeOutput: string;
};

type ClusterJudgeSnapshot = {
    grading: ClusterJudgeResult;
    judgeConfig: JudgeConfig;
    runFile: string;
    clusterId: string;
    memberCount: number;
    gradedAt: string;
};

type SavedGradeRecord = {
    id: string;
    savedAt: string;
    grading: ClusterJudgeResult;
    judgeConfig: JudgeConfig;
    runFile: string;
    clusterId: string;
    memberCount: number;
};

type JudgeModelComparisonRow = {
    key: string;
    provider: JudgeProvider;
    model: string;
    sampleCount: number;
    averageFinalScore: number;
    averageSubtotal: number;
    averagePenalty: number;
    commonOutcome: string;
    commonReasoning: string;
};

type JudgeApiResponse = {
    grading: ClusterJudgeResult;
    cluster: {
        runFile: string;
        clusterId: string;
        memberCount: number;
    };
    judgeConfig?: {
        provider?: JudgeProvider;
        model?: string;
        reasoningEffort?: string;
        customInstructions?: string;
    };
};

const MAP_WIDTH = 980;
const MAP_HEIGHT = 640;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MODEL_PALETTE = ['#22c55e', '#ef4444', '#94a3b8', '#3b82f6', '#f97316', '#14b8a6', '#eab308', '#a855f7', '#06b6d4', '#f43f5e'];
const SAVED_GRADES_STORAGE_KEY = 'lsh-runs-saved-grades-v1';

const JUDGE_MODEL_OPTIONS: Record<JudgeProvider, Array<{ value: string; label: string }>> = {
    openai: [
        { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat Latest' },
        { value: 'gpt-5.2', label: 'GPT-5.2' },
        { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
        { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
        { value: 'gpt-4o', label: 'GPT-4o' },
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

const JUDGE_ROW_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const;
const JUDGE_REASONING_OPTIONS: Array<{ value: JudgeReasoningEffort; label: string }> = [
    { value: 'auto', label: 'Auto (default)' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

export default function LshRunsPage() {
    const [runs, setRuns] = useState<LshRunSummary[]>([]);
    const [isLoadingRuns, setIsLoadingRuns] = useState(true);
    const [runsError, setRunsError] = useState<string | null>(null);

    const [selectedRunFile, setSelectedRunFile] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<LshRunDetails | null>(null);
    const [isLoadingSelectedRun, setIsLoadingSelectedRun] = useState(false);
    const [selectedRunError, setSelectedRunError] = useState<string | null>(null);
    const [isStreamConnected, setIsStreamConnected] = useState(false);

    const [clusterQuery, setClusterQuery] = useState('');
    const [minClusterSize, setMinClusterSize] = useState(1);
    const [showNoise, setShowNoise] = useState(false);
    const [showClusterHulls, setShowClusterHulls] = useState(true);
    const [visibleModels, setVisibleModels] = useState<string[]>([]);
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
    const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

    const [judgeProvider, setJudgeProvider] = useState<JudgeProvider>('openai');
    const [judgeModel, setJudgeModel] = useState<string>(JUDGE_MODEL_OPTIONS.openai[0].value);
    const [judgeReasoningEffort, setJudgeReasoningEffort] = useState<JudgeReasoningEffort>('auto');
    const [judgeInstructions, setJudgeInstructions] = useState('');
    const [isJudgingCluster, setIsJudgingCluster] = useState(false);
    const [judgeError, setJudgeError] = useState<string | null>(null);
    const [judgeResultsByCluster, setJudgeResultsByCluster] = useState<Record<string, ClusterJudgeSnapshot>>({});
    const [savedGrades, setSavedGrades] = useState<SavedGradeRecord[]>([]);
    const [selectedSavedGradeIds, setSelectedSavedGradeIds] = useState<string[]>([]);
    const [savedGradesStatus, setSavedGradesStatus] = useState<string | null>(null);
    const [comparisonGradeIds, setComparisonGradeIds] = useState<string[]>([]);
    const [isComparisonVisible, setIsComparisonVisible] = useState(false);
    const [inspectorPanePercent, setInspectorPanePercent] = useState(28);
    const [isResizingPanes, setIsResizingPanes] = useState(false);
    const splitPaneRef = useRef<HTMLDivElement | null>(null);

    const loadRuns = useCallback(async () => {
        try {
            const response = await fetch('/api/lsh-runs', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to load runs (${response.status}).`);
            }

            const data = (await response.json()) as { runs?: LshRunSummary[] };
            const nextRuns = Array.isArray(data.runs) ? data.runs : [];
            setRuns(nextRuns);
            setRunsError(null);

            setSelectedRunFile((previousRunFile) => {
                if (nextRuns.length === 0) {
                    return null;
                }
                if (previousRunFile && nextRuns.some((run) => run.fileName === previousRunFile)) {
                    return previousRunFile;
                }
                return nextRuns[0].fileName;
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load runs.';
            setRunsError(message);
        } finally {
            setIsLoadingRuns(false);
        }
    }, []);

    const loadRunDetails = useCallback(async (runFile: string) => {
        setIsLoadingSelectedRun(true);
        try {
            const response = await fetch(`/api/lsh-runs/${encodeURIComponent(runFile)}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to load run (${response.status}).`);
            }

            const data = (await response.json()) as { run?: LshRunDetails };
            setSelectedRun(data.run || null);
            setSelectedRunError(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load run details.';
            setSelectedRunError(message);
        } finally {
            setIsLoadingSelectedRun(false);
        }
    }, []);

    useEffect(() => {
        void loadRuns();
    }, [loadRuns]);

    useEffect(() => {
        if (!selectedRunFile) {
            setSelectedRun(null);
            setSelectedRunError(null);
            return;
        }
        void loadRunDetails(selectedRunFile);
    }, [loadRunDetails, selectedRunFile]);

    useEffect(() => {
        const loaded = readSavedGradesFromStorage();
        setSavedGrades(loaded);
    }, []);

    useEffect(() => {
        writeSavedGradesToStorage(savedGrades);
    }, [savedGrades]);

    useEffect(() => {
        const stream = new EventSource('/api/lsh-runs/stream');

        const handleConnected = () => {
            setIsStreamConnected(true);
        };
        const handleDisconnected = () => {
            setIsStreamConnected(false);
        };
        const handleRunsUpdated = () => {
            void loadRuns();
            if (selectedRunFile) {
                void loadRunDetails(selectedRunFile);
            }
        };

        stream.addEventListener('open', handleConnected);
        stream.addEventListener('ready', handleConnected);
        stream.addEventListener('runs_updated', handleRunsUpdated);
        stream.addEventListener('error', handleDisconnected);

        return () => {
            stream.close();
            setIsStreamConnected(false);
        };
    }, [loadRuns, loadRunDetails, selectedRunFile]);

    const activeRunSummary = useMemo(
        () => runs.find((run) => run.fileName === selectedRunFile) || null,
        [runs, selectedRunFile]
    );

    const modelStats = useMemo(() => buildModelStats(selectedRun), [selectedRun]);
    const allModels = useMemo(() => modelStats.map((entry) => entry.model), [modelStats]);
    const modelColorMap = useMemo(() => buildModelColorMap(allModels), [allModels]);

    const maxClusterSize = useMemo(() => {
        if (!selectedRun || selectedRun.clusters.length === 0) {
            return 1;
        }
        return Math.max(1, ...selectedRun.clusters.map((cluster) => cluster.size));
    }, [selectedRun]);

    useEffect(() => {
        setClusterQuery('');
        setMinClusterSize(1);
        setShowNoise(false);
        setShowClusterHulls(true);
        setVisibleModels([]);
        setSelectedClusterId(null);
        setHoveredClusterId(null);
        setIsResizingPanes(false);
    }, [selectedRun?.fileName]);

    useEffect(() => {
        if (minClusterSize > maxClusterSize) {
            setMinClusterSize(maxClusterSize);
        }
    }, [maxClusterSize, minClusterSize]);

    useEffect(() => {
        setVisibleModels((previous) => {
            if (allModels.length === 0) {
                return [];
            }
            if (previous.length === 0) {
                return allModels;
            }
            const kept = previous.filter((model) => allModels.includes(model));
            return kept.length > 0 ? kept : allModels;
        });
    }, [allModels]);

    useEffect(() => {
        const options = JUDGE_MODEL_OPTIONS[judgeProvider];
        if (!options.some((option) => option.value === judgeModel)) {
            setJudgeModel(options[0].value);
        }
    }, [judgeProvider, judgeModel]);

    useEffect(() => {
        setJudgeError(null);
    }, [selectedRunFile, selectedClusterId]);

    useEffect(() => {
        setSelectedSavedGradeIds((previous) => previous.filter((id) => savedGrades.some((grade) => grade.id === id)));
    }, [savedGrades]);

    useEffect(() => {
        setComparisonGradeIds((previous) => previous.filter((id) => savedGrades.some((grade) => grade.id === id)));
    }, [savedGrades]);

    useEffect(() => {
        if (!savedGradesStatus) {
            return;
        }
        const timer = window.setTimeout(() => setSavedGradesStatus(null), 2500);
        return () => window.clearTimeout(timer);
    }, [savedGradesStatus]);

    useEffect(() => {
        if (!isResizingPanes) {
            return;
        }

        const handlePointerMove = (event: MouseEvent) => {
            const container = splitPaneRef.current;
            if (!container) {
                return;
            }

            const bounds = container.getBoundingClientRect();
            if (bounds.width <= 0) {
                return;
            }

            const mapPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
            const nextInspectorPercent = clampNumber(100 - mapPercent, 20, 48);
            setInspectorPanePercent(nextInspectorPercent);
        };

        const handlePointerUp = () => {
            setIsResizingPanes(false);
        };

        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        return () => {
            window.removeEventListener('mousemove', handlePointerMove);
            window.removeEventListener('mouseup', handlePointerUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizingPanes]);

    const visibleModelSet = useMemo(() => new Set(visibleModels), [visibleModels]);

    const filteredClusters = useMemo(() => {
        if (!selectedRun) {
            return [] as LshClusterSummary[];
        }

        const query = clusterQuery.trim().toLowerCase();
        return selectedRun.clusters.filter((cluster) => {
            if (!showNoise && cluster.id.toLowerCase() === 'noise') {
                return false;
            }
            if (cluster.size < minClusterSize) {
                return false;
            }
            if (query.length > 0) {
                const haystack = `${cluster.id} ${cluster.representative.id} ${cluster.representative.model}`.toLowerCase();
                if (!haystack.includes(query)) {
                    return false;
                }
            }
            return cluster.modelBreakdown.some((entry) => visibleModelSet.has(entry.model));
        });
    }, [clusterQuery, minClusterSize, selectedRun, showNoise, visibleModelSet]);

    useEffect(() => {
        setSelectedClusterId((previous) => {
            if (previous && filteredClusters.some((cluster) => cluster.id === previous)) {
                return previous;
            }
            if (filteredClusters.length === 0) {
                return null;
            }
            return filteredClusters[0].id;
        });
    }, [filteredClusters]);

    const filteredClusterLookup = useMemo(
        () => new Map(filteredClusters.map((cluster) => [cluster.id, cluster])),
        [filteredClusters]
    );

    const mapData = useMemo(
        () => buildClusterMapData(filteredClusters, visibleModelSet),
        [filteredClusters, visibleModelSet]
    );

    const axisDomain = useMemo(
        () => buildAxisDomain(mapData.points, mapData.regions),
        [mapData.points, mapData.regions]
    );

    const xTicks = useMemo(() => buildTicks(axisDomain.minX, axisDomain.maxX, 6), [axisDomain]);
    const yTicks = useMemo(() => buildTicks(axisDomain.minY, axisDomain.maxY, 6), [axisDomain]);

    const hoveredCluster = useMemo(
        () => (hoveredClusterId ? filteredClusterLookup.get(hoveredClusterId) || null : null),
        [filteredClusterLookup, hoveredClusterId]
    );

    const selectedCluster = useMemo(
        () => (selectedClusterId ? filteredClusterLookup.get(selectedClusterId) || null : null),
        [filteredClusterLookup, selectedClusterId]
    );

    const focusCluster = selectedCluster || hoveredCluster;
    const activeClusterId = selectedClusterId || hoveredClusterId;

    const resetFilters = () => {
        setClusterQuery('');
        setMinClusterSize(1);
        setShowNoise(false);
        setShowClusterHulls(true);
        setVisibleModels(allModels);
        setSelectedClusterId(null);
        setHoveredClusterId(null);
    };

    const toggleModel = (model: string) => {
        setVisibleModels((previous) => {
            if (previous.includes(model)) {
                return previous.filter((entry) => entry !== model);
            }
            return [...previous, model];
        });
    };

    const selectOnlyModel = (model: string) => {
        setVisibleModels([model]);
        setSelectedClusterId(null);
        setHoveredClusterId(null);
    };

    const selectedClusterKey = useMemo(() => {
        if (!selectedRunFile || !selectedCluster) {
            return null;
        }
        return buildJudgeResultKey(selectedRunFile, selectedCluster.id);
    }, [selectedRunFile, selectedCluster]);

    const selectedClusterSnapshot = selectedClusterKey
        ? judgeResultsByCluster[selectedClusterKey] || null
        : null;
    const selectedClusterGrade = selectedClusterSnapshot?.grading || null;

    const judgeModelOptions = JUDGE_MODEL_OPTIONS[judgeProvider];
    const judgeSupportsReasoningControl = useMemo(
        () => supportsJudgeReasoningControl(judgeProvider, judgeModel),
        [judgeProvider, judgeModel]
    );
    const mapPanePercent = 100 - inspectorPanePercent;
    const comparedSavedGrades = useMemo(
        () => savedGrades.filter((grade) => comparisonGradeIds.includes(grade.id)),
        [savedGrades, comparisonGradeIds]
    );
    const judgeModelComparisonRows = useMemo(
        () => buildJudgeModelComparisonRows(comparedSavedGrades),
        [comparedSavedGrades]
    );
    const selectedPenaltyTrends = useMemo(
        () => buildPenaltyTrendRows(comparedSavedGrades),
        [comparedSavedGrades]
    );
    const maxPenaltyTrendCount = useMemo(
        () => Math.max(1, ...selectedPenaltyTrends.map((penalty) => penalty.count)),
        [selectedPenaltyTrends]
    );
    const maxPenaltyScale = useMemo(
        () => Math.max(5, ...judgeModelComparisonRows.map((row) => row.averagePenalty)),
        [judgeModelComparisonRows]
    );
    const comparisonHighlights = useMemo(() => {
        if (judgeModelComparisonRows.length === 0) {
            return {
                bestModel: null as JudgeModelComparisonRow | null,
                strictestModel: null as JudgeModelComparisonRow | null,
                consensusOutcome: null as string | null,
                consensusReasoning: null as string | null,
            };
        }

        let bestModel = judgeModelComparisonRows[0];
        let strictestModel = judgeModelComparisonRows[0];
        for (const row of judgeModelComparisonRows) {
            if (row.averageFinalScore > bestModel.averageFinalScore) {
                bestModel = row;
            }
            if (row.averagePenalty > strictestModel.averagePenalty) {
                strictestModel = row;
            }
        }

        return {
            bestModel,
            strictestModel,
            consensusOutcome: findMostCommon(comparedSavedGrades.map((grade) => grade.grading.outcomes.bottomLineOutcome)),
            consensusReasoning: findMostCommon(comparedSavedGrades.map((grade) => grade.grading.outcomes.reasoningAlignment)),
        };
    }, [comparedSavedGrades, judgeModelComparisonRows]);
    const allSavedGradesSelected = savedGrades.length > 0 && selectedSavedGradeIds.length === savedGrades.length;

    const handleJudgeCluster = async () => {
        if (!selectedRunFile || !selectedCluster) {
            return;
        }

        setIsJudgingCluster(true);
        setJudgeError(null);

        try {
            const payload: {
                runFile: string;
                clusterId: string;
                judgeProvider: JudgeProvider;
                judgeModel: string;
                customInstructions: string;
                reasoningEffort?: Exclude<JudgeReasoningEffort, 'auto'>;
            } = {
                runFile: selectedRunFile,
                clusterId: selectedCluster.id,
                judgeProvider,
                judgeModel,
                customInstructions: judgeInstructions,
            };

            if (judgeSupportsReasoningControl && judgeReasoningEffort !== 'auto') {
                payload.reasoningEffort = judgeReasoningEffort;
            }

            const response = await fetch('/api/lsh-runs/judge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = (await response.json()) as JudgeApiResponse & { error?: string };
            if (!response.ok) {
                throw new Error(data.error || `Judge request failed (${response.status}).`);
            }

            const key = buildJudgeResultKey(selectedRunFile, selectedCluster.id);
            setJudgeResultsByCluster((previous) => ({
                ...previous,
                [key]: {
                    grading: data.grading,
                    judgeConfig: {
                        provider: data.judgeConfig?.provider || judgeProvider,
                        model: data.judgeConfig?.model || judgeModel,
                        reasoningEffort: normalizeReasoningEffort(data.judgeConfig?.reasoningEffort),
                        customInstructions: typeof data.judgeConfig?.customInstructions === 'string'
                            ? data.judgeConfig.customInstructions
                            : judgeInstructions,
                    },
                    runFile: data.cluster?.runFile || selectedRunFile,
                    clusterId: data.cluster?.clusterId || selectedCluster.id,
                    memberCount: Number.isFinite(data.cluster?.memberCount) ? data.cluster.memberCount : selectedCluster.size,
                    gradedAt: new Date().toISOString(),
                },
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to judge cluster.';
            setJudgeError(message);
        } finally {
            setIsJudgingCluster(false);
        }
    };

    const handleSaveLatestGrade = () => {
        if (!selectedClusterSnapshot) {
            return;
        }

        const savedRecord: SavedGradeRecord = {
            id: `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            savedAt: new Date().toISOString(),
            grading: selectedClusterSnapshot.grading,
            judgeConfig: selectedClusterSnapshot.judgeConfig,
            runFile: selectedClusterSnapshot.runFile,
            clusterId: selectedClusterSnapshot.clusterId,
            memberCount: selectedClusterSnapshot.memberCount,
        };

        setSavedGrades((previous) => [savedRecord, ...previous]);
        setSelectedSavedGradeIds((previous) => [savedRecord.id, ...previous.filter((id) => id !== savedRecord.id)]);
        setSavedGradesStatus('Grade saved for comparison.');
    };

    const toggleSavedGradeSelection = (gradeId: string) => {
        setSelectedSavedGradeIds((previous) => {
            if (previous.includes(gradeId)) {
                return previous.filter((id) => id !== gradeId);
            }
            return [...previous, gradeId];
        });
    };

    const clearSavedGradeSelection = () => {
        setSelectedSavedGradeIds([]);
    };

    const selectAllSavedGrades = () => {
        setSelectedSavedGradeIds(savedGrades.map((grade) => grade.id));
    };

    const removeSelectedSavedGrades = () => {
        if (selectedSavedGradeIds.length === 0) {
            return;
        }
        setSavedGrades((previous) => previous.filter((grade) => !selectedSavedGradeIds.includes(grade.id)));
        setComparisonGradeIds((previous) => previous.filter((id) => !selectedSavedGradeIds.includes(id)));
        setSavedGradesStatus('Selected saved grades removed.');
    };

    const clearAllSavedGrades = () => {
        setSavedGrades([]);
        setSelectedSavedGradeIds([]);
        setComparisonGradeIds([]);
        setIsComparisonVisible(false);
        setSavedGradesStatus('All saved grades cleared.');
    };

    const deleteSavedGrade = (gradeId: string) => {
        setSavedGrades((previous) => previous.filter((grade) => grade.id !== gradeId));
        setSelectedSavedGradeIds((previous) => previous.filter((id) => id !== gradeId));
        setComparisonGradeIds((previous) => previous.filter((id) => id !== gradeId));
        setSavedGradesStatus('Saved grade deleted.');
    };

    const handleCompareSelected = () => {
        if (selectedSavedGradeIds.length === 0) {
            setSavedGradesStatus('Select at least one saved grade to compare.');
            return;
        }
        setComparisonGradeIds(selectedSavedGradeIds);
        setIsComparisonVisible(true);
        setSavedGradesStatus(`Comparing ${selectedSavedGradeIds.length} saved grade${selectedSavedGradeIds.length === 1 ? '' : 's'}.`);
    };

    return (
        <main className={`min-h-screen bg-[radial-gradient(1200px_620px_at_6%_-8%,rgba(59,130,246,0.18),transparent),radial-gradient(1050px_620px_at_100%_0%,rgba(34,197,94,0.14),transparent),#f8fafc] text-slate-900 ${isResizingPanes ? 'select-none' : ''}`}>
            <div className="mx-auto w-full max-w-none px-5 py-6 sm:px-8 sm:py-8">
                <header className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">LSH Run Atlas</p>
                            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Interactive Cluster Separation Map</h1>
                            <p className="mt-2 text-sm text-slate-600">
                                Filter by model and cluster size, then click a cluster to inspect details without overlapping labels.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isStreamConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {isStreamConnected ? 'Live stream connected' : 'Live stream reconnecting'}
                            </span>
                            <Link
                                href="/"
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                            >
                                Back to benchmark app
                            </Link>
                        </div>
                    </div>
                </header>

                <div className="mt-6 space-y-4">
                    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-600">Run Selection</h2>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {runs.length} runs
                            </span>
                        </div>

                        {isLoadingRuns && runs.length === 0 ? (
                            <p className="mt-3 text-sm text-slate-500">Loading runs...</p>
                        ) : runsError ? (
                            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{runsError}</p>
                        ) : runs.length === 0 ? (
                            <p className="mt-3 text-sm text-slate-500">No run files found in `lsh/results`.</p>
                        ) : (
                            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Active run
                                <select
                                    value={selectedRunFile ?? ''}
                                    onChange={(event) => setSelectedRunFile(event.target.value || null)}
                                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                                >
                                    {runs.map((run) => (
                                        <option key={run.fileName} value={run.fileName}>
                                            {run.schema === 'IRAC' ? '[IRAC] ' : ''}{run.fileName} - {run.totalItems} items - {run.numClusters} clusters
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </section>

                    <section>
                        {!selectedRunFile ? (
                            <EmptyStateCard message="Select a run to render the cluster map." />
                        ) : isLoadingSelectedRun ? (
                            <EmptyStateCard message="Loading run details..." />
                        ) : selectedRunError ? (
                            <EmptyStateCard message={selectedRunError} isError />
                        ) : !selectedRun ? (
                            <EmptyStateCard message="Run details are unavailable." />
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                                    <MetricCard label="Run" value={activeRunSummary?.runId || selectedRun.runId} />
                                    <MetricCard label="Schema" value={selectedRun.schema} />
                                    <MetricCard label="Method" value={formatMetadataValue(selectedRun.metadata.method)} />
                                    <MetricCard label="Items" value={String(selectedRun.totalMembers)} />
                                    <MetricCard label="Clusters" value={String(selectedRun.totalClusters)} />
                                    <MetricCard label="Updated" value={formatDateTime(selectedRun.modifiedAt)} />
                                </div>

                                <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur sm:p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h2 className="text-lg font-bold text-slate-900">Projected Cluster Islands</h2>
                                            <p className="text-sm text-slate-600">
                                                Click a cluster to lock focus. Hover for quick inspection. Use filters to simplify the view.
                                            </p>
                                        </div>
                                        <p className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                            Run timestamp: {formatRunTimestamp(selectedRun.timestamp)}
                                        </p>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                                            <div className="lg:col-span-2">
                                                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Search Cluster / Representative</label>
                                                <input
                                                    type="text"
                                                    value={clusterQuery}
                                                    onChange={(event) => setClusterQuery(event.target.value)}
                                                    placeholder="cluster id, representative id, model"
                                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-blue-200 placeholder:text-slate-400 focus:ring"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Min Cluster Size</label>
                                                <div className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={maxClusterSize}
                                                        value={minClusterSize}
                                                        onChange={(event) => setMinClusterSize(Number(event.target.value))}
                                                        className="w-full"
                                                    />
                                                    <p className="mt-1 text-xs font-semibold text-slate-700">{minClusterSize} and above</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">View Options</p>
                                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={showNoise}
                                                        onChange={(event) => setShowNoise(event.target.checked)}
                                                        className="h-4 w-4 rounded border-slate-300"
                                                    />
                                                    Show noise cluster
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={showClusterHulls}
                                                        onChange={(event) => setShowClusterHulls(event.target.checked)}
                                                        className="h-4 w-4 rounded border-slate-300"
                                                    />
                                                    Show cluster hulls
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={resetFilters}
                                                    className="rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                                >
                                                    Reset filters
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setVisibleModels(allModels)}
                                                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                                All models
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setVisibleModels([])}
                                                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                                None
                                            </button>

                                            {modelStats.map((entry) => {
                                                const enabled = visibleModels.includes(entry.model);
                                                const color = modelColorMap.get(entry.model) || '#94a3b8';
                                                return (
                                                    <button
                                                        key={entry.model}
                                                        type="button"
                                                        onClick={() => toggleModel(entry.model)}
                                                        onDoubleClick={() => selectOnlyModel(entry.model)}
                                                        title="Double-click to isolate"
                                                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${enabled ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-200 bg-slate-100 text-slate-400'}`}
                                                    >
                                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, opacity: enabled ? 1 : 0.35 }} />
                                                        {entry.model} ({entry.count})
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div
                                        ref={splitPaneRef}
                                        className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-0"
                                        style={{
                                            ['--map-pane-basis' as string]: `calc(${mapPanePercent}% - 6px)`,
                                            ['--inspector-pane-basis' as string]: `calc(${inspectorPanePercent}% - 6px)`,
                                        }}
                                    >
                                        <div className="min-w-0 xl:shrink-0 xl:basis-[var(--map-pane-basis)]">
                                            <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                                                <svg
                                                    key={selectedRun.fileName}
                                                    viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                                                    className="h-auto w-full"
                                                    role="img"
                                                    aria-label="Cluster scatter map"
                                                >
                                                    <rect
                                                        x={0}
                                                        y={0}
                                                        width={MAP_WIDTH}
                                                        height={MAP_HEIGHT}
                                                        fill="#061227"
                                                        onClick={() => setSelectedClusterId(null)}
                                                    />

                                                    {xTicks.map((tick) => {
                                                        const x = toSvgX(tick, axisDomain);
                                                        return (
                                                            <g key={`x-${tick}`}>
                                                                <line x1={x} y1={0} x2={x} y2={MAP_HEIGHT} stroke="#334155" strokeOpacity={0.42} strokeWidth={1} />
                                                                <text x={x} y={MAP_HEIGHT - 9} textAnchor="middle" fontSize="11" fill="#94a3b8">
                                                                    {formatTick(tick)}
                                                                </text>
                                                            </g>
                                                        );
                                                    })}

                                                    {yTicks.map((tick) => {
                                                        const y = toSvgY(tick, axisDomain);
                                                        return (
                                                            <g key={`y-${tick}`}>
                                                                <line x1={0} y1={y} x2={MAP_WIDTH} y2={y} stroke="#334155" strokeOpacity={0.42} strokeWidth={1} />
                                                                <text x={10} y={y - 6} textAnchor="start" fontSize="11" fill="#94a3b8">
                                                                    {formatTick(tick)}
                                                                </text>
                                                            </g>
                                                        );
                                                    })}

                                                    {showClusterHulls && mapData.regions.map((region) => {
                                                        const active = activeClusterId === region.clusterId;
                                                        const muted = Boolean(activeClusterId) && !active;
                                                        const color = modelColorMap.get(region.dominantModel) || '#94a3b8';
                                                        return (
                                                            <circle
                                                                key={`region-${region.clusterId}`}
                                                                cx={toSvgX(region.centerX, axisDomain)}
                                                                cy={toSvgY(region.centerY, axisDomain)}
                                                                r={Math.max((region.radius / (axisDomain.maxX - axisDomain.minX || 1)) * MAP_WIDTH, 8)}
                                                                fill={color}
                                                                fillOpacity={active ? 0.22 : muted ? 0.05 : 0.12}
                                                                stroke={color}
                                                                strokeOpacity={active ? 0.95 : muted ? 0.2 : 0.55}
                                                                strokeWidth={active ? 2.2 : 1.2}
                                                                onMouseEnter={() => setHoveredClusterId(region.clusterId)}
                                                                onMouseLeave={() => setHoveredClusterId((current) => (current === region.clusterId ? null : current))}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setSelectedClusterId(region.clusterId);
                                                                }}
                                                                className="cursor-pointer"
                                                            />
                                                        );
                                                    })}

                                                    {mapData.points.map((point, index) => {
                                                        const active = activeClusterId === point.clusterId;
                                                        const muted = Boolean(activeClusterId) && !active;
                                                        return (
                                                            <circle
                                                                key={`${point.clusterId}-${index}`}
                                                                cx={toSvgX(point.x, axisDomain)}
                                                                cy={toSvgY(point.y, axisDomain)}
                                                                r={active ? 4.8 : 3.4}
                                                                fill={modelColorMap.get(point.model) || '#94a3b8'}
                                                                fillOpacity={muted ? 0.18 : 0.9}
                                                                onMouseEnter={() => setHoveredClusterId(point.clusterId)}
                                                                onMouseLeave={() => setHoveredClusterId((current) => (current === point.clusterId ? null : current))}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setSelectedClusterId(point.clusterId);
                                                                }}
                                                                className="cursor-pointer"
                                                            />
                                                        );
                                                    })}

                                                    <text x={MAP_WIDTH / 2} y={22} textAnchor="middle" fontSize="15" fill="#dbeafe" fontWeight="700">
                                                        {selectedRun.fileName}
                                                    </text>
                                                    <text x={MAP_WIDTH - 16} y={MAP_HEIGHT - 28} textAnchor="end" fontSize="11" fill="#94a3b8">
                                                        Projection X
                                                    </text>
                                                    <text
                                                        transform={`translate(18 ${MAP_HEIGHT / 2}) rotate(-90)`}
                                                        textAnchor="middle"
                                                        fontSize="11"
                                                        fill="#94a3b8"
                                                    >
                                                        Projection Y
                                                    </text>
                                                </svg>

                                                {mapData.points.length === 0 && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 p-4 text-center">
                                                        <p className="max-w-md rounded-lg border border-slate-600 bg-slate-900/90 px-4 py-3 text-sm text-slate-200">
                                                            No points match the current filters. Re-enable models or lower the cluster size threshold.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            <p className="mt-2 text-xs text-slate-500">
                                                Filtered clusters: {filteredClusters.length} / {selectedRun.clusters.length} - Visible points: {mapData.points.length}
                                            </p>
                                        </div>

                                        <div className="hidden xl:flex xl:w-3 xl:shrink-0 xl:items-center xl:justify-center">
                                            <button
                                                type="button"
                                                onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    setIsResizingPanes(true);
                                                }}
                                                className="group flex h-full w-full cursor-col-resize items-center justify-center"
                                                aria-label="Resize cluster view and inspector panels"
                                                title="Drag to resize panels"
                                            >
                                                <span className="h-24 w-1.5 rounded-full bg-slate-300 transition-colors group-hover:bg-blue-400" />
                                            </button>
                                        </div>

                                        <aside className="min-w-0 xl:shrink-0 xl:basis-[var(--inspector-pane-basis)]">
                                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h3 className="text-sm font-bold text-slate-900">Cluster Inspector</h3>
                                                    {selectedClusterId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedClusterId(null)}
                                                            className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                                                        >
                                                            Clear focus
                                                        </button>
                                                    )}
                                                </div>

                                                {focusCluster ? (
                                                    <div className="mt-3 space-y-3">
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900">
                                                                {focusCluster.id === 'noise' ? 'Noise Cluster' : `Cluster ${focusCluster.id}`}
                                                            </p>
                                                            <p className="mt-0.5 text-xs text-slate-600">{focusCluster.size} members</p>
                                                        </div>

                                                        <p className="text-xs text-slate-700">
                                                            Representative: <span className="font-semibold">{focusCluster.representative.id}</span>
                                                            {' '}({focusCluster.representative.model})
                                                        </p>
                                                        <p className="text-xs text-slate-600">{focusCluster.representative.textPreview || 'No representative preview available.'}</p>

                                                        <div className="space-y-1">
                                                            {focusCluster.modelBreakdown.map((entry) => (
                                                                <div key={`${focusCluster.id}-${entry.model}`} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                                                                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                                                                        <span
                                                                            className="h-2.5 w-2.5 rounded-full"
                                                                            style={{ backgroundColor: modelColorMap.get(entry.model) || '#94a3b8' }}
                                                                        />
                                                                        {entry.model}
                                                                    </span>
                                                                    <span className="text-xs font-semibold text-slate-700">{entry.count}</span>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {focusCluster.membersPreview && focusCluster.membersPreview.length > 0 && (
                                                            <div>
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sample members</p>
                                                                <div className="mt-1.5 space-y-1">
                                                                    {focusCluster.membersPreview.slice(0, 3).map((member) => (
                                                                        <div key={`${focusCluster.id}-${member.id}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                                                                            <p className="text-[11px] font-semibold text-slate-700">{member.id} ({member.model})</p>
                                                                            <p className="mt-0.5 text-[11px] text-slate-600">{member.textPreview}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-sm text-slate-600">Click or hover a cluster to inspect details.</p>
                                                )}

                                                <div className="mt-4 border-t border-slate-200 pt-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">LLM-as-Judge</p>
                                                    {!selectedCluster ? (
                                                        <p className="mt-2 text-xs text-slate-600">Select a cluster to configure judging.</p>
                                                    ) : (
                                                        <div className="mt-2 space-y-3">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <label className="text-[11px] font-semibold text-slate-600">
                                                                    Provider
                                                                    <select
                                                                        value={judgeProvider}
                                                                        onChange={(event) => setJudgeProvider(event.target.value as JudgeProvider)}
                                                                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                                                                    >
                                                                        <option value="openai">OpenAI</option>
                                                                        <option value="anthropic">Anthropic</option>
                                                                        <option value="gemini">Google Gemini</option>
                                                                    </select>
                                                                </label>
                                                                <label className="text-[11px] font-semibold text-slate-600">
                                                                    Judge model
                                                                    <select
                                                                        value={judgeModel}
                                                                        onChange={(event) => setJudgeModel(event.target.value)}
                                                                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                                                                    >
                                                                        {judgeModelOptions.map((option) => (
                                                                            <option key={option.value} value={option.value}>
                                                                                {option.label}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </label>
                                                            </div>

                                                            {judgeSupportsReasoningControl ? (
                                                                <label className="block text-[11px] font-semibold text-slate-600">
                                                                    Reasoning mode
                                                                    <select
                                                                        value={judgeReasoningEffort}
                                                                        onChange={(event) => setJudgeReasoningEffort(event.target.value as JudgeReasoningEffort)}
                                                                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                                                                    >
                                                                        {JUDGE_REASONING_OPTIONS.map((option) => (
                                                                            <option key={option.value} value={option.value}>
                                                                                {option.label}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </label>
                                                            ) : (
                                                                <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                                                                    This model does not expose judge reasoning controls. Default provider behavior is used.
                                                                </p>
                                                            )}

                                                            <label className="block text-[11px] font-semibold text-slate-600">
                                                                Custom judge instructions
                                                                <textarea
                                                                    value={judgeInstructions}
                                                                    onChange={(event) => setJudgeInstructions(event.target.value)}
                                                                    rows={4}
                                                                    placeholder="Add custom grading preferences (optional). Base rubric is always applied."
                                                                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 placeholder:text-slate-400"
                                                                />
                                                            </label>

                                                            <button
                                                                type="button"
                                                                onClick={handleJudgeCluster}
                                                                disabled={isJudgingCluster}
                                                                className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                            >
                                                                {isJudgingCluster ? 'Grading cluster...' : `Grade ${selectedCluster.id === 'noise' ? 'Noise Cluster' : `Cluster ${selectedCluster.id}`}`}
                                                            </button>

                                                            <p className="text-[11px] text-slate-500">
                                                                Latest grade is temporary. Use Save grade to keep it for comparison.
                                                            </p>

                                                            {judgeError && (
                                                                <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{judgeError}</p>
                                                            )}

                                                            {selectedClusterGrade && (
                                                                <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Latest grade</p>
                                                                        <p className="text-sm font-extrabold text-slate-900">{selectedClusterGrade.finalScore.toFixed(2)} / 100</p>
                                                                    </div>
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleSaveLatestGrade}
                                                                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                                                                        >
                                                                            Save grade
                                                                        </button>
                                                                        {savedGradesStatus && (
                                                                            <p className="text-[11px] text-emerald-700">{savedGradesStatus}</p>
                                                                        )}
                                                                    </div>

                                                                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                                                                        <div className="rounded border border-slate-200 bg-white px-2 py-1">
                                                                            <p className="font-semibold text-slate-500">Subtotal</p>
                                                                            <p className="mt-0.5 font-bold text-slate-800">{selectedClusterGrade.subtotal.toFixed(2)}</p>
                                                                        </div>
                                                                        <div className="rounded border border-slate-200 bg-white px-2 py-1">
                                                                            <p className="font-semibold text-slate-500">Penalties</p>
                                                                            <p className="mt-0.5 font-bold text-slate-800">-{selectedClusterGrade.penaltyTotal.toFixed(2)}</p>
                                                                        </div>
                                                                        <div className="rounded border border-slate-200 bg-white px-2 py-1">
                                                                            <p className="font-semibold text-slate-500">Cap</p>
                                                                            <p className="mt-0.5 font-bold text-slate-800">{formatJudgeCap(selectedClusterGrade.cap)}</p>
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-4 gap-1 text-[11px]">
                                                                        {JUDGE_ROW_ORDER.map((row) => {
                                                                            const rowScore = selectedClusterGrade.rowScores[row] ?? 0;
                                                                            const rowPoint = selectedClusterGrade.rowPoints[row] ?? 0;
                                                                            return (
                                                                                <div key={row} className="rounded border border-slate-200 bg-white px-1.5 py-1">
                                                                                    <p className="font-semibold text-slate-500">{row}</p>
                                                                                    <p className="font-bold text-slate-800">{rowScore} / 4</p>
                                                                                    <p className="text-slate-600">{rowPoint.toFixed(2)}</p>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>

                                                                    <div className="space-y-1 text-[11px] text-slate-700">
                                                                        <p><span className="font-semibold">Outcome:</span> {selectedClusterGrade.outcomes.bottomLineOutcome}</p>
                                                                        <p><span className="font-semibold">Correctness:</span> {selectedClusterGrade.outcomes.outcomeCorrectness}</p>
                                                                        <p><span className="font-semibold">Reasoning:</span> {selectedClusterGrade.outcomes.reasoningAlignment}</p>
                                                                        <p><span className="font-semibold">Jurisdiction:</span> {selectedClusterGrade.outcomes.jurisdictionAssumption}</p>
                                                                    </div>

                                                                    <p className="text-xs text-slate-700">{selectedClusterGrade.summary}</p>

                                                                    {selectedClusterGrade.penaltiesApplied.length > 0 && (
                                                                        <div className="space-y-1">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Penalties applied</p>
                                                                            {selectedClusterGrade.penaltiesApplied.map((penalty) => (
                                                                                <p key={penalty.key} className="text-[11px] text-slate-700">
                                                                                    - {penalty.label} (-{penalty.points})
                                                                                </p>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    {selectedClusterGrade.parseFailed && (
                                                                        <details className="rounded border border-amber-200 bg-amber-50 p-2">
                                                                            <summary className="cursor-pointer text-[11px] font-semibold text-amber-800">
                                                                                Judge JSON parse failed (show raw output)
                                                                            </summary>
                                                                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-amber-900">
                                                                                {selectedClusterGrade.rawJudgeOutput}
                                                                            </pre>
                                                                        </details>
                                                                    )}
                                                                </div>
                                                            )}

                                                            <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Saved grades</p>
                                                                    <p className="text-xs font-semibold text-slate-700">{savedGrades.length}</p>
                                                                </div>

                                                                <div className="flex flex-wrap gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={allSavedGradesSelected ? clearSavedGradeSelection : selectAllSavedGrades}
                                                                        disabled={savedGrades.length === 0}
                                                                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        {allSavedGradesSelected ? 'Clear selection' : 'Select all'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleCompareSelected}
                                                                        disabled={selectedSavedGradeIds.length === 0}
                                                                        className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        Compare selected ({selectedSavedGradeIds.length})
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={removeSelectedSavedGrades}
                                                                        disabled={selectedSavedGradeIds.length === 0}
                                                                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        Delete selected
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={clearAllSavedGrades}
                                                                        disabled={savedGrades.length === 0}
                                                                        className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        Clear all
                                                                    </button>
                                                                </div>

                                                                {savedGradesStatus && (
                                                                    <p className="text-[11px] text-emerald-700">{savedGradesStatus}</p>
                                                                )}

                                                                {savedGrades.length === 0 ? (
                                                                    <p className="text-xs text-slate-600">
                                                                        No saved grades yet. Saved grades persist even when you do not compare.
                                                                    </p>
                                                                ) : (
                                                                    <div className="overflow-x-auto">
                                                                        <div className="flex gap-2 pb-1">
                                                                            {savedGrades.map((grade) => {
                                                                                const selected = selectedSavedGradeIds.includes(grade.id);
                                                                                return (
                                                                                    <div
                                                                                        key={grade.id}
                                                                                        className={`min-w-[210px] rounded border px-2 py-1.5 text-[11px] ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}
                                                                                    >
                                                                                        <label className="flex items-start gap-2">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={selected}
                                                                                                onChange={() => toggleSavedGradeSelection(grade.id)}
                                                                                                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                                                                                            />
                                                                                            <span className="min-w-0 flex-1">
                                                                                                <span className="block truncate font-semibold text-slate-800">
                                                                                                    {grade.judgeConfig.provider}/{grade.judgeConfig.model}
                                                                                                </span>
                                                                                                <span className="block text-slate-600">
                                                                                                    {grade.grading.finalScore.toFixed(1)} - c{grade.clusterId}
                                                                                                </span>
                                                                                            </span>
                                                                                        </label>
                                                                                        <div className="mt-1 flex items-center justify-between gap-2">
                                                                                            <span className="text-[10px] text-slate-500">{formatDateTime(grade.savedAt)}</span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => deleteSavedGrade(grade.id)}
                                                                                                className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                                                                                            >
                                                                                                Delete
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {isComparisonVisible && (
                                                                    <div className="space-y-3 rounded-xl border border-slate-200 bg-[linear-gradient(165deg,#ffffff_0%,#f8fbff_55%,#eef6ff_100%)] p-3 shadow-sm">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                                                                                Comparison results ({comparedSavedGrades.length})
                                                                            </p>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setIsComparisonVisible(false)}
                                                                                className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
                                                                            >
                                                                                Hide
                                                                            </button>
                                                                        </div>

                                                                        {judgeModelComparisonRows.length === 0 ? (
                                                                            <p className="text-xs text-slate-600">No comparable grades selected.</p>
                                                                        ) : (
                                                                            <div className="space-y-3">
                                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                                                                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Highest average score</p>
                                                                                        <p className="mt-0.5 text-xs font-bold text-emerald-900">
                                                                                            {comparisonHighlights.bestModel?.provider}/{comparisonHighlights.bestModel?.model}
                                                                                        </p>
                                                                                        <p className="text-sm font-extrabold text-emerald-900">
                                                                                            {comparisonHighlights.bestModel?.averageFinalScore.toFixed(2) ?? '0.00'}
                                                                                        </p>
                                                                                    </div>
                                                                                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2">
                                                                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-700">Highest average penalties</p>
                                                                                        <p className="mt-0.5 text-xs font-bold text-rose-900">
                                                                                            {comparisonHighlights.strictestModel?.provider}/{comparisonHighlights.strictestModel?.model}
                                                                                        </p>
                                                                                        <p className="text-sm font-extrabold text-rose-900">
                                                                                            {comparisonHighlights.strictestModel?.averagePenalty.toFixed(2) ?? '0.00'}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px]">
                                                                                    <p className="font-semibold text-slate-700">Selection consensus</p>
                                                                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                                                                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                                                                            Outcome: {comparisonHighlights.consensusOutcome || 'N/A'}
                                                                                        </span>
                                                                                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                                                                                            Reasoning: {comparisonHighlights.consensusReasoning || 'N/A'}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="space-y-2">
                                                                                    {judgeModelComparisonRows.map((row) => (
                                                                                        <div key={row.key} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2.5">
                                                                                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                                                                                                <p className="text-[11px] font-bold text-slate-800">
                                                                                                    {row.provider}/{row.model}
                                                                                                </p>
                                                                                                <span
                                                                                                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${row.provider === 'openai'
                                                                                                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                                                                        : row.provider === 'anthropic'
                                                                                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                                                                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                                                        }`}
                                                                                                >
                                                                                                    N={row.sampleCount}
                                                                                                </span>
                                                                                            </div>

                                                                                            <div className="mt-2 space-y-1.5">
                                                                                                <div>
                                                                                                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                                                                                                        <span>Avg final score</span>
                                                                                                        <span>{row.averageFinalScore.toFixed(2)}</span>
                                                                                                    </div>
                                                                                                    <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-200">
                                                                                                        <div
                                                                                                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                                                                                                            style={{ width: `${clampNumber(row.averageFinalScore, 0, 100)}%` }}
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div>
                                                                                                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                                                                                                        <span>Avg penalties</span>
                                                                                                        <span>{row.averagePenalty.toFixed(2)}</span>
                                                                                                    </div>
                                                                                                    <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-200">
                                                                                                        <div
                                                                                                            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500"
                                                                                                            style={{ width: `${clampNumber((row.averagePenalty / maxPenaltyScale) * 100, 0, 100)}%` }}
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>

                                                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700">
                                                                                                    {row.commonOutcome}
                                                                                                </span>
                                                                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700">
                                                                                                    {row.commonReasoning}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {selectedPenaltyTrends.length > 0 && (
                                                                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                                                                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Frequent penalties</p>
                                                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                                                    {selectedPenaltyTrends.map((penalty) => (
                                                                                        <span
                                                                                            key={penalty.key}
                                                                                            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                                                                                            style={{
                                                                                                borderColor: `rgba(148, 163, 184, ${0.3 + (penalty.count / maxPenaltyTrendCount) * 0.5})`,
                                                                                                backgroundColor: `rgba(15, 23, 42, ${0.04 + (penalty.count / maxPenaltyTrendCount) * 0.08})`,
                                                                                            }}
                                                                                        >
                                                                                            {penalty.label}: {penalty.count}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-4 border-t border-slate-200 pt-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Visible cluster list</p>
                                                    <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                                                        {filteredClusters.length === 0 ? (
                                                            <p className="text-xs text-slate-500">No clusters match current filters.</p>
                                                        ) : (
                                                            filteredClusters.map((cluster) => {
                                                                const dominantModel = cluster.modelBreakdown[0]?.model || 'unknown';
                                                                const dominantColor = modelColorMap.get(dominantModel) || '#94a3b8';
                                                                const selected = selectedClusterId === cluster.id;
                                                                const hovered = hoveredClusterId === cluster.id;
                                                                return (
                                                                    <button
                                                                        key={cluster.id}
                                                                        type="button"
                                                                        onClick={() => setSelectedClusterId(cluster.id)}
                                                                        onMouseEnter={() => setHoveredClusterId(cluster.id)}
                                                                        onMouseLeave={() => setHoveredClusterId((current) => (current === cluster.id ? null : current))}
                                                                        className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition ${selected ? 'border-blue-300 bg-blue-50' : hovered ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                                                    >
                                                                        <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                                                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dominantColor }} />
                                                                            {cluster.id === 'noise' ? 'Noise' : `Cluster ${cluster.id}`}
                                                                        </span>
                                                                        <span className="font-semibold text-slate-600">{cluster.size}</span>
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </aside>
                                    </div>
                                </section>

                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-bold text-slate-900 break-words">{value}</p>
        </div>
    );
}

function EmptyStateCard({ message, isError = false }: { message: string; isError?: boolean }) {
    return (
        <div className={`rounded-2xl border p-5 shadow-sm ${isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white/95 text-slate-600'}`}>
            <p className="text-sm font-medium">{message}</p>
        </div>
    );
}

function buildModelStats(run: LshRunDetails | null): ModelStat[] {
    if (!run) {
        return [];
    }

    const totals = new Map<string, number>();
    for (const cluster of run.clusters) {
        for (const entry of cluster.modelBreakdown) {
            totals.set(entry.model, (totals.get(entry.model) || 0) + entry.count);
        }
    }

    return Array.from(totals.entries())
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.model.localeCompare(b.model);
        });
}

function buildClusterMapData(
    clusters: LshClusterSummary[],
    visibleModels: Set<string>
) {
    if (clusters.length === 0 || visibleModels.size === 0) {
        return { points: [] as ClusterMapPoint[], regions: [] as ClusterMapRegion[] };
    }

    const seeds: ClusterSeed[] = clusters
        .map((cluster) => {
            const visibleBreakdown = cluster.modelBreakdown.filter((entry) => visibleModels.has(entry.model));
            const visibleMembers = visibleBreakdown.reduce((total, entry) => total + entry.count, 0);
            if (visibleMembers === 0) {
                return null;
            }

            const dominantModel = visibleBreakdown[0]?.model || cluster.modelBreakdown[0]?.model || 'unknown';
            const radius = 2.8 + Math.sqrt(visibleMembers) * 1.9;

            return {
                clusterId: cluster.id,
                radius,
                visibleMembers,
                totalMembers: cluster.size,
                dominantModel,
                note: cluster.representative.textPreview,
                visibleBreakdown,
            };
        })
        .filter((seed): seed is ClusterSeed => seed !== null);

    if (seeds.length === 0) {
        return { points: [] as ClusterMapPoint[], regions: [] as ClusterMapRegion[] };
    }

    const seededRegions: ClusterMapRegion[] = seeds.map((seed, index) => {
        const spiralStep = 8 + Math.floor(index / 6) * 7;
        const angle = index * GOLDEN_ANGLE * 0.92;
        return {
            clusterId: seed.clusterId,
            centerX: Math.cos(angle) * spiralStep,
            centerY: Math.sin(angle) * spiralStep * 0.72,
            radius: seed.radius,
            visibleMembers: seed.visibleMembers,
            totalMembers: seed.totalMembers,
            dominantModel: seed.dominantModel,
            note: seed.note,
        };
    });

    const regions = resolveRegionOverlaps(seededRegions);
    const regionByCluster = new Map(regions.map((region) => [region.clusterId, region]));

    const points: ClusterMapPoint[] = [];
    for (const seed of seeds) {
        const region = regionByCluster.get(seed.clusterId);
        if (!region) {
            continue;
        }

        const sequence = expandModelsByCount(seed.visibleBreakdown, seed.visibleMembers);
        sequence.forEach((model, pointIndex) => {
            const randomSeed = hashString(`${seed.clusterId}:${model}:${pointIndex}`);
            const radialPosition = region.radius * Math.sqrt((pointIndex + 1) / sequence.length);
            const theta = pointIndex * GOLDEN_ANGLE + seededFloat(randomSeed, 1) * 0.85;
            const jitterX = (seededFloat(randomSeed, 2) - 0.5) * 0.85;
            const jitterY = (seededFloat(randomSeed, 3) - 0.5) * 0.85;

            points.push({
                x: region.centerX + Math.cos(theta) * radialPosition + jitterX,
                y: region.centerY + Math.sin(theta) * radialPosition + jitterY,
                model,
                clusterId: seed.clusterId,
            });
        });
    }

    return {
        points,
        regions: regions.sort((a, b) => b.visibleMembers - a.visibleMembers),
    };
}

function resolveRegionOverlaps(regions: ClusterMapRegion[]) {
    const adjusted = regions.map((region) => ({ ...region }));

    for (let iteration = 0; iteration < 120; iteration += 1) {
        let moved = false;

        for (let i = 0; i < adjusted.length; i += 1) {
            for (let j = i + 1; j < adjusted.length; j += 1) {
                const left = adjusted[i];
                const right = adjusted[j];

                const dx = right.centerX - left.centerX;
                const dy = right.centerY - left.centerY;
                const distance = Math.hypot(dx, dy) || 0.0001;
                const minimumDistance = left.radius + right.radius + 2.3;

                if (distance < minimumDistance) {
                    const overlap = (minimumDistance - distance) * 0.5;
                    const ux = dx / distance;
                    const uy = dy / distance;
                    left.centerX -= ux * overlap;
                    left.centerY -= uy * overlap;
                    right.centerX += ux * overlap;
                    right.centerY += uy * overlap;
                    moved = true;
                }
            }
        }

        for (const region of adjusted) {
            region.centerX *= 0.995;
            region.centerY *= 0.995;
        }

        if (!moved) {
            break;
        }
    }

    return adjusted;
}

function expandModelsByCount(entries: ModelBreakdownEntry[], fallbackCount: number) {
    const expanded: string[] = [];
    for (const entry of entries) {
        const safeCount = Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
        for (let i = 0; i < safeCount; i += 1) {
            expanded.push(entry.model);
        }
    }
    if (expanded.length === 0 && fallbackCount > 0) {
        expanded.push('unknown');
    }
    return expanded;
}

function buildModelColorMap(models: string[]) {
    const map = new Map<string, string>();
    models.forEach((model, index) => {
        map.set(model, MODEL_PALETTE[index % MODEL_PALETTE.length]);
    });
    return map;
}

function buildAxisDomain(points: ClusterMapPoint[], regions: ClusterMapRegion[]): AxisDomain {
    if (points.length === 0 && regions.length === 0) {
        return { minX: -20, maxX: 20, minY: -20, maxY: 20 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }

    for (const region of regions) {
        minX = Math.min(minX, region.centerX - region.radius);
        maxX = Math.max(maxX, region.centerX + region.radius);
        minY = Math.min(minY, region.centerY - region.radius);
        maxY = Math.max(maxY, region.centerY + region.radius);
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const paddingX = Math.max(6, width * 0.16);
    const paddingY = Math.max(6, height * 0.16);

    return {
        minX: minX - paddingX,
        maxX: maxX + paddingX,
        minY: minY - paddingY,
        maxY: maxY + paddingY,
    };
}

function buildTicks(min: number, max: number, steps: number) {
    const range = max - min;
    if (range <= 0 || steps <= 0) {
        return [min];
    }
    return Array.from({ length: steps + 1 }, (_, index) => min + (range * index) / steps);
}

function toSvgX(value: number, domain: AxisDomain) {
    const ratio = (value - domain.minX) / (domain.maxX - domain.minX || 1);
    return ratio * MAP_WIDTH;
}

function toSvgY(value: number, domain: AxisDomain) {
    const ratio = (value - domain.minY) / (domain.maxY - domain.minY || 1);
    return MAP_HEIGHT - ratio * MAP_HEIGHT;
}

function hashString(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededFloat(seed: number, stream: number) {
    const mixed = Math.sin(seed * 0.013 + stream * 17.933) * 43758.5453;
    return mixed - Math.floor(mixed);
}

function formatRunTimestamp(timestamp: string | null) {
    if (!timestamp) {
        return 'Unknown timestamp';
    }
    return formatDateTime(timestamp);
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

function formatMetadataValue(value: unknown) {
    if (value === null || value === undefined) {
        return 'N/A';
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (typeof value === 'string') {
        return value;
    }
    return JSON.stringify(value);
}

function buildJudgeResultKey(runFile: string, clusterId: string) {
    return `${runFile}::${clusterId}`;
}

function supportsJudgeReasoningControl(provider: JudgeProvider, model: string) {
    if (provider === 'openai') {
        return model.startsWith('gpt-5');
    }
    if (provider === 'gemini') {
        return model.startsWith('gemini-2.5') || model.startsWith('gemini-3');
    }
    return false;
}

function formatJudgeCap(cap: JudgeCap) {
    if (cap === 'cap_60') {
        return '60';
    }
    if (cap === 'cap_70') {
        return '70';
    }
    return 'None';
}

function formatTick(value: number) {
    return value.toFixed(0);
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function normalizeReasoningEffort(value: unknown): JudgeReasoningEffort {
    if (value === 'low' || value === 'medium' || value === 'high') {
        return value;
    }
    if (value === 'xhigh') {
        return 'high';
    }
    return 'auto';
}

function readSavedGradesFromStorage(): SavedGradeRecord[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(SAVED_GRADES_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => normalizeSavedGrade(entry))
            .filter((entry): entry is SavedGradeRecord => entry !== null)
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch {
        return [];
    }
}

function writeSavedGradesToStorage(savedGrades: SavedGradeRecord[]) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(SAVED_GRADES_STORAGE_KEY, JSON.stringify(savedGrades));
    } catch (error) {
        console.error('Failed to persist saved grades:', error);
    }
}

function normalizeSavedGrade(value: unknown): SavedGradeRecord | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Record<string, unknown>;
    const id = typeof source.id === 'string' ? source.id : '';
    const savedAt = typeof source.savedAt === 'string' ? source.savedAt : '';
    const runFile = typeof source.runFile === 'string' ? source.runFile : '';
    const clusterId = typeof source.clusterId === 'string' ? source.clusterId : '';
    const memberCount = typeof source.memberCount === 'number' && Number.isFinite(source.memberCount)
        ? source.memberCount
        : 0;
    if (!id || !savedAt || !runFile || !clusterId) {
        return null;
    }

    const grading = source.grading as ClusterJudgeResult | undefined;
    if (!grading || typeof grading !== 'object') {
        return null;
    }

    const rawJudgeConfig = source.judgeConfig as Record<string, unknown> | undefined;
    const provider = rawJudgeConfig?.provider;
    const model = rawJudgeConfig?.model;
    if (
        (provider !== 'openai' && provider !== 'anthropic' && provider !== 'gemini')
        || typeof model !== 'string'
        || model.trim().length === 0
    ) {
        return null;
    }

    return {
        id,
        savedAt,
        runFile,
        clusterId,
        memberCount,
        grading,
        judgeConfig: {
            provider,
            model,
            reasoningEffort: normalizeReasoningEffort(rawJudgeConfig?.reasoningEffort),
            customInstructions: typeof rawJudgeConfig?.customInstructions === 'string'
                ? rawJudgeConfig.customInstructions
                : '',
        },
    };
}

function buildJudgeModelComparisonRows(savedGrades: SavedGradeRecord[]): JudgeModelComparisonRow[] {
    const grouped = new Map<string, SavedGradeRecord[]>();
    for (const grade of savedGrades) {
        const key = `${grade.judgeConfig.provider}::${grade.judgeConfig.model}`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)?.push(grade);
    }

    return Array.from(grouped.entries())
        .map(([key, grades]) => {
            const sampleCount = grades.length;
            const averageFinalScore = sampleCount > 0
                ? grades.reduce((sum, grade) => sum + grade.grading.finalScore, 0) / sampleCount
                : 0;
            const averageSubtotal = sampleCount > 0
                ? grades.reduce((sum, grade) => sum + grade.grading.subtotal, 0) / sampleCount
                : 0;
            const averagePenalty = sampleCount > 0
                ? grades.reduce((sum, grade) => sum + grade.grading.penaltyTotal, 0) / sampleCount
                : 0;

            return {
                key,
                provider: grades[0].judgeConfig.provider,
                model: grades[0].judgeConfig.model,
                sampleCount,
                averageFinalScore,
                averageSubtotal,
                averagePenalty,
                commonOutcome: findMostCommon(grades.map((grade) => grade.grading.outcomes.bottomLineOutcome)) || 'N/A',
                commonReasoning: findMostCommon(grades.map((grade) => grade.grading.outcomes.reasoningAlignment)) || 'N/A',
            };
        })
        .sort((a, b) => {
            if (b.sampleCount !== a.sampleCount) {
                return b.sampleCount - a.sampleCount;
            }
            return b.averageFinalScore - a.averageFinalScore;
        });
}

function buildPenaltyTrendRows(savedGrades: SavedGradeRecord[]) {
    const totals = new Map<string, { key: string; label: string; count: number }>();

    for (const savedGrade of savedGrades) {
        for (const penalty of savedGrade.grading.penaltiesApplied) {
            const existing = totals.get(penalty.key);
            if (existing) {
                existing.count += 1;
                continue;
            }
            totals.set(penalty.key, {
                key: penalty.key,
                label: penalty.label,
                count: 1,
            });
        }
    }

    return Array.from(totals.values()).sort((a, b) => b.count - a.count);
}

function findMostCommon(values: string[]) {
    if (values.length === 0) {
        return null;
    }

    const counts = new Map<string, number>();
    for (const value of values) {
        counts.set(value, (counts.get(value) || 0) + 1);
    }

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
