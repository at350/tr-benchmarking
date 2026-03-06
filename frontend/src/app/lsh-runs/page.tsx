'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/ui/AppShell';
import {
    createJudgeRubricTemplate,
    isBuiltinJudgeRubricTemplateId,
    readJudgeRubricLibraryFromStorage,
    writeJudgeRubricLibraryToStorage,
    type JudgeRubricTemplate,
} from '@/lib/judge-rubric-library';
import {
    LSH_JUDGE_OUTPUT_JSON_SCHEMA,
    LSH_JUDGE_OUTPUT_RULES,
} from '@/lib/lsh-judge-output-format';

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
    members?: Array<{ id: string; model: string }>;
    membersPreview?: Array<{
        id: string;
        model: string;
        textPreview: string;
        text: string;
        irac?: { issue: string; rule: string; application: string; conclusion: string };
    }>;
    edgeMembersPreview?: Array<{
        id: string;
        model: string;
        textPreview: string;
        text: string;
        irac?: { issue: string; rule: string; application: string; conclusion: string };
    }>;
    topicSignals?: Array<{
        topic: string;
        score: number;
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
    memberId?: string;
    isCentroid?: boolean;
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
    members: Array<{ id: string; model: string }>;
    representativeId: string;
};

type ModelStat = {
    model: string;
    count: number;
};

type JudgeProvider = 'openai' | 'anthropic' | 'gemini';
type JudgeReasoningEffort = 'auto' | 'low' | 'medium' | 'high';
type JudgeCap = 'none' | 'cap_60' | 'cap_70';
type JudgeContextMode = 'full_cluster' | 'centroid_only';

type JudgeConfig = {
    provider: JudgeProvider;
    model: string;
    reasoningEffort: JudgeReasoningEffort;
    customInstructions: string;
    contextMode: JudgeContextMode;
    judgeOutlineIds: string[];
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

type BatchJudgeRunRecord = {
    id: string;
    runFile: string;
    startedAt: string;
    completedAt: string;
    judgeConfig: JudgeConfig;
    snapshots: ClusterJudgeSnapshot[];
    errors: Array<{ clusterId: string; message: string }>;
};

type SavedBatchGradeRecord = {
    id: string;
    savedAt: string;
    batchRun: BatchJudgeRunRecord;
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
        contextMode?: string;
        judgeOutlineIds?: string[];
    };
};

type OutlineReferenceOption = {
    id: string;
    fileName: string;
    title: string;
    viewUrl: string;
};

type OutlinesApiResponse = {
    outlines?: OutlineReferenceOption[];
};

type BatchJudgeProgress = {
    total: number;
    completed: number;
    succeeded: number;
    failed: number;
};

type BatchJudgeAspectStat = {
    rowKey: typeof JUDGE_ROW_ORDER[number];
    label: string;
    averageScore: number;
    averagePoints: number;
    maxedCount: number;
    lowScoreCount: number;
};

type BatchJudgeClusterStatRow = {
    clusterId: string;
    memberCount: number;
    finalScore: number;
    subtotal: number;
    penaltyTotal: number;
    cap: JudgeCap;
    outcome: string;
    correctness: string;
    reasoning: string;
    rowScores: Record<string, number>;
};

type BatchJudgeStatistics = {
    runId: string;
    startedAt: string;
    completedAt: string;
    judgeConfig: JudgeConfig;
    gradedClusterCount: number;
    failureCount: number;
    averageFinalScore: number;
    averageSubtotal: number;
    averagePenalty: number;
    bestCluster: BatchJudgeClusterStatRow | null;
    weakestCluster: BatchJudgeClusterStatRow | null;
    aspectRows: BatchJudgeAspectStat[];
    clusterRows: BatchJudgeClusterStatRow[];
    outcomeCounts: Array<{ label: string; count: number }>;
    correctnessCounts: Array<{ label: string; count: number }>;
    reasoningCounts: Array<{ label: string; count: number }>;
};

const MAP_WIDTH = 980;
const MAP_HEIGHT = 640;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MODEL_PALETTE = ['#22c55e', '#ef4444', '#94a3b8', '#3b82f6', '#f97316', '#14b8a6', '#eab308', '#a855f7', '#06b6d4', '#f43f5e'];
const SAVED_GRADES_STORAGE_KEY = 'lsh-runs-saved-grades-v1';
const SAVED_BATCH_GRADES_STORAGE_KEY = 'lsh-runs-saved-batch-grades-v1';
const LSH_JUDGE_RUBRIC_LIBRARY_STORAGE_KEY = 'lsh-runs.judge-rubric-library.v1';
const LSH_JUDGE_UI_STATE_STORAGE_KEY = 'lsh-runs.judge-ui-state.v1';
const LSH_BUILTIN_RUBRIC_TIMESTAMP = '2026-03-06T00:00:00.000Z';
const LSH_BUILTIN_JUDGE_RUBRICS: JudgeRubricTemplate[] = [
    {
        id: 'lsh_builtin_contract_outline_rubric_v1',
        name: 'Contract Law Outline Compliance',
        createdAt: LSH_BUILTIN_RUBRIC_TIMESTAMP,
        updatedAt: LSH_BUILTIN_RUBRIC_TIMESTAMP,
        content: [
            'Use the selected Contract Law Outline as the substantive expectations for what a strong answer should spot and analyze.',
            '',
            'Operationalize it this way:',
            '- Evaluate the model answer as free-form response text; do not expect the answer itself to be JSON or IRAC-labeled.',
            '- Reward answers that identify the controlling contract formation and enforceability issues before secondary issues.',
            '- Reward correct rule statements only when they are tied to the facts.',
            '- Do not give substantial credit for merely naming outline topics without applying them.',
            '- Penalize answers that omit dispositive doctrines clearly implicated by the facts.',
            '- Do not penalize omission of outline sections that are not factually relevant.',
            '- Treat incorrect doctrinal statements as more serious than incomplete organization.',
            '- If the answer follows the outline mechanically but misses the case-dispositive issue, apply low scores on A, C, and K and consider controlling_doctrine_omitted.',
            '- Prefer concise, hierarchy-aware legal reasoning over exhaustive issue dumping.',
            '- Evaluate compliance with the outline as: issue selection, doctrinal accuracy, exception handling, and application to facts.',
        ].join('\n'),
    },
    {
        id: 'lsh_builtin_tort_outline_rubric_v1',
        name: 'Tort Law Outline Compliance',
        createdAt: LSH_BUILTIN_RUBRIC_TIMESTAMP,
        updatedAt: LSH_BUILTIN_RUBRIC_TIMESTAMP,
        content: [
            'Use the selected Tort Law Outline as the substantive expectations for what a strong answer should spot and analyze.',
            '',
            'Operationalize it this way:',
            '- Evaluate the model answer as free-form response text; do not expect the answer itself to be JSON or IRAC-labeled.',
            '- Reward answers that identify the controlling tort claim, defenses, and causation/damages issues before secondary issues.',
            '- Reward correct element-by-element analysis only when it is tied to the facts.',
            '- Do not give substantial credit for merely naming tort doctrines without applying them.',
            '- Penalize answers that omit dispositive duty, breach, causation, intent, privilege, or damages issues clearly implicated by the facts.',
            '- Do not penalize omission of outline sections that are not factually relevant.',
            '- Treat incorrect doctrinal statements as more serious than incomplete organization.',
            '- If the answer recites the outline mechanically but misses the dispositive liability or defense issue, apply low scores on A, C, and K and consider controlling_doctrine_omitted or material_rule_misstatement as appropriate.',
            '- Prefer concise, hierarchy-aware legal reasoning over exhaustive issue dumping.',
            '- Evaluate compliance with the outline as: claim selection, doctrinal accuracy, defense handling, and application to facts.',
        ].join('\n'),
    },
];
const LSH_OUTLINE_TO_RUBRIC_ID: Record<string, string> = {
    'contract_law_outline.pdf': 'lsh_builtin_contract_outline_rubric_v1',
    'tort_law_outline.pdf': 'lsh_builtin_tort_outline_rubric_v1',
};

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
const JUDGE_ROW_LABELS: Record<typeof JUDGE_ROW_ORDER[number], string> = {
    A: 'Issue spotting + prioritization',
    B: 'Formation framing + consideration vs conditional gift',
    C: 'SoF categories + triggers and enforceability vs proof distinction',
    D: 'One-year SoF test + application',
    E: 'Suretyship nuance + main purpose prerequisites',
    F: 'SoF exceptions/workarounds + limits',
    G: 'Promissory estoppel alternative + reliance rigor',
    H: 'Defenses/conditions/mistake: motive vs condition precedent',
    I: 'Factual fidelity + internal consistency',
    J: 'Clear bottom line + structured reasoning',
    K: 'Barrier stacking + exception mapping',
    L: 'Scope calibration / claim discipline',
    M: 'Relevance discipline / prompt adherence',
};
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
    const [sampleMembersMode, setSampleMembersMode] = useState<'centroid' | 'edge'>('centroid');
    const [selectedSampleMemberId, setSelectedSampleMemberId] = useState<string | null>(null);
    const [isIracComparisonExpanded, setIsIracComparisonExpanded] = useState(false);
    const [visibleModels, setVisibleModels] = useState<string[]>([]);
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
    const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

    const [judgeProvider, setJudgeProvider] = useState<JudgeProvider>('openai');
    const [judgeModel, setJudgeModel] = useState<string>(JUDGE_MODEL_OPTIONS.openai[0].value);
    const [judgeReasoningEffort, setJudgeReasoningEffort] = useState<JudgeReasoningEffort>('auto');
    const [judgeInstructions, setJudgeInstructions] = useState('');
    const [judgeRubricLibrary, setJudgeRubricLibrary] = useState<JudgeRubricTemplate[]>([]);
    const [selectedJudgeRubricTemplateId, setSelectedJudgeRubricTemplateId] = useState('');
    const [judgeRubricNameDraft, setJudgeRubricNameDraft] = useState('');
    const [judgeRubricStatus, setJudgeRubricStatus] = useState<string | null>(null);
    const [hasHydratedJudgeRubricLibrary, setHasHydratedJudgeRubricLibrary] = useState(false);
    const [hasHydratedJudgeUiState, setHasHydratedJudgeUiState] = useState(false);
    const [availableOutlines, setAvailableOutlines] = useState<OutlineReferenceOption[]>([]);
    const [selectedJudgeOutlineIds, setSelectedJudgeOutlineIds] = useState<string[]>([]);
    const [isJudgingCluster, setIsJudgingCluster] = useState(false);
    const [isBatchJudging, setIsBatchJudging] = useState(false);
    const [batchProgress, setBatchProgress] = useState<BatchJudgeProgress | null>(null);
    const [batchErrors, setBatchErrors] = useState<Array<{ clusterId: string; message: string }>>([]);
    const [judgeError, setJudgeError] = useState<string | null>(null);
    const [judgeResultsByCluster, setJudgeResultsByCluster] = useState<Record<string, ClusterJudgeSnapshot>>({});
    const [savedGrades, setSavedGrades] = useState<SavedGradeRecord[]>([]);
    const [savedBatchGrades, setSavedBatchGrades] = useState<SavedBatchGradeRecord[]>([]);
    const [latestBatchJudgeRun, setLatestBatchJudgeRun] = useState<BatchJudgeRunRecord | null>(null);
    const [selectedSavedGradeIds, setSelectedSavedGradeIds] = useState<string[]>([]);
    const [savedGradesStatus, setSavedGradesStatus] = useState<string | null>(null);
    const [savedBatchGradesStatus, setSavedBatchGradesStatus] = useState<string | null>(null);
    const [comparisonGradeIds, setComparisonGradeIds] = useState<string[]>([]);
    const [isComparisonVisible, setIsComparisonVisible] = useState(false);
    const [inspectorPanePercent, setInspectorPanePercent] = useState(28);
    const [isResizingPanes, setIsResizingPanes] = useState(false);
    const splitPaneRef = useRef<HTMLDivElement | null>(null);

    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [runQuestion, setRunQuestion] = useState('');
    const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
    const [runBenchmarkError, setRunBenchmarkError] = useState<string | null>(null);

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
        setSavedBatchGrades(readSavedBatchGradesFromStorage());
    }, []);

    useEffect(() => {
        setJudgeRubricLibrary(readJudgeRubricLibraryFromStorage({
            storageKey: LSH_JUDGE_RUBRIC_LIBRARY_STORAGE_KEY,
            builtinTemplates: LSH_BUILTIN_JUDGE_RUBRICS,
        }));
        setHasHydratedJudgeRubricLibrary(true);

        const persistedJudgeUiState = readLshJudgeUiStateFromStorage();
        if (persistedJudgeUiState) {
            setJudgeProvider(persistedJudgeUiState.provider);
            setJudgeModel(persistedJudgeUiState.model);
            setJudgeReasoningEffort(persistedJudgeUiState.reasoningEffort);
            setJudgeInstructions(persistedJudgeUiState.judgeInstructions);
            setSelectedJudgeOutlineIds(persistedJudgeUiState.selectedJudgeOutlineIds);
            setSelectedJudgeRubricTemplateId(persistedJudgeUiState.selectedJudgeRubricTemplateId);
            setJudgeRubricNameDraft(persistedJudgeUiState.judgeRubricNameDraft);
        }
        setHasHydratedJudgeUiState(true);
    }, []);

    useEffect(() => {
        async function loadOutlines() {
            try {
                const res = await fetch('/api/outlines', { cache: 'no-store' });
                const json = (await res.json()) as OutlinesApiResponse;
                if (!Array.isArray(json.outlines)) {
                    setAvailableOutlines([]);
                    return;
                }
                setAvailableOutlines(json.outlines);
            } catch (error) {
                console.error('Failed to load outlines', error);
                setAvailableOutlines([]);
            }
        }

        void loadOutlines();
    }, []);

    useEffect(() => {
        writeSavedGradesToStorage(savedGrades);
    }, [savedGrades]);

    useEffect(() => {
        writeSavedBatchGradesToStorage(savedBatchGrades);
    }, [savedBatchGrades]);

    useEffect(() => {
        if (!hasHydratedJudgeRubricLibrary) {
            return;
        }
        writeJudgeRubricLibraryToStorage(judgeRubricLibrary, LSH_JUDGE_RUBRIC_LIBRARY_STORAGE_KEY);
    }, [hasHydratedJudgeRubricLibrary, judgeRubricLibrary]);

    useEffect(() => {
        if (!hasHydratedJudgeUiState) {
            return;
        }
        writeLshJudgeUiStateToStorage({
            provider: judgeProvider,
            model: judgeModel,
            reasoningEffort: judgeReasoningEffort,
            judgeInstructions,
            selectedJudgeOutlineIds,
            selectedJudgeRubricTemplateId,
            judgeRubricNameDraft,
        });
    }, [
        hasHydratedJudgeUiState,
        judgeInstructions,
        judgeModel,
        judgeProvider,
        judgeReasoningEffort,
        judgeRubricNameDraft,
        selectedJudgeOutlineIds,
        selectedJudgeRubricTemplateId,
    ]);

    useEffect(() => {
        const validOutlineIds = new Set(availableOutlines.map((outline) => outline.id));
        setSelectedJudgeOutlineIds((previous) => previous.filter((id) => validOutlineIds.has(id)));
    }, [availableOutlines]);

    useEffect(() => {
        const validIds = new Set(judgeRubricLibrary.map((rubric) => rubric.id));
        if (selectedJudgeRubricTemplateId && !validIds.has(selectedJudgeRubricTemplateId)) {
            setSelectedJudgeRubricTemplateId('');
        }
    }, [judgeRubricLibrary, selectedJudgeRubricTemplateId]);

    useEffect(() => {
        const autoRubricId = getAutoJudgeRubricIdForOutlineSelection(selectedJudgeOutlineIds);
        if (!autoRubricId) {
            return;
        }

        const autoRubric = judgeRubricLibrary.find((rubric) => rubric.id === autoRubricId);
        if (!autoRubric) {
            return;
        }

        const shouldUpdateSelection = selectedJudgeRubricTemplateId !== autoRubric.id;
        const shouldUpdateName = judgeRubricNameDraft !== autoRubric.name;
        const shouldUpdateInstructions = judgeInstructions !== autoRubric.content;

        if (!shouldUpdateSelection && !shouldUpdateName && !shouldUpdateInstructions) {
            return;
        }

        setSelectedJudgeRubricTemplateId(autoRubric.id);
        setJudgeRubricNameDraft(autoRubric.name);
        setJudgeInstructions(autoRubric.content);
        setJudgeRubricStatus(`Auto-loaded "${autoRubric.name}" from the selected outline.`);
    }, [
        judgeInstructions,
        judgeRubricLibrary,
        judgeRubricNameDraft,
        selectedJudgeOutlineIds,
        selectedJudgeRubricTemplateId,
    ]);

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
    const selectedJudgeRubricTemplate = useMemo(
        () => judgeRubricLibrary.find((rubric) => rubric.id === selectedJudgeRubricTemplateId) || null,
        [judgeRubricLibrary, selectedJudgeRubricTemplateId],
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
        setIsBatchJudging(false);
        setBatchProgress(null);
        setBatchErrors([]);
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
        if (!savedBatchGradesStatus) {
            return;
        }
        const timer = window.setTimeout(() => setSavedBatchGradesStatus(null), 2500);
        return () => window.clearTimeout(timer);
    }, [savedBatchGradesStatus]);

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

    useEffect(() => {
        setSelectedSampleMemberId(null);
    }, [activeClusterId]);

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
    const visibleBatchJudgeStats = useMemo(
        () => buildBatchJudgeStatistics(latestBatchJudgeRun, selectedRunFile, selectedRun),
        [latestBatchJudgeRun, selectedRun, selectedRunFile],
    );
    const allSavedGradesSelected = savedGrades.length > 0 && selectedSavedGradeIds.length === savedGrades.length;

    const toggleJudgeOutlineSelection = (outlineId: string) => {
        setSelectedJudgeOutlineIds((previous) => {
            if (previous.includes(outlineId)) {
                return previous.filter((id) => id !== outlineId);
            }
            return [...previous, outlineId];
        });
    };

    const upsertSnapshot = useCallback((snapshot: ClusterJudgeSnapshot) => {
        const key = buildJudgeResultKey(snapshot.runFile, snapshot.clusterId);
        setJudgeResultsByCluster((previous) => ({
            ...previous,
            [key]: snapshot,
        }));
    }, []);

    const buildSavedRecord = useCallback((snapshot: ClusterJudgeSnapshot): SavedGradeRecord => ({
        id: `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        savedAt: new Date().toISOString(),
        grading: snapshot.grading,
        judgeConfig: snapshot.judgeConfig,
        runFile: snapshot.runFile,
        clusterId: snapshot.clusterId,
        memberCount: snapshot.memberCount,
    }), []);

    const requestClusterJudge = useCallback(async (params: {
        runFile: string;
        clusterId: string;
        clusterSizeHint: number;
        contextMode: JudgeContextMode;
    }): Promise<ClusterJudgeSnapshot> => {
        const payload: {
            runFile: string;
            clusterId: string;
            judgeProvider: JudgeProvider;
            judgeModel: string;
            customInstructions: string;
            contextMode: JudgeContextMode;
            judgeOutlineIds: string[];
            reasoningEffort?: Exclude<JudgeReasoningEffort, 'auto'>;
        } = {
            runFile: params.runFile,
            clusterId: params.clusterId,
            judgeProvider,
            judgeModel,
            customInstructions: judgeInstructions,
            contextMode: params.contextMode,
            judgeOutlineIds: selectedJudgeOutlineIds,
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

        return {
            grading: data.grading,
            judgeConfig: {
                provider: data.judgeConfig?.provider || judgeProvider,
                model: data.judgeConfig?.model || judgeModel,
                reasoningEffort: normalizeReasoningEffort(data.judgeConfig?.reasoningEffort),
                customInstructions: typeof data.judgeConfig?.customInstructions === 'string'
                    ? data.judgeConfig.customInstructions
                    : judgeInstructions,
                contextMode: normalizeJudgeContextMode(data.judgeConfig?.contextMode, params.contextMode),
                judgeOutlineIds: Array.isArray(data.judgeConfig?.judgeOutlineIds)
                    ? data.judgeConfig.judgeOutlineIds.filter((id): id is string => typeof id === 'string')
                    : selectedJudgeOutlineIds,
            },
            runFile: data.cluster?.runFile || params.runFile,
            clusterId: data.cluster?.clusterId || params.clusterId,
            memberCount: Number.isFinite(data.cluster?.memberCount) ? data.cluster.memberCount : params.clusterSizeHint,
            gradedAt: new Date().toISOString(),
        };
    }, [
        judgeInstructions,
        judgeModel,
        judgeProvider,
        judgeReasoningEffort,
        judgeSupportsReasoningControl,
        selectedJudgeOutlineIds,
    ]);

    const handleJudgeCluster = async () => {
        if (!selectedRunFile || !selectedCluster) {
            return;
        }

        setIsJudgingCluster(true);
        setJudgeError(null);

        try {
            const snapshot = await requestClusterJudge({
                runFile: selectedRunFile,
                clusterId: selectedCluster.id,
                clusterSizeHint: selectedCluster.size,
                contextMode: 'full_cluster',
            });
            upsertSnapshot(snapshot);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to judge cluster.';
            setJudgeError(message);
        } finally {
            setIsJudgingCluster(false);
        }
    };

    const handleJudgeAllCentroids = useCallback(async () => {
        if (!selectedRunFile || !selectedRun) {
            return;
        }

        const startedAt = new Date().toISOString();
        setIsBatchJudging(true);
        setJudgeError(null);
        setBatchErrors([]);
        setLatestBatchJudgeRun(null);

        const targets = selectedRun.clusters.map((cluster) => ({ id: cluster.id, size: cluster.size }));
        const total = targets.length;
        setBatchProgress({ total, completed: 0, succeeded: 0, failed: 0 });

        let completed = 0;
        let succeeded = 0;
        let failed = 0;
        const errorRows: Array<{ clusterId: string; message: string }> = [];
        const successfulSnapshots: ClusterJudgeSnapshot[] = [];

        for (const target of targets) {
            try {
                const snapshot = await requestClusterJudge({
                    runFile: selectedRunFile,
                    clusterId: target.id,
                    clusterSizeHint: target.size,
                    contextMode: 'centroid_only',
                });
                upsertSnapshot(snapshot);
                successfulSnapshots.push(snapshot);
                succeeded += 1;
            } catch (error) {
                failed += 1;
                const message = error instanceof Error ? error.message : 'Failed to grade cluster centroid.';
                errorRows.push({ clusterId: target.id, message });
            } finally {
                completed += 1;
                setBatchProgress({ total, completed, succeeded, failed });
            }
        }

        setBatchErrors(errorRows);
        setLatestBatchJudgeRun({
            id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            runFile: selectedRunFile,
            startedAt,
            completedAt: new Date().toISOString(),
            judgeConfig: {
                provider: judgeProvider,
                model: judgeModel,
                reasoningEffort: judgeReasoningEffort,
                customInstructions: judgeInstructions,
                contextMode: 'centroid_only',
                judgeOutlineIds: [...selectedJudgeOutlineIds],
            },
            snapshots: successfulSnapshots,
            errors: errorRows,
        });
        setSavedGradesStatus(
            `Batch grading complete: ${succeeded} succeeded, ${failed} failed. Save the all-cluster run explicitly if you want to keep it.`
        );
        setIsBatchJudging(false);
    }, [judgeInstructions, judgeModel, judgeProvider, judgeReasoningEffort, requestClusterJudge, selectedJudgeOutlineIds, selectedRun, selectedRunFile, upsertSnapshot]);

    const handleSaveLatestGrade = () => {
        if (!selectedClusterSnapshot) {
            return;
        }

        const savedRecord = buildSavedRecord(selectedClusterSnapshot);

        setSavedGrades((previous) => [savedRecord, ...previous]);
        setSelectedSavedGradeIds((previous) => [savedRecord.id, ...previous.filter((id) => id !== savedRecord.id)]);
        setSavedGradesStatus('Grade saved for comparison.');
    };

    const handleSaveLatestBatchGrade = useCallback(() => {
        if (!latestBatchJudgeRun) {
            return;
        }

        const savedBatchGrade: SavedBatchGradeRecord = {
            id: `saved_batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            savedAt: new Date().toISOString(),
            batchRun: latestBatchJudgeRun,
        };

        setSavedBatchGrades((previous) => [savedBatchGrade, ...previous]);
        setSavedBatchGradesStatus('All-cluster grade saved.');
    }, [latestBatchJudgeRun]);

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

    const deleteSavedBatchGrade = useCallback((gradeId: string) => {
        setSavedBatchGrades((previous) => previous.filter((grade) => grade.id !== gradeId));
        setSavedBatchGradesStatus('Saved all-cluster grade deleted.');
    }, []);

    const clearAllSavedBatchGrades = useCallback(() => {
        setSavedBatchGrades([]);
        setSavedBatchGradesStatus('All saved all-cluster grades cleared.');
    }, []);

    const handleCompareSelected = () => {
        if (selectedSavedGradeIds.length === 0) {
            setSavedGradesStatus('Select at least one saved grade to compare.');
            return;
        }
        setComparisonGradeIds(selectedSavedGradeIds);
        setIsComparisonVisible(true);
        setSavedGradesStatus(`Comparing ${selectedSavedGradeIds.length} saved grade${selectedSavedGradeIds.length === 1 ? '' : 's'}.`);
    };

    const handleRunBenchmark = async () => {
        if (!runQuestion.trim()) return;

        setIsRunningBenchmark(true);
        setRunBenchmarkError(null);

        try {
            const response = await fetch('/api/lsh-runs/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: runQuestion }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to start benchmark run');
            }

            setIsRunModalOpen(false);
            setRunQuestion('');
            // Optional: trigger reload of runs since a new one was just created
            void loadRuns();
        } catch (error) {
            setRunBenchmarkError(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsRunningBenchmark(false);
        }
    };

    const handleSelectJudgeRubricTemplate = useCallback((templateId: string) => {
        setSelectedJudgeRubricTemplateId(templateId);
        if (!templateId) {
            setJudgeRubricStatus('Started a new judge rubric draft.');
            return;
        }

        const selectedTemplate = judgeRubricLibrary.find((rubric) => rubric.id === templateId);
        if (!selectedTemplate) {
            return;
        }

        setJudgeRubricNameDraft(selectedTemplate.name);
        setJudgeInstructions(selectedTemplate.content);
        setJudgeRubricStatus(`Loaded judge rubric "${selectedTemplate.name}".`);
    }, [judgeRubricLibrary]);

    const saveJudgeRubricTemplate = useCallback(() => {
        const content = judgeInstructions.trim();
        if (!content) {
            setJudgeRubricStatus('Judge rubric instructions are required.');
            return;
        }

        const name = judgeRubricNameDraft.trim() || 'Untitled judge rubric';
        if (selectedJudgeRubricTemplate) {
            if (isBuiltinJudgeRubricTemplateId(selectedJudgeRubricTemplate.id, LSH_BUILTIN_JUDGE_RUBRICS)) {
                setJudgeRubricStatus('Built-in judge rubrics cannot be overwritten.');
                return;
            }

            setJudgeRubricLibrary((previous) => previous.map((rubric) => (
                rubric.id === selectedJudgeRubricTemplate.id
                    ? { ...rubric, name, content, updatedAt: new Date().toISOString() }
                    : rubric
            )));
            setJudgeRubricNameDraft(name);
            setJudgeRubricStatus('Judge rubric updated.');
            return;
        }

        const created = createJudgeRubricTemplate(name, content);
        setJudgeRubricLibrary((previous) => [created, ...previous]);
        setSelectedJudgeRubricTemplateId(created.id);
        setJudgeRubricNameDraft(created.name);
        setJudgeRubricStatus('Judge rubric saved.');
    }, [judgeInstructions, judgeRubricNameDraft, selectedJudgeRubricTemplate]);

    const createNewJudgeRubricDraft = useCallback(() => {
        setSelectedJudgeRubricTemplateId('');
        setJudgeRubricNameDraft('');
        setJudgeInstructions('');
        setJudgeRubricStatus('Started a new judge rubric draft.');
    }, []);

    const deleteSelectedJudgeRubric = useCallback(() => {
        if (!selectedJudgeRubricTemplate) {
            setJudgeRubricStatus('Select a judge rubric to delete.');
            return;
        }
        if (isBuiltinJudgeRubricTemplateId(selectedJudgeRubricTemplate.id, LSH_BUILTIN_JUDGE_RUBRICS)) {
            setJudgeRubricStatus('Built-in judge rubrics cannot be deleted.');
            return;
        }

        setJudgeRubricLibrary((previous) => previous.filter((rubric) => rubric.id !== selectedJudgeRubricTemplate.id));
        setSelectedJudgeRubricTemplateId('');
        setJudgeRubricNameDraft('');
        setJudgeRubricStatus('Judge rubric deleted.');
    }, [selectedJudgeRubricTemplate]);

    const judgeControlsPanel = (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

                    <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">Judge Rubrics</p>
                            <span className="text-[11px] font-semibold text-slate-500">{judgeRubricLibrary.length} saved</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                            Saved rubrics on this page persist locally and stay separate from rubric-first multi-model judge. Selecting a single mapped outline auto-loads its paired rubric.
                        </p>
                        <label className="block text-[11px] font-semibold text-slate-600">
                            Saved rubric
                            <select
                                value={selectedJudgeRubricTemplateId}
                                onChange={(event) => handleSelectJudgeRubricTemplate(event.target.value)}
                                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
                            >
                                <option value="">New draft</option>
                                {judgeRubricLibrary.map((rubric) => (
                                    <option key={rubric.id} value={rubric.id}>
                                        {rubric.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <details className="rounded border border-slate-200 bg-white">
                            <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-slate-700">
                                View enforced JSON output contract
                            </summary>
                            <div className="space-y-2 border-t border-slate-200 px-2 py-2">
                                <p className="text-[11px] text-slate-500">
                                    This format is enforced by the judge route itself, not by the selected rubric text.
                                </p>
                                <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-700">{LSH_JUDGE_OUTPUT_JSON_SCHEMA}</pre>
                                <div className="space-y-1 text-[11px] text-slate-600">
                                    {LSH_JUDGE_OUTPUT_RULES.map((rule) => (
                                        <p key={rule}>{rule}</p>
                                    ))}
                                    <p>- summary must be concise and specific to this cluster.</p>
                                </div>
                            </div>
                        </details>
                        <label className="block text-[11px] font-semibold text-slate-600">
                            Rubric name
                            <input
                                value={judgeRubricNameDraft}
                                onChange={(event) => setJudgeRubricNameDraft(event.target.value)}
                                placeholder="Contract Law Outline Compliance"
                                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400"
                            />
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={saveJudgeRubricTemplate}
                                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                                {selectedJudgeRubricTemplate ? 'Update rubric' : 'Save rubric'}
                            </button>
                            <button
                                type="button"
                                onClick={createNewJudgeRubricDraft}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                                New draft
                            </button>
                            <button
                                type="button"
                                onClick={deleteSelectedJudgeRubric}
                                disabled={!selectedJudgeRubricTemplate}
                                className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Delete
                            </button>
                        </div>
                        {judgeRubricStatus ? (
                            <p className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
                                {judgeRubricStatus}
                            </p>
                        ) : null}
                    </div>

                    <label className="block text-[11px] font-semibold text-slate-600">
                        Judge rubric instructions
                        <textarea
                            value={judgeInstructions}
                            onChange={(event) => setJudgeInstructions(event.target.value)}
                            rows={4}
                            placeholder="Add saved or ad hoc grading preferences (optional). Base rubric is always applied."
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 placeholder:text-slate-400"
                        />
                    </label>

                    <div className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">Outline Rubrics (Judge)</p>
                            <span className="text-[11px] font-semibold text-slate-500">{selectedJudgeOutlineIds.length} selected</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                            Checked outlines are retrieved with RAG and treated as additional rubric context for judging this cluster.
                        </p>
                        <div className="max-h-32 overflow-y-auto rounded border border-slate-300 bg-white">
                            {availableOutlines.length === 0 ? (
                                <p className="px-2 py-1.5 text-[11px] text-slate-500">No outlines available.</p>
                            ) : (
                                <div className="divide-y divide-slate-200">
                                    {availableOutlines.map((outline) => {
                                        const selected = selectedJudgeOutlineIds.includes(outline.id);
                                        return (
                                            <label key={`lsh-judge-outline-${outline.id}`} className={`flex cursor-pointer items-start gap-2 px-2 py-1.5 ${selected ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleJudgeOutlineSelection(outline.id)}
                                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-[11px] font-semibold text-slate-800">{outline.title}</span>
                                                    <span className="block text-[10px] text-slate-500">{outline.fileName}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleJudgeCluster}
                            disabled={isJudgingCluster || isBatchJudging}
                            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isJudgingCluster ? 'Grading cluster...' : `Grade ${selectedCluster.id === 'noise' ? 'Noise Cluster' : `Cluster ${selectedCluster.id}`}`}
                        </button>

                        <button
                            type="button"
                            onClick={handleJudgeAllCentroids}
                            disabled={isBatchJudging || isJudgingCluster || !selectedRun}
                            className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isBatchJudging ? 'Grading all centroids...' : 'Grade All Cluster Centroids'}
                        </button>
                    </div>

                    <p className="text-[11px] text-slate-500">
                        Latest grade is temporary. Use Save grade to keep it for comparison.
                    </p>

                    {batchProgress && (
                        <p className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-800">
                            {batchProgress.completed}/{batchProgress.total} completed • {batchProgress.succeeded} succeeded • {batchProgress.failed} failed
                        </p>
                    )}

                    {batchErrors.length > 0 && (
                        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                            <p className="font-semibold">Batch failures:</p>
                            <div className="mt-1 space-y-0.5">
                                {batchErrors.slice(0, 6).map((row) => (
                                    <p key={`${row.clusterId}-${row.message}`}>
                                        {row.clusterId}: {row.message}
                                    </p>
                                ))}
                                {batchErrors.length > 6 && (
                                    <p>...and {batchErrors.length - 6} more</p>
                                )}
                            </div>
                        </div>
                    )}

                    {judgeError && (
                        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{judgeError}</p>
                    )}
                </div>
            )}
        </div>
    );

    const judgeResultsPanel = (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Judge Results</p>
            {!selectedCluster ? (
                <p className="mt-2 text-xs text-slate-600">Select a cluster to view grading results.</p>
            ) : (
                <div className="mt-2 space-y-3">
                    <p className="text-[11px] text-slate-500">
                        Latest grade is temporary. Use Save grade to keep it for comparison.
                    </p>

                    {selectedClusterGrade && (
                        <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Selected cluster grade</p>
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

                    <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Latest cross-cluster run statistics</p>
                                <p className="mt-0.5 text-[11px] text-slate-600">
                                    Batch centroid judging across all clusters, grouped as one reproducible run.
                                </p>
                            </div>
                            {visibleBatchJudgeStats ? (
                                <p className="text-[10px] font-semibold text-slate-500">
                                    Completed {formatDateTime(visibleBatchJudgeStats.completedAt)}
                                </p>
                            ) : null}
                        </div>

                        {!visibleBatchJudgeStats ? (
                            <p className="text-xs text-slate-600">
                                Run `Grade All Cluster Centroids` to populate all-cluster statistics for the selected run.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSaveLatestBatchGrade}
                                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                                    >
                                        Save all-cluster grade
                                    </button>
                                    {savedBatchGradesStatus ? (
                                        <p className="text-[11px] text-emerald-700">{savedBatchGradesStatus}</p>
                                    ) : null}
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
                                    <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Clusters graded</p>
                                        <p className="mt-1 text-sm font-bold text-slate-900">{visibleBatchJudgeStats.gradedClusterCount}</p>
                                        <p className="text-[10px] text-slate-500">{visibleBatchJudgeStats.failureCount} failures</p>
                                    </div>
                                    <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Average final</p>
                                        <p className="mt-1 text-sm font-bold text-slate-900">{visibleBatchJudgeStats.averageFinalScore.toFixed(2)}</p>
                                        <p className="text-[10px] text-slate-500">centroid-only batch judge</p>
                                    </div>
                                    <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Average subtotal</p>
                                        <p className="mt-1 text-sm font-bold text-slate-900">{visibleBatchJudgeStats.averageSubtotal.toFixed(2)}</p>
                                        <p className="text-[10px] text-slate-500">before penalties/caps</p>
                                    </div>
                                    <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Average penalties</p>
                                        <p className="mt-1 text-sm font-bold text-slate-900">-{visibleBatchJudgeStats.averagePenalty.toFixed(2)}</p>
                                        <p className="text-[10px] text-slate-500">
                                            {visibleBatchJudgeStats.judgeConfig.provider}/{visibleBatchJudgeStats.judgeConfig.model}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid gap-2 lg:grid-cols-2">
                                    <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Best cluster</p>
                                        {visibleBatchJudgeStats.bestCluster ? (
                                            <>
                                                <p className="mt-1 text-sm font-bold text-emerald-900">
                                                    {visibleBatchJudgeStats.bestCluster.clusterId} • {visibleBatchJudgeStats.bestCluster.finalScore.toFixed(2)}
                                                </p>
                                                <p className="text-[11px] text-emerald-800">
                                                    {visibleBatchJudgeStats.bestCluster.outcome} • {visibleBatchJudgeStats.bestCluster.correctness}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="mt-1 text-xs text-emerald-800">No successful cluster grades yet.</p>
                                        )}
                                    </div>
                                    <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-700">Lowest-scoring cluster</p>
                                        {visibleBatchJudgeStats.weakestCluster ? (
                                            <>
                                                <p className="mt-1 text-sm font-bold text-rose-900">
                                                    {visibleBatchJudgeStats.weakestCluster.clusterId} • {visibleBatchJudgeStats.weakestCluster.finalScore.toFixed(2)}
                                                </p>
                                                <p className="text-[11px] text-rose-800">
                                                    {visibleBatchJudgeStats.weakestCluster.outcome} • {visibleBatchJudgeStats.weakestCluster.correctness}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="mt-1 text-xs text-rose-800">No successful cluster grades yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid gap-2 lg:grid-cols-3">
                                    <div className="rounded border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Outcome distribution</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {visibleBatchJudgeStats.outcomeCounts.map((entry) => (
                                                <span key={`batch-outcome-${entry.label}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                                    {entry.label}: {entry.count}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Correctness distribution</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {visibleBatchJudgeStats.correctnessCounts.map((entry) => (
                                                <span key={`batch-correctness-${entry.label}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                                    {entry.label}: {entry.count}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Reasoning distribution</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {visibleBatchJudgeStats.reasoningCounts.map((entry) => (
                                                <span key={`batch-reasoning-${entry.label}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                                    {entry.label}: {entry.count}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Average rubric performance by aspect</p>
                                        <p className="text-[10px] text-slate-500">Average score is on the 0-4 row scale.</p>
                                    </div>
                                    <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                        {visibleBatchJudgeStats.aspectRows.map((aspect) => (
                                            <div key={`aspect-${aspect.rowKey}`} className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-[11px] font-bold text-slate-800">{aspect.rowKey}</p>
                                                        <p className="text-[10px] leading-4 text-slate-600">{aspect.label}</p>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-900">{aspect.averageScore.toFixed(2)} / 4</p>
                                                </div>
                                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"
                                                        style={{ width: `${clampNumber((aspect.averageScore / 4) * 100, 0, 100)}%` }}
                                                    />
                                                </div>
                                                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
                                                    <span>Avg points: {aspect.averagePoints.toFixed(2)}</span>
                                                    <span>4/4 in {aspect.maxedCount}</span>
                                                </div>
                                                <p className="mt-1 text-[10px] text-slate-500">Scores of 0-1 in {aspect.lowScoreCount} clusters.</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Per-cluster rubric table</p>
                                            <p className="mt-0.5 text-[10px] text-slate-500">Each row is one cluster from the latest cross-cluster centroid run.</p>
                                        </div>
                                        <p className="text-[10px] text-slate-500">Rows A-M are the rubric aspect scores.</p>
                                    </div>
                                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">A-M key</p>
                                        <div className="mt-1.5 grid gap-x-3 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
                                            {JUDGE_ROW_ORDER.map((rowKey) => (
                                                <p key={`cluster-table-key-${rowKey}`} className="text-[10px] leading-4 text-slate-600">
                                                    <span className="font-bold text-slate-800">{rowKey}</span>: {JUDGE_ROW_LABELS[rowKey]}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mt-2 overflow-x-auto">
                                        <table className="min-w-[1380px] divide-y divide-slate-200 text-[11px]">
                                            <thead>
                                                <tr className="bg-slate-50 text-left text-slate-600">
                                                    <th className="px-2 py-1.5 font-semibold">Cluster</th>
                                                    <th className="px-2 py-1.5 font-semibold">Members</th>
                                                    <th className="px-2 py-1.5 font-semibold">Final</th>
                                                    <th className="px-2 py-1.5 font-semibold">Subtotal</th>
                                                    <th className="px-2 py-1.5 font-semibold">Penalty</th>
                                                    <th className="px-2 py-1.5 font-semibold">Cap</th>
                                                    <th className="px-2 py-1.5 font-semibold">Outcome</th>
                                                    <th className="px-2 py-1.5 font-semibold">Correctness</th>
                                                    {JUDGE_ROW_ORDER.map((rowKey) => (
                                                        <th
                                                            key={`batch-header-${rowKey}`}
                                                            title={JUDGE_ROW_LABELS[rowKey]}
                                                            className="px-2 py-1.5 text-center font-semibold"
                                                        >
                                                            {rowKey}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {visibleBatchJudgeStats.clusterRows.map((clusterRow) => (
                                                    <tr key={`batch-cluster-${clusterRow.clusterId}`} className="align-top text-slate-700">
                                                        <td className="px-2 py-1.5 font-semibold text-slate-900">{clusterRow.clusterId}</td>
                                                        <td className="px-2 py-1.5">{clusterRow.memberCount}</td>
                                                        <td className="px-2 py-1.5 font-semibold text-slate-900">{clusterRow.finalScore.toFixed(2)}</td>
                                                        <td className="px-2 py-1.5">{clusterRow.subtotal.toFixed(2)}</td>
                                                        <td className="px-2 py-1.5">-{clusterRow.penaltyTotal.toFixed(2)}</td>
                                                        <td className="px-2 py-1.5">{formatJudgeCap(clusterRow.cap)}</td>
                                                        <td className="max-w-[220px] px-2 py-1.5">{clusterRow.outcome}</td>
                                                        <td className="max-w-[220px] px-2 py-1.5">{clusterRow.correctness}</td>
                                                        {JUDGE_ROW_ORDER.map((rowKey) => {
                                                            const score = clusterRow.rowScores[rowKey] ?? 0;
                                                            return (
                                                                <td key={`batch-cell-${clusterRow.clusterId}-${rowKey}`} className="px-2 py-1.5 text-center">
                                                                    <span className={`inline-flex min-w-8 items-center justify-center rounded-full px-1.5 py-0.5 font-semibold ${
                                                                        score >= 3 ? 'bg-emerald-50 text-emerald-800'
                                                                            : score >= 2 ? 'bg-amber-50 text-amber-800'
                                                                                : 'bg-rose-50 text-rose-800'
                                                                    }`}>
                                                                        {score}
                                                                    </span>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {visibleBatchJudgeStats.failureCount > 0 && (
                                        <p className="mt-2 text-[10px] text-amber-700">
                                            {visibleBatchJudgeStats.failureCount} cluster grades failed in this batch run. See the batch failure list in the left judge panel for details.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Saved all-cluster grades</p>
                            <p className="text-xs font-semibold text-slate-700">{savedBatchGrades.length}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={clearAllSavedBatchGrades}
                                disabled={savedBatchGrades.length === 0}
                                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Clear all
                            </button>
                        </div>

                        {savedBatchGradesStatus ? (
                            <p className="text-[11px] text-emerald-700">{savedBatchGradesStatus}</p>
                        ) : null}

                        {savedBatchGrades.length === 0 ? (
                            <p className="text-xs text-slate-600">
                                No saved all-cluster grades yet. Batch runs must be saved explicitly.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="flex gap-2 pb-1">
                                    {savedBatchGrades.map((grade) => {
                                        const stats = buildBatchJudgeStatistics(grade.batchRun, grade.batchRun.runFile, selectedRun?.fileName === grade.batchRun.runFile ? selectedRun : null);
                                        return (
                                            <div
                                                key={grade.id}
                                                className="min-w-[260px] rounded border border-slate-200 bg-white px-2.5 py-2 text-[11px]"
                                            >
                                                <div className="min-w-0">
                                                    <span className="block truncate font-semibold text-slate-800">
                                                        {grade.batchRun.judgeConfig.provider}/{grade.batchRun.judgeConfig.model}
                                                    </span>
                                                    <span className="mt-0.5 block text-slate-600">
                                                        {stats ? `${stats.averageFinalScore.toFixed(1)} avg` : `${grade.batchRun.snapshots.length} clusters`}
                                                    </span>
                                                    <span className="block text-[10px] text-slate-500">
                                                        {grade.batchRun.snapshots.length} graded clusters
                                                        {grade.batchRun.errors.length > 0 ? ` • ${grade.batchRun.errors.length} failures` : ''}
                                                    </span>
                                                    {grade.batchRun.judgeConfig.judgeOutlineIds.length > 0 && (
                                                        <span className="block text-[10px] text-slate-500">
                                                            outlines: {grade.batchRun.judgeConfig.judgeOutlineIds.length}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-2 flex items-center justify-between gap-2">
                                                    <span className="text-[10px] text-slate-500">{formatDateTime(grade.savedAt)}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteSavedBatchGrade(grade.id)}
                                                        className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
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
                    </div>

                    <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Saved cluster grades</p>
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
                                                        {grade.judgeConfig.judgeOutlineIds.length > 0 && (
                                                            <span className="block text-[10px] text-slate-500">
                                                                outlines: {grade.judgeConfig.judgeOutlineIds.length}
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                                <div className="mt-1 flex items-center justify-between gap-2">
                                                    <span className="text-[10px] text-slate-500">{formatDateTime(grade.savedAt)}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteSavedGrade(grade.id)}
                                                        className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
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
    );

    return (
        <AppShell
            eyebrow="LSH-RUHS"
            title="Interactive Cluster Separation Map"
            subtitle="Filter by model and cluster size, inspect cluster members, and compare saved grading snapshots."
            maxWidthClassName="max-w-none"
        >
            <div className={`${isResizingPanes ? 'select-none' : ''}`}>
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
                            <button
                                onClick={() => setIsRunModalOpen(true)}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
                            >
                                Run New Benchmark
                            </button>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isStreamConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {isStreamConnected ? 'Live stream connected' : 'Live stream reconnecting'}
                            </span>
                            <Link
                                href="/general-benchmarking"
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                            >
                                Open Benchmark Runner
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
                                        <div className="min-w-0 xl:order-3 xl:shrink-0 xl:basis-[var(--map-pane-basis)]">
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
                                                        const isSelectedSample = selectedSampleMemberId === point.memberId;
                                                        const isCentroid = point.isCentroid ?? false;
                                                        const baseRadius = isSelectedSample ? 7 : active ? 4.8 : 3.4;
                                                        const strokeColor = isSelectedSample ? '#fbbf24' : isCentroid ? '#0d9488' : 'none';
                                                        const strokeWidth = isSelectedSample ? 3 : isCentroid ? 2 : 0;
                                                        return (
                                                            <g key={`${point.clusterId}-${index}`}>
                                                                <title>{isCentroid ? `${point.memberId} (cluster centroid)` : point.memberId ?? point.model}</title>
                                                                <circle
                                                                    cx={toSvgX(point.x, axisDomain)}
                                                                    cy={toSvgY(point.y, axisDomain)}
                                                                    r={isCentroid && !isSelectedSample ? baseRadius + 0.8 : baseRadius}
                                                                    fill={modelColorMap.get(point.model) || '#94a3b8'}
                                                                    fillOpacity={muted && !isSelectedSample ? 0.18 : 0.9}
                                                                    stroke={strokeColor}
                                                                    strokeWidth={strokeWidth}
                                                                    onMouseEnter={() => setHoveredClusterId(point.clusterId)}
                                                                    onMouseLeave={() => setHoveredClusterId((current) => (current === point.clusterId ? null : current))}
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        setSelectedClusterId(point.clusterId);
                                                                    }}
                                                                    className="cursor-pointer"
                                                                />
                                                            </g>
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

                                            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h3 className="text-sm font-bold text-slate-900">Selected Cluster Outcomes</h3>
                                                    {selectedCluster ? (
                                                        <p className="text-[11px] font-semibold text-slate-500">
                                                            {selectedCluster.id === 'noise' ? 'Noise Cluster' : `Cluster ${selectedCluster.id}`}
                                                        </p>
                                                    ) : null}
                                                </div>

                                                {selectedClusterGrade ? (
                                                    <div className="mt-3 space-y-3">
                                                        <p className="text-xs text-slate-600">
                                                            These tags describe the currently selected cluster grade. They are not a whole-run or all-cluster aggregate.
                                                        </p>

                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Cluster conclusion tag</p>
                                                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedClusterGrade.outcomes.bottomLineOutcome}</p>
                                                            </div>
                                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Legal correctness tag</p>
                                                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedClusterGrade.outcomes.outcomeCorrectness}</p>
                                                            </div>
                                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Reasoning alignment tag</p>
                                                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedClusterGrade.outcomes.reasoningAlignment}</p>
                                                            </div>
                                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Jurisdiction assumption</p>
                                                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedClusterGrade.outcomes.jurisdictionAssumption}</p>
                                                            </div>
                                                        </div>

                                                        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Judge summary</p>
                                                            <p className="mt-2 text-sm leading-6 text-slate-700">{selectedClusterGrade.summary}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-sm text-slate-600">
                                                        Grade a cluster, or select a graded cluster after batch judging, to see its outcome tags and summary here.
                                                    </p>
                                                )}
                                            </div>

                                            {judgeResultsPanel}
                                        </div>

                                        <div className="hidden xl:order-2 xl:flex xl:w-3 xl:shrink-0 xl:items-center xl:justify-center">
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

                                        <aside className="min-w-0 xl:order-1 xl:shrink-0 xl:basis-[var(--inspector-pane-basis)]">
                                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h3 className="text-sm font-bold text-slate-900">Cluster Inspector</h3>
                                                    {selectedClusterId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedClusterId(null);
                                                                setSelectedSampleMemberId(null);
                                                            }}
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

                                                        {focusCluster.topicSignals && focusCluster.topicSignals.length > 0 && (
                                                            <div>
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Topic signals</p>
                                                                <div className="mt-1.5 space-y-1">
                                                                    {focusCluster.topicSignals.map((signal) => (
                                                                        <div
                                                                            key={`${focusCluster.id}-topic-${signal.topic}`}
                                                                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
                                                                        >
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <span className="text-[11px] font-semibold text-slate-700">{signal.topic}</span>
                                                                                <span className="text-[11px] font-semibold text-slate-700">{signal.score.toFixed(1)}</span>
                                                                            </div>
                                                                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                                                                <div
                                                                                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                                                                                    style={{ width: `${clampNumber(signal.score, 0, 100)}%` }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

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
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sample members</p>
                                                                    <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setSampleMembersMode('centroid')}
                                                                            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${sampleMembersMode === 'centroid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                                        >
                                                                            Centroid
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setSampleMembersMode('edge')}
                                                                            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${sampleMembersMode === 'edge' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                                        >
                                                                            Edge cases
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {sampleMembersMode === 'edge' && (!focusCluster.edgeMembersPreview || focusCluster.edgeMembersPreview.length === 0) ? (
                                                                    <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                                                                        <p className="text-[11px] text-amber-800">
                                                                            Edge sampling requires re-running the pipeline to compute outer-third members.
                                                                        </p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-1.5 space-y-1">
                                                                        {(sampleMembersMode === 'centroid'
                                                                            ? focusCluster.membersPreview.slice(0, 3)
                                                                            : focusCluster.edgeMembersPreview ?? []
                                                                        ).map((member) => {
                                                                            const isSelected = selectedSampleMemberId === member.id;
                                                                            const isActualCentroid = sampleMembersMode === 'centroid' && member.id === focusCluster.representative.id;
                                                                            return (
                                                                                <button
                                                                                    key={`${focusCluster.id}-${member.id}`}
                                                                                    type="button"
                                                                                    onClick={() => setSelectedSampleMemberId(isSelected ? null : member.id)}
                                                                                    className={`w-full rounded border px-2 py-1.5 text-left transition ${isSelected ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : isActualCentroid ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-300' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'}`}
                                                                                >
                                                                                    <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                                                                                        {member.id} ({member.model})
                                                                                        {isActualCentroid && (
                                                                                            <span className="rounded bg-teal-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                                                                                                Centroid
                                                                                            </span>
                                                                                        )}
                                                                                    </p>
                                                                                    <p className="mt-0.5 text-[11px] text-slate-600">{member.textPreview}</p>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                                {selectedSampleMemberId && focusCluster && (() => {
                                                                    const sampleList = sampleMembersMode === 'centroid'
                                                                        ? focusCluster.membersPreview?.slice(0, 3) ?? []
                                                                        : focusCluster.edgeMembersPreview ?? [];
                                                                    const selectedMember = sampleList.find((m) => m.id === selectedSampleMemberId);
                                                                    if (!selectedMember) return null;
                                                                    const isActualCentroid = sampleMembersMode === 'centroid' && selectedMember.id === focusCluster.representative.id;
                                                                    return (
                                                                        <div className={`mt-2 rounded-lg border-2 p-3 ${isActualCentroid ? 'border-teal-400 bg-teal-50/80' : 'border-blue-300 bg-blue-50/80'}`}>
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <p className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                                                                    Full response: {selectedMember.id}
                                                                                    {isActualCentroid && (
                                                                                        <span className="rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                                                                            Cluster centroid
                                                                                        </span>
                                                                                    )}
                                                                                </p>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setSelectedSampleMemberId(null)}
                                                                                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                                                                                >
                                                                                    Close
                                                                                </button>
                                                                            </div>
                                                                            <div className="mt-2 max-h-64 overflow-y-auto rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 whitespace-pre-wrap">
                                                                                {selectedMember.text || selectedMember.textPreview || 'No content.'}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {selectedRun?.schema === 'IRAC' &&
                                                                    focusCluster?.membersPreview &&
                                                                    focusCluster.membersPreview.length > 0 &&
                                                                    focusCluster.edgeMembersPreview &&
                                                                    focusCluster.edgeMembersPreview.length > 0 &&
                                                                    focusCluster.membersPreview.some((m) => m.irac) &&
                                                                    focusCluster.edgeMembersPreview.some((m) => m.irac) && (
                                                                        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50/80 p-3">
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <div>
                                                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">IRAC section comparison</p>
                                                                                    <p className="mt-0.5 text-[10px] text-slate-500">Centroid vs edge cases by section</p>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setIsIracComparisonExpanded(true)}
                                                                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                                                                                >
                                                                                    Expand view
                                                                                </button>
                                                                            </div>
                                                                            <div className="mt-2 space-y-3">
                                                                                {(['issue', 'rule', 'application', 'conclusion'] as const).map((section) => {
                                                                                    const label = section.charAt(0).toUpperCase() + section.slice(1);
                                                                                    const centroidTexts = focusCluster.membersPreview!.slice(0, 3)
                                                                                        .filter((m) => m.irac?.[section])
                                                                                        .map((m) => ({ id: m.id, model: m.model, text: m.irac![section] }));
                                                                                    const edgeTexts = focusCluster.edgeMembersPreview!
                                                                                        .filter((m) => m.irac?.[section])
                                                                                        .map((m) => ({ id: m.id, model: m.model, text: m.irac![section] }));
                                                                                    if (centroidTexts.length === 0 && edgeTexts.length === 0) return null;
                                                                                    return (
                                                                                        <div key={section} className="rounded border border-slate-200 bg-white overflow-hidden">
                                                                                            <p className="bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
                                                                                            <div className="grid grid-cols-2 divide-x divide-slate-200">
                                                                                                <div className="p-2 min-w-0">
                                                                                                    <p className="text-[10px] font-semibold text-teal-700 mb-1">Centroids</p>
                                                                                                    <div className="space-y-2 max-h-32 overflow-y-auto text-[10px] text-slate-600">
                                                                                                        {centroidTexts.map(({ id, model, text }) => {
                                                                                                            const isActualCentroid = id === focusCluster.representative.id;
                                                                                                            return (
                                                                                                                <div key={id} className={`rounded border p-1.5 ${isActualCentroid ? 'border-teal-400 bg-teal-100 ring-1 ring-teal-300' : 'border-slate-100 bg-teal-50/30'}`}>
                                                                                                                    <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                                                                                                                        {id} ({model})
                                                                                                                        {isActualCentroid && (
                                                                                                                            <span className="rounded bg-teal-600 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Centroid</span>
                                                                                                                        )}
                                                                                                                    </p>
                                                                                                                    <p className="mt-0.5 whitespace-pre-wrap">{text}</p>
                                                                                                                </div>
                                                                                                            );
                                                                                                        })}
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div className="p-2 min-w-0">
                                                                                                    <p className="text-[10px] font-semibold text-amber-700 mb-1">Edge cases</p>
                                                                                                    <div className="space-y-2 max-h-32 overflow-y-auto text-[10px] text-slate-600">
                                                                                                        {edgeTexts.map(({ id, model, text }) => (
                                                                                                            <div key={id} className="rounded border border-slate-100 bg-amber-50/30 p-1.5">
                                                                                                                <p className="font-semibold text-slate-700">{id} ({model})</p>
                                                                                                                <p className="mt-0.5 whitespace-pre-wrap">{text}</p>
                                                                                                            </div>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            {isIracComparisonExpanded && (
                                                                                <div
                                                                                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                                                                                    onClick={() => setIsIracComparisonExpanded(false)}
                                                                                    role="dialog"
                                                                                    aria-modal="true"
                                                                                    aria-label="IRAC comparison expanded view"
                                                                                >
                                                                                    <div
                                                                                        className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                                                                                            <p className="text-sm font-bold text-slate-800">IRAC section comparison — expanded</p>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setIsIracComparisonExpanded(false)}
                                                                                                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                                                                                            >
                                                                                                Close
                                                                                            </button>
                                                                                        </div>
                                                                                        <div className="max-h-[calc(90vh-4rem)] overflow-y-auto p-4">
                                                                                            <div className="space-y-4">
                                                                                                {(['issue', 'rule', 'application', 'conclusion'] as const).map((section) => {
                                                                                                    const label = section.charAt(0).toUpperCase() + section.slice(1);
                                                                                                    const centroidTexts = focusCluster.membersPreview!.slice(0, 3)
                                                                                                        .filter((m) => m.irac?.[section])
                                                                                                        .map((m) => ({ id: m.id, model: m.model, text: m.irac![section] }));
                                                                                                    const edgeTexts = focusCluster.edgeMembersPreview!
                                                                                                        .filter((m) => m.irac?.[section])
                                                                                                        .map((m) => ({ id: m.id, model: m.model, text: m.irac![section] }));
                                                                                                    if (centroidTexts.length === 0 && edgeTexts.length === 0) return null;
                                                                                                    return (
                                                                                                        <div key={section} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                                                                                            <p className="bg-slate-100 px-3 py-2 text-sm font-bold uppercase tracking-wider text-slate-600">{label}</p>
                                                                                                            <div className="grid grid-cols-2 divide-x divide-slate-200">
                                                                                                                <div className="p-4 min-w-0">
                                                                                                                    <p className="text-sm font-semibold text-teal-700 mb-2">Centroids</p>
                                                                                                                    <div className="space-y-3 text-sm text-slate-600">
                                                                                                                        {centroidTexts.map(({ id, model, text }) => {
                                                                                                                            const isActualCentroid = id === focusCluster.representative.id;
                                                                                                                            return (
                                                                                                                                <div key={id} className={`rounded-lg border p-3 ${isActualCentroid ? 'border-teal-400 bg-teal-100 ring-2 ring-teal-300' : 'border-slate-200 bg-teal-50/40'}`}>
                                                                                                                                    <p className="font-semibold text-slate-700 flex items-center gap-2">
                                                                                                                                        {id} ({model})
                                                                                                                                        {isActualCentroid && (
                                                                                                                                            <span className="rounded bg-teal-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">Cluster centroid</span>
                                                                                                                                        )}
                                                                                                                                    </p>
                                                                                                                                    <p className="mt-2 whitespace-pre-wrap leading-relaxed">{text}</p>
                                                                                                                                </div>
                                                                                                                            );
                                                                                                                        })}
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                                <div className="p-4 min-w-0">
                                                                                                                    <p className="text-sm font-semibold text-amber-700 mb-2">Edge cases</p>
                                                                                                                    <div className="space-y-3 text-sm text-slate-600">
                                                                                                                        {edgeTexts.map(({ id, model, text }) => (
                                                                                                                            <div key={id} className="rounded-lg border border-slate-200 bg-amber-50/40 p-3">
                                                                                                                                <p className="font-semibold text-slate-700">{id} ({model})</p>
                                                                                                                                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{text}</p>
                                                                                                                            </div>
                                                                                                                        ))}
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-sm text-slate-600">Click or hover a cluster to inspect details.</p>
                                                )}

                                                {judgeControlsPanel}

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

            {/* Run New Benchmark Modal */}
            {isRunModalOpen && (
                <div className="relative z-50">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" />
                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                            <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-200">
                                <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                                    <div className="sm:flex sm:items-start">
                                        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                                            <h3 className="text-lg font-semibold leading-6 text-slate-900">
                                                Run LSH-IRAC Benchmark
                                            </h3>
                                            <div className="mt-2 text-sm text-slate-500 space-y-3">
                                                <p>
                                                    Enter a legal question below. The backend will fetch ~100+ responses from multiple models and cluster them using LSH + UMAP + HDBSCAN.
                                                </p>
                                                <div className="my-2 rounded-md bg-blue-50 p-3 text-blue-800 text-xs text-left">
                                                    <strong>Note:</strong> This process will take a few minutes as it waits for all models to respond. Please do not close this window.
                                                </div>
                                                <textarea
                                                    rows={4}
                                                    className="mt-2 block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
                                                    placeholder="Enter a legal fact pattern or question..."
                                                    value={runQuestion}
                                                    onChange={(e) => setRunQuestion(e.target.value)}
                                                    disabled={isRunningBenchmark}
                                                />
                                                {runBenchmarkError && (
                                                    <p className="text-red-600 text-sm mt-2">{runBenchmarkError}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                                    <button
                                        type="button"
                                        className={`inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm sm:ml-3 sm:w-auto ${isRunningBenchmark || !runQuestion.trim()
                                            ? 'bg-blue-400 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                            }`}
                                        onClick={handleRunBenchmark}
                                        disabled={isRunningBenchmark || !runQuestion.trim()}
                                    >
                                        {isRunningBenchmark ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Running...
                                            </span>
                                        ) : 'Start Benchmark'}
                                    </button>
                                    <button
                                        type="button"
                                        className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:mt-0 sm:w-auto"
                                        onClick={() => !isRunningBenchmark && setIsRunModalOpen(false)}
                                        disabled={isRunningBenchmark}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
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

            const members = cluster.members ?? [];
            return {
                clusterId: cluster.id,
                radius,
                visibleMembers,
                totalMembers: cluster.size,
                dominantModel,
                note: cluster.representative.textPreview,
                visibleBreakdown,
                members,
                representativeId: cluster.representative.id,
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
        const membersByModel = new Map<string, string[]>();
        for (const m of seed.members) {
            if (visibleModels.has(m.model)) {
                const list = membersByModel.get(m.model) ?? [];
                list.push(m.id);
                membersByModel.set(m.model, list);
            }
        }
        const modelCounters = new Map<string, number>();
        for (const entry of seed.visibleBreakdown) {
            modelCounters.set(entry.model, 0);
        }

        sequence.forEach((model, pointIndex) => {
            const randomSeed = hashString(`${seed.clusterId}:${model}:${pointIndex}`);
            const radialPosition = region.radius * Math.sqrt((pointIndex + 1) / sequence.length);
            const theta = pointIndex * GOLDEN_ANGLE + seededFloat(randomSeed, 1) * 0.85;
            const jitterX = (seededFloat(randomSeed, 2) - 0.5) * 0.85;
            const jitterY = (seededFloat(randomSeed, 3) - 0.5) * 0.85;

            const modelList = membersByModel.get(model) ?? [];
            const counter = modelCounters.get(model) ?? 0;
            const memberId = modelList[counter] ?? undefined;
            modelCounters.set(model, counter + 1);

            points.push({
                x: region.centerX + Math.cos(theta) * radialPosition + jitterX,
                y: region.centerY + Math.sin(theta) * radialPosition + jitterY,
                model,
                clusterId: seed.clusterId,
                memberId,
                isCentroid: memberId === seed.representativeId,
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

function getAutoJudgeRubricIdForOutlineSelection(selectedOutlineIds: string[]) {
    if (selectedOutlineIds.length !== 1) {
        return null;
    }
    return LSH_OUTLINE_TO_RUBRIC_ID[selectedOutlineIds[0]] || null;
}

type LshJudgeUiState = {
    provider: JudgeProvider;
    model: string;
    reasoningEffort: JudgeReasoningEffort;
    judgeInstructions: string;
    selectedJudgeOutlineIds: string[];
    selectedJudgeRubricTemplateId: string;
    judgeRubricNameDraft: string;
};

function readLshJudgeUiStateFromStorage(): LshJudgeUiState | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(LSH_JUDGE_UI_STATE_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const source = parsed as Record<string, unknown>;
        const provider = source.provider === 'openai' || source.provider === 'anthropic' || source.provider === 'gemini'
            ? source.provider
            : 'openai';
        const model = typeof source.model === 'string' && source.model.trim().length > 0
            ? source.model.trim()
            : JUDGE_MODEL_OPTIONS[provider][0].value;

        return {
            provider,
            model,
            reasoningEffort: normalizeReasoningEffort(source.reasoningEffort),
            judgeInstructions: typeof source.judgeInstructions === 'string' ? source.judgeInstructions : '',
            selectedJudgeOutlineIds: Array.isArray(source.selectedJudgeOutlineIds)
                ? source.selectedJudgeOutlineIds.filter((id): id is string => typeof id === 'string')
                : [],
            selectedJudgeRubricTemplateId: typeof source.selectedJudgeRubricTemplateId === 'string'
                ? source.selectedJudgeRubricTemplateId
                : '',
            judgeRubricNameDraft: typeof source.judgeRubricNameDraft === 'string'
                ? source.judgeRubricNameDraft
                : '',
        };
    } catch {
        return null;
    }
}

function writeLshJudgeUiStateToStorage(state: LshJudgeUiState) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(LSH_JUDGE_UI_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Failed to persist LSH judge UI state:', error);
    }
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

function readSavedBatchGradesFromStorage(): SavedBatchGradeRecord[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(SAVED_BATCH_GRADES_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => normalizeSavedBatchGrade(entry))
            .filter((entry): entry is SavedBatchGradeRecord => entry !== null)
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

function writeSavedBatchGradesToStorage(savedBatchGrades: SavedBatchGradeRecord[]) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(SAVED_BATCH_GRADES_STORAGE_KEY, JSON.stringify(savedBatchGrades));
    } catch (error) {
        console.error('Failed to persist saved batch grades:', error);
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
    const judgeOutlineIds = Array.isArray(rawJudgeConfig?.judgeOutlineIds)
        ? rawJudgeConfig.judgeOutlineIds
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : [];

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
            contextMode: normalizeJudgeContextMode(rawJudgeConfig?.contextMode, 'full_cluster'),
            judgeOutlineIds,
        },
    };
}

function normalizeSavedBatchGrade(value: unknown): SavedBatchGradeRecord | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Record<string, unknown>;
    const id = typeof source.id === 'string' ? source.id : '';
    const savedAt = typeof source.savedAt === 'string' ? source.savedAt : '';
    const batchRun = normalizeBatchJudgeRun(source.batchRun);
    if (!id || !savedAt || !batchRun) {
        return null;
    }

    return {
        id,
        savedAt,
        batchRun,
    };
}

function normalizeBatchJudgeRun(value: unknown): BatchJudgeRunRecord | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Record<string, unknown>;
    const id = typeof source.id === 'string' ? source.id : '';
    const runFile = typeof source.runFile === 'string' ? source.runFile : '';
    const startedAt = typeof source.startedAt === 'string' ? source.startedAt : '';
    const completedAt = typeof source.completedAt === 'string' ? source.completedAt : '';
    const judgeConfig = normalizeJudgeConfig(source.judgeConfig, 'centroid_only');
    const snapshots = Array.isArray(source.snapshots)
        ? source.snapshots
            .map((entry) => normalizeClusterJudgeSnapshot(entry))
            .filter((entry): entry is ClusterJudgeSnapshot => entry !== null)
        : [];
    const errors = Array.isArray(source.errors)
        ? source.errors
            .map((entry) => normalizeBatchJudgeError(entry))
            .filter((entry): entry is { clusterId: string; message: string } => entry !== null)
        : [];

    if (!id || !runFile || !startedAt || !completedAt || !judgeConfig) {
        return null;
    }

    return {
        id,
        runFile,
        startedAt,
        completedAt,
        judgeConfig,
        snapshots,
        errors,
    };
}

function normalizeClusterJudgeSnapshot(value: unknown): ClusterJudgeSnapshot | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Record<string, unknown>;
    const grading = source.grading as ClusterJudgeResult | undefined;
    const judgeConfig = normalizeJudgeConfig(source.judgeConfig, 'full_cluster');
    const runFile = typeof source.runFile === 'string' ? source.runFile : '';
    const clusterId = typeof source.clusterId === 'string' ? source.clusterId : '';
    const memberCount = typeof source.memberCount === 'number' && Number.isFinite(source.memberCount)
        ? source.memberCount
        : 0;
    const gradedAt = typeof source.gradedAt === 'string' ? source.gradedAt : '';

    if (!grading || !judgeConfig || !runFile || !clusterId || !gradedAt) {
        return null;
    }

    return {
        grading,
        judgeConfig,
        runFile,
        clusterId,
        memberCount,
        gradedAt,
    };
}

function normalizeJudgeConfig(value: unknown, fallbackContextMode: JudgeContextMode): JudgeConfig | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Record<string, unknown>;
    const provider = source.provider;
    const model = source.model;
    if (
        (provider !== 'openai' && provider !== 'anthropic' && provider !== 'gemini')
        || typeof model !== 'string'
        || model.trim().length === 0
    ) {
        return null;
    }

    return {
        provider,
        model,
        reasoningEffort: normalizeReasoningEffort(source.reasoningEffort),
        customInstructions: typeof source.customInstructions === 'string' ? source.customInstructions : '',
        contextMode: normalizeJudgeContextMode(source.contextMode, fallbackContextMode),
        judgeOutlineIds: Array.isArray(source.judgeOutlineIds)
            ? source.judgeOutlineIds
                .filter((id): id is string => typeof id === 'string')
                .map((id) => id.trim())
                .filter((id) => id.length > 0)
            : [],
    };
}

function normalizeBatchJudgeError(value: unknown) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Record<string, unknown>;
    const clusterId = typeof source.clusterId === 'string' ? source.clusterId : '';
    const message = typeof source.message === 'string' ? source.message : '';
    if (!clusterId || !message) {
        return null;
    }
    return { clusterId, message };
}

function normalizeJudgeContextMode(value: unknown, fallback: JudgeContextMode = 'full_cluster'): JudgeContextMode {
    if (value === 'centroid_only') {
        return 'centroid_only';
    }
    if (value === 'full_cluster') {
        return 'full_cluster';
    }
    return fallback;
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

function buildBatchJudgeStatistics(
    batchRun: BatchJudgeRunRecord | null,
    selectedRunFile: string | null,
    selectedRun: LshRunDetails | null,
): BatchJudgeStatistics | null {
    if (!batchRun || !selectedRunFile || batchRun.runFile !== selectedRunFile || batchRun.snapshots.length === 0) {
        return null;
    }

    const clusterOrder = new Map(
        (selectedRun?.clusters || []).map((cluster, index) => [cluster.id, index]),
    );
    const clusterRows = batchRun.snapshots
        .map<BatchJudgeClusterStatRow>((snapshot) => ({
            clusterId: snapshot.clusterId,
            memberCount: snapshot.memberCount,
            finalScore: snapshot.grading.finalScore,
            subtotal: snapshot.grading.subtotal,
            penaltyTotal: snapshot.grading.penaltyTotal,
            cap: snapshot.grading.cap,
            outcome: snapshot.grading.outcomes.bottomLineOutcome,
            correctness: snapshot.grading.outcomes.outcomeCorrectness,
            reasoning: snapshot.grading.outcomes.reasoningAlignment,
            rowScores: snapshot.grading.rowScores,
        }))
        .sort((a, b) => {
            const orderA = clusterOrder.get(a.clusterId);
            const orderB = clusterOrder.get(b.clusterId);
            if (typeof orderA === 'number' && typeof orderB === 'number' && orderA !== orderB) {
                return orderA - orderB;
            }
            if (typeof orderA === 'number') {
                return -1;
            }
            if (typeof orderB === 'number') {
                return 1;
            }
            return a.clusterId.localeCompare(b.clusterId, undefined, { numeric: true, sensitivity: 'base' });
        });

    const gradedClusterCount = clusterRows.length;
    const averageFinalScore = clusterRows.reduce((sum, cluster) => sum + cluster.finalScore, 0) / gradedClusterCount;
    const averageSubtotal = clusterRows.reduce((sum, cluster) => sum + cluster.subtotal, 0) / gradedClusterCount;
    const averagePenalty = clusterRows.reduce((sum, cluster) => sum + cluster.penaltyTotal, 0) / gradedClusterCount;
    const aspectRows = JUDGE_ROW_ORDER.map<BatchJudgeAspectStat>((rowKey) => {
        const totalScore = clusterRows.reduce((sum, cluster) => sum + (cluster.rowScores[rowKey] ?? 0), 0);
        const totalPoints = batchRun.snapshots.reduce((sum, snapshot) => sum + (snapshot.grading.rowPoints[rowKey] ?? 0), 0);
        const maxedCount = clusterRows.filter((cluster) => (cluster.rowScores[rowKey] ?? 0) >= 4).length;
        const lowScoreCount = clusterRows.filter((cluster) => (cluster.rowScores[rowKey] ?? 0) <= 1).length;
        return {
            rowKey,
            label: JUDGE_ROW_LABELS[rowKey],
            averageScore: totalScore / gradedClusterCount,
            averagePoints: totalPoints / gradedClusterCount,
            maxedCount,
            lowScoreCount,
        };
    });

    return {
        runId: batchRun.id,
        startedAt: batchRun.startedAt,
        completedAt: batchRun.completedAt,
        judgeConfig: batchRun.judgeConfig,
        gradedClusterCount,
        failureCount: batchRun.errors.length,
        averageFinalScore,
        averageSubtotal,
        averagePenalty,
        bestCluster: clusterRows.reduce<BatchJudgeClusterStatRow | null>((best, cluster) => {
            if (!best || cluster.finalScore > best.finalScore) {
                return cluster;
            }
            return best;
        }, null),
        weakestCluster: clusterRows.reduce<BatchJudgeClusterStatRow | null>((weakest, cluster) => {
            if (!weakest || cluster.finalScore < weakest.finalScore) {
                return cluster;
            }
            return weakest;
        }, null),
        aspectRows,
        clusterRows,
        outcomeCounts: countLabelFrequency(clusterRows.map((cluster) => cluster.outcome)),
        correctnessCounts: countLabelFrequency(clusterRows.map((cluster) => cluster.correctness)),
        reasoningCounts: countLabelFrequency(clusterRows.map((cluster) => cluster.reasoning)),
    };
}

function countLabelFrequency(values: string[]) {
    const counts = new Map<string, number>();
    for (const value of values) {
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.label.localeCompare(b.label);
        });
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
