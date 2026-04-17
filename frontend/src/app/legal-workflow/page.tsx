'use client';

import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
    DashaRunMode,
    DashaRunV2,
    DashaSelectedModel,
    FrankPacketV2,
    FrankGenerationSettings,
    FrankSofPackId,
    KarthicRubricPackV2,
    KarthicRubricRow,
    PromptGenerationSettingsByKind,
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

type WorkflowStageId =
    | 'source'
    | 'routing_intake'
    | 'extraction_mapping'
    | 'benchmark'
    | 'question'
    | 'rubric'
    | 'judge'
    | 'zak';

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

type WorkflowGenerationTarget =
    | 'routing_intake_generation'
    | 'extraction_mapping_generation'
    | 'benchmark_generation'
    | 'question_generation'
    | 'rubric_generation';

const DEFAULT_SELECTED_MODEL_KEYS = [
    'openai::gpt-5.4',
    'anthropic::claude-opus-4-6',
    'gemini::gemini-3.1-pro-preview',
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
        id: 'rubric',
        title: 'Karthic Rubric',
        shortLabel: 'Karthic Rubric',
        description: 'Karthic stage: generate and edit the row-based rubric pack derived from an approved Frank packet.',
    },
    {
        id: 'judge',
        title: 'Dasha Judge',
        shortLabel: 'Dasha Judge',
        description: 'Dasha stage: run the approved rubric against clustered model responses and inspect row/module scoring.',
    },
    {
        id: 'zak',
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
        stageIds: ['rubric'],
    },
    {
        id: 'dasha',
        title: 'Dasha',
        description: 'Clustered judging and score inspection.',
        stageIds: ['judge'],
    },
    {
        id: 'zak',
        title: 'Zak',
        description: 'Escalation and SME review when the run is unstable.',
        stageIds: ['zak'],
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
    rubric: {
        purpose: 'Generate and edit the row-based Karthic rubric pack that turns the approved Frank packet into scoring criteria.',
        stopRules: [
            'Frank must already be approved before rubric generation can start.',
        ],
        promptFiles: [
            '07_SHARED_MODULE_SKELETON.txt',
            'Pack doctrine file',
            'Pack failure bank file',
        ],
        promptNote: 'Generating the rubric pack creates or refreshes the row set for the selected approved Frank packet.',
    },
    judge: {
        purpose: 'Run Dasha to generate model responses, cluster the reasoning patterns, and score those clustered outputs against the approved rubric.',
        stopRules: [
            'Only approved rubric packs can start Dasha.',
            'Clustering can fall back to heuristic mode if the Python pipeline is unavailable.',
        ],
        promptNote: 'Dasha uses the approved question from the rubric-linked Frank packet, then scores clustered outputs row by row.',
    },
    zak: {
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
    rubric_generation: 'Karthic Rubric',
};

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

export default function LegalWorkflowPage() {
    const [hasMounted, setHasMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [visibleStage, setVisibleStage] = useState<WorkflowStageId>('source');
    const [isStageGuideOpen, setIsStageGuideOpen] = useState(true);

    const [frankPackets, setFrankPackets] = useState<FrankPacketV2[]>([]);
    const [selectedFrankId, setSelectedFrankId] = useState('');
    const [frankEditor, setFrankEditor] = useState<FrankPacketV2 | null>(null);
    const [newPacketTitle, setNewPacketTitle] = useState('');
    const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
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
    const [dashaRunMode, setDashaRunMode] = useState<DashaRunMode>('score_and_cluster');
    const [sampleCount, setSampleCount] = useState('120');
    const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>(DEFAULT_SELECTED_MODEL_KEYS);

    const approvedFrankPackets = useMemo(
        () => frankPackets.filter((packet) => packet.status === 'approved'),
        [frankPackets],
    );
    const approvedRubricPacks = useMemo(
        () => rubricPacks.filter((pack) => pack.status === 'approved'),
        [rubricPacks],
    );
    const selectedRun = useMemo(
        () => dashaRuns.find((run) => run.id === selectedRunId) ?? dashaRuns[0] ?? null,
        [dashaRuns, selectedRunId],
    );
    useEffect(() => {
        setHasMounted(true);
    }, []);

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
        if (!selectedRunId && dashaRuns.length > 0) {
            setSelectedRunId(dashaRuns[0].id);
        }
    }, [dashaRuns, selectedRunId]);

    useEffect(() => {
        if (!selectedRunId || selectedRun?.status !== 'draft') {
            return;
        }

        let cancelled = false;
        const intervalId = window.setInterval(async () => {
            try {
                const runResponse = await fetch('/api/dasha-runs', { cache: 'no-store' });
                const runJson = await runResponse.json();
                if (!runResponse.ok) {
                    throw new Error(runJson.error || 'Failed to refresh Dasha judge run.');
                }
                if (cancelled) {
                    return;
                }
                const refreshedRuns = sortRuns(Array.isArray(runJson.items) ? runJson.items as DashaRunV2[] : []);
                setDashaRuns(refreshedRuns);
                const item = refreshedRuns.find((run) => run.id === selectedRunId);
                if (item?.status === 'completed') {
                    setStatusMessage('Dasha judge run completed.');
                }
                if (item?.status === 'failed') {
                    setErrorMessage(item.errorMessage || 'Dasha judge run failed.');
                }
            } catch (error) {
                if (!cancelled) {
                    setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh Dasha judge run.');
                }
            }
        }, 4000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [selectedRun?.status, selectedRunId]);

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
                frankRes.json(),
                rubricRes.json(),
                runRes.json(),
            ]);
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

    async function createFrankPacket() {
        if (uploadRows.length === 0) {
            setErrorMessage('Upload at least one authority file first.');
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
            uploadRows.forEach((row, index) => {
                formData.append('files', row.file);
                formData.set(`role_${index}`, row.role);
            });
            const response = await fetch('/api/frank-packets/draft', { method: 'POST', body: formData });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to create Frank packet.');
            }
            const item = json.item as FrankPacketV2;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((packet) => packet.id !== item.id)]));
            setUploadRows([]);
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
            const json = await response.json();
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
            const json = await response.json();
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

    async function deleteFrank(id: string) {
        setErrorMessage(null);
        setStatusMessage('Deleting Frank packet...');
        try {
            const response = await fetch('/api/frank-packets', {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const json = await response.json();
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

    async function generateRubricPack() {
        if (!frankEditor?.id || frankEditor.status !== 'approved') {
            setErrorMessage('Select an approved Frank packet first.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Generating Karthic rubric pack from the approved Frank packet...');
        try {
            const settings = getGenerationSetting('rubric_generation');
            const response = await fetch('/api/karthic-rubric-packs/rows', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    frankPacketId: frankEditor.id,
                    id: rubricEditor?.frankPacketId === frankEditor.id ? rubricEditor.id : undefined,
                    model: settings.model,
                    reasoningEffort: settings.reasoningEffort,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to generate rubric pack.');
            }
            const item = json.item as KarthicRubricPackV2;
            applyRubricPack(item);
            setRubricPacks((current) => sortByUpdated([item, ...current.filter((pack) => pack.id !== item.id)]));
            setDashaRubricPackId(item.id);
            setStatusMessage('Karthic rubric pack generated.');
            goToStage('rubric');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate rubric pack.');
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
            const json = await response.json();
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
        if (!dashaRubricPackId) {
            setErrorMessage('Select an approved rubric pack first.');
            return;
        }
        if (selectedModelKeys.length === 0) {
            setErrorMessage('Select at least one model for Dasha.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Starting Dasha judge run...');
        try {
            const formData = new FormData();
            formData.set('rubricPackId', dashaRubricPackId);
            formData.set('runMode', dashaRunMode);
            formData.set('sampleCount', sampleCount || '120');
            formData.set('selectedModels', JSON.stringify(buildSelectedModels(selectedModelKeys)));
            const response = await fetch('/api/dasha-runs', {
                method: 'POST',
                body: formData,
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to start Dasha judge run.');
            }
            const item = json.item as DashaRunV2;
            setDashaRuns((current) => sortRuns([item, ...current.filter((run) => run.id !== item.id)]));
            setSelectedRunId(item.id);
            setStatusMessage('Dasha judge run started.');
            goToStage('judge');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to start Dasha judge run.');
            setStatusMessage(null);
        }
    }

    const benchmarkBlockedReason = frankEditor ? buildClientFrankBlockReason(frankEditor) : null;
    const frankApprovalBlockedReason = frankEditor ? buildClientFrankApprovalBlockReason(frankEditor) : null;
    const benchmarkHeadingPreview = FRANK_V2_BENCHMARK_HEADINGS.join('\n');
    const visibleRubricRowKeys = useMemo(
        () => rubricEditor ? rubricEditor.rows.map((row) => `${rubricEditor.id}:${row.key}`) : [],
        [rubricEditor],
    );
    const allRubricRowsCollapsed = useMemo(
        () => visibleRubricRowKeys.length > 0 && visibleRubricRowKeys.every((key) => collapsedRubricRows[key]),
        [collapsedRubricRows, visibleRubricRowKeys],
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
    const hasExtractionMapping = Boolean(frankEditor?.sourceExtractionSheet && frankEditor?.goldPacketMapping && frankEditor?.likelyFailureModes);
    const hasBenchmark = Boolean(frankEditor?.benchmarkAnswer.trim());
    const hasQuestion = Boolean(frankEditor?.reverseEngineeredQuestion.trim());
    const hasApprovedFrank = frankEditor?.status === 'approved';
    const hasApprovedRubric = rubricEditor?.status === 'approved';
    const hasCompletedRun = selectedRun?.status === 'completed';

    const stageViews = useMemo<WorkflowStageView[]>(() => {
        return WORKFLOW_STAGES.map((stage) => {
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
                case 'rubric':
                    return {
                        ...stage,
                        complete: hasApprovedRubric,
                        unlocked: hasApprovedFrank,
                        blocked: false,
                        statusLabel: hasApprovedRubric ? 'Approved' : hasApprovedFrank ? 'Open' : 'Locked',
                    };
                case 'judge':
                    return {
                        ...stage,
                        complete: Boolean(hasCompletedRun),
                        unlocked: approvedRubricPacks.length > 0,
                        blocked: false,
                        statusLabel: hasCompletedRun
                            ? 'Results'
                            : selectedRun?.status === 'draft'
                                ? 'Running'
                                : selectedRun?.status === 'failed'
                                    ? 'Needs review'
                                    : approvedRubricPacks.length > 0
                                        ? 'Open'
                                        : 'Locked',
                    };
                case 'zak':
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
        approvedRubricPacks.length,
        benchmarkBlockedReason,
        hasApprovedFrank,
        hasApprovedRubric,
        hasBenchmark,
        hasCompletedRun,
        hasExtractionMapping,
        hasFrankPacket,
        hasQuestion,
        hasRoutingIntake,
        selectedRun,
        selectedRun?.status,
    ]);

    const blockViews = useMemo<WorkflowBlockView[]>(() => {
        return WORKFLOW_BLOCKS.map((block) => {
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
    }, [stageViews, visibleStage]);

    const currentStageIndex = stageViews.findIndex((stage) => stage.id === visibleStage);
    const currentStage = stageViews[currentStageIndex] ?? stageViews[0];
    const previousStage = currentStageIndex > 0 ? stageViews[currentStageIndex - 1] : null;
    const nextStage = currentStageIndex >= 0 && currentStageIndex < stageViews.length - 1 ? stageViews[currentStageIndex + 1] : null;
    const currentBlockIndex = blockViews.findIndex((block) => block.active);
    const currentBlock = blockViews[currentBlockIndex] ?? blockViews[0];
    const currentBlockStepIndex = currentBlock?.stages.findIndex((stage) => stage.id === visibleStage) ?? -1;
    const selectedDashaPack = useMemo(
        () => approvedRubricPacks.find((pack) => pack.id === dashaRubricPackId) ?? null,
        [approvedRubricPacks, dashaRubricPackId],
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

    useEffect(() => {
        if (currentStage?.unlocked) {
            return;
        }
        const fallback = findLastUnlockedStage(stageViews);
        if (fallback && fallback.id !== visibleStage) {
            goToStage(fallback.id);
        }
    }, [currentStage?.unlocked, stageViews, visibleStage]);

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
                return hasApprovedFrank ? null : 'Approve the Frank packet before continuing to rubric generation.';
            case 'rubric':
                return hasApprovedRubric ? null : 'Approve a rubric pack before continuing to Dasha.';
            case 'judge':
                return selectedRun ? null : 'Run Dasha before continuing to Zak review.';
            case 'zak':
                return null;
            default:
                return 'This stage is not ready yet.';
        }
    }, [
        benchmarkBlockedReason,
        hasApprovedFrank,
        hasApprovedRubric,
        hasBenchmark,
        hasExtractionMapping,
        hasFrankPacket,
        hasQuestion,
        hasRoutingIntake,
        selectedRun,
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
                        <p><span className="font-semibold">Frank progress:</span> {formatFrankPacketPhase(frankEditor.phase)}</p>
                        <p><span className="font-semibold">Status:</span> {frankEditor.status}</p>
                        <p><span className="font-semibold">Pack:</span> {frankEditor.selectedPack ? FRANK_V2_PACK_LABELS[frankEditor.selectedPack] : 'Unrouted'}</p>
                        <p><span className="font-semibold">Routing confidence:</span> {frankEditor.routingConfidence ?? 'Unstated'}</p>
                        <p><span className="font-semibold">Intake rating:</span> {frankEditor.intakeChecklist?.finalIntakeRating ?? 'Not generated'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button className={secondaryButtonClassName} onClick={() => void deleteFrank(frankEditor.id)}>Delete Packet</button>
                        <button className={secondaryButtonClassName} onClick={() => void saveFrank('draft')}>Save Frank Packet</button>
                        <button
                            className={primaryButtonClassName}
                            disabled={Boolean(frankApprovalBlockedReason)}
                            title={frankApprovalBlockedReason ?? undefined}
                            onClick={() => void saveFrank('approved')}
                        >
                            Approve Frank Packet
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
                        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                            <div className="space-y-3">
                                <Field label="Packet title">
                                    <input
                                        className={inputClassName}
                                        value={newPacketTitle}
                                        onChange={(event) => setNewPacketTitle(event.target.value)}
                                        placeholder="Optional title for the uploaded source packet"
                                    />
                                </Field>
                                <Field label="Authority files">
                                    <input
                                        className={inputClassName}
                                        type="file"
                                        multiple
                                        accept=".pdf,.txt,.md"
                                        onChange={(event) => onUploadFilesSelected(event.target.files)}
                                    />
                                </Field>
                                {uploadRows.length > 0 ? (
                                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        {uploadRows.map((row, index) => (
                                            <div key={`${row.file.name}_${index}`} className="grid gap-2 md:grid-cols-[1fr,220px]">
                                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{row.file.name}</div>
                                                <select
                                                    className={inputClassName}
                                                    value={row.role}
                                                    onChange={(event) => {
                                                        const nextRows = [...uploadRows];
                                                        nextRows[index] = { ...nextRows[index], role: event.target.value as ArtifactRole };
                                                        setUploadRows(nextRows);
                                                    }}
                                                >
                                                    <option value="anchor_case">Anchor authority</option>
                                                    <option value="supporting_authority">Supporting authority</option>
                                                    <option value="issue_statement">Issue statement</option>
                                                    <option value="evidence_packet">Evidence packet</option>
                                                    <option value="supplemental">Supplemental</option>
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                    <button className={primaryButtonClassName} onClick={() => void createFrankPacket()}>
                                        Create Packet and Run Phase 1
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('routing_intake_generation')}
                                        onClick={() => openGenerationSettings('routing_intake_generation')}
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
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
                                                {packet.title} · {formatFrankPacketPhase(packet.phase)} · {packet.status}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                {renderFrankSummaryCard()}
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
                                <Banner tone="info" text="Frank Phase 1 runs when the packet is created. Review or edit the routing record here, then continue to Phase 2 for extraction and mapping." />
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
                                    <ReadOnlyJsonCard title="Intake checklist" value={frankEditor.intakeChecklist} />
                                    <ReadOnlyJsonCard title="Source artifacts" value={frankEditor.sourceArtifacts.map((artifact) => ({ role: artifact.role, fileName: artifact.fileName }))} />
                                </div>
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
                                        {hasExtractionMapping ? 'Re-run Phase 2' : 'Run Phase 2'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('extraction_mapping_generation')}
                                        onClick={() => openGenerationSettings('extraction_mapping_generation')}
                                    />
                                </div>
                                <div className="grid gap-4 lg:grid-cols-3">
                                    <ReadOnlyJsonCard title="Source extraction sheet" value={frankEditor.sourceExtractionSheet} />
                                    <ReadOnlyJsonCard title="Gold packet mapping" value={frankEditor.goldPacketMapping} />
                                    <ReadOnlyJsonCard title="Likely failure modes" value={frankEditor.likelyFailureModes} />
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
                                        disabled={Boolean(benchmarkBlockedReason)}
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
                                        {hasBenchmark ? 'Re-run Phase 3' : 'Run Phase 3'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('benchmark_generation')}
                                        onClick={() => openGenerationSettings('benchmark_generation')}
                                    />
                                    <button className={secondaryButtonClassName} onClick={() => void saveFrank('draft')}>Save Phase 3 Draft</button>
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
                                        disabled={Boolean(benchmarkBlockedReason) || !frankEditor.benchmarkAnswer.trim()}
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
                                        {hasQuestion ? 'Re-run Phase 4' : 'Run Phase 4'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('question_generation')}
                                        onClick={() => openGenerationSettings('question_generation')}
                                    />
                                    <button className={secondaryButtonClassName} onClick={() => void saveFrank('draft')}>Save Phase 4 Draft</button>
                                </div>
                                {frankEditor.questionWarnings.length > 0 ? (
                                    <WarningList title="Question warnings" items={frankEditor.questionWarnings} />
                                ) : null}
                            </div>
                        ) : <EmptyPanelCopy text="Select a Frank packet to generate or edit the reverse-engineered question." />}
                    </>
                );
            case 'rubric':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 grid gap-4 lg:grid-cols-[320px,1fr]">
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
                                <div className="flex flex-wrap gap-2">
                                    <button className={primaryButtonClassName} onClick={() => void generateRubricPack()}>
                                        {rubricEditor?.frankPacketId === frankEditor?.id ? 'Regenerate Rubric Pack' : 'Generate Rubric Pack'}
                                    </button>
                                    <GenerationSettingsButton
                                        setting={getGenerationSetting('rubric_generation')}
                                        onClick={() => openGenerationSettings('rubric_generation')}
                                    />
                                </div>
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
                                            <option key={pack.id} value={pack.id}>{FRANK_V2_PACK_LABELS[pack.selectedPack]} · {pack.status}</option>
                                        ))}
                                    </select>
                                </Field>
                                {rubricEditor ? (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                        <p><span className="font-semibold">Pack:</span> {FRANK_V2_PACK_LABELS[rubricEditor.selectedPack]}</p>
                                        <p><span className="font-semibold">Rows:</span> {rubricEditor.rows.length}</p>
                                        <p><span className="font-semibold">Status:</span> {rubricEditor.status}</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button className={secondaryButtonClassName} onClick={() => void saveRubric('draft')}>Save Rubric Pack</button>
                                            <button className={primaryButtonClassName} onClick={() => void saveRubric('approved')}>Approve Rubric Pack</button>
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyPanelCopy text="Generate or select a rubric pack to edit row-level scoring definitions." />
                                )}
                            </div>
                            <div>
                                {rubricEditor ? (
                                    <div className="space-y-4">
                                        <ReadOnlyTextCard
                                            title="Current question"
                                            text={frankEditor?.reverseEngineeredQuestion ?? rubricEditor.questionText}
                                        />
                                        <Field label="Comparison method note">
                                            <textarea
                                                className={textareaClassName}
                                                value={rubricEditor.comparisonMethodNote}
                                                onChange={(event) => setRubricEditor((current) => current ? { ...current, comparisonMethodNote: event.target.value } : current)}
                                            />
                                        </Field>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                className={secondaryButtonClassName}
                                                onClick={() => setCollapsedRubricRows(
                                                    allRubricRowsCollapsed
                                                        ? {}
                                                        : Object.fromEntries(rubricEditor.rows.map((row) => [`${rubricEditor.id}:${row.key}`, true])),
                                                )}
                                                type="button"
                                            >
                                                {allRubricRowsCollapsed ? 'Expand All Issues' : 'Collapse All Issues'}
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {rubricEditor.rows.map((row) => (
                                                <RubricRowEditor
                                                    key={row.key}
                                                    row={row}
                                                    collapsed={Boolean(collapsedRubricRows[`${rubricEditor.id}:${row.key}`])}
                                                    onToggleCollapsed={() => setCollapsedRubricRows((current) => ({
                                                        ...current,
                                                        [`${rubricEditor.id}:${row.key}`]: !current[`${rubricEditor.id}:${row.key}`],
                                                    }))}
                                                    onChange={(nextRow) => setRubricEditor((current) => current ? {
                                                        ...current,
                                                        rows: current.rows.map((item) => item.key === nextRow.key ? nextRow : item),
                                                    } : current)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </>
                );
            case 'judge':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 space-y-5">
                            <div className="grid gap-4 xl:grid-cols-2">
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Shared Dasha Configuration</p>
                                            <p className="mt-1 text-sm text-slate-600">
                                                Set the sample count and model pool once here for the Dasha scoring and clustering run.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                className={secondaryButtonClassName}
                                                type="button"
                                                onClick={() => setSelectedModelKeys(DEFAULT_SELECTED_MODEL_KEYS)}
                                            >
                                                Reset defaults
                                            </button>
                                            <button
                                                className={secondaryButtonClassName}
                                                type="button"
                                                disabled={selectedModelKeys.length === 0}
                                                onClick={() => setSelectedModelKeys([])}
                                            >
                                                Clear all
                                            </button>
                                        </div>
                                    </div>
                                    <div className="grid gap-4 xl:grid-cols-[220px,minmax(0,1fr)]">
                                        <Field label="Requested responses">
                                            <input className={inputClassName} value={sampleCount} onChange={(event) => setSampleCount(event.target.value)} />
                                        </Field>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Model configuration</p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {selectedModelKeys.length} model{selectedModelKeys.length === 1 ? '' : 's'} selected for Dasha.
                                                </p>
                                            </div>
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
                                </div>

                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Dasha Run</p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            Judge clustered model responses against the approved rubric and inspect row-level scoring.
                                        </p>
                                    </div>
                                    <div className="grid gap-4 lg:grid-cols-2">
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
                                        <Field label="Run mode">
                                            <select className={inputClassName} value={dashaRunMode} onChange={(event) => setDashaRunMode(event.target.value as DashaRunMode)}>
                                                <option value="score_and_cluster">Score + cluster</option>
                                                <option value="cluster_only">Cluster only</option>
                                            </select>
                                        </Field>
                                    </div>
                                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),220px]">
                                        <Field label="Saved runs">
                                            <select
                                                className={inputClassName}
                                                value={selectedRun?.id ?? ''}
                                                onChange={(event) => setSelectedRunId(event.target.value)}
                                            >
                                                <option value="">Select run</option>
                                                {dashaRuns.map((run) => (
                                                    <option key={run.id} value={run.id}>{run.id} · {run.status}</option>
                                                ))}
                                            </select>
                                        </Field>
                                        <div className="flex items-end">
                                            <button className={`${primaryButtonClassName} w-full`} onClick={() => void runDasha()}>
                                                Start Dasha Run
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="min-w-0 space-y-4">
                                {selectedRun ? (
                                    <DashaResultsExplorer key={selectedRun.id} run={selectedRun} />
                                ) : (
                                    <EmptyPanelCopy text="Start or select a Dasha run to inspect saved results." />
                                )}
                            </div>
                        </div>
                    </>
                );
            case 'zak':
                return (
                    <>
                        <SectionHeader title={currentStage.title} description={currentStage.description} />
                        <div className="mt-4 space-y-4">
                            <Banner tone="info" text="Zak is represented as its own top-level block now, but automated escalation triggers are not implemented in this branch yet." />
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Manual Escalation Point</p>
                                        <p className="mt-2 text-sm text-slate-600">
                                            This is where unstable Dasha outcomes should hand off for SME review. For now, the block is structural: it makes the full FKDZ pipeline visible without pretending Zak automation already exists.
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                        <p className="font-semibold text-slate-900">Planned Zak triggers</p>
                                        <ul className="mt-3 space-y-2">
                                            <li>Unstable clustered scoring or obvious disagreement between strong clusters and the benchmark answer.</li>
                                            <li>Caps, penalties, or other scoring behavior that suggests the rubric is underspecified.</li>
                                            <li>Any packet where Dasha looks directionally wrong even though the pipeline completed.</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {selectedRun ? (
                                        <>
                                            <ReadOnlyTextCard title="Selected Dasha run" text={`${selectedRun.id}\nStatus: ${selectedRun.status}\nRun mode: ${selectedRun.runMode}`} />
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
                eyebrow="Workflow v2"
                title="FKD Pipeline Redo"
                subtitle="A grouped Frank / Karthic / Dasha / Zak workflow with smaller substeps inside each block."
            >
                <div className="space-y-6">
                    <Banner tone="info" text="Loading Frank v2 workflow data..." />
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell
            eyebrow="Workflow v2"
            title="FKD Pipeline Redo"
            subtitle="A grouped Frank / Karthic / Dasha / Zak workflow with smaller substeps inside each block."
        >
            <div className="space-y-6">
                {isLoading ? <Banner tone="info" text="Loading Frank v2 workflow data..." /> : null}
                {statusMessage ? <Banner tone="info" text={statusMessage} /> : null}
                {errorMessage ? <Banner tone="error" text={errorMessage} /> : null}

                <Panel>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pipeline Navigator</p>
                            <p className="mt-2 text-sm text-slate-600">
                                One substep is visible at a time, but the navigator is grouped into the larger FKDZ blocks so the overall pipeline shape is easier to see.
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p className="font-semibold text-slate-900">Pipeline Block {currentBlockIndex + 1} of {blockViews.length}</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Step {Math.max(currentBlockStepIndex + 1, 1)} of {currentBlock?.stages.length ?? 1} in {currentBlock?.title ?? 'Pipeline'}
                            </p>
                            {getFrankPhaseNumber(currentStage.id) !== null ? (
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                    Frank Phase {getFrankPhaseNumber(currentStage.id)} of {FRANK_PHASE_ORDER.length}
                                </p>
                            ) : null}
                            <p>{currentStage.title}</p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-4">
                        {blockViews.map((block, index) => (
                            <div
                                key={block.id}
                                className={buildBlockCardClassName(block, block.active)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Block {index + 1}</p>
                                        <p className="mt-1 text-sm font-semibold">{block.title}</p>
                                        <p className="mt-1 text-xs">{block.statusLabel}</p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-slate-600">{block.description}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {block.stages.map((stage) => (
                                        <button
                                            key={stage.id}
                                            type="button"
                                            aria-current={stage.id === visibleStage ? 'step' : undefined}
                                            disabled={!stage.unlocked}
                                            className={buildBlockStepButtonClassName(stage, stage.id === visibleStage)}
                                            onClick={() => goToStage(stage.id)}
                                        >
                                            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em]">
                                                {getNavigatorBadge(stage.id)}
                                            </span>
                                            <span className="mt-1 block text-sm font-semibold">{stage.shortLabel}</span>
                                            <span className="mt-1 block text-xs">{stage.statusLabel}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel>
                    <div className="relative min-w-0">
                        <div className="min-w-0">
                            {renderStagePanel()}
                        </div>
                        <div className="mt-4 xl:absolute xl:right-0 xl:top-0 xl:z-20 xl:mt-0 xl:w-[340px]">
                            <StageGuideOverlay
                                stageId={visibleStage}
                                promptPreview={activeStagePrompt}
                                isOpen={isStageGuideOpen}
                                onToggle={() => setIsStageGuideOpen((current) => !current)}
                            />
                        </div>
                    </div>
                    <div className="mt-6 border-t border-slate-200 pt-4">
                        {nextStageBlockedReason ? <Banner tone="warning" text={nextStageBlockedReason} /> : null}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <button
                                className={secondaryButtonClassName}
                                disabled={!previousStage}
                                onClick={() => {
                                    if (previousStage) {
                                        goToStage(previousStage.id);
                                    }
                                }}
                            >
                                Previous
                            </button>
                            <div className="text-sm text-slate-500">
                                {nextStage ? `Next: ${nextStage.title}` : 'Final stage'}
                            </div>
                            <button
                                className={primaryButtonClassName}
                                disabled={!nextStage || Boolean(nextStageBlockedReason)}
                                onClick={() => {
                                    if (nextStage && !nextStageBlockedReason) {
                                        goToStage(nextStage.id);
                                    }
                                }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </Panel>
            </div>
            {openGenerationTarget ? (
                <GenerationSettingsModal
                    targetLabel={WORKFLOW_GENERATION_TARGET_LABELS[openGenerationTarget]}
                    value={generationSettingsDraft}
                    onChange={setGenerationSettingsDraft}
                    onClose={() => setOpenGenerationTarget(null)}
                    onSave={saveGenerationSettings}
                />
            ) : null}
        </AppShell>
    );
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
        case 'rubric':
            return 'Rubric';
        case 'judge':
            return 'Judge';
        case 'zak':
            return 'Zak';
        default:
            return 'Stage';
    }
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
    if (!packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.likelyFailureModes) {
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
    if (!packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.likelyFailureModes) {
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

function sortRuns(items: DashaRunV2[]) {
    return [...items].sort((left, right) => String(right.completedAt ?? right.createdAt).localeCompare(String(left.completedAt ?? left.createdAt)));
}

function splitLines(value: string) {
    return value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

function buildBlockCardClassName(block: WorkflowBlockView, isCurrent: boolean) {
    if (isCurrent) {
        return 'rounded-2xl border border-teal-300 bg-teal-50 p-4 text-left text-teal-900 shadow-[0_10px_25px_rgba(13,148,136,0.12)]';
    }
    if (!block.unlocked) {
        return 'rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-slate-400';
    }
    if (block.complete) {
        return 'rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left text-emerald-900';
    }
    if (block.blocked) {
        return 'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-900';
    }
    return 'rounded-2xl border border-slate-200 bg-white p-4 text-left text-slate-700';
}

function buildBlockStepButtonClassName(stage: WorkflowStageView, isCurrent: boolean) {
    if (isCurrent) {
        return 'min-w-[132px] rounded-xl border border-teal-300 bg-white px-3 py-3 text-left text-teal-900 shadow-[0_8px_20px_rgba(13,148,136,0.12)]';
    }
    if (!stage.unlocked) {
        return 'min-w-[132px] rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-left text-slate-400';
    }
    if (stage.complete) {
        return 'min-w-[132px] rounded-xl border border-emerald-200 bg-white px-3 py-3 text-left text-emerald-900';
    }
    if (stage.blocked) {
        return 'min-w-[132px] rounded-xl border border-amber-200 bg-white px-3 py-3 text-left text-amber-900';
    }
    return 'min-w-[132px] rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-slate-700';
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
        case 'rubric':
            return getSavedPromptPreview(input.rubricPack?.savedPrompts, 'rubric_generation');
        case 'judge': {
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
        case 'zak':
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

function formatGenerationSettingInline(setting: FrankGenerationSettings) {
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

const inputClassName = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const textareaClassName = 'min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const primaryButtonClassName = 'rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';
const secondaryButtonClassName = 'rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';
