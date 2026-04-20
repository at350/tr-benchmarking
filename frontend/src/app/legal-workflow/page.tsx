'use client';

import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Network, Scale, ScrollText, ShieldAlert } from 'lucide-react';

import { DashaResultsExplorer } from '@/components/DashaResultsExplorer';
import { AppShell } from '@/components/ui/AppShell';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
    DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND,
    FRANK_V2_BENCHMARK_HEADINGS,
    FRANK_V2_PACK_LABELS,
    RUBRIC_MODULE_LABELS,
} from '@/lib/legal-workflow-v2-constants';
import type {
    ArtifactRole,
    DashaJudgeSettings,
    DashaRunV2,
    DashaSelectedModel,
    FrankPacketV2,
    FrankGenerationSettings,
    FrankSofPackId,
    KarthicCapRule,
    KarthicPenaltyRule,
    KarthicRubricPackV2,
    KarthicRubricRow,
    KarthicRubricTrackId,
    PromptGenerationSettingsByKind,
    QuestionVarianceMenuOption,
    ReasoningEffort,
} from '@/lib/legal-workflow-v2-types';
import {
    MODEL_OPTIONS_BY_PROVIDER,
    PROVIDER_LABELS,
    REASONING_OPTIONS,
    supportsReasoningEffortControl,
    type ModelProvider,
} from '@/lib/model-options';

type UploadRow = {
    file: File;
    role: ArtifactRole;
};

type BenchmarkCaseQuickSelect = {
    key: string;
    label: string;
    description: string;
    matchers: string[];
};

type WorkflowStageId =
    | 'source'
    | 'routing_intake'
    | 'extraction_mapping'
    | 'benchmark'
    | 'question'
    | 'seed_rubric'
    | 'refine_rubric'
    | 'approve_rubric'
    | 'dasha_cluster'
    | 'dasha_judge'
    | 'dasha_results'
    | 'zak_review';

type WorkflowBlockId = 'frank' | 'karthic' | 'dasha' | 'zak';

type WorkflowStageDefinition = {
    id: WorkflowStageId;
    title: string;
    description: string;
    shortLabel: string;
};

type WorkflowStageView = WorkflowStageDefinition & {
    complete: boolean;
    unlocked: boolean;
    blocked: boolean;
    statusLabel: string;
};

type WorkflowBlockDefinition = {
    id: WorkflowBlockId;
    title: string;
    description: string;
    stageIds: WorkflowStageId[];
};

type WorkflowBlockView = WorkflowBlockDefinition & {
    stages: WorkflowStageView[];
    complete: boolean;
    unlocked: boolean;
    blocked: boolean;
    active: boolean;
    statusLabel: string;
};

type WorkflowStageGuide = {
    purpose: string;
    stopRules?: string[];
    promptFiles?: string[];
    promptNote?: string;
};

type StagePromptPreview = {
    title: string;
    prompt: string;
};

type ApiErrorPayload = {
    error?: string;
};

type WorkflowActionState = {
    id: string;
    label: string;
};

type WorkflowStatusTone = 'idle' | 'progress' | 'success' | 'error';

type WorkflowGenerationTarget =
    | 'routing_intake_generation'
    | 'extraction_mapping_generation'
    | 'benchmark_generation'
    | 'question_generation'
    | 'question_variance_routing_menu_generation'
    | 'question_variance_package_generation'
    | 'rubric_generation';

type DashaJudgeModalTarget = 'run_default' | 'judge_override';

const DEFAULT_SELECTED_MODEL_KEYS = [
    'openai::gpt-5.4',
    'anthropic::claude-opus-4-6',
    'gemini::gemini-3.1-pro-preview',
];

const DEFAULT_DASHA_JUDGE_SETTINGS: DashaJudgeSettings = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    reasoningEffort: 'medium',
};

const BENCHMARK_CASE_QUICK_SELECTS: BenchmarkCaseQuickSelect[] = [
    {
        key: 'marraigesof_angelmire',
        label: 'marraigesof_angelmire',
        description: "Anglemire v. Policemen's Benevolent Association of Chicago",
        matchers: ['anglemire', 'policemen', 'marriage'],
    },
    {
        key: 'oneyearsof_westside',
        label: 'oneyearsof_westside',
        description: 'Westside Wrecker Service, Inc. v. Skafi',
        matchers: ['westside', 'skafi', 'oneyear'],
    },
    {
        key: 'suretysof_demeritt',
        label: 'suretysof_demeritt',
        description: 'Demeritt v. Bickford Surety',
        matchers: ['demeritt', 'bickford', 'surety'],
    },
];

const PACK_OPTIONS: Array<{ value: FrankSofPackId; label: string }> = [
    { value: 'pack10', label: FRANK_V2_PACK_LABELS.pack10 },
    { value: 'pack20', label: FRANK_V2_PACK_LABELS.pack20 },
    { value: 'pack30', label: FRANK_V2_PACK_LABELS.pack30 },
    { value: 'pack40', label: FRANK_V2_PACK_LABELS.pack40 },
];

const WORKFLOW_STAGES: WorkflowStageDefinition[] = [
    {
        id: 'source',
        title: 'Source Upload / Packet Selection',
        shortLabel: 'Source Upload',
        description: 'Upload authority or select an existing packet before the Frank phases begin.',
    },
    {
        id: 'routing_intake',
        title: 'Routing / Intake',
        shortLabel: 'Routing / Intake',
        description: 'Frank Phase 1: selected pack, routing confidence, and source-intake screening.',
    },
    {
        id: 'extraction_mapping',
        title: 'Extraction / Mapping',
        shortLabel: 'Extraction / Mapping',
        description: 'Frank Phase 2: source extraction sheet, gold-packet mapping, and likely failure modes.',
    },
    {
        id: 'benchmark',	
        title: 'Benchmark Answer',
        shortLabel: 'Benchmark Answer',
        description: 'Frank Phase 3: clean benchmark answer with the fixed v2 headings.',
    },
    {
        id: 'question',
        title: 'Reverse-Engineered Question',
        shortLabel: 'Question',
        description: 'Frank Phase 4: one neutral reverse-engineered hypo without the old task-packet structure.',
    },
    {
        id: 'seed_rubric',
        title: 'Seed Rubric Draft',
        shortLabel: 'Seed Rubric',
        description: 'Generate the initial rubric prefill directly from Frank artifacts and any selected variation context.',
    },
    {
        id: 'refine_rubric',
        title: 'Refine Rubric',
        shortLabel: 'Refine Rubric',
        description: 'Refine broad rows from the direct prefill draft and filter redundant or misaligned criteria.',
    },
    {
        id: 'approve_rubric',
        title: 'Approve Rubric',
        shortLabel: 'Approve Rubric',
        description: 'Review the refined rubric pack, confirm the row set, and approve it for Dasha.',
    },
    {
        id: 'dasha_cluster',
        title: 'Dasha Cluster',
        shortLabel: 'Cluster',
        description: 'Generate the final evaluation batch and cluster the raw answers before any judging begins.',
    },
    {
        id: 'dasha_judge',
        title: 'Dasha Judge',
        shortLabel: 'Judge',
        description: 'Judge clustered centroid representatives against the approved refined rubric.',
    },
    {
        id: 'dasha_results',
        title: 'Dasha Results',
        shortLabel: 'Results',
        description: 'Inspect propagated cluster scores, model summaries, and the current Dasha results view.',
    },
    {
        id: 'zak_review',
        title: 'Zak Escalation',
        shortLabel: 'Zak Review',
        description: 'Zak stage: SME escalation and instability review after Dasha when a packet needs human judgment.',
    },
];

const WORKFLOW_BLOCKS: WorkflowBlockDefinition[] = [
    {
        id: 'frank',
        title: 'Frank',
        description: 'Packet construction and benchmark setup.',
        stageIds: ['source', 'routing_intake', 'extraction_mapping', 'benchmark', 'question'],
    },
    {
        id: 'karthic',
        title: 'Karthic',
        description: 'Rubric construction and refinement.',
        stageIds: ['seed_rubric', 'refine_rubric', 'approve_rubric'],
    },
    {
        id: 'dasha',
        title: 'Dasha',
        description: 'Clustered judging and score inspection.',
        stageIds: ['dasha_cluster', 'dasha_judge', 'dasha_results'],
    },
    {
        id: 'zak',
        title: 'Zak',
        description: 'Escalation and SME review when the run is unstable.',
        stageIds: ['zak_review'],
    },
];

const FRANK_PHASE_ORDER: WorkflowStageId[] = [
    'routing_intake',
    'extraction_mapping',
    'benchmark',
    'question',
];

const WORKFLOW_STAGE_GUIDES: Record<WorkflowStageId, WorkflowStageGuide> = {
    source: {
        purpose: 'Upload authority to create a new Frank packet, or load an existing packet to continue working through later stages.',
        promptNote: 'Creating a packet immediately runs Frank Phase 1. The saved Phase 1 prompt appears below after packet creation.',
    },
    routing_intake: {
        purpose: 'Review the Phase 1 routing result: selected pack, routing confidence, intake rating, and any secondary issues before moving deeper into drafting.',
        stopRules: [
            'Weak routing confidence should stop the packet for JD review.',
            'Moderate sources need supporting authority before later generation.',
        ],
        promptNote: 'This panel shows the saved Phase 1 prompt and lets you adjust the stored routing notes before Phase 2.',
    },
    extraction_mapping: {
        purpose: 'Run Frank Phase 2 to generate the structured gold materials for this source: extraction sheet, gold-packet mapping, and likely failure modes.',
        stopRules: [
            'Blocked when routing confidence is weak.',
        ],
        promptFiles: [
            '00_MAIN_GPT_INSTRUCTIONS.txt',
            '01_CORE_WORKFLOW_TEMPLATE.txt',
            '02_CORE_SOURCE_INTAKE_CHECKLIST.txt',
            '05_SOF_ROUTING_MATRIX.txt',
            'Pack doctrine file',
            'Pack failure bank file',
        ],
        promptNote: 'Running or re-running Phase 2 refreshes all three structured outputs together from the same prompt bundle.',
    },
    benchmark: {
        purpose: 'Run Frank Phase 3 to generate or edit the clean benchmark answer that becomes the gold reasoning target for this packet.',
        stopRules: [
            'Blocked if Phase 2 is incomplete.',
            'Blocked if intake failed or a moderate source lacks supporting authority.',
        ],
        promptFiles: [
            '00_MAIN_GPT_INSTRUCTIONS.txt',
            '01_CORE_WORKFLOW_TEMPLATE.txt',
            '03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt',
            '06_CORE_SELF_AUDIT.txt',
            'Pack doctrine file',
        ],
        promptNote: 'Phase 3 produces prose, not JSON. The saved prompt and the generated benchmark answer are shown separately.',
    },
    question: {
        purpose: 'Run Frank Phase 4 to generate or edit the reverse-engineered neutral question that should trigger the benchmark reasoning without leaking the doctrine.',
        stopRules: [
            'The old task-packet format is rejected.',
            'The final call line must stay neutral and end in Analyze.',
        ],
        promptFiles: [
            '00_MAIN_GPT_INSTRUCTIONS.txt',
            '01_CORE_WORKFLOW_TEMPLATE.txt',
            '04_CORE_QUESTION_WRITING_CHECKLIST.txt',
            'Pack doctrine file',
        ],
        promptNote: 'Phase 4 runs only after the benchmark answer exists. The stored prompt below should always correspond to the current question draft.',
    },
    seed_rubric: {
        purpose: 'Generate the initial rubric draft directly from the approved Frank packet and the optional selected variation package.',
        stopRules: [
            'Frank must already be approved before Karthic prefill can start.',
        ],
        promptFiles: [
            '08_Karthic_Rubric_Build_Spec_v1.md',
            '09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md',
            '50_Karthic_PreFill_Instructions.rtf',
            '07_SHARED_MODULE_SKELETON.txt',
            'Pack doctrine file',
            'Pack failure bank file',
        ],
        promptNote: 'Seed drafting is now a direct prefill step. It should stay anchored to the controller card, the benchmark answer, and the selected variation state if variation is active.',
    },
    refine_rubric: {
        purpose: 'Refine the direct prefill rubric so broad or redundant rows become sharper and more discriminative without adding clutter.',
        stopRules: [
            'Only seeded rubric packs can be refined.',
            'Rows that do not sharpen doctrinal discrimination should be rewritten or conceptually dropped.',
        ],
        promptFiles: [
            '08_Karthic_Rubric_Build_Spec_v1.md',
            '09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md',
            '07_SHARED_MODULE_SKELETON.txt',
            'Pack doctrine file',
            'Pack failure bank file',
        ],
        promptNote: 'This is still a refinement pass, but it no longer depends on exploratory Karthic clustering.',
    },
    approve_rubric: {
        purpose: 'Review the refined rubric pack, the scoring policy, and the refinement log before approving the rubric for Dasha.',
        stopRules: [
            'Approval is blocked until the pack has refined status.',
        ],
        promptNote: 'Approval freezes the refined rubric as the judging target for Dasha.',
    },
    dasha_cluster: {
        purpose: 'Generate the full final response batch and cluster the answers before any row-level judging starts.',
        stopRules: [
            'Only approved refined rubric packs can start Dasha clustering.',
            'Clustering can fall back to heuristic mode if the Python pipeline is unavailable.',
        ],
        promptNote: 'This is the only clustering pass now. If variation is active, Dasha should run once per legal question track.',
    },
    dasha_judge: {
        purpose: 'Judge the clustered centroid representatives against the approved refined rubric after Dasha clustering has completed.',
        stopRules: [
            'Only clustered Dasha runs can be judged.',
        ],
        promptNote: 'Dasha judges centroid representatives row by row, then propagates those scores to the run summary.',
    },
    dasha_results: {
        purpose: 'Inspect the judged Dasha run in the results explorer after centroid judging has completed.',
        stopRules: [
            'Dasha judging must complete before the final scored results view is available.',
        ],
        promptNote: 'The raw cluster JSON stays in the Dasha Cluster stage. This results stage is the scored explorer for judged runs.',
    },
    zak_review: {
        purpose: 'Review the Dasha run for instability, caps, penalties, or other flags that should escalate the packet for SME inspection.',
        stopRules: [
            'Zak is shown as its own top-level block even though auto-triggering is not implemented yet.',
            'Use this as the manual handoff point when a Dasha run needs human review.',
        ],
        promptNote: 'The current branch exposes Zak in the pipeline structure, but escalation is still manual rather than automated.',
    },
};

const WORKFLOW_GENERATION_TARGET_LABELS: Record<WorkflowGenerationTarget, string> = {
    routing_intake_generation: 'Frank Phase 1',
    extraction_mapping_generation: 'Frank Phase 2',
    benchmark_generation: 'Frank Phase 3',
    question_generation: 'Frank Phase 4',
    question_variance_routing_menu_generation: 'Question Variation Menu',
    question_variance_package_generation: 'Question Variation Package',
    rubric_generation: 'Karthic Rubric',
};

type WorkflowPageMode = 'full' | 'frank_only';

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

type LegalWorkflowPageClientProps = {
    pageMode?: WorkflowPageMode;
    eyebrow?: string;
    title?: string;
    subtitle?: string;
};

export function LegalWorkflowPageClient({
    pageMode = 'full',
    eyebrow = 'Workflow v2',
    title = 'FKD Pipeline Redo',
    subtitle = 'A grouped Frank / Karthic / Dasha / Zak workflow with smaller substeps inside each block.',
}: LegalWorkflowPageClientProps) {
    const isFrankOnlyMode = pageMode === 'frank_only';
    const [hasMounted, setHasMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [activeAction, setActiveAction] = useState<WorkflowActionState | null>(null);
    const [isStatusDockCollapsed, setIsStatusDockCollapsed] = useState(false);
    const [visibleStage, setVisibleStage] = useState<WorkflowStageId>('source');
    const [isStageGuideOpen, setIsStageGuideOpen] = useState(true);

    const [frankPackets, setFrankPackets] = useState<FrankPacketV2[]>([]);
    const [selectedFrankId, setSelectedFrankId] = useState('');
    const [frankEditor, setFrankEditor] = useState<FrankPacketV2 | null>(null);
    const [newPacketTitle, setNewPacketTitle] = useState('');
    const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
    const [selectedBenchmarkTemplateKey, setSelectedBenchmarkTemplateKey] = useState('');
    const [selectedVariationOptionId, setSelectedVariationOptionId] = useState('');
    const [selectedVariationSwapIdsByOptionId, setSelectedVariationSwapIdsByOptionId] = useState<Record<string, string[]>>({});
    const [workflowGenerationSettingsDraft, setWorkflowGenerationSettingsDraft] = useState<PromptGenerationSettingsByKind>(
        clone(DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND),
    );
    const [openGenerationTarget, setOpenGenerationTarget] = useState<WorkflowGenerationTarget | null>(null);
    const [generationSettingsDraft, setGenerationSettingsDraft] = useState<FrankGenerationSettings>(
        clone(DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND.routing_intake_generation!),
    );

    const [rubricPacks, setRubricPacks] = useState<KarthicRubricPackV2[]>([]);
    const [selectedRubricId, setSelectedRubricId] = useState('');
    const [rubricEditor, setRubricEditor] = useState<KarthicRubricPackV2 | null>(null);
    const [collapsedRubricRows, setCollapsedRubricRows] = useState<Record<string, boolean>>({});

    const [dashaRuns, setDashaRuns] = useState<DashaRunV2[]>([]);
    const [selectedRunId, setSelectedRunId] = useState('');
    const [dashaRubricPackId, setDashaRubricPackId] = useState('');
    const [sampleCount, setSampleCount] = useState('120');
    const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>(DEFAULT_SELECTED_MODEL_KEYS);
    const [dashaJudgeSettings, setDashaJudgeSettings] = useState<DashaJudgeSettings>(clone(DEFAULT_DASHA_JUDGE_SETTINGS));
    const [judgeSettingsDraft, setJudgeSettingsDraft] = useState<DashaJudgeSettings>(clone(DEFAULT_DASHA_JUDGE_SETTINGS));
    const [openDashaJudgeTarget, setOpenDashaJudgeTarget] = useState<DashaJudgeModalTarget | null>(null);
    const workflowBlocks = useMemo(
        () => isFrankOnlyMode ? WORKFLOW_BLOCKS.filter((block) => block.id === 'frank') : WORKFLOW_BLOCKS,
        [isFrankOnlyMode],
    );
    const allowedStageIds = useMemo(
        () => new Set(workflowBlocks.flatMap((block) => block.stageIds)),
        [workflowBlocks],
    );
    const workflowStages = useMemo(
        () => WORKFLOW_STAGES.filter((stage) => allowedStageIds.has(stage.id)),
        [allowedStageIds],
    );

    const approvedFrankPackets = useMemo(
        () => frankPackets.filter((packet) => packet.status === 'approved'),
        [frankPackets],
    );
    const benchmarkCaseQuickSelectOptions = useMemo(() => {
        return BENCHMARK_CASE_QUICK_SELECTS.map((preset) => {
            const matchedPacket = frankPackets
                .filter((packet) => {
                    const searchText = [
                        packet.title,
                        packet.reverseEngineeredQuestion,
                        ...packet.sourceArtifacts.map((artifact) => artifact.fileName),
                    ].join(' ').toLowerCase();
                    return preset.matchers.every((matcher) => searchText.includes(matcher));
                })
                .sort((left, right) => {
                    const score = (packet: FrankPacketV2) => {
                        let total = 0;
                        if (packet.status === 'approved') {
                            total += 4;
                        }
                        if (packet.phase === 'question') {
                            total += 2;
                        }
                        if (packet.benchmarkAnswer.trim()) {
                            total += 1;
                        }
                        if (packet.reverseEngineeredQuestion.trim()) {
                            total += 1;
                        }
                        return total;
                    };
                    return score(right) - score(left)
                        || String(right.updatedAt).localeCompare(String(left.updatedAt));
                })[0] ?? null;

            return {
                ...preset,
                packet: matchedPacket,
            };
        });
    }, [frankPackets]);
    const selectedBenchmarkTemplate = useMemo(
        () => benchmarkCaseQuickSelectOptions.find((option) => option.key === selectedBenchmarkTemplateKey) ?? null,
        [benchmarkCaseQuickSelectOptions, selectedBenchmarkTemplateKey],
    );
    const approvedRubricPacks = useMemo(
        () => rubricPacks.filter((pack) => pack.status === 'approved'),
        [rubricPacks],
    );
    const selectedDashaPack = approvedRubricPacks.find((pack) => pack.id === dashaRubricPackId) ?? null;
    const expectedDashaTrackIds: KarthicRubricTrackId[] = selectedDashaPack?.tracks.selected_variation
        ? ['base', 'selected_variation']
        : selectedDashaPack
            ? ['base']
            : [];
    const visibleDashaRuns = useMemo(
        () => dashaRubricPackId ? dashaRuns.filter((run) => run.rubricPackId === dashaRubricPackId) : dashaRuns,
        [dashaRubricPackId, dashaRuns],
    );
    const selectedRun = useMemo(
        () => visibleDashaRuns.find((run) => run.id === selectedRunId) ?? visibleDashaRuns[0] ?? null,
        [selectedRunId, visibleDashaRuns],
    );
    useEffect(() => {
        setHasMounted(true);
    }, []);

    useEffect(() => {
        if (!allowedStageIds.has(visibleStage)) {
            setVisibleStage(workflowStages[0]?.id ?? 'source');
        }
    }, [allowedStageIds, visibleStage, workflowStages]);

    useEffect(() => {
        void loadAll();
    }, []);

    useEffect(() => {
        if (!selectedFrankId && frankPackets.length > 0) {
            applyFrankPacket(frankPackets[0]);
        }
    }, [frankPackets, selectedFrankId]);

    useEffect(() => {
        if (selectedFrankId) {
            const packet = frankPackets.find((item) => item.id === selectedFrankId);
            if (packet) {
                setFrankEditor(clone(packet));
            }
        }
    }, [frankPackets, selectedFrankId]);

    useEffect(() => {
        const options = frankEditor?.questionVariance.menu?.options ?? [];
        const activePackage = frankEditor?.questionVariance.packages.find((pkg) => pkg.id === frankEditor.questionVariance.activePackageId) ?? null;
        const activeOptionId = activePackage?.selectedOptionId ?? '';
        if (options.length === 0) {
            setSelectedVariationOptionId('');
            return;
        }
        if (activeOptionId && options.some((option) => option.id === activeOptionId)) {
            if (selectedVariationOptionId !== activeOptionId) {
                setSelectedVariationOptionId(activeOptionId);
            }
            return;
        }
        if (selectedVariationOptionId && !options.some((option) => option.id === selectedVariationOptionId)) {
            setSelectedVariationOptionId('');
        }
    }, [frankEditor?.id, frankEditor?.questionVariance.activePackageId, frankEditor?.questionVariance.menu, frankEditor?.questionVariance.packages, selectedVariationOptionId]);

    useEffect(() => {
        const options = frankEditor?.questionVariance.menu?.options ?? [];
        if (options.length === 0) {
            setSelectedVariationSwapIdsByOptionId({});
            return;
        }
        const activePackage = frankEditor?.questionVariance.packages.find((pkg) => pkg.id === frankEditor.questionVariance.activePackageId) ?? null;
        setSelectedVariationSwapIdsByOptionId((current) => {
            const nextEntries = options.map((option) => {
                const validIds = new Set(option.exactSwapOptions.map((swap) => swap.id));
                const activeSelection = activePackage?.selectedOptionId === option.id
                    ? (activePackage.selectedSwapOptionIds ?? []).filter((swapId) => validIds.has(swapId))
                    : [];
                const existing = current[option.id]?.filter((swapId) => validIds.has(swapId)) ?? [];
                const nextValue = activeSelection.length > 0
                    ? activeSelection
                    : existing;
                return [option.id, nextValue] as const;
            });
            return Object.fromEntries(nextEntries);
        });
    }, [frankEditor?.id, frankEditor?.questionVariance.activePackageId, frankEditor?.questionVariance.menu, frankEditor?.questionVariance.packages]);

    useEffect(() => {
        if (!selectedRubricId && rubricPacks.length > 0) {
            applyRubricPack(rubricPacks[0]);
        }
    }, [rubricPacks, selectedRubricId]);

    useEffect(() => {
        if (selectedRubricId) {
            const pack = rubricPacks.find((item) => item.id === selectedRubricId);
            if (pack) {
                setRubricEditor(clone(pack));
            }
        }
    }, [rubricPacks, selectedRubricId]);

    useEffect(() => {
        if (!selectedRunId && visibleDashaRuns.length > 0) {
            setSelectedRunId(visibleDashaRuns[0].id);
        }
    }, [selectedRunId, visibleDashaRuns]);

    useEffect(() => {
        if (selectedRun?.judgeSettings) {
            setJudgeSettingsDraft(clone(selectedRun.judgeSettings));
        }
    }, [selectedRun?.id, selectedRun?.judgeSettings.model, selectedRun?.judgeSettings.reasoningEffort]);

    useEffect(() => {
        if (!selectedRunId || selectedRun?.status !== 'draft' || selectedRun?.workflowStage !== 'cluster_pending') {
            return;
        }

        let cancelled = false;
        const intervalId = window.setInterval(async () => {
            try {
                const runResponse = await fetch('/api/dasha-runs', { cache: 'no-store' });
                const runJson = await readJsonResponse<{ items?: DashaRunV2[]; error?: string }>(runResponse, 'Failed to refresh Dasha run.');
                if (!runResponse.ok) {
                    throw new Error(runJson.error || 'Failed to refresh Dasha run.');
                }
                if (cancelled) {
                    return;
                }
                const refreshedRuns = sortRuns(Array.isArray(runJson.items) ? runJson.items as DashaRunV2[] : []);
                setDashaRuns(refreshedRuns);
                const item = refreshedRuns.find((run) => run.id === selectedRunId);
                if (item?.status === 'completed' && item.workflowStage === 'judged') {
                    setStatusMessage('Dasha judging completed.');
                }
                if (item?.status === 'draft' && item.workflowStage === 'clustered') {
                    setStatusMessage('Dasha clustering completed. Review the clustered results or continue to judging.');
                }
                if (item?.status === 'failed') {
                    setErrorMessage(item.errorMessage || 'Dasha run failed.');
                }
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh Dasha run.');
                }
            }
        }, 4000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [selectedRun?.status, selectedRun?.workflowStage, selectedRunId]);

    async function loadAll() {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            const [frankRes, rubricRes, runRes] = await Promise.all([
                fetch('/api/frank-packets', { cache: 'no-store' }),
                fetch('/api/karthic-rubric-packs', { cache: 'no-store' }),
                fetch('/api/dasha-runs', { cache: 'no-store' }),
            ]);
            const [frankJson, rubricJson, runJson] = await Promise.all([
                readJsonResponse<{ items?: FrankPacketV2[]; error?: string }>(frankRes, 'Failed to load Frank packets.'),
                readJsonResponse<{ items?: KarthicRubricPackV2[]; error?: string }>(rubricRes, 'Failed to load Karthic rubric packs.'),
                readJsonResponse<{ items?: DashaRunV2[]; error?: string }>(runRes, 'Failed to load Dasha runs.'),
            ]);
            if (!frankRes.ok) {
                throw new Error(frankJson.error || 'Failed to load Frank packets.');
            }
            if (!rubricRes.ok) {
                throw new Error(rubricJson.error || 'Failed to load Karthic rubric packs.');
            }
            if (!runRes.ok) {
                throw new Error(runJson.error || 'Failed to load Dasha runs.');
            }
            setFrankPackets(sortByUpdated(Array.isArray(frankJson.items) ? frankJson.items as FrankPacketV2[] : []));
            setRubricPacks(sortByUpdated(Array.isArray(rubricJson.items) ? rubricJson.items as KarthicRubricPackV2[] : []));
            setDashaRuns(sortRuns(Array.isArray(runJson.items) ? runJson.items as DashaRunV2[] : []));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to load workflow data.');
        } finally {
            setIsLoading(false);
        }
    }

    function goToStage(stageId: WorkflowStageId) {
        startTransition(() => {
            setVisibleStage(stageId);
        });
    }

    function applyFrankPacket(packet: FrankPacketV2) {
        setSelectedFrankId(packet.id);
        setFrankEditor(clone(packet));
    }

    function applyRubricPack(pack: KarthicRubricPackV2) {
        setSelectedRubricId(pack.id);
        setRubricEditor(clone(pack));
        if (pack.status === 'approved') {
            setDashaRubricPackId(pack.id);
        }
    }

    function updateRubricEditor(mutator: (current: KarthicRubricPackV2) => KarthicRubricPackV2) {
        setRubricEditor((current) => current ? mutator(current) : current);
    }

    function switchRubricTrack(trackId: KarthicRubricTrackId) {
        updateRubricEditor((current) => {
            const nextTrack = trackId === 'selected_variation'
                ? current.tracks.selected_variation
                : current.tracks.base;
            if (!nextTrack) {
                return current;
            }
            return {
                ...current,
                activeTrack: trackId,
                questionSource: nextTrack.questionSource,
                questionVariancePackageId: nextTrack.questionVariancePackageId,
                questionText: nextTrack.questionText,
                seedRows: nextTrack.seedRows,
                rows: nextTrack.rows,
            };
        });
    }

    function updateRubricTrackRows(trackId: KarthicRubricTrackId, mutator: (rows: KarthicRubricRow[]) => KarthicRubricRow[]) {
        updateRubricEditor((current) => {
            const currentTrack = trackId === 'selected_variation'
                ? current.tracks.selected_variation
                : current.tracks.base;
            if (!currentTrack) {
                return current;
            }
            const nextRows = mutator(currentTrack.rows);
            const nextTrack = {
                ...currentTrack,
                rows: nextRows,
            };
            const next = {
                ...current,
                tracks: {
                    ...current.tracks,
                    [trackId]: nextTrack,
                },
            };
            return current.activeTrack === trackId
                ? {
                    ...next,
                    rows: nextRows,
                }
                : next;
        });
    }

    function onUploadFilesSelected(files: FileList | null) {
        const nextRows = Array.from(files ?? []).map((file, index) => ({
            file,
            role: index === 0 ? 'anchor_case' as const : 'supporting_authority' as const,
        }));
        setUploadRows(nextRows);
    }

    function getGenerationSetting(target: WorkflowGenerationTarget): FrankGenerationSettings {
        if (target === 'rubric_generation' && rubricEditor?.generationSettings?.[target]) {
            return rubricEditor.generationSettings[target]!;
        }
        if (target !== 'rubric_generation' && frankEditor?.generationSettings?.[target]) {
            return frankEditor.generationSettings[target]!;
        }
        return workflowGenerationSettingsDraft[target] ?? DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND[target]!;
    }

    function updateGenerationSetting(target: WorkflowGenerationTarget, nextSetting: FrankGenerationSettings) {
        setWorkflowGenerationSettingsDraft((current) => ({
            ...current,
            [target]: nextSetting,
        }));
        if (target === 'rubric_generation') {
            setRubricEditor((current) => current ? {
                ...current,
                generationSettings: {
                    ...(current.generationSettings ?? {}),
                    [target]: nextSetting,
                },
            } : current);
            return;
        }
        setFrankEditor((current) => current ? {
            ...current,
            generationSettings: {
                ...(current.generationSettings ?? {}),
                [target]: nextSetting,
            },
        } : current);
    }

    function openGenerationSettings(target: WorkflowGenerationTarget) {
        setGenerationSettingsDraft(clone(getGenerationSetting(target)));
        setOpenGenerationTarget(target);
    }

    function saveGenerationSettings() {
        if (!openGenerationTarget) {
            return;
        }
        updateGenerationSetting(openGenerationTarget, generationSettingsDraft);
        setOpenGenerationTarget(null);
    }

    function openDashaJudgeSettings(target: DashaJudgeModalTarget) {
        if (target === 'run_default') {
            setJudgeSettingsDraft(clone(dashaJudgeSettings));
        } else {
            setJudgeSettingsDraft(clone(selectedRun?.judgeSettings ?? DEFAULT_DASHA_JUDGE_SETTINGS));
        }
        setOpenDashaJudgeTarget(target);
    }

    function saveDashaJudgeSettings() {
        if (!openDashaJudgeTarget) {
            return;
        }
        if (openDashaJudgeTarget === 'run_default') {
            setDashaJudgeSettings((current) => ({
                ...current,
                model: judgeSettingsDraft.model,
                reasoningEffort: judgeSettingsDraft.reasoningEffort,
            }));
        }
        setOpenDashaJudgeTarget(null);
    }

    async function createFrankPacket() {
        if (uploadRows.length === 0 && !selectedBenchmarkTemplate?.packet?.id) {
            setErrorMessage('Upload authority files or choose a benchmark case first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Creating packet and running Frank Phase 1...');
        try {
            const formData = new FormData();
            const phaseOneSettings = getGenerationSetting('routing_intake_generation');
            formData.set('title', newPacketTitle.trim());
            formData.set('model', phaseOneSettings.model);
            formData.set('reasoningEffort', phaseOneSettings.reasoningEffort);
            if (selectedBenchmarkTemplate?.packet?.id) {
                formData.set('sourcePacketId', selectedBenchmarkTemplate.packet.id);
            } else {
                uploadRows.forEach((row, index) => {
                    formData.append('files', row.file);
                    formData.set(`role_${index}`, row.role);
                });
            }
            const response = await fetch('/api/frank-packets/draft', { method: 'POST', body: formData });
            const json = await readJsonResponse<{ item?: FrankPacketV2; error?: string }>(response, 'Failed to create Frank packet.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to create Frank packet.');
            }
            const item = json.item as FrankPacketV2;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((packet) => packet.id !== item.id)]));
            setUploadRows([]);
            setSelectedBenchmarkTemplateKey('');
            setNewPacketTitle('');
            setStatusMessage('Frank Phase 1 completed. Packet created and routed.');
            goToStage('routing_intake');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to create Frank packet.');
            setStatusMessage(null);
        }
    }

    async function runFrankPhase(input: {
        target: Exclude<WorkflowGenerationTarget, 'routing_intake_generation' | 'rubric_generation'>;
        endpoint: '/api/frank-packets/extraction-mapping' | '/api/frank-packets/benchmark' | '/api/frank-packets/question';
        inProgressLabel: string;
        successLabel: string;
        errorLabel: string;
    }) {
        if (!frankEditor?.id) {
            setErrorMessage('Select a Frank packet first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage(input.inProgressLabel);
        try {
            const settings = getGenerationSetting(input.target);
            const response = await fetch(input.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: frankEditor.id,
                    model: settings.model,
                    reasoningEffort: settings.reasoningEffort,
                }),
            });
            const json = await readJsonResponse<{ item?: FrankPacketV2; error?: string }>(response, input.errorLabel);
            if (!response.ok) {
                throw new Error(json.error || input.errorLabel);
            }
            const item = json.item as FrankPacketV2;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((packet) => packet.id !== item.id)]));
            setStatusMessage(input.successLabel);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : input.errorLabel);
            setStatusMessage(null);
        }
    }

    async function saveFrank(status: FrankPacketV2['status']) {
        if (!frankEditor) {
            return;
        }
        setErrorMessage(null);
        setStatusMessage(status === 'approved' ? 'Approving Frank packet...' : 'Saving Frank packet...');
        try {
            const response = await fetch('/api/frank-packets', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(frankEditor ? { ...frankEditor, status } : null),
            });
            const json = await readJsonResponse<{ item?: FrankPacketV2; error?: string }>(response, 'Failed to save Frank packet.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to save Frank packet.');
            }
            const item = json.item as FrankPacketV2;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((packet) => packet.id !== item.id)]));
            setStatusMessage(status === 'approved' ? 'Frank packet approved.' : 'Frank packet saved.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to save Frank packet.');
            setStatusMessage(null);
        }
    }

    async function generateVariationMenu() {
        if (!frankEditor?.id) {
            setErrorMessage('Select a Frank packet first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Generating variation options...');
        try {
            const response = await fetch('/api/frank-packets/question-variation/menu', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: frankEditor.id,
                    model: getGenerationSetting('question_variance_routing_menu_generation').model,
                    reasoningEffort: getGenerationSetting('question_variance_routing_menu_generation').reasoningEffort,
                }),
            });
            const json = await readJsonResponse<{ item?: FrankPacketV2; error?: string }>(response, 'Failed to generate variation options.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to generate variation options.');
            }
            const item = json.item as FrankPacketV2;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((packet) => packet.id !== item.id)]));
            setStatusMessage(item.questionVariance.menu?.options?.length ? 'Variation options generated.' : 'No safe variation options were generated for this question.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate variation options.');
            setStatusMessage(null);
        }
    }

    function toggleVariationSwap(option: QuestionVarianceMenuOption, swapId: string, checked: boolean) {
        setSelectedVariationSwapIdsByOptionId((current) => {
            const existing = current[option.id] ?? option.exactSwapOptions.map((swap) => swap.id);
            const next = checked
                ? [...new Set([...existing, swapId])]
                : existing.filter((item) => item !== swapId);
            return {
                ...current,
                [option.id]: next,
            };
        });
    }

    async function generateVariationPackage() {
        if (!frankEditor?.id || !selectedVariationOptionId) {
            setErrorMessage('Choose a variation option first.');
            return;
        }
        if (selectedVariationOption && selectedVariationSwapIds.length === 0) {
            setErrorMessage('Select at least one exact variation before generating the selected package.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Generating selected variation...');
        try {
            const response = await fetch('/api/frank-packets/question-variation/package', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: frankEditor.id,
                    optionId: selectedVariationOptionId,
                    selectedSwapIds: selectedVariationSwapIds,
                    model: getGenerationSetting('question_variance_package_generation').model,
                    reasoningEffort: getGenerationSetting('question_variance_package_generation').reasoningEffort,
                }),
            });
            const json = await readJsonResponse<{ item?: FrankPacketV2; error?: string }>(response, 'Failed to generate the selected variation.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to generate the selected variation.');
            }
            const item = json.item as FrankPacketV2;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((packet) => packet.id !== item.id)]));
            setStatusMessage('Selected variation generated. Karthic and Dasha will now branch into two tracks.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate the selected variation.');
            setStatusMessage(null);
        }
    }

    async function clearVariation() {
        if (!frankEditor?.id) {
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Clearing variation branch...');
        try {
            const response = await fetch('/api/frank-packets/question-variation/clear', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: frankEditor.id }),
            });
            const json = await readJsonResponse<{ item?: FrankPacketV2; error?: string }>(response, 'Failed to clear the variation branch.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to clear the variation branch.');
            }
            const item = json.item as FrankPacketV2;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((packet) => packet.id !== item.id)]));
            setStatusMessage('Variation branch cleared. The workflow is back to the single-question path.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to clear the variation branch.');
            setStatusMessage(null);
        }
    }

    async function deleteFrank(id: string) {
        setErrorMessage(null);
        setStatusMessage('Deleting Frank packet...');
        try {
            const response = await fetch('/api/frank-packets', {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const json = await readJsonResponse<{ deletedId?: string; error?: string }>(response, 'Failed to delete Frank packet.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to delete Frank packet.');
            }
            const nextPackets = frankPackets.filter((packet) => packet.id !== id);
            setFrankPackets(nextPackets);
            if (selectedFrankId === id) {
                const nextPacket = nextPackets[0] ?? null;
                if (nextPacket) {
                    applyFrankPacket(nextPacket);
                } else {
                    setSelectedFrankId('');
                    setFrankEditor(null);
                    goToStage('source');
                }
            }
            setStatusMessage('Frank packet deleted.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to delete Frank packet.');
            setStatusMessage(null);
        }
    }

    async function seedRubricPack() {
        if (!frankEditor?.id || frankEditor.status !== 'approved') {
            setErrorMessage('Select an approved Frank packet first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Generating seed Karthic rubric pack...');
        try {
            const settings = getGenerationSetting('rubric_generation');
            const response = await fetch('/api/karthic-rubric-packs/seed', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    frankPacketId: frankEditor.id,
                    id: rubricEditor?.frankPacketId === frankEditor.id ? rubricEditor.id : undefined,
                    model: settings.model,
                    reasoningEffort: settings.reasoningEffort,
                }),
            });
            const json = await readJsonResponse<{ item?: KarthicRubricPackV2; error?: string }>(response, 'Failed to generate seed rubric pack.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to generate seed rubric pack.');
            }
            const item = json.item as KarthicRubricPackV2;
            applyRubricPack(item);
            setRubricPacks((current) => sortByUpdated([item, ...current.filter((pack) => pack.id !== item.id)]));
            setStatusMessage('Seed rubric pack generated.');
            goToStage('refine_rubric');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate seed rubric pack.');
            setStatusMessage(null);
        }
    }

    async function refineRubricPack() {
        if (!rubricEditor?.id) {
            setErrorMessage('Select a rubric pack first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Refining Karthic rubric pack...');
        try {
            const settings = getGenerationSetting('rubric_generation');
            const response = await fetch('/api/karthic-rubric-packs/refine', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: rubricEditor.id,
                    model: settings.model,
                    reasoningEffort: settings.reasoningEffort,
                }),
            });
            const json = await readJsonResponse<{ item?: KarthicRubricPackV2; error?: string }>(response, 'Failed to refine rubric pack.');
            if (!response.ok) {
                throw new Error(json.error || 'Failed to refine rubric pack.');
            }
            const item = json.item as KarthicRubricPackV2;
            applyRubricPack(item);
            setRubricPacks((current) => sortByUpdated([item, ...current.filter((pack) => pack.id !== item.id)]));
            setStatusMessage('Rubric pack refined.');
            goToStage('approve_rubric');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to refine rubric pack.');
            setStatusMessage(null);
        }
    }

    async function saveRubric(status: KarthicRubricPackV2['status']) {
        if (!rubricEditor) {
            setErrorMessage('Select a rubric pack first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage(status === 'approved' ? 'Approving Karthic rubric pack...' : 'Saving Karthic rubric pack...');
        try {
            const response = await fetch('/api/karthic-rubric-packs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    ...rubricEditor,
                    status,
                }),
            });
            const json = await readJsonResponse<{ item?: KarthicRubricPackV2; error?: string }>(
                response,
                status === 'approved' ? 'Failed to approve Karthic rubric pack.' : 'Failed to save rubric pack.',
            );
            if (!response.ok) {
                throw new Error(json.error || 'Failed to save rubric pack.');
            }
            const item = json.item as KarthicRubricPackV2;
            applyRubricPack(item);
            setRubricPacks((current) => sortByUpdated([item, ...current.filter((pack) => pack.id !== item.id)]));
            if (item.status === 'approved') {
                setDashaRubricPackId(item.id);
            }
            setStatusMessage(status === 'approved' ? 'Karthic rubric pack approved.' : 'Karthic rubric pack saved.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to save rubric pack.');
            setStatusMessage(null);
        }
    }

    async function runDasha() {
        if (!selectedDashaPack) {
            setErrorMessage('Select an approved rubric pack first.');
            return;
        }
        if (selectedModelKeys.length === 0) {
            setErrorMessage('Select at least one model for Dasha.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Starting Dasha cluster run...');
        try {
            const trackIds: KarthicRubricTrackId[] = selectedDashaPack.tracks.selected_variation
                ? ['base', 'selected_variation']
                : ['base'];
            const startedRuns: DashaRunV2[] = [];
            for (const trackId of trackIds) {
                const formData = new FormData();
                formData.set('rubricPackId', dashaRubricPackId);
                formData.set('rubricTrackId', trackId);
                formData.set('runMode', 'score_and_cluster');
                formData.set('sampleCount', sampleCount || '120');
                formData.set('selectedModels', JSON.stringify(buildSelectedModels(selectedModelKeys)));
                formData.set('judgeModel', dashaJudgeSettings.model);
                formData.set('judgeReasoningEffort', dashaJudgeSettings.reasoningEffort);
                const response = await fetch('/api/dasha-runs', {
                    method: 'POST',
                    body: formData,
                });
                const json = await readJsonResponse<{ item?: DashaRunV2; error?: string }>(response, 'Failed to start Dasha cluster run.');
                if (!response.ok) {
                    throw new Error(json.error || 'Failed to start Dasha cluster run.');
                }
                startedRuns.push(json.item as DashaRunV2);
            }
            setDashaRuns((current) => sortRuns([
                ...startedRuns,
                ...current.filter((run) => !startedRuns.some((item) => item.id === run.id)),
            ]));
            setSelectedRunId(startedRuns[0]?.id ?? '');
            setStatusMessage(startedRuns.length > 1 ? 'Two Dasha clustering runs started.' : 'Dasha clustering started.');
            goToStage('dasha_cluster');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to start Dasha cluster run.');
            setStatusMessage(null);
        }
    }

    async function judgeDashaRun() {
        const runsToJudge = selectedDashaPack
            ? expectedDashaTrackIds
                .map((trackId) => visibleDashaRuns.find((run) => run.rubricTrackId === trackId && run.workflowStage === 'clustered'))
                .filter((run): run is DashaRunV2 => Boolean(run))
            : selectedRun?.workflowStage === 'clustered'
                ? [selectedRun]
                : [];
        if (runsToJudge.length === 0) {
            setErrorMessage(selectedDashaPack?.tracks.selected_variation
                ? 'Run clustering for both questions before judging the Dasha evaluations.'
                : 'Select a clustered Dasha run first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage(runsToJudge.length > 1 ? 'Judging clustered Dasha runs...' : 'Judging clustered Dasha run...');
        try {
            const judgedRuns: DashaRunV2[] = [];
            for (const run of runsToJudge) {
                const response = await fetch(`/api/dasha-runs/${run.id}/judge`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        judgeModel: judgeSettingsDraft.model,
                        judgeReasoningEffort: judgeSettingsDraft.reasoningEffort,
                    }),
                });
                const json = await readJsonResponse<{ item?: DashaRunV2; error?: string }>(response, 'Failed to judge clustered Dasha run.');
                if (!response.ok) {
                    throw new Error(json.error || 'Failed to judge clustered Dasha run.');
                }
                judgedRuns.push(json.item as DashaRunV2);
            }
            setDashaRuns((current) => sortRuns([
                ...judgedRuns,
                ...current.filter((run) => !judgedRuns.some((item) => item.id === run.id)),
            ]));
            setSelectedRunId(judgedRuns[0]?.id ?? '');
            setStatusMessage(judgedRuns.length > 1 ? 'Two Dasha evaluations completed.' : 'Dasha judging completed.');
            goToStage('dasha_results');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to judge clustered Dasha run.');
            setStatusMessage(null);
        }
    }

    const benchmarkBlockedReason = frankEditor ? buildClientFrankBlockReason(frankEditor) : null;
    const frankApprovalBlockedReason = frankEditor ? buildClientFrankApprovalBlockReason(frankEditor) : null;
    const benchmarkHeadingPreview = FRANK_V2_BENCHMARK_HEADINGS.join('\n');
    const visibleRubricRowKeys = useMemo(
        () => rubricEditor
            ? [
                ...rubricEditor.tracks.base.rows.map((row) => `${rubricEditor.id}:base:${row.key}`),
                ...(rubricEditor.tracks.selected_variation?.rows.map((row) => `${rubricEditor.id}:selected_variation:${row.key}`) ?? []),
            ]
            : [],
        [rubricEditor],
    );

    useEffect(() => {
        if (visibleRubricRowKeys.length === 0) {
            setCollapsedRubricRows({});
            return;
        }
        const visibleKeySet = new Set(visibleRubricRowKeys);
        setCollapsedRubricRows((current) => {
            const nextEntries = Object.entries(current).filter(([key]) => visibleKeySet.has(key));
            if (nextEntries.length === Object.keys(current).length) {
                return current;
            }
            return Object.fromEntries(nextEntries);
        });
    }, [visibleRubricRowKeys]);

    const hasFrankPacket = Boolean(frankEditor);
    const hasRoutingIntake = Boolean(frankEditor?.selectedPack && frankEditor?.intakeChecklist);
    const hasExtractionMapping = Boolean(
        frankEditor?.sourceExtractionSheet
        && frankEditor?.goldPacketMapping
        && frankEditor?.controllerCard
        && frankEditor?.likelyFailureModes,
    );
    const hasBenchmark = Boolean(frankEditor?.benchmarkAnswer.trim());
    const hasQuestion = Boolean(frankEditor?.reverseEngineeredQuestion.trim());
    const hasApprovedFrank = frankEditor?.status === 'approved';
    const hasSeedRubric = Boolean(rubricEditor?.tracks.base.seedRows?.length) && rubricEditor?.refinementStatus !== 'not_started';
    const hasRefinedRubric = rubricEditor?.refinementStatus === 'refined' || rubricEditor?.refinementStatus === 'approved';
    const hasApprovedRubric = rubricEditor?.status === 'approved';
    const hasClusteredRun = expectedDashaTrackIds.length > 0
        ? expectedDashaTrackIds.every((trackId) => visibleDashaRuns.some((run) => run.rubricTrackId === trackId && (run.workflowStage === 'clustered' || run.workflowStage === 'judged' || run.status === 'completed')))
        : Boolean(selectedRun?.clusters?.length) && (selectedRun?.workflowStage === 'clustered' || selectedRun?.workflowStage === 'judged' || selectedRun?.status === 'completed');
    const hasJudgedRun = expectedDashaTrackIds.length > 0
        ? expectedDashaTrackIds.every((trackId) => visibleDashaRuns.some((run) => run.rubricTrackId === trackId && run.status === 'completed' && run.workflowStage === 'judged'))
        : selectedRun?.status === 'completed' && selectedRun?.workflowStage === 'judged';
    const hasPendingDashaRun = expectedDashaTrackIds.length > 0
        ? visibleDashaRuns.some((run) => expectedDashaTrackIds.includes(run.rubricTrackId) && run.status === 'draft' && run.workflowStage === 'cluster_pending')
        : selectedRun?.status === 'draft' && selectedRun?.workflowStage === 'cluster_pending';

    const stageViews = useMemo<WorkflowStageView[]>(() => {
        return workflowStages.map((stage) => {
            switch (stage.id) {
                case 'source':
                    return {
                        ...stage,
                        complete: hasFrankPacket,
                        unlocked: true,
                        blocked: false,
                        statusLabel: hasFrankPacket ? 'Ready' : 'Start here',
                    };
                case 'routing_intake':
                    return {
                        ...stage,
                        complete: hasRoutingIntake,
                        unlocked: hasFrankPacket,
                        blocked: false,
                        statusLabel: hasRoutingIntake ? 'Complete' : hasFrankPacket ? 'Open' : 'Locked',
                    };
                case 'extraction_mapping':
                    return {
                        ...stage,
                        complete: hasExtractionMapping,
                        unlocked: hasRoutingIntake,
                        blocked: false,
                        statusLabel: hasExtractionMapping ? 'Complete' : hasRoutingIntake ? 'Open' : 'Locked',
                    };
                case 'benchmark':
                    return {
                        ...stage,
                        complete: hasBenchmark,
                        unlocked: hasExtractionMapping,
                        blocked: Boolean(!hasBenchmark && benchmarkBlockedReason),
                        statusLabel: hasBenchmark
                            ? 'Complete'
                            : !hasExtractionMapping
                                ? 'Locked'
                                : benchmarkBlockedReason
                                    ? 'Blocked'
                                    : 'Open',
                    };
                case 'question':
                    return {
                        ...stage,
                        complete: hasQuestion,
                        unlocked: hasBenchmark,
                        blocked: false,
                        statusLabel: hasQuestion ? 'Complete' : hasBenchmark ? 'Open' : 'Locked',
                    };
                case 'seed_rubric':
                    return {
                        ...stage,
                        complete: Boolean(hasSeedRubric),
                        unlocked: hasApprovedFrank,
                        blocked: false,
                        statusLabel: hasSeedRubric ? 'Drafted' : hasApprovedFrank ? 'Open' : 'Locked',
                    };
                case 'refine_rubric':
                    return {
                        ...stage,
                        complete: Boolean(hasRefinedRubric),
                        unlocked: Boolean(hasSeedRubric),
                        blocked: false,
                        statusLabel: hasRefinedRubric ? 'Refined' : hasSeedRubric ? 'Open' : 'Locked',
                    };
                case 'approve_rubric':
                    return {
                        ...stage,
                        complete: Boolean(hasApprovedRubric),
                        unlocked: Boolean(hasRefinedRubric),
                        blocked: false,
                        statusLabel: hasApprovedRubric ? 'Approved' : hasRefinedRubric ? 'Open' : 'Locked',
                    };
                case 'dasha_cluster':
                    return {
                        ...stage,
                        complete: Boolean(hasClusteredRun),
                        unlocked: approvedRubricPacks.length > 0,
                        blocked: false,
                        statusLabel: hasClusteredRun
                            ? 'Clustered'
                            : hasPendingDashaRun
                                ? 'Running'
                                : approvedRubricPacks.length > 0
                                    ? 'Open'
                                    : 'Locked',
                    };
                case 'dasha_judge':
                    return {
                        ...stage,
                        complete: Boolean(hasJudgedRun),
                        unlocked: Boolean(hasClusteredRun),
                        blocked: false,
                        statusLabel: hasJudgedRun ? 'Complete' : hasClusteredRun ? 'Open' : 'Locked',
                    };
                case 'dasha_results':
                    return {
                        ...stage,
                        complete: Boolean(hasJudgedRun),
                        unlocked: Boolean(hasJudgedRun),
                        blocked: false,
                        statusLabel: hasJudgedRun ? 'Results' : 'Locked',
                    };
                case 'zak_review':
                    return {
                        ...stage,
                        complete: false,
                        unlocked: Boolean(selectedRun),
                        blocked: false,
                        statusLabel: selectedRun
                            ? selectedRun.status === 'failed'
                                ? 'Review'
                                : selectedRun.status === 'completed'
                                    ? 'Review'
                                    : 'Pending run'
                            : 'Locked',
                    };
                default:
                    return {
                        ...stage,
                        complete: false,
                        unlocked: false,
                        blocked: false,
                        statusLabel: 'Locked',
                    };
            }
        });
    }, [
        workflowStages,
        approvedRubricPacks.length,
        benchmarkBlockedReason,
        hasApprovedFrank,
        hasApprovedRubric,
        hasBenchmark,
        hasClusteredRun,
        hasPendingDashaRun,
        hasExtractionMapping,
        hasFrankPacket,
        hasQuestion,
        hasRefinedRubric,
        hasRoutingIntake,
        hasSeedRubric,
        hasJudgedRun,
        selectedRun,
        selectedRun?.status,
        selectedRun?.workflowStage,
    ]);

    const blockViews = useMemo<WorkflowBlockView[]>(() => {
        return workflowBlocks.map((block) => {
            const stages = block.stageIds
                .map((stageId) => stageViews.find((stage) => stage.id === stageId))
                .filter((stage): stage is WorkflowStageView => Boolean(stage));
            const active = stages.some((stage) => stage.id === visibleStage);
            const unlocked = stages.some((stage) => stage.unlocked);
            const blocked = stages.some((stage) => stage.blocked);
            const complete = stages.length > 0 && stages.every((stage) => stage.complete);
            return {
                ...block,
                stages,
                active,
                unlocked,
                blocked,
                complete,
                statusLabel: complete
                    ? 'Complete'
                    : blocked
                        ? 'Attention'
                        : unlocked
                            ? 'Open'
                            : 'Locked',
            };
        });
    }, [stageViews, visibleStage, workflowBlocks]);

    const currentStageIndex = stageViews.findIndex((stage) => stage.id === visibleStage);
    const currentStage = stageViews[currentStageIndex] ?? stageViews[0];
    const previousStage = currentStageIndex > 0 ? stageViews[currentStageIndex - 1] : null;
    const nextStage = currentStageIndex >= 0 && currentStageIndex < stageViews.length - 1 ? stageViews[currentStageIndex + 1] : null;
    const currentBlockIndex = blockViews.findIndex((block) => block.active);
    const currentBlock = blockViews[currentBlockIndex] ?? blockViews[0];
    const currentBlockStepIndex = currentBlock?.stages.findIndex((stage) => stage.id === visibleStage) ?? -1;
    const currentBlockPreviousStage = currentBlockStepIndex > 0
        ? currentBlock?.stages[currentBlockStepIndex - 1] ?? null
        : null;
    const currentBlockNextStage = currentBlockStepIndex >= 0 && currentBlockStepIndex < ((currentBlock?.stages.length ?? 0) - 1)
        ? currentBlock?.stages[currentBlockStepIndex + 1] ?? null
        : null;
    const selectedVariationOption = useMemo(
        () => frankEditor?.questionVariance.menu?.options.find((option) => option.id === selectedVariationOptionId) ?? null,
        [frankEditor?.questionVariance.menu, selectedVariationOptionId],
    );
    const activeVariationPackage = useMemo(
        () => frankEditor?.questionVariance.activePackageId
            ? frankEditor.questionVariance.packages.find((pkg) => pkg.id === frankEditor.questionVariance.activePackageId) ?? null
            : null,
        [frankEditor?.questionVariance.activePackageId, frankEditor?.questionVariance.packages],
    );
    const selectedVariationSwapIds = useMemo(
        () => selectedVariationOption ? (selectedVariationSwapIdsByOptionId[selectedVariationOption.id] ?? []) : [],
        [selectedVariationOption, selectedVariationSwapIdsByOptionId],
    );
    const activeStagePrompt = useMemo(
        () => buildStagePromptPreview({
            stageId: visibleStage,
            frankPacket: frankEditor,
            rubricPack: rubricEditor,
            dashaPack: selectedDashaPack,
            selectedRun,
        }),
        [frankEditor, rubricEditor, selectedDashaPack, selectedRun, visibleStage],
    );
    const isWorkflowActionPending = Boolean(activeAction);
    const isActionPending = (actionId: string) => activeAction?.id === actionId;
    const statusDockTone: WorkflowStatusTone = errorMessage
        ? 'error'
        : isLoading || isWorkflowActionPending || hasPendingDashaRun
            ? 'progress'
            : statusMessage
                ? 'success'
                : 'idle';
    const statusDockTitle = errorMessage
        ? 'Workflow issue'
        : isLoading
            ? 'Loading workflow data'
            : activeAction?.label
                ? `${activeAction.label} in progress`
                : hasPendingDashaRun
                    ? 'Dasha clustering in progress'
                    : statusMessage
                        ? 'Latest workflow update'
                        : 'Workflow ready';
    const statusDockMessage = errorMessage
        ? errorMessage
        : isLoading
            ? 'Loading Frank, Karthic, and Dasha workflow data...'
            : activeAction
                ? (statusMessage ?? `${activeAction.label}...`)
                : hasPendingDashaRun
                    ? 'Dasha clustering is still processing in the background. This panel will keep showing updates until the run finishes or fails.'
                    : (statusMessage ?? 'No workflow action is running right now.');
    const statusDockDetail = errorMessage
        ? (activeAction ? `The error happened while ${activeAction.label.toLowerCase()}.` : 'Review the latest message here before trying again.')
        : isLoading
            ? 'The page is fetching saved packets, rubric packs, and Dasha runs.'
            : activeAction
                ? 'The workflow action buttons are temporarily disabled while this request finishes.'
                : hasPendingDashaRun
                    ? 'You can keep navigating the workflow while the status dock tracks the run.'
                    : statusMessage
                        ? 'You can collapse this panel if you want more room while keeping the latest update available.'
                        : 'Use any workflow action button to see progress and errors here.';

    useEffect(() => {
        if (currentStage?.unlocked) {
            return;
        }
        const fallback = findLastUnlockedStage(stageViews);
        if (fallback && fallback.id !== visibleStage) {
            goToStage(fallback.id);
        }
    }, [currentStage?.unlocked, stageViews, visibleStage]);

    useEffect(() => {
        if (errorMessage) {
            setIsStatusDockCollapsed(false);
        }
    }, [errorMessage]);

    async function runBusyWorkflowAction<T>(action: WorkflowActionState, work: () => Promise<T>) {
        setActiveAction(action);
        try {
            return await work();
        } finally {
            setActiveAction((current) => current?.id === action.id ? null : current);
        }
    }

    const nextStageBlockedReason = useMemo(() => {
        switch (visibleStage) {
            case 'source':
                return hasFrankPacket ? null : 'Create or select a Frank packet to continue.';
            case 'routing_intake':
                return hasRoutingIntake ? null : 'Finish routing and intake before continuing.';
            case 'extraction_mapping':
                if (!hasExtractionMapping) {
                    return 'Run Phase 2 before continuing.';
                }
                if (benchmarkBlockedReason && !hasBenchmark) {
                    return benchmarkBlockedReason;
                }
                return null;
            case 'benchmark':
                if (benchmarkBlockedReason && !hasBenchmark) {
                    return benchmarkBlockedReason;
                }
                return hasBenchmark ? null : 'Generate or enter the benchmark answer before continuing.';
            case 'question':
                if (!hasQuestion) {
                    return 'Generate or enter the reverse-engineered question before continuing.';
                }
                if (isFrankOnlyMode) {
                    return hasApprovedFrank ? null : 'Approve the Frank packet to finish the Legal AutoEval pipeline.';
                }
                return hasApprovedFrank ? null : 'Approve the Frank packet before continuing to Karthic.';
            case 'seed_rubric':
                return hasSeedRubric ? null : 'Generate the seed rubric before continuing.';
            case 'refine_rubric':
                return hasRefinedRubric ? null : 'Refine the rubric before continuing.';
            case 'approve_rubric':
                return hasApprovedRubric ? null : 'Approve the refined rubric before continuing to Dasha.';
            case 'dasha_cluster':
                return hasClusteredRun ? null : 'Run Dasha clustering before continuing.';
            case 'dasha_judge':
                return hasJudgedRun ? null : 'Judge the clustered Dasha evaluation runs before continuing.';
            case 'dasha_results':
                return hasJudgedRun ? null : 'Complete Dasha judging before reviewing final results.';
            case 'zak_review':
                return null;
            default:
                return 'This stage is not ready yet.';
        }
    }, [
        benchmarkBlockedReason,
        hasClusteredRun,
        hasApprovedFrank,
        hasApprovedRubric,
        hasBenchmark,
        hasExtractionMapping,
        hasFrankPacket,
        hasQuestion,
        hasRefinedRubric,
        hasRoutingIntake,
        hasSeedRubric,
        hasJudgedRun,
        selectedRun,
        isFrankOnlyMode,
        visibleStage,
    ]);

    function renderFrankSummaryCard() {
        if (!frankEditor) {
            return <EmptyPanelCopy text="No Frank packet selected." />;
        }
        return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                        <p className="text-base font-semibold text-slate-900">{frankEditor.title}</p>
                        <p className="text-slate-600">
                            {formatFrankPacketPhase(frankEditor.phase)}
                            {frankEditor.selectedPack ? ` · ${FRANK_V2_PACK_LABELS[frankEditor.selectedPack]}` : ''}
                            {frankEditor.status ? ` · ${frankEditor.status}` : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button className={secondaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void deleteFrank(frankEditor.id)}>
                            {isActionPending('delete_frank') ? 'Deleting...' : 'Delete Packet'}
                        </button>
                        <button className={secondaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void saveFrank('draft')}>
                            {isActionPending('save_frank') ? 'Saving...' : 'Save Frank Packet'}
                        </button>
                        <button
                            className={primaryButtonClassName}
                            disabled={isWorkflowActionPending || Boolean(frankApprovalBlockedReason)}
                            title={frankApprovalBlockedReason ?? undefined}
                            onClick={() => void saveFrank('approved')}
                        >
                            {isActionPending('approve_frank') ? 'Approving...' : 'Approve Frank Packet'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    function renderStagePanel() {
        switch (visibleStage) {
            case 'source':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 space-y-4">
                            <div className="grid gap-4 lg:grid-cols-[1fr,1fr,auto]">
                                <Field label="Benchmark case">
                                    <select
                                        className={inputClassName}
                                        value={selectedBenchmarkTemplateKey}
                                        onChange={(event) => {
                                            setSelectedBenchmarkTemplateKey(event.target.value);
                                            setErrorMessage(null);
                                        }}
                                    >
                                        <option value="">None</option>
                                        {benchmarkCaseQuickSelectOptions.map((option) => (
                                            <option key={option.key} value={option.key} disabled={!option.packet}>
                                                {option.label}{option.packet ? '' : ' · unavailable'}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Authority files">
                                    <input
                                        className={inputClassName}
                                        type="file"
                                        multiple
                                        accept=".pdf,.txt,.md"
                                        onChange={(event) => {
                                            setSelectedBenchmarkTemplateKey('');
                                            onUploadFilesSelected(event.target.files);
                                        }}
                                    />
                                </Field>
                                <div className="flex items-end gap-2">
                                    <button className={primaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void createFrankPacket()}>
                                        {isActionPending('create_packet') ? 'Creating...' : 'Create Packet'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('routing_intake_generation')}
                                        onClick={() => openGenerationSettings('routing_intake_generation')}
                                    />
                                </div>
                            </div>
                            {selectedBenchmarkTemplate ? (
                                <Banner tone="info" text={`Creating a new packet from ${selectedBenchmarkTemplate.label}.`} />
                            ) : null}
                            {uploadRows.length > 0 ? (
                                <CompactItemList
                                    title="Selected files"
                                    items={uploadRows.map((row) => `${row.file.name} · ${row.role}`)}
                                />
                            ) : null}
                            <div className="grid gap-4 lg:grid-cols-[1fr,auto]">
                                <Field label="Saved Frank packets">
                                    <select
                                        className={inputClassName}
                                        value={selectedFrankId}
                                        onChange={(event) => {
                                            const packet = frankPackets.find((item) => item.id === event.target.value);
                                            if (packet) {
                                                applyFrankPacket(packet);
                                            }
                                        }}
                                    >
                                        <option value="">Select a packet</option>
                                        {frankPackets.map((packet) => (
                                            <option key={packet.id} value={packet.id}>
                                                {packet.title} · {formatFrankPacketPhase(packet.phase)}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                {frankEditor ? (
                                    <div className="flex items-end">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            <span className="font-semibold text-slate-900">{frankEditor.title}</span>
                                            <span className="text-slate-500"> · {formatFrankPacketPhase(frankEditor.phase)}</span>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </>
                );
            case 'routing_intake':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        {frankEditor ? (
                            <div className="mt-4 space-y-4">
                                {renderFrankSummaryCard()}
                                <div className="grid gap-4 lg:grid-cols-2">
                                    <Field label="Title">
                                        <input
                                            className={inputClassName}
                                            value={frankEditor.title}
                                            onChange={(event) => setFrankEditor((current) => current ? { ...current, title: event.target.value } : current)}
                                        />
                                    </Field>
                                    <Field label="Selected pack">
                                        <select
                                            className={inputClassName}
                                            value={frankEditor.selectedPack ?? ''}
                                            onChange={(event) => setFrankEditor((current) => current ? { ...current, selectedPack: (event.target.value || null) as FrankSofPackId | null } : current)}
                                        >
                                            <option value="">Select pack</option>
                                            {PACK_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Routing reason" className="lg:col-span-2">
                                        <textarea
                                            className={textareaClassName}
                                            value={frankEditor.routingReason}
                                            onChange={(event) => setFrankEditor((current) => current ? { ...current, routingReason: event.target.value } : current)}
                                        />
                                    </Field>
                                    <Field label="Secondary issues" className="lg:col-span-2">
                                        <textarea
                                            className={textareaClassName}
                                            value={frankEditor.secondaryIssues.join('\n')}
                                            onChange={(event) => setFrankEditor((current) => current ? { ...current, secondaryIssues: splitLines(event.target.value) } : current)}
                                        />
                                    </Field>
                                </div>
                                <CompactJsonDisclosure title="Intake checklist" value={frankEditor.intakeChecklist} />
                            </div>
                        ) : <EmptyPanelCopy text="Select a Frank packet to inspect routing and intake." />}
                    </>
                );
            case 'extraction_mapping':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        {frankEditor ? (
                            <div className="mt-4 space-y-4">
                                {renderFrankSummaryCard()}
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className={primaryButtonClassName}
                                        disabled={isWorkflowActionPending}
                                        onClick={() => void runFrankPhase({
                                            target: 'extraction_mapping_generation',
                                            endpoint: '/api/frank-packets/extraction-mapping',
                                            inProgressLabel: hasExtractionMapping
                                                ? 'Re-running Frank Phase 2: extraction and mapping...'
                                                : 'Running Frank Phase 2: extraction and mapping...',
                                            successLabel: 'Frank Phase 2 completed. Extraction and mapping updated.',
                                            errorLabel: 'Failed to run Frank Phase 2.',
                                        })}
                                    >
                                        {isActionPending('extraction_mapping_generation')
                                            ? 'Running Phase 2...'
                                            : hasExtractionMapping ? 'Re-run Phase 2' : 'Run Phase 2'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('extraction_mapping_generation')}
                                        onClick={() => openGenerationSettings('extraction_mapping_generation')}
                                    />
                                </div>
                                <div className="grid gap-3 lg:grid-cols-2">
                                    <CompactJsonDisclosure title="Source extraction sheet" value={frankEditor.sourceExtractionSheet} />
                                    <CompactJsonDisclosure title="Gold packet mapping" value={frankEditor.goldPacketMapping} />
                                    <CompactJsonDisclosure title="Locked controller card" value={frankEditor.controllerCard} />
                                    <CompactJsonDisclosure title="Likely failure modes" value={frankEditor.likelyFailureModes} />
                                </div>
                                {benchmarkBlockedReason ? <Banner tone="warning" text={benchmarkBlockedReason} /> : null}
                            </div>
                        ) : <EmptyPanelCopy text="Select a Frank packet to inspect extraction and mapping." />}
                    </>
                );
            case 'benchmark':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        {frankEditor ? (
                            <div className="mt-4 space-y-4">
                                {renderFrankSummaryCard()}
                                {benchmarkBlockedReason ? <Banner tone="warning" text={benchmarkBlockedReason} /> : null}
                                <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
                                    <ReadOnlyTextCard title="Required headings" text={benchmarkHeadingPreview} />
                                    <Field label="Benchmark answer">
                                        <textarea
                                            className={`${textareaClassName} min-h-[420px]`}
                                            value={frankEditor.benchmarkAnswer}
                                            onChange={(event) => setFrankEditor((current) => current ? { ...current, benchmarkAnswer: event.target.value } : current)}
                                        />
                                    </Field>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className={primaryButtonClassName}
                                        disabled={isWorkflowActionPending || Boolean(benchmarkBlockedReason)}
                                        onClick={() => void runFrankPhase({
                                            target: 'benchmark_generation',
                                            endpoint: '/api/frank-packets/benchmark',
                                            inProgressLabel: hasBenchmark
                                                ? 'Re-running Frank Phase 3: benchmark answer...'
                                                : 'Running Frank Phase 3: benchmark answer...',
                                            successLabel: 'Frank Phase 3 completed. Benchmark answer updated.',
                                            errorLabel: 'Failed to run Frank Phase 3.',
                                        })}
                                    >
                                        {isActionPending('benchmark_generation')
                                            ? 'Running Phase 3...'
                                            : hasBenchmark ? 'Re-run Phase 3' : 'Run Phase 3'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('benchmark_generation')}
                                        onClick={() => openGenerationSettings('benchmark_generation')}
                                    />
                                    <button className={secondaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void saveFrank('draft')}>
                                        {isActionPending('save_frank') ? 'Saving...' : 'Save Phase 3 Draft'}
                                    </button>
                                </div>
                                {frankEditor.benchmarkWarnings.length > 0 ? (
                                    <WarningList title="Benchmark warnings" items={frankEditor.benchmarkWarnings} />
                                ) : null}
                            </div>
                        ) : <EmptyPanelCopy text="Select a Frank packet to generate or edit the benchmark answer." />}
                    </>
                );
            case 'question':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        {frankEditor ? (
                            <div className="mt-4 space-y-4">
                                {renderFrankSummaryCard()}
                                <Field label="Reverse-engineered question">
                                    <textarea
                                        className={`${textareaClassName} min-h-[260px]`}
                                        value={frankEditor.reverseEngineeredQuestion}
                                        onChange={(event) => setFrankEditor((current) => current ? { ...current, reverseEngineeredQuestion: event.target.value } : current)}
                                    />
                                </Field>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className={primaryButtonClassName}
                                        disabled={isWorkflowActionPending || Boolean(benchmarkBlockedReason) || !frankEditor.benchmarkAnswer.trim()}
                                        onClick={() => void runFrankPhase({
                                            target: 'question_generation',
                                            endpoint: '/api/frank-packets/question',
                                            inProgressLabel: hasQuestion
                                                ? 'Re-running Frank Phase 4: reverse-engineered question...'
                                                : 'Running Frank Phase 4: reverse-engineered question...',
                                            successLabel: 'Frank Phase 4 completed. Reverse-engineered question updated.',
                                            errorLabel: 'Failed to run Frank Phase 4.',
                                        })}
                                    >
                                        {isActionPending('question_generation')
                                            ? 'Running Phase 4...'
                                            : hasQuestion ? 'Re-run Phase 4' : 'Run Phase 4'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('question_generation')}
                                        onClick={() => openGenerationSettings('question_generation')}
                                    />
                                    <button className={secondaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void saveFrank('draft')}>
                                        {isActionPending('save_frank') ? 'Saving...' : 'Save Phase 4 Draft'}
                                    </button>
                                </div>
                                <div className="rounded-2xl border border-teal-200 bg-[linear-gradient(180deg,rgba(240,253,250,0.96),rgba(248,250,252,0.98))] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="max-w-2xl">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Question Variation</p>
                                            <p className="mt-2 text-sm text-slate-700">
                                                Keep variation off for the single-question path. Turn it on only when you want a second legal question, a second Karthic rubric track, and a second Dasha run.
                                            </p>
                                            <p className="mt-2 text-sm text-slate-600">
                                                Choose exactly one sub-lane such as A1 or B1, then choose one or more exact variations inside that sub-lane.
                                            </p>
                                        </div>
                                        <div className="rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-800">
                                            {frankEditor.questionVariance.activePackageId
                                                ? 'Variation active'
                                                : frankEditor.questionVariance.menu?.options?.length
                                                    ? 'Options ready'
                                                    : 'Single-question path'}
                                        </div>
                                    </div>
                                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr),280px]">
                                        <div className="space-y-4">
                                            {frankEditor.questionVariance.menu?.options?.length ? (
                                                <div className="space-y-4">
                                                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
                                                        <Field label="Variation sub-lane">
                                                            <select className={inputClassName} value={selectedVariationOptionId} onChange={(event) => setSelectedVariationOptionId(event.target.value)}>
                                                                <option value="">Select a variation option</option>
                                                                {frankEditor.questionVariance.menu.options.map((option) => (
                                                                    <option key={option.id} value={option.id}>
                                                                        {option.laneCode} · {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </Field>
                                                        <div className="self-end">
                                                            <button
                                                                className={primaryButtonClassName}
                                                                type="button"
                                                                disabled={isWorkflowActionPending || !selectedVariationOptionId || selectedVariationSwapIds.length === 0}
                                                                onClick={() => void generateVariationPackage()}
                                                            >
                                                                {isActionPending('variation_package') ? 'Generating...' : 'Generate selected variation'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {selectedVariationOption ? (
                                                        <div className="space-y-4 rounded-xl border border-teal-100 bg-white/90 p-4">
                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Selected sub-lane</p>
                                                                    <p className="mt-1 text-sm font-semibold text-slate-900">
                                                                        {selectedVariationOption.laneCode} · {selectedVariationOption.variationType}
                                                                    </p>
                                                                </div>
                                                                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                                                                    {selectedVariationOption.lane === 'lane_a' ? 'Lane A' : 'Lane B'}
                                                                </div>
                                                            </div>
                                                            <div className="grid gap-4 lg:grid-cols-2">
                                                                <div className="space-y-2">
                                                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">What is being swapped</p>
                                                                    <p className="text-sm text-slate-700">{selectedVariationOption.whatChanges}</p>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Why this fits</p>
                                                                    <p className="text-sm text-slate-700">{selectedVariationOption.whyItFits}</p>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-3">
                                                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Exact variations to apply</p>
                                                                <p className="text-sm text-slate-600">
                                                                    You can combine multiple swaps within {selectedVariationOption.laneCode}, but you cannot mix {selectedVariationOption.laneCode} with another sub-lane.
                                                                </p>
                                                                <div className="space-y-2">
                                                                    {selectedVariationOption.exactSwapOptions.map((swap) => {
                                                                        const checked = selectedVariationSwapIds.includes(swap.id);
                                                                        return (
                                                                            <label key={swap.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                                                                                <input
                                                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    onChange={(event) => toggleVariationSwap(selectedVariationOption, swap.id, event.target.checked)}
                                                                                />
                                                                                <span className="min-w-0">
                                                                                    <span className="block font-semibold text-slate-900">{swap.label}</span>
                                                                                    <span className="mt-1 block text-slate-700">
                                                                                        {swap.from && swap.to ? `${swap.from} -> ${swap.to}` : swap.whatChanges}
                                                                                    </span>
                                                                                    {swap.from && swap.to && swap.whatChanges && swap.whatChanges !== `${swap.from} -> ${swap.to}` ? (
                                                                                        <span className="mt-1 block text-slate-500">{swap.whatChanges}</span>
                                                                                    ) : null}
                                                                                </span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                                                <span className="font-semibold">Main red flag:</span> {selectedVariationOption.mainRedFlag}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
                                                    No variation options have been generated yet.
                                                </div>
                                            )}
                                            {activeVariationPackage ? (
                                                <>
                                                    <ReadOnlyTextCard
                                                        title="Generated variation question"
                                                        text={activeVariationPackage.variedLegalQuestion || 'No varied legal question was saved in the active package.'}
                                                    />
                                                    <CompactJsonDisclosure
                                                        title="Active variation package"
                                                        value={activeVariationPackage}
                                                    />
                                                </>
                                            ) : null}
                                            {frankEditor.questionVariance.warnings.length > 0 ? (
                                                <WarningList title="Variation warnings" items={frankEditor.questionVariance.warnings} />
                                            ) : null}
                                        </div>
                                        <div className="space-y-3 rounded-xl border border-white/80 bg-white/90 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Actions</p>
                                            <button
                                                className={primaryButtonClassName}
                                                type="button"
                                                disabled={isWorkflowActionPending || !frankEditor.reverseEngineeredQuestion.trim()}
                                                onClick={() => void generateVariationMenu()}
                                            >
                                                {isActionPending('variation_menu') ? 'Generating...' : 'Generate variation options'}
                                            </button>
                                            <button className={secondaryButtonClassName} type="button" disabled={isWorkflowActionPending} onClick={() => void clearVariation()}>
                                                {isActionPending('clear_variation') ? 'Clearing...' : 'No variation'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {frankEditor.questionWarnings.length > 0 ? (
                                    <WarningList title="Question warnings" items={frankEditor.questionWarnings} />
                                ) : null}
                            </div>
                        ) : <EmptyPanelCopy text="Select a Frank packet to generate or edit the reverse-engineered question." />}
                    </>
                );
            case 'seed_rubric':
            case 'refine_rubric':
            case 'approve_rubric':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 grid gap-4 lg:grid-cols-[340px,1fr]">
                            <div className="space-y-3">
                                <Field label="Approved Frank packet">
                                    <select
                                        className={inputClassName}
                                        value={frankEditor?.status === 'approved' ? frankEditor.id : ''}
                                        onChange={(event) => {
                                            const packet = approvedFrankPackets.find((item) => item.id === event.target.value);
                                            if (packet) {
                                                applyFrankPacket(packet);
                                            }
                                        }}
                                    >
                                        <option value="">Select approved Frank packet</option>
                                        {approvedFrankPackets.map((packet) => (
                                            <option key={packet.id} value={packet.id}>{packet.title}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Saved rubric packs">
                                    <select
                                        className={inputClassName}
                                        value={selectedRubricId}
                                        onChange={(event) => {
                                            const pack = rubricPacks.find((item) => item.id === event.target.value);
                                            if (pack) {
                                                applyRubricPack(pack);
                                            }
                                        }}
                                    >
                                        <option value="">Select rubric pack</option>
                                        {rubricPacks.map((pack) => (
                                            <option key={pack.id} value={pack.id}>{FRANK_V2_PACK_LABELS[pack.selectedPack]} · {pack.refinementStatus} · {pack.status}</option>
                                        ))}
                                    </select>
                                </Field>
                                <div className="flex flex-wrap gap-2">
                                    {visibleStage === 'seed_rubric' ? (
                                        <button className={primaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void seedRubricPack()}>
                                            {isActionPending('seed_rubric') ? 'Generating...' : 'Generate Seed Rubric'}
                                        </button>
                                    ) : null}
                                    {visibleStage === 'refine_rubric' ? (
                                        <button className={primaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void refineRubricPack()}>
                                            {isActionPending('refine_rubric') ? 'Refining...' : 'Refine Rubric'}
                                        </button>
                                    ) : null}
                                    {visibleStage === 'approve_rubric' ? (
                                        <button className={primaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void saveRubric('approved')}>
                                            {isActionPending('approve_rubric') ? 'Approving...' : 'Approve Rubric Pack'}
                                        </button>
                                    ) : null}
                                    <button className={secondaryButtonClassName} disabled={isWorkflowActionPending} onClick={() => void saveRubric('draft')}>
                                        {isActionPending('save_rubric') ? 'Saving...' : 'Save Draft'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('rubric_generation')}
                                        onClick={() => openGenerationSettings('rubric_generation')}
                                    />
                                </div>
                                {rubricEditor ? (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                        <p><span className="font-semibold">Pack:</span> {FRANK_V2_PACK_LABELS[rubricEditor.selectedPack]}</p>
                                        <p><span className="font-semibold">Refinement:</span> {rubricEditor.refinementStatus}</p>
                                        <p><span className="font-semibold">Status:</span> {rubricEditor.status}</p>
                                        <p><span className="font-semibold">Prefill mode:</span> Direct from Frank outputs</p>
                                        <p><span className="font-semibold">Active track:</span> {rubricEditor.activeTrack === 'base' ? 'Original question' : 'Selected variation'}</p>
                                    </div>
                                ) : null}
                            </div>
                            <div className="space-y-4">
                                {rubricEditor ? (
                                    <>
                                        <ReadOnlyJsonCard title="Cluster failure modes" value={rubricEditor.clusterFailureModes} />
                                        <Field label="Comparison method note">
                                            <textarea
                                                className={textareaClassName}
                                                value={rubricEditor.comparisonMethodNote}
                                                onChange={(event) => updateRubricEditor((current) => ({ ...current, comparisonMethodNote: event.target.value }))}
                                            />
                                        </Field>
                                        <ScoringPolicyEditor
                                            policy={rubricEditor.scoringPolicy}
                                            onChange={(policy) => updateRubricEditor((current) => ({ ...current, scoringPolicy: policy }))}
                                        />
                                        {visibleStage !== 'seed_rubric' ? <ReadOnlyJsonCard title="Refinement log" value={rubricEditor.refinementLog} /> : null}
                                        {!rubricEditor.tracks.selected_variation ? (
                                            <Banner
                                                tone="warning"
                                                text={buildMissingSecondRubricReason({
                                                    frankPacket: frankEditor,
                                                    rubricPack: rubricEditor,
                                                }) ?? 'Rubric #2 is not available for this packet.'}
                                            />
                                        ) : null}
                                        <div className={`grid gap-4 ${rubricEditor.tracks.selected_variation ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                                            <RubricTrackEditorCard
                                                pack={rubricEditor}
                                                trackId="base"
                                                title="Original question rubric"
                                                track={rubricEditor.tracks.base}
                                                isActive={rubricEditor.activeTrack === 'base'}
                                                collapsedRubricRows={collapsedRubricRows}
                                                onSetActive={() => switchRubricTrack('base')}
                                                onToggleCollapsed={(rowKey) => setCollapsedRubricRows((current) => ({
                                                    ...current,
                                                    [`${rubricEditor.id}:base:${rowKey}`]: !current[`${rubricEditor.id}:base:${rowKey}`],
                                                }))}
                                                onToggleAll={() => {
                                                    const rowKeys = rubricEditor.tracks.base.rows.map((row) => `${rubricEditor.id}:base:${row.key}`);
                                                    const allCollapsed = rowKeys.length > 0 && rowKeys.every((key) => collapsedRubricRows[key]);
                                                    setCollapsedRubricRows((current) => allCollapsed
                                                        ? Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${rubricEditor.id}:base:`)))
                                                        : {
                                                            ...current,
                                                            ...Object.fromEntries(rubricEditor.tracks.base.rows.map((row) => [`${rubricEditor.id}:base:${row.key}`, true])),
                                                        });
                                                }}
                                                onChangeRow={(nextRow) => updateRubricTrackRows('base', (rows) => rows.map((item) => item.key === nextRow.key ? nextRow : item))}
                                            />
                                            {rubricEditor.tracks.selected_variation ? (
                                                <RubricTrackEditorCard
                                                    pack={rubricEditor}
                                                    trackId="selected_variation"
                                                    title="Selected variation rubric"
                                                    track={rubricEditor.tracks.selected_variation}
                                                    isActive={rubricEditor.activeTrack === 'selected_variation'}
                                                    collapsedRubricRows={collapsedRubricRows}
                                                    onSetActive={() => switchRubricTrack('selected_variation')}
                                                    onToggleCollapsed={(rowKey) => setCollapsedRubricRows((current) => ({
                                                        ...current,
                                                        [`${rubricEditor.id}:selected_variation:${rowKey}`]: !current[`${rubricEditor.id}:selected_variation:${rowKey}`],
                                                    }))}
                                                    onToggleAll={() => {
                                                        const rowKeys = rubricEditor.tracks.selected_variation?.rows.map((row) => `${rubricEditor.id}:selected_variation:${row.key}`) ?? [];
                                                        const allCollapsed = rowKeys.length > 0 && rowKeys.every((key) => collapsedRubricRows[key]);
                                                        setCollapsedRubricRows((current) => allCollapsed
                                                            ? Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${rubricEditor.id}:selected_variation:`)))
                                                            : {
                                                                ...current,
                                                                ...Object.fromEntries((rubricEditor.tracks.selected_variation?.rows ?? []).map((row) => [`${rubricEditor.id}:selected_variation:${row.key}`, true])),
                                                            });
                                                    }}
                                                    onChangeRow={(nextRow) => updateRubricTrackRows('selected_variation', (rows) => rows.map((item) => item.key === nextRow.key ? nextRow : item))}
                                                />
                                            ) : null}
                                        </div>
                                    </>
                                ) : (
                                    <EmptyPanelCopy text="Generate or select a rubric pack to inspect the seeded and refined row set." />
                                )}
                            </div>
                        </div>
                    </>
                );
            case 'dasha_cluster':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 space-y-5">
                            <div className="grid gap-4 xl:grid-cols-2">
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Shared Dasha Configuration</p>
                                            <p className="mt-1 text-sm text-slate-600">Set the sample count and model pool for the final evaluation clustering pass.</p>
                                        </div>
                                    </div>
                                    <div className="grid gap-4 xl:grid-cols-[220px,minmax(0,1fr)]">
                                        <Field label="Requested responses">
                                            <input className={inputClassName} value={sampleCount} onChange={(event) => setSampleCount(event.target.value)} />
                                        </Field>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Model configuration</p>
                                            <p className="mt-1 text-sm text-slate-600">{selectedModelKeys.length} model{selectedModelKeys.length === 1 ? '' : 's'} selected for Dasha.</p>
                                            <div className="mt-4">
                                                <ModelSelectionPanel
                                                    selectedModelKeys={selectedModelKeys}
                                                    onToggleModel={(modelKey, checked) => {
                                                        setSelectedModelKeys((current) => checked
                                                            ? [...new Set([...current, modelKey])]
                                                            : current.filter((item) => item !== modelKey));
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judge configuration</p>
                                        <p className="mt-1 text-sm text-slate-600">Choose the OpenAI model Dasha should use later when scoring clustered representatives against the rubric.</p>
                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                            <JudgeSettingsButton
                                                setting={dashaJudgeSettings}
                                                onClick={() => openDashaJudgeSettings('run_default')}
                                            />
                                            <p className="text-sm text-slate-500">
                                                Saved for new Dasha runs started from this stage.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                                    <Field label="Approved rubric pack">
                                        <select
                                            className={inputClassName}
                                            value={dashaRubricPackId}
                                            onChange={(event) => setDashaRubricPackId(event.target.value)}
                                        >
                                            <option value="">Select approved rubric pack</option>
                                            {approvedRubricPacks.map((pack) => (
                                                <option key={pack.id} value={pack.id}>{FRANK_V2_PACK_LABELS[pack.selectedPack]} · {pack.id}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                        <p className="font-semibold text-slate-900">Run plan</p>
                                        <p className="mt-1">
                                            {selectedDashaPack?.tracks.selected_variation
                                                ? 'Variation is active, so Dasha will cluster one run for the original question and one run for the selected variation.'
                                                : 'Dasha will cluster one run for the original question.'}
                                        </p>
                                    </div>
                                    <Field label="Saved runs">
                                        <select className={inputClassName} value={selectedRun?.id ?? ''} onChange={(event) => setSelectedRunId(event.target.value)}>
                                            <option value="">Select run</option>
                                            {visibleDashaRuns.map((run) => (
                                                <option key={run.id} value={run.id}>{run.id} · {run.rubricTrackId === 'selected_variation' ? 'variation' : 'base'} · {run.workflowStage} · {run.status}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <button className={primaryButtonClassName} disabled={isWorkflowActionPending || hasPendingDashaRun} onClick={() => void runDasha()}>
                                        {isActionPending('run_dasha')
                                            ? 'Starting Dasha...'
                                            : hasPendingDashaRun
                                                ? 'Dasha Clustering Running...'
                                                : selectedDashaPack?.tracks.selected_variation ? 'Run Both Dasha Clustering Passes' : 'Run Dasha Clustering'}
                                    </button>
                                </div>
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                                    {selectedRun ? (
                                        <>
                                            <ReadOnlyTextCard title="Selected Dasha run" text={`${selectedRun.id}\nTrack: ${selectedRun.rubricTrackId === 'selected_variation' ? 'Selected variation' : 'Original question'}\nStatus: ${selectedRun.status}\nWorkflow stage: ${selectedRun.workflowStage}\nClusters: ${selectedRun.clusters.length}\nJudge: ${formatGenerationSettingInline(selectedRun.judgeSettings)}`} />
                                            <ReadOnlyTextCard title="Clustering notes" text={selectedRun.clusteringNotes ?? 'No clustering notes saved for this run.'} />
                                        </>
                                    ) : (
                                        <EmptyPanelCopy text="Start or select a Dasha run to inspect the clustering stage." />
                                    )}
                                </div>
                            </div>
                            {selectedRun ? (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <ReadOnlyJsonCard title="Cluster centroids JSON" value={selectedRun.clusters} />
                                    <ReadOnlyJsonCard title="Run outputs JSON" value={buildDashaClusterOutputsJson(selectedRun)} />
                                </div>
                            ) : null}
                        </div>
                    </>
                );
            case 'dasha_judge':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 grid gap-4 xl:grid-cols-[360px,1fr]">
                            <div className="space-y-3">
                                <Field label="Clustered Dasha run">
                                    <select className={inputClassName} value={selectedRun?.id ?? ''} onChange={(event) => setSelectedRunId(event.target.value)}>
                                        <option value="">Select clustered run</option>
                                        {visibleDashaRuns.filter((run) => run.workflowStage === 'clustered' || run.workflowStage === 'judged' || run.status === 'completed').map((run) => (
                                            <option key={run.id} value={run.id}>
                                                {run.id} · {run.rubricTrackId === 'selected_variation' ? 'variation' : 'base'} · {run.workflowStage}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judge override</p>
                                    <p className="mt-1 text-sm text-slate-600">Adjust the judge model for this clustered run before Dasha scores the centroids.</p>
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <JudgeSettingsButton
                                            setting={judgeSettingsDraft}
                                            onClick={() => openDashaJudgeSettings('judge_override')}
                                        />
                                        <p className="text-sm text-slate-500">
                                            Starts from the run’s saved judge setting and can be changed before judging.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    className={primaryButtonClassName}
                                    disabled={isWorkflowActionPending || (selectedDashaPack
                                        ? !expectedDashaTrackIds.some((trackId) => visibleDashaRuns.some((run) => run.rubricTrackId === trackId && run.workflowStage === 'clustered'))
                                        : !selectedRun || selectedRun.workflowStage !== 'clustered')}
                                    onClick={() => void judgeDashaRun()}
                                >
                                    {isActionPending('judge_dasha')
                                        ? 'Judging...'
                                        : selectedDashaPack?.tracks.selected_variation ? 'Judge Ready Dasha Runs' : 'Judge Clustered Run'}
                                </button>
                            </div>
                            <div className="space-y-4">
                                {selectedRun ? (
                                    <>
                                        <ReadOnlyJsonCard title="Clusters" value={selectedRun.clusters.map((cluster) => ({
                                            id: cluster.id,
                                            size: cluster.size,
                                            representativeText: cluster.representativeText,
                                        }))} />
                                        <ReadOnlyTextCard title="Clustering notes" text={selectedRun.clusteringNotes ?? 'No clustering notes saved for this run.'} />
                                    </>
                                ) : (
                                        <EmptyPanelCopy text="Select a clustered Dasha run to judge its centroid representatives, or let Dasha judge every ready track for the selected pack." />
                                    )}
                                </div>
                        </div>
                    </>
                );
            case 'dasha_results':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 min-w-0 space-y-4">
                            {selectedRun ? (
                                <DashaResultsExplorer key={selectedRun.id} run={selectedRun} />
                            ) : (
                                <EmptyPanelCopy text="Start, cluster, and judge a Dasha run to inspect saved results." />
                            )}
                        </div>
                    </>
                );
            case 'zak_review':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 space-y-4">
                            <Banner tone="info" text="Zak now follows the simplified Dasha rule: only a no-majority best-centroid decision should escalate. In the current single-judge setup that usually means no automatic Zak review is needed." />
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Manual Escalation Point</p>
                                        <p className="mt-2 text-sm text-slate-600">
                                            This is where disputed Dasha outcomes should hand off for SME review. The current branch saves the Dasha majority result and case-verification flags, but still keeps the actual Zak handoff human-reviewed.
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                        <p className="font-semibold text-slate-900">Current Zak rule</p>
                                        <ul className="mt-3 space-y-2">
                                            <li>No strict majority on the best centroid should escalate to Zak.</li>
                                            <li>Case-verification ambiguity is recorded, but does not escalate by itself under the simplified Dasha rule.</li>
                                            <li>Penalties and caps remain visible for human review, but they do not auto-trigger Zak on their own.</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {selectedRun ? (
                                        <>
                                            <ReadOnlyTextCard title="Selected Dasha run" text={`${selectedRun.id}\nStatus: ${selectedRun.status}\nRun mode: ${selectedRun.runMode}\nSaved judge: ${formatGenerationSettingInline(selectedRun.judgeSettings)}\nJudge override: ${formatGenerationSettingInline(judgeSettingsDraft)}`} />
                                            <ReadOnlyTextCard title="Clustering notes" text={selectedRun.clusteringNotes ?? 'No clustering notes saved for this run.'} />
                                        </>
                                    ) : (
                                        <EmptyPanelCopy text="Run Dasha first, then use Zak as the review handoff block for unstable or questionable outcomes." />
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                );
            default:
                return <EmptyPanelCopy text="This stage is not available." />;
        }
    }

    if (!hasMounted) {
        return (
            <AppShell
                eyebrow={eyebrow}
                title={title}
                subtitle={subtitle}
            >
                <div className="space-y-6 pb-28 sm:pb-32" />
                <WorkflowStatusDock
                    collapsed={isStatusDockCollapsed}
                    tone="progress"
                    title="Loading workflow data"
                    message="Loading Frank v2 workflow data..."
                    detail="The floating status dock keeps progress and errors visible without taking over the top of the page."
                    onToggle={() => setIsStatusDockCollapsed((current) => !current)}
                />
            </AppShell>
        );
    }

    return (
        <AppShell
            eyebrow={eyebrow}
            title={title}
            subtitle={subtitle}
        >
            <div className="space-y-4 pb-28 sm:pb-32">
                <section>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pipeline Tabs</p>
                            <p className="mt-1 text-sm text-slate-500">
                                {isFrankOnlyMode
                                    ? 'This Legal AutoEval tab is a Frank-only workflow for packet construction, benchmark drafting, and reverse-engineered question setup.'
                                    : 'These switch between the major workflow blocks: Frank builds the packet, Karthic builds the rubric, Dasha runs judging, and Zak handles escalation.'}
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current Tab</p>
                            <p className="mt-1 font-semibold text-slate-900">{currentBlock?.title ?? 'Pipeline'}</p>
                        </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                    {blockViews.map((block) => {
                        const targetStage = block.stages.find((stage) => stage.unlocked) ?? block.stages[0] ?? null;
                        return (
                            <StageBlockCard
                                key={block.id}
                                block={block}
                                icon={getBlockIcon(block.id)}
                                onClick={() => {
                                    if (targetStage?.unlocked) {
                                        goToStage(targetStage.id);
                                    }
                                }}
                            />
                        );
                    })}
                    </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="min-w-0 space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <SectionHeader
                                title={`${currentBlock?.title ?? 'Pipeline'} Wizard`}                            />
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current Step</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                                {getNavigatorBadge(currentStage.id)}
                                            </span>
                                            <span className="font-semibold text-slate-900">{currentStage.title}</span>
                                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{currentStage.statusLabel}</span>
                                        </div>
                                    </div>
                                    <div className="text-right text-sm text-slate-500">
                                        <p>{buildBlockProgressLabel(currentBlock?.id ?? 'frank', currentStage.id, currentBlockStepIndex, currentBlock?.stages.length ?? 1)}</p>
                                        <p className="mt-1">{currentBlockNextStage ? `Next up: ${formatWorkflowStepLabel(currentBlockNextStage.id)}` : 'Final step in this block'}</p>
                                    </div>
                                </div>
                            </div>
                            {(currentBlock?.stages.length ?? 0) > 1 ? (
                            <BlockStepRail
                                blockId={currentBlock?.id ?? 'frank'}
                                stages={currentBlock?.stages ?? []}
                                currentStageId={visibleStage}
                                onChange={goToStage}
                            />
                            ) : null}
                            <div className="mt-4 border-t border-slate-200 pt-4">
                                {nextStageBlockedReason ? <Banner tone="warning" text={nextStageBlockedReason} /> : null}
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <button
                                        className={secondaryButtonClassName}
                                        disabled={!currentBlockPreviousStage}
                                        onClick={() => {
                                            if (currentBlockPreviousStage) {
                                                goToStage(currentBlockPreviousStage.id);
                                            }
                                        }}
                                    >
                                        Previous
                                    </button>
                                    <div className="text-sm text-slate-500">
                                        {currentBlockNextStage ? `Next: ${currentBlockNextStage.title}` : 'Final step in this block'}
                                    </div>
                                    <button
                                        className={primaryButtonClassName}
                                        disabled={!currentBlockNextStage || Boolean(nextStageBlockedReason)}
                                        onClick={() => {
                                            if (currentBlockNextStage && !nextStageBlockedReason) {
                                                goToStage(currentBlockNextStage.id);
                                            }
                                        }}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="min-w-0">
                                {renderStagePanel()}
                            </div>
                        </div>
                    </div>

                    <div className="min-w-0 space-y-6">
                        <StageGuideCard stageId={visibleStage} promptPreview={activeStagePrompt} />
                    </div>
                </section>
            </div>
            <WorkflowStatusDock
                collapsed={isStatusDockCollapsed}
                tone={statusDockTone}
                title={statusDockTitle}
                message={statusDockMessage}
                detail={statusDockDetail}
                onToggle={() => setIsStatusDockCollapsed((current) => !current)}
            />
            {openGenerationTarget ? (
                <GenerationSettingsModal
                    targetLabel={WORKFLOW_GENERATION_TARGET_LABELS[openGenerationTarget]}
                    value={generationSettingsDraft}
                    onChange={setGenerationSettingsDraft}
                    onClose={() => setOpenGenerationTarget(null)}
                    onSave={saveGenerationSettings}
                />
            ) : null}
            {openDashaJudgeTarget ? (
                <JudgeSettingsModal
                    targetLabel={openDashaJudgeTarget === 'run_default' ? 'Dasha Judge Configuration' : 'Dasha Judge Override'}
                    value={judgeSettingsDraft}
                    onChange={(value) => setJudgeSettingsDraft((current) => ({
                        ...current,
                        model: value.model,
                        reasoningEffort: value.reasoningEffort,
                    }))}
                    onClose={() => setOpenDashaJudgeTarget(null)}
                    onSave={saveDashaJudgeSettings}
                />
            ) : null}
        </AppShell>
    );
}

export default function LegalWorkflowPage() {
    return <LegalWorkflowPageClient />;
}

function findLastUnlockedStage(stages: WorkflowStageView[]) {
    for (let index = stages.length - 1; index >= 0; index -= 1) {
        if (stages[index].unlocked) {
            return stages[index];
        }
    }
    return stages[0] ?? null;
}

function getFrankPhaseNumber(stageId: WorkflowStageId) {
    const index = FRANK_PHASE_ORDER.indexOf(stageId);
    return index >= 0 ? index + 1 : null;
}

function getNavigatorBadge(stageId: WorkflowStageId) {
    const phaseNumber = getFrankPhaseNumber(stageId);
    if (phaseNumber !== null) {
        return `Phase ${phaseNumber}`;
    }
    switch (stageId) {
        case 'source':
            return 'Source';
        case 'seed_rubric':
        case 'refine_rubric':
        case 'approve_rubric':
            return 'Rubric';
        case 'dasha_cluster':
        case 'dasha_judge':
        case 'dasha_results':
            return 'Judge';
        case 'zak_review':
            return 'Zak';
        default:
            return 'Stage';
    }
}

function formatWorkflowStepLabel(stageId: WorkflowStageId) {
    const phaseNumber = getFrankPhaseNumber(stageId);
    if (phaseNumber !== null) {
        const stage = WORKFLOW_STAGES.find((item) => item.id === stageId);
        return stage ? `Phase ${phaseNumber} · ${stage.shortLabel}` : `Phase ${phaseNumber}`;
    }
    switch (stageId) {
        case 'source':
            return 'Source Setup';
        case 'seed_rubric':
            return 'Seed Rubric';
        case 'refine_rubric':
            return 'Refine Rubric';
        case 'approve_rubric':
            return 'Approve Rubric';
        case 'dasha_cluster':
            return 'Dasha Cluster';
        case 'dasha_judge':
            return 'Dasha Judge';
        case 'dasha_results':
            return 'Results';
        case 'zak_review':
            return 'Zak Review';
        default: {
            const stage = WORKFLOW_STAGES.find((item) => item.id === stageId);
            return stage?.shortLabel ?? 'Stage';
        }
    }
}

function buildBlockProgressLabel(
    blockId: WorkflowBlockId,
    stageId: WorkflowStageId,
    currentBlockStepIndex: number,
    blockStageCount: number,
) {
    if (blockId === 'frank') {
        const phaseNumber = getFrankPhaseNumber(stageId);
        return phaseNumber !== null
            ? `Frank Phase ${phaseNumber} of ${FRANK_PHASE_ORDER.length}`
            : 'Source setup';
    }
    if (blockStageCount <= 1) {
        return 'Single-step block';
    }
    return `Step ${Math.max(currentBlockStepIndex + 1, 1)} of ${blockStageCount}`;
}

function getBlockIcon(blockId: WorkflowBlockId) {
    switch (blockId) {
        case 'frank':
            return <ScrollText className="h-5 w-5" />;
        case 'karthic':
            return <Scale className="h-5 w-5" />;
        case 'dasha':
            return <Network className="h-5 w-5" />;
        case 'zak':
            return <ShieldAlert className="h-5 w-5" />;
        default:
            return <ScrollText className="h-5 w-5" />;
    }
}

function buildMissingSecondRubricReason(input: {
    frankPacket: FrankPacketV2 | null;
    rubricPack: KarthicRubricPackV2 | null;
}) {
    const { frankPacket, rubricPack } = input;
    if (!frankPacket) {
        return 'Rubric #2 is unavailable because no Frank packet is selected.';
    }
    if (!frankPacket.questionVariance.activePackageId) {
        return 'Rubric #2 is unavailable because no selected variation package is active in Frank Phase 4.';
    }
    if (frankPacket.controllerCard?.dual_rubric_mode !== 'on') {
        return 'Rubric #2 is unavailable because the current Frank packet is still on the single-question path.';
    }
    if (!rubricPack) {
        return 'Rubric #2 will appear after you generate a Karthic rubric pack for this Frank packet.';
    }
    if (rubricPack.frankPacketId !== frankPacket.id) {
        return 'Rubric #2 is unavailable in this view because the selected rubric pack belongs to a different Frank packet.';
    }
    if (!rubricPack.tracks.selected_variation) {
        return 'Rubric #2 is unavailable in this rubric pack. Re-run Generate Seed Rubric so Karthic picks up the active selected variation.';
    }
    return null;
}

function formatFrankPacketPhase(phase: FrankPacketV2['phase']) {
    switch (phase) {
        case 'source':
            return 'Source Upload / Packet Selection';
        case 'routing_intake':
            return 'Phase 1 · Routing / Intake';
        case 'extraction_mapping':
            return 'Phase 2 · Extraction / Mapping';
        case 'benchmark':
            return 'Phase 3 · Benchmark Answer';
        case 'question':
            return 'Phase 4 · Reverse-Engineered Question';
        default:
            return phase;
    }
}

function buildClientFrankBlockReason(packet: FrankPacketV2) {
    if (packet.routingConfidence === 'weak') {
        return 'Routing confidence is weak. Stop at intake/extraction and resolve JD review first.';
    }
    if (!packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.controllerCard || !packet.likelyFailureModes) {
        return 'Run Phase 2 before generating the benchmark answer or question.';
    }
    if (packet.intakeChecklist?.finalIntakeRating === 'Weak; support/contrast source only' || packet.intakeChecklist?.finalIntakeRating === 'Not a strong gold-source candidate without additional authority') {
        return 'This source failed the stop rule and cannot proceed to benchmark or question generation.';
    }
    if (packet.intakeChecklist?.finalIntakeRating === 'Moderate; usable with supporting authority') {
        const hasSupportingAuthority = packet.sourceArtifacts.some((artifact) => artifact.role === 'supporting_authority' || artifact.role === 'supplemental');
        if (!hasSupportingAuthority) {
            return 'This source is only moderate and requires supporting authority before benchmark/question generation.';
        }
    }
    return null;
}

function buildClientFrankApprovalBlockReason(packet: FrankPacketV2) {
    if (!packet.selectedPack || !packet.intakeChecklist) {
        return 'Complete Frank Phase 1 before approval.';
    }
    if (!packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.controllerCard || !packet.likelyFailureModes) {
        return 'Complete Frank Phase 2 before approval.';
    }
    const benchmarkBlockReason = buildClientFrankBlockReason(packet);
    if (benchmarkBlockReason) {
        return benchmarkBlockReason;
    }
    if (!packet.benchmarkAnswer.trim()) {
        return 'Complete Frank Phase 3 before approval.';
    }
    if (!packet.reverseEngineeredQuestion.trim()) {
        return 'Complete Frank Phase 4 before approval.';
    }
    return null;
}

function buildSelectedModels(selectedModelKeys: string[]): DashaSelectedModel[] {
    return selectedModelKeys.map((modelKey) => {
        const [provider, model] = modelKey.split('::');
        return {
            provider: provider as ModelProvider,
            model,
            reasoningEffort: provider === 'anthropic' ? undefined : 'medium',
        };
    });
}

function sortByUpdated<T extends { updatedAt?: string }>(items: T[]) {
    return [...items].sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
}

async function readJsonResponse<T extends ApiErrorPayload>(response: Response, fallbackMessage: string): Promise<T> {
    const raw = await response.text();
    if (!raw.trim()) {
        throw new Error(`${fallbackMessage} The server returned an empty response (${response.status} ${response.statusText || 'unknown status'}).`);
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        const contentType = response.headers.get('content-type') ?? 'unknown content type';
        const preview = raw.replace(/\s+/g, ' ').trim();
        const clippedPreview = preview.length > 180 ? `${preview.slice(0, 180)}...` : preview;
        throw new Error(`${fallbackMessage} The server returned invalid JSON (${response.status} ${response.statusText || 'unknown status'}, ${contentType}).${clippedPreview ? ` Response preview: ${clippedPreview}` : ''}`);
    }
}

function sortRuns(items: DashaRunV2[]) {
    return [...items].sort((left, right) => String(right.completedAt ?? right.createdAt).localeCompare(String(left.completedAt ?? left.createdAt)));
}

function buildDashaClusterOutputsJson(run: DashaRunV2) {
    const responseById = new Map(run.responses.map((response) => [response.id, response]));
    const assignedResponseIds = new Set<string>();

    const clusters = run.clusters.map((cluster) => {
        const memberResponses = cluster.memberResponseIds
            .map((responseId) => {
                assignedResponseIds.add(responseId);
                return responseById.get(responseId) ?? null;
            })
            .filter((response): response is NonNullable<typeof response> => Boolean(response));

        return {
            cluster,
            representative: responseById.get(cluster.representativeResponseId) ?? null,
            members: memberResponses,
        };
    });

    return {
        runId: run.id,
        status: run.status,
        workflowStage: run.workflowStage,
        runMode: run.runMode,
        questionText: run.questionText,
        judgeSettings: run.judgeSettings,
        requestedResponseCount: run.requestedResponseCount ?? run.responses.length,
        validResponseCount: run.validResponseCount ?? run.responses.filter((response) => !response.error && response.responseText.trim()).length,
        clusteringMethod: run.clusteringMethod,
        clusteringNotes: run.clusteringNotes,
        selectedModels: run.selectedModels,
        trackSummary: run.trackSummary,
        clusters,
        clusterAnalyses: run.clusterAnalyses,
        unassignedResponses: run.responses.filter((response) => !assignedResponseIds.has(response.id)),
        erroredResponses: run.responses.filter((response) => Boolean(response.error)),
    };
}

function splitLines(value: string) {
    return value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

function buildStageBlockCardClassName(block: WorkflowBlockView) {
    if (block.active) {
        return 'rounded-2xl border border-teal-300 bg-teal-50/60 p-4 text-left text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1 ring-teal-200';
    }
    if (!block.unlocked) {
        return 'rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-slate-400 shadow-[0_8px_20px_rgba(15,23,42,0.06)]';
    }
    return 'rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.08)]';
}

function buildSubstepTabClassName(stage: WorkflowStageView, isCurrent: boolean) {
    if (isCurrent) {
        return 'rounded-full border border-teal-300 bg-teal-50 px-3 py-1.5 text-left text-teal-900 shadow-[0_6px_16px_rgba(13,148,136,0.10)]';
    }
    if (!stage.unlocked) {
        return 'rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-left text-slate-400';
    }
    if (stage.complete) {
        return 'rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-left text-emerald-900';
    }
    if (stage.blocked) {
        return 'rounded-full border border-amber-200 bg-white px-3 py-1.5 text-left text-amber-900';
    }
    return 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-slate-700';
}

function StageBlockCard({
    block,
    icon,
    onClick,
}: {
    block: WorkflowBlockView;
    icon: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!block.unlocked}
            className={buildStageBlockCardClassName(block)}
        >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {block.active ? 'Active Tab' : 'Pipeline Tab'}
            </p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200 bg-white text-teal-800">
                {icon}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">{block.title}</h2>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {block.statusLabel}
                </span>
            </div>
            <p className="mt-2 max-w-md text-sm leading-7 text-slate-600">{block.description}</p>
        </button>
    );
}

function BlockStepRail({
    blockId,
    stages,
    currentStageId,
    onChange,
}: {
    blockId: WorkflowBlockId;
    stages: WorkflowStageView[];
    currentStageId: WorkflowStageId;
    onChange: (stageId: WorkflowStageId) => void;
}) {
    return (
        <div className="mt-4 flex flex-wrap gap-2.5">
            {stages.map((stage) => (
                <button
                    key={stage.id}
                    type="button"
                    disabled={!stage.unlocked}
                    onClick={() => onChange(stage.id)}
                    className={buildWizardStepClassName(stage, stage.id === currentStageId)}
                >
                    <span className="font-semibold">
                        {blockId === 'frank' ? formatWorkflowStepLabel(stage.id) : stage.shortLabel}
                    </span>
                    <span className="ml-2 text-[11px] uppercase tracking-[0.12em] opacity-70">{stage.statusLabel}</span>
                </button>
            ))}
        </div>
    );
}

function buildWizardStepClassName(stage: WorkflowStageView, isCurrent: boolean) {
    if (isCurrent) {
        return 'inline-flex items-center rounded-full border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800';
    }
    if (!stage.unlocked) {
        return 'inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400';
    }
    return 'inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500';
}

function buildStagePromptPreview(input: {
    stageId: WorkflowStageId;
    frankPacket: FrankPacketV2 | null;
    rubricPack: KarthicRubricPackV2 | null;
    dashaPack: KarthicRubricPackV2 | null;
    selectedRun: DashaRunV2 | null;
}): StagePromptPreview | null {
    switch (input.stageId) {
        case 'source':
        case 'routing_intake':
            return getSavedPromptPreview(input.frankPacket?.savedPrompts, 'routing_intake_generation');
        case 'extraction_mapping':
            return getSavedPromptPreview(input.frankPacket?.savedPrompts, 'extraction_mapping_generation');
        case 'benchmark':
            return getSavedPromptPreview(input.frankPacket?.savedPrompts, 'benchmark_generation');
        case 'question':
            return getSavedPromptPreview(input.frankPacket?.savedPrompts, 'question_generation');
        case 'seed_rubric':
        case 'refine_rubric':
        case 'approve_rubric':
            return getSavedPromptPreview(input.rubricPack?.savedPrompts, 'rubric_generation');
        case 'dasha_cluster':
        case 'dasha_judge': {
            const questionText = input.selectedRun?.questionText?.trim() || input.dashaPack?.questionText?.trim() || '';
            if (!questionText) {
                return null;
            }
            return {
                title: 'Dasha generation prompt',
                prompt: [
                    'System:',
                    'Write a direct legal analysis answering the prompt. Do not use markdown headings unless the question calls for them.',
                    '',
                    'User:',
                    questionText,
                ].join('\n'),
            };
        }
        case 'dasha_results':
        case 'zak_review':
            return null;
        default:
            return null;
    }
}

function getSavedPromptPreview(
    prompts: Array<{ kind: string; title: string; prompt: string }> | undefined,
    kind: string,
): StagePromptPreview | null {
    const match = [...(prompts ?? [])].reverse().find((item) => item.kind === kind && item.prompt.trim());
    return match ? { title: match.title, prompt: match.prompt } : null;
}

function StageGuideOverlay({
    stageId,
    promptPreview,
    isOpen,
    onToggle,
}: {
    stageId: WorkflowStageId;
    promptPreview: StagePromptPreview | null;
    isOpen: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="flex justify-end">
            <div className="w-full xl:max-w-[340px]">
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-left shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur"
                    aria-expanded={isOpen}
                    aria-controls="stage-guide-overlay-panel"
                >
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stage Guide</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                            {WORKFLOW_STAGES.find((stage) => stage.id === stageId)?.title ?? 'Workflow Stage'}
                        </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 p-1 text-slate-600">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                </button>
                {isOpen ? (
                    <div id="stage-guide-overlay-panel" className="mt-3">
                        <StageGuideCard stageId={stageId} promptPreview={promptPreview} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function StageGuideCard({ stageId, promptPreview }: { stageId: WorkflowStageId; promptPreview: StagePromptPreview | null }) {
    const guide = WORKFLOW_STAGE_GUIDES[stageId];
    const phaseNumber = getFrankPhaseNumber(stageId);
    return (
        <aside className="rounded-2xl border border-slate-200 bg-slate-50/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stage Guide</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {phaseNumber !== null ? `Frank Phase ${phaseNumber}` : stageId === 'source' ? 'Source Setup' : WORKFLOW_STAGES.find((stage) => stage.id === stageId)?.title ?? 'Workflow Stage'}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">What this stage is doing</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{guide.purpose}</p>

            {guide.promptFiles?.length ? (
                <StageGuideSection title="V2 Prompt Files">
                    {guide.promptFiles.map((item) => (
                        <li key={`${stageId}_file_${item}`}>{item}</li>
                    ))}
                </StageGuideSection>
            ) : null}

            {guide.promptNote ? (
                <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm text-teal-900">
                    <p className="font-semibold">Prompt usage</p>
                    <p className="mt-1 leading-6">{guide.promptNote}</p>
                </div>
            ) : null}

            {guide.stopRules?.length ? (
                <StageGuideSection title="Watch for">
                    {guide.stopRules.map((item) => (
                        <li key={`${stageId}_stop_${item}`}>{item}</li>
                    ))}
                </StageGuideSection>
            ) : null}

            <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Prompt Preview</p>
                {promptPreview ? (
                    <details className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white" open={stageId === 'benchmark' || stageId === 'question'}>
                        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">
                            {promptPreview.title}
                        </summary>
                        <pre className="max-h-[420px] overflow-auto border-t border-slate-200 px-3 py-3 text-xs leading-5 text-slate-700 whitespace-pre-wrap">
                            {promptPreview.prompt}
                        </pre>
                    </details>
                ) : (
                    <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
                        No prompt preview is available for this stage yet.
                    </div>
                )}
            </div>
        </aside>
    );
}

function StageGuideSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                {children}
            </ul>
        </div>
    );
}

function ModelSelectionPanel({
    selectedModelKeys,
    onToggleModel,
}: {
    selectedModelKeys: string[];
    onToggleModel: (modelKey: string, checked: boolean) => void;
}) {
    const providers: ModelProvider[] = ['openai', 'anthropic', 'gemini'];

    return (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {providers.map((provider) => {
                const providerModels = MODEL_OPTIONS_BY_PROVIDER[provider];
                const providerKeys = providerModels.map((option) => `${provider}::${option.value}`);
                const selectedCount = providerKeys.filter((modelKey) => selectedModelKeys.includes(modelKey)).length;

                return (
                    <div key={provider} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{PROVIDER_LABELS[provider]}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                    {selectedCount} of {providerModels.length} selected
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
                                    type="button"
                                    onClick={() => providerKeys.forEach((modelKey) => onToggleModel(modelKey, true))}
                                >
                                    Select all
                                </button>
                                <button
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
                                    type="button"
                                    disabled={selectedCount === 0}
                                    onClick={() => providerKeys.forEach((modelKey) => onToggleModel(modelKey, false))}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 max-h-[180px] overflow-y-auto pr-1">
                            <div className="space-y-2">
                                {providerModels.map((option) => {
                                    const modelKey = `${provider}::${option.value}`;
                                    const checked = selectedModelKeys.includes(modelKey);
                                    return (
                                        <label
                                            key={modelKey}
                                            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                                                checked
                                                    ? 'border-teal-300 bg-teal-50/70'
                                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                checked={checked}
                                                onChange={(event) => onToggleModel(modelKey, event.target.checked)}
                                            />
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {provider === 'anthropic' ? 'Standard reasoning profile' : 'Reasoning effort defaults to medium for this model'}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function GenerationSettingsButton({
    setting,
    onClick,
}: {
    setting: FrankGenerationSettings;
    onClick: () => void;
}) {
    return (
        <button className={secondaryButtonClassName} type="button" onClick={onClick}>
            Model: {formatGenerationSettingInline(setting)}
        </button>
    );
}

function JudgeSettingsButton({
    setting,
    onClick,
}: {
    setting: DashaJudgeSettings;
    onClick: () => void;
}) {
    return (
        <button className={secondaryButtonClassName} type="button" onClick={onClick}>
            Model: {formatGenerationSettingInline(setting)}
        </button>
    );
}

function GenerationSettingsModal({
    targetLabel,
    value,
    onChange,
    onClose,
    onSave,
}: {
    targetLabel: string;
    value: FrankGenerationSettings;
    onChange: (value: FrankGenerationSettings) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    const modelOptions = MODEL_OPTIONS_BY_PROVIDER.openai;
    const supportsReasoning = supportsReasoningEffortControl('openai', value.model);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Model Selection</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{targetLabel}</p>
                        <p className="mt-2 text-sm text-slate-600">
                            Choose the OpenAI model used for this step. GPT-5.4 Pro is supported here because the workflow uses the Responses API for both text and structured JSON calls.
                        </p>
                    </div>
                </div>
                <div className="mt-4 space-y-4">
                    <Field label="Model">
                        <select
                            className={inputClassName}
                            value={value.model}
                            onChange={(event) => onChange({
                                ...value,
                                model: event.target.value,
                            })}
                        >
                            {modelOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Reasoning effort">
                        <select
                            className={inputClassName}
                            value={supportsReasoning ? value.reasoningEffort : 'medium'}
                            disabled={!supportsReasoning}
                            onChange={(event) => onChange({
                                ...value,
                                reasoningEffort: event.target.value as ReasoningEffort,
                            })}
                        >
                            {REASONING_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </Field>
                    {!supportsReasoning ? (
                        <p className="text-sm text-slate-500">
                            This model uses its default reasoning behavior for this workflow step.
                        </p>
                    ) : null}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button className={secondaryButtonClassName} type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button className={primaryButtonClassName} type="button" onClick={onSave}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

function JudgeSettingsModal({
    targetLabel,
    value,
    onChange,
    onClose,
    onSave,
}: {
    targetLabel: string;
    value: DashaJudgeSettings;
    onChange: (value: Pick<DashaJudgeSettings, 'model' | 'reasoningEffort'>) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    const modelOptions = MODEL_OPTIONS_BY_PROVIDER.openai;
    const supportsReasoning = supportsReasoningEffortControl('openai', value.model);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Model Selection</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{targetLabel}</p>
                        <p className="mt-2 text-sm text-slate-600">
                            Choose the OpenAI model Dasha should use when scoring clustered representatives against the approved rubric.
                        </p>
                    </div>
                </div>
                <div className="mt-4 space-y-4">
                    <Field label="Model">
                        <select
                            className={inputClassName}
                            value={value.model}
                            onChange={(event) => onChange({
                                model: event.target.value,
                                reasoningEffort: value.reasoningEffort,
                            })}
                        >
                            {modelOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Reasoning effort">
                        <select
                            className={inputClassName}
                            value={supportsReasoning ? value.reasoningEffort : 'medium'}
                            disabled={!supportsReasoning}
                            onChange={(event) => onChange({
                                model: value.model,
                                reasoningEffort: event.target.value as ReasoningEffort,
                            })}
                        >
                            {REASONING_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </Field>
                    {!supportsReasoning ? (
                        <p className="text-sm text-slate-500">
                            This model uses its default reasoning behavior for Dasha judging.
                        </p>
                    ) : null}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button className={secondaryButtonClassName} type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button className={primaryButtonClassName} type="button" onClick={onSave}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatGenerationSettingInline(setting: Pick<FrankGenerationSettings, 'model' | 'reasoningEffort'>) {
    const modelLabel = getOpenAiModelLabel(setting.model);
    const supportsReasoning = supportsReasoningEffortControl('openai', setting.model);
    return supportsReasoning
        ? `${modelLabel} · ${setting.reasoningEffort}`
        : modelLabel;
}

function getOpenAiModelLabel(model: string) {
    return MODEL_OPTIONS_BY_PROVIDER.openai.find((option) => option.value === model)?.label ?? model;
}

function Banner({ tone, text }: { tone: 'info' | 'warning' | 'error'; text: string }) {
    const className = tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-teal-200 bg-teal-50 text-teal-800';
    return <div className={`rounded-xl border px-4 py-3 text-sm ${className}`}>{text}</div>;
}

function WorkflowStatusDock({
    collapsed,
    tone,
    title,
    message,
    detail,
    onToggle,
}: {
    collapsed: boolean;
    tone: WorkflowStatusTone;
    title: string;
    message: string;
    detail: string;
    onToggle: () => void;
}) {
    const icon = tone === 'error'
        ? <AlertTriangle className="h-4 w-4" />
        : tone === 'progress'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : tone === 'success'
                ? <CheckCircle2 className="h-4 w-4" />
                : <ScrollText className="h-4 w-4" />;
    const shellClassName = tone === 'error'
        ? 'border-rose-200 bg-rose-50/95 text-rose-950 shadow-[0_18px_45px_rgba(244,63,94,0.18)]'
        : tone === 'progress'
            ? 'border-teal-200 bg-white/95 text-slate-900 shadow-[0_18px_45px_rgba(13,148,136,0.16)]'
            : tone === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-950 shadow-[0_18px_45px_rgba(16,185,129,0.16)]'
                : 'border-slate-200 bg-white/95 text-slate-900 shadow-[0_18px_45px_rgba(15,23,42,0.12)]';
    const badgeClassName = tone === 'error'
        ? 'border-rose-200 bg-rose-100 text-rose-800'
        : tone === 'progress'
            ? 'border-teal-200 bg-teal-50 text-teal-800'
            : tone === 'success'
                ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                : 'border-slate-200 bg-slate-100 text-slate-700';
    const collapsedSummary = tone === 'error'
        ? 'Issue'
        : tone === 'progress'
            ? 'Working'
            : tone === 'success'
                ? 'Updated'
                : 'Ready';

    return (
        <div className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:w-[360px]">
            <div className={`overflow-hidden rounded-2xl border backdrop-blur ${shellClassName}`}>
                <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                    onClick={onToggle}
                    aria-expanded={!collapsed}
                    aria-controls="workflow-status-dock-body"
                >
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${badgeClassName}`}>
                                {icon}
                                {collapsedSummary}
                            </span>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Workflow Status</p>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-current">{title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{message}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white/80 p-1 text-slate-600">
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                </button>
                {!collapsed ? (
                    <div
                        id="workflow-status-dock-body"
                        className="border-t border-black/5 px-4 pb-4 pt-3"
                        aria-live={tone === 'error' ? 'assertive' : 'polite'}
                    >
                        <p className="text-sm font-medium text-current">{message}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function Panel({ children }: { children: ReactNode }) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">{children}</section>;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={className}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</label>
            {children}
        </div>
    );
}

function EmptyPanelCopy({ text }: { text: string }) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{text}</div>;
}

function CompactItemList({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
            <div className="space-y-1 text-sm text-slate-700">
                {items.map((item, index) => (
                    <p key={`${title}_${index}`}>{item}</p>
                ))}
            </div>
        </div>
    );
}

function CompactJsonDisclosure({ title, value }: { title: string; value: unknown }) {
    return (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {title}
            </summary>
            <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(value, null, 2)}</pre>
        </details>
    );
}

function ReadOnlyJsonCard({ title, value }: { title: string; value: unknown }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(value, null, 2)}</pre>
        </div>
    );
}

function ReadOnlyTextCard({ title, text }: { title: string; text: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
            <pre className="whitespace-pre-wrap text-sm text-slate-700">{text}</pre>
        </div>
    );
}

function WarningList({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">{title}</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {items.map((item, index) => (
                    <li key={`${title}_${index}`}>• {item}</li>
                ))}
            </ul>
        </div>
    );
}

function RubricTrackEditorCard({
    pack,
    trackId,
    title,
    track,
    isActive,
    collapsedRubricRows,
    onSetActive,
    onToggleCollapsed,
    onToggleAll,
    onChangeRow,
}: {
    pack: KarthicRubricPackV2;
    trackId: KarthicRubricTrackId;
    title: string;
    track: NonNullable<KarthicRubricPackV2['tracks'][KarthicRubricTrackId]>;
    isActive: boolean;
    collapsedRubricRows: Record<string, boolean>;
    onSetActive: () => void;
    onToggleCollapsed: (rowKey: string) => void;
    onToggleAll: () => void;
    onChangeRow: (row: KarthicRubricRow) => void;
}) {
    const rowPrefix = `${pack.id}:${trackId}:`;
    const rowKeys = track.rows.map((row) => `${rowPrefix}${row.key}`);
    const allCollapsed = rowKeys.length > 0 && rowKeys.every((key) => collapsedRubricRows[key]);

    return (
        <div className={`space-y-4 rounded-2xl border p-4 ${isActive ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{track.label}</p>
                </div>
                <button className={isActive ? secondaryButtonClassName : primaryButtonClassName} type="button" onClick={onSetActive}>
                    {isActive ? 'Active track' : 'Set active'}
                </button>
            </div>
            <ReadOnlyTextCard title="Question" text={track.questionText || 'No question saved for this track yet.'} />
            {track.patchNotes?.length ? <CompactItemList title="Patch notes" items={track.patchNotes} /> : null}
            {track.deltaSummary?.length ? <CompactItemList title="Delta summary" items={track.deltaSummary} /> : null}
            <div className="flex flex-wrap gap-2">
                <button className={secondaryButtonClassName} onClick={onToggleAll} type="button">
                    {allCollapsed ? 'Expand All Issues' : 'Collapse All Issues'}
                </button>
            </div>
            <div className="space-y-3">
                {track.rows.map((row) => (
                    <RubricRowEditor
                        key={`${trackId}:${row.key}`}
                        row={row}
                        collapsed={Boolean(collapsedRubricRows[`${rowPrefix}${row.key}`])}
                        onToggleCollapsed={() => onToggleCollapsed(row.key)}
                        onChange={onChangeRow}
                    />
                ))}
            </div>
        </div>
    );
}

function RubricRowEditor({
    row,
    collapsed,
    onToggleCollapsed,
    onChange,
}: {
    row: KarthicRubricRow;
    collapsed: boolean;
    onToggleCollapsed: () => void;
    onChange: (row: KarthicRubricRow) => void;
}) {
    return (
        <div className={`rounded-xl border border-slate-200 bg-slate-50 ${collapsed ? 'px-3 py-2' : 'p-4'}`}>
            <div className={`flex flex-wrap justify-between gap-3 ${collapsed ? 'items-center' : 'items-start'}`}>
                <div className="flex min-w-0 items-start gap-2">
                    <button
                        className="mt-0.5 rounded-md p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                        onClick={onToggleCollapsed}
                        type="button"
                        aria-label={collapsed ? `Expand issue ${row.key}` : `Collapse issue ${row.key}`}
                    >
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{row.key} · {row.title}</p>
                        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${collapsed ? 'mt-0.5' : 'mt-1'}`}>
                            <p className="text-xs text-slate-500">{RUBRIC_MODULE_LABELS[row.moduleId]}</p>
                            {collapsed ? (
                                <p className="text-xs font-medium text-slate-600">Weight {row.weight}</p>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div className={collapsed ? 'self-center' : 'w-24'}>
                    {collapsed ? null : (
                        <Field label="Weight">
                            <input
                                className={inputClassName}
                                value={String(row.weight)}
                                onChange={(event) => onChange({ ...row, weight: Number.parseInt(event.target.value || '0', 10) || row.weight })}
                            />
                        </Field>
                    )}
                </div>
            </div>
            {collapsed ? null : (
                <div className="mt-3 grid gap-3">
                    <Field label="Description">
                        <textarea className={textareaClassName} value={row.description} onChange={(event) => onChange({ ...row, description: event.target.value })} />
                    </Field>
                    <Field label="NA guidance">
                        <textarea className={textareaClassName} value={row.naGuidance} onChange={(event) => onChange({ ...row, naGuidance: event.target.value })} />
                    </Field>
                    <Field label="Golden target summary">
                        <textarea
                            className={textareaClassName}
                            value={row.goldenTarget.summary}
                            onChange={(event) => onChange({ ...row, goldenTarget: { ...row.goldenTarget, summary: event.target.value } })}
                        />
                    </Field>
                    <Field label="Golden contains">
                        <textarea
                            className={textareaClassName}
                            value={row.goldenTarget.goldenContains.join('\n')}
                            onChange={(event) => onChange({ ...row, goldenTarget: { ...row.goldenTarget, goldenContains: splitLines(event.target.value) } })}
                        />
                    </Field>
                    <Field label="Allowed omissions">
                        <textarea
                            className={textareaClassName}
                            value={row.goldenTarget.allowedOmissions.join('\n')}
                            onChange={(event) => onChange({ ...row, goldenTarget: { ...row.goldenTarget, allowedOmissions: splitLines(event.target.value) } })}
                        />
                    </Field>
                    <Field label="Contradiction flags">
                        <textarea
                            className={textareaClassName}
                            value={row.goldenTarget.contradictionFlags.join('\n')}
                            onChange={(event) => onChange({ ...row, goldenTarget: { ...row.goldenTarget, contradictionFlags: splitLines(event.target.value) } })}
                        />
                    </Field>
                    <Field label="Comparison guidance">
                        <textarea
                            className={textareaClassName}
                            value={row.goldenTarget.comparisonGuidance}
                            onChange={(event) => onChange({ ...row, goldenTarget: { ...row.goldenTarget, comparisonGuidance: event.target.value } })}
                        />
                    </Field>
                </div>
            )}
        </div>
    );
}

function ScoringPolicyEditor({
    policy,
    onChange,
}: {
    policy: KarthicRubricPackV2['scoringPolicy'];
    onChange: (policy: KarthicRubricPackV2['scoringPolicy']) => void;
}) {
    return (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Scoring Policy
            </summary>
            <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Case-citation verification">
                        <select
                            className={inputClassName}
                            value={policy.caseCitationVerificationMode}
                            onChange={(event) => onChange({
                                ...policy,
                                caseCitationVerificationMode: event.target.value as KarthicRubricPackV2['scoringPolicy']['caseCitationVerificationMode'],
                            })}
                        >
                            <option value="off">Off</option>
                            <option value="on">On</option>
                        </select>
                    </Field>
                    <Field label="Zak review threshold">
                        <input
                            className={inputClassName}
                            value={String(policy.zakReviewPenaltyThreshold)}
                            onChange={(event) => onChange({
                                ...policy,
                                zakReviewPenaltyThreshold: Number.parseInt(event.target.value || '0', 10) || policy.zakReviewPenaltyThreshold,
                            })}
                        />
                    </Field>
                </div>
                <CompactItemList title="Source files" items={policy.sourceFiles} />
                <div className="space-y-3">
                    {policy.penalties.map((penalty) => (
                        <PenaltyRuleEditor
                            key={penalty.code}
                            rule={penalty}
                            onChange={(nextRule) => onChange({
                                ...policy,
                                penalties: policy.penalties.map((item) => item.code === nextRule.code ? nextRule : item),
                            })}
                        />
                    ))}
                </div>
                <div className="space-y-3">
                    {policy.caps.map((cap) => (
                        <CapRuleEditor
                            key={cap.code}
                            rule={cap}
                            onChange={(nextRule) => onChange({
                                ...policy,
                                caps: policy.caps.map((item) => item.code === nextRule.code ? nextRule : item),
                            })}
                        />
                    ))}
                </div>
                <Field label="Policy notes">
                    <textarea
                        className={textareaClassName}
                        value={policy.notes.join('\n')}
                        onChange={(event) => onChange({
                            ...policy,
                            notes: splitLines(event.target.value),
                        })}
                    />
                </Field>
            </div>
        </details>
    );
}

function PenaltyRuleEditor({
    rule,
    onChange,
}: {
    rule: KarthicPenaltyRule;
    onChange: (rule: KarthicPenaltyRule) => void;
}) {
    return (
        <details className="rounded-xl border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                {rule.code} · {rule.label}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-[120px,120px,1fr]">
                <Field label="Enabled">
                    <select
                        className={inputClassName}
                        value={rule.enabled ? 'yes' : 'no'}
                        onChange={(event) => onChange({ ...rule, enabled: event.target.value === 'yes' })}
                    >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                    </select>
                </Field>
                <Field label="Points">
                    <input
                        className={inputClassName}
                        value={String(rule.points)}
                        onChange={(event) => onChange({ ...rule, points: Number.parseInt(event.target.value || '0', 10) || 0 })}
                    />
                </Field>
                <Field label="Use when">
                    <textarea
                        className={textareaClassName}
                        value={rule.appliesWhen}
                        onChange={(event) => onChange({ ...rule, appliesWhen: event.target.value })}
                    />
                </Field>
            </div>
        </details>
    );
}

function CapRuleEditor({
    rule,
    onChange,
}: {
    rule: KarthicCapRule;
    onChange: (rule: KarthicCapRule) => void;
}) {
    return (
        <details className="rounded-xl border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                {rule.code} · {rule.label}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-[120px,120px,1fr]">
                <Field label="Enabled">
                    <select
                        className={inputClassName}
                        value={rule.enabled ? 'yes' : 'no'}
                        onChange={(event) => onChange({ ...rule, enabled: event.target.value === 'yes' })}
                    >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                    </select>
                </Field>
                <Field label="Cap">
                    <input
                        className={inputClassName}
                        value={String(rule.cap)}
                        onChange={(event) => onChange({ ...rule, cap: Number.parseInt(event.target.value || '0', 10) || rule.cap })}
                    />
                </Field>
                <Field label="Use when">
                    <textarea
                        className={textareaClassName}
                        value={rule.appliesWhen}
                        onChange={(event) => onChange({ ...rule, appliesWhen: event.target.value })}
                    />
                </Field>
            </div>
        </details>
    );
}

const inputClassName = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const textareaClassName = 'min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const primaryButtonClassName = 'rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';
const secondaryButtonClassName = 'rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';
