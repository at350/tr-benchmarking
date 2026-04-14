import 'server-only';

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

import OpenAI from 'openai';

import {
    FRANK_V2_BENCHMARK_HEADING_ALIASES,
    FRANK_V2_BENCHMARK_HEADINGS,
    KARTHIC_MODULE_DEFAULT_BUDGETS,
    RUBRIC_MODULE_LABELS,
    RUBRIC_ROW_SPECS,
} from '@/lib/legal-workflow-v2-constants';
import {
    buildDashaRowEvaluationPrompt,
    buildFrankBenchmarkPrompt,
    buildFrankExtractionMappingPrompt,
    buildFrankQuestionPrompt,
    buildFrankRoutingIntakePrompt,
    buildKarthicRowsPrompt,
    getFrankV2AssetBundle,
} from '@/lib/legal-workflow-v2-prompts';
import type {
    ArtifactRecord,
    ArtifactRole,
    BenchmarkPosture,
    DashaClusterRecord,
    DashaClusterRowScore,
    DashaClusterScorecard,
    DashaCapStatus,
    DashaPenaltyApplication,
    DashaResponseRecord,
    DashaRunMode,
    DashaRunV2,
    DashaSelectedModel,
    FrankGoldPacketMapping,
    FrankLikelyFailureModes,
    FrankPacketV2,
    FrankPhase,
    FrankSofPackId,
    FrankSourceExtractionSheet,
    FrankSourceIntakeChecklist,
    IntakeRating,
    KarthicDecompositionLogEntry,
    KarthicFailureLabelMapEntry,
    KarthicHandoff,
    KarthicHandoffAuditStatus,
    KarthicModuleBudget,
    KarthicOutputShell,
    KarthicPacketReadiness,
    KarthicPrefillStatus,
    KarthicRubricPackV2,
    KarthicRubricRow,
    KarthicVariationLane,
    ModelProvider,
    ModuleSummary,
    ReasoningEffort,
    RoutingConfidence,
    RubricModuleId,
    RubricRowCentroidEvaluation,
    RubricRowDifference,
    RubricRowGoldenTarget,
    RubricRowKey,
    RubricRowRole,
    RubricRowScoreAnchors,
    RubricRowResult,
} from '@/lib/legal-workflow-v2-types';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const execFileAsync = promisify(execFile);
let pdfWorkerConfigured = false;

const DATA_DIRECTORIES = {
    frank: 'frank-v2-packets',
    karthic: 'karthic-v2-rubric-packs',
    dasha: 'dasha-v2-runs',
    artifacts: 'artifacts-v2',
} as const;

const DEFAULT_OPENAI_JSON_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_TEXT_MODEL = 'gpt-5.4-mini';
const PACK_IDS = new Set<FrankSofPackId>(['pack10', 'pack20', 'pack30', 'pack40']);
const MODULE_IDS = new Set<RubricModuleId>(['module0', 'module1', 'module2', 'module3', 'module4']);
const PREFILL_STATUSES = new Set<KarthicPrefillStatus>(['Fixed', 'Fixed but jurisdiction-sensitive', 'Needs human confirmation']);
const OUTPUT_SHELLS = new Set<KarthicOutputShell>(['core_cross_pack_v1', 'legacy_father_son_v1', 'custom']);
const VARIATION_LANES = new Set<KarthicVariationLane>(['A', 'B']);
const PACKET_READINESS = new Set<KarthicPacketReadiness>(['Ready', 'Needs work', 'Blocked']);

const VALID_BENCHMARK_POSTURES = new Set<BenchmarkPosture>([
    'narrow_source_grounded_benchmark_only',
    'generalizable_only_with_supporting_authority',
    'portable_benchmark_under_stated_assumptions',
]);

type UploadFileInput = {
    role: ArtifactRole;
    fileName: string;
    bytes: Uint8Array;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type GenerateModelOptions = {
    provider: ModelProvider;
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort?: ReasoningEffort;
};

export async function listFrankPackets() {
    const items = await listArtifacts<Record<string, unknown>>(DATA_DIRECTORIES.frank);
    return items
        .map((item) => normalizeFrankPacket(item))
        .filter((item): item is FrankPacketV2 => Boolean(item));
}

export async function getFrankPacket(id: string) {
    const item = await readArtifact<Record<string, unknown>>(DATA_DIRECTORIES.frank, id);
    return item ? normalizeFrankPacket(item) : null;
}

export async function deleteFrankPacket(id: string) {
    const packet = await getFrankPacket(id);
    if (!packet) {
        throw new Error('Frank packet not found.');
    }

    const rubricRefs = (await listKarthicRubricPacks()).filter((item) => item.frankPacketId === id);
    if (rubricRefs.length > 0) {
        throw new Error('Cannot delete Frank packet while it is linked to a rubric pack.');
    }

    await deleteUploadedArtifacts(id);
    await deleteArtifact(DATA_DIRECTORIES.frank, id);
}

export async function draftFrankPacket(input: {
    title?: string;
    files: UploadFileInput[];
}): Promise<FrankPacketV2> {
    if (input.files.length === 0) {
        throw new Error('At least one uploaded authority file is required.');
    }

    const id = `frank_v2_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    try {
        const sourceArtifacts = await saveUploadedArtifacts(id, input.files);
        const sourceText = buildSourceText(sourceArtifacts, 18000);
        if (!sourceText) {
            throw new Error('Uploaded authority could not be processed because no readable text was extracted.');
        }

        const parsed = await generateJson({
            operation: 'Frank v2 routing and intake',
            prompt: buildFrankRoutingIntakePrompt({
                title: input.title?.trim() || sourceArtifacts[0]?.fileName || 'Uploaded authority packet',
                fileNames: sourceArtifacts.map((artifact) => artifact.fileName),
                sourceText,
            }),
        });

        const intakeChecklist = normalizeIntakeChecklist(parsed.intakeChecklist);
        const packet: FrankPacketV2 = {
            schemaVersion: 3,
            id,
            status: 'draft',
            phase: 'routing_intake',
            legalDomain: 'Statute of Frauds',
            sourceFamily: 'uploaded_authority',
            title: normalizeNonEmptyString(parsed.title, input.title?.trim() || sourceArtifacts[0]?.fileName || id),
            selectedPack: normalizePackId(parsed.selectedPack),
            routingReason: normalizeNonEmptyString(parsed.routingReason, 'Routing explanation unavailable.'),
            secondaryIssues: normalizeStringArray(parsed.secondaryIssues),
            routingConfidence: normalizeRoutingConfidence(parsed.routingConfidence),
            sourceArtifacts,
            intakeChecklist,
            sourceExtractionSheet: null,
            goldPacketMapping: null,
            likelyFailureModes: null,
            benchmarkAnswer: '',
            reverseEngineeredQuestion: '',
            karthicHandoff: buildDefaultKarthicHandoff({
                id,
                title: normalizeNonEmptyString(parsed.title, input.title?.trim() || sourceArtifacts[0]?.fileName || id),
                selectedPack: normalizePackId(parsed.selectedPack),
                routingReason: normalizeNonEmptyString(parsed.routingReason, 'Routing explanation unavailable.'),
                sourceArtifacts,
                intakeChecklist,
            }),
            savedPrompts: [{
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'routing_intake_generation',
                title: `Routing + intake prompt · ${new Date().toLocaleString()}`,
                prompt: buildFrankRoutingIntakePrompt({
                    title: input.title?.trim() || sourceArtifacts[0]?.fileName || 'Uploaded authority packet',
                    fileNames: sourceArtifacts.map((artifact) => artifact.fileName),
                    sourceText,
                }),
                createdAt: now,
            }],
            benchmarkWarnings: [],
            questionWarnings: [],
            approvedAt: null,
            createdAt: now,
            updatedAt: now,
        };

        await writeArtifact(DATA_DIRECTORIES.frank, packet.id, packet);
        return packet;
    } catch (error) {
        await deleteUploadedArtifacts(id).catch(() => undefined);
        throw error;
    }
}

export async function generateFrankExtractionMapping(input: {
    id: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    if (!packet.selectedPack || !packet.intakeChecklist) {
        throw new Error('Routing and intake must be completed before extraction and mapping.');
    }
    if (packet.routingConfidence === 'weak') {
        throw new Error('Routing confidence is weak. Stop at intake and JD review instead of forcing extraction and mapping.');
    }

    const assets = await getFrankV2AssetBundle(packet.selectedPack);
    const sourceText = buildSourceText(packet.sourceArtifacts, 22000);
    const prompt = buildFrankExtractionMappingPrompt({
        packet,
        assets,
        sourceText,
    });
    const parsed = await generateJson({
        operation: 'Frank v2 extraction and mapping',
        prompt,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
    });
    const sourceExtractionSheet = normalizeSourceExtractionSheet(parsed.sourceExtractionSheet, packet.selectedPack);
    const goldPacketMapping = normalizeGoldPacketMapping(parsed.goldPacketMapping);
    const likelyFailureModes = normalizeFailureModes(parsed.likelyFailureModes);

    validateFrankExtractionMappingOrThrow({
        sourceExtractionSheet,
        goldPacketMapping,
        likelyFailureModes,
    });

    const nextPacket: FrankPacketV2 = {
        ...packet,
        phase: 'extraction_mapping',
        sourceExtractionSheet,
        goldPacketMapping,
        likelyFailureModes,
        karthicHandoff: buildUpdatedKarthicHandoff({
            packet: {
                ...packet,
                sourceExtractionSheet,
                goldPacketMapping,
                likelyFailureModes,
            },
        }),
        savedPrompts: [
            ...packet.savedPrompts,
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'extraction_mapping_generation',
                title: `Extraction + mapping prompt · ${new Date().toLocaleString()}`,
                prompt,
                createdAt: new Date().toISOString(),
            },
        ],
        updatedAt: new Date().toISOString(),
    };
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function generateFrankBenchmark(input: {
    id: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    if (!canGenerateFrankBenchmark(packet)) {
        throw new Error(buildFrankBenchmarkBlockReason(packet));
    }
    const assets = await getFrankV2AssetBundle(packet.selectedPack as FrankSofPackId);
    const sourceText = buildSourceText(packet.sourceArtifacts, 22000);
    const prompt = buildFrankBenchmarkPrompt({ packet, assets, sourceText });
    const benchmarkAnswer = normalizeGeneratedText(await generateText({
        operation: 'Frank v2 benchmark answer',
        prompt,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
    }));

    validateBenchmarkAnswerOrThrow(benchmarkAnswer);
    const nextPacket: FrankPacketV2 = {
        ...packet,
        phase: 'benchmark',
        benchmarkAnswer,
        benchmarkWarnings: collectBenchmarkWarnings(benchmarkAnswer),
        karthicHandoff: buildUpdatedKarthicHandoff({
            packet: {
                ...packet,
                benchmarkAnswer,
                benchmarkWarnings: collectBenchmarkWarnings(benchmarkAnswer),
            },
        }),
        savedPrompts: [
            ...packet.savedPrompts,
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'benchmark_generation',
                title: `Benchmark prompt · ${new Date().toLocaleString()}`,
                prompt,
                createdAt: new Date().toISOString(),
            },
        ],
        updatedAt: new Date().toISOString(),
    };
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function generateFrankQuestion(input: {
    id: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    if (!packet.benchmarkAnswer.trim()) {
        throw new Error('Generate the benchmark answer before generating the reverse-engineered question.');
    }
    if (!canGenerateFrankBenchmark(packet)) {
        throw new Error(buildFrankBenchmarkBlockReason(packet));
    }
    const assets = await getFrankV2AssetBundle(packet.selectedPack as FrankSofPackId);
    const prompt = buildFrankQuestionPrompt({ packet, assets });
    const questionText = normalizeGeneratedText(await generateText({
        operation: 'Frank v2 reverse-engineered question',
        prompt,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
    }));

    validateReverseEngineeredQuestionOrThrow(questionText);
    const nextPacket: FrankPacketV2 = {
        ...packet,
        phase: 'question',
        reverseEngineeredQuestion: questionText,
        questionWarnings: collectQuestionWarnings(questionText),
        karthicHandoff: buildUpdatedKarthicHandoff({
            packet: {
                ...packet,
                reverseEngineeredQuestion: questionText,
                questionWarnings: collectQuestionWarnings(questionText),
            },
        }),
        savedPrompts: [
            ...packet.savedPrompts,
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'question_generation',
                title: `Question prompt · ${new Date().toLocaleString()}`,
                prompt,
                createdAt: new Date().toISOString(),
            },
        ],
        updatedAt: new Date().toISOString(),
    };
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function saveFrankPacket(input: Partial<FrankPacketV2> & { id?: string }) {
    const existing = input.id ? await getFrankPacket(input.id) : null;
    const now = new Date().toISOString();
    const packet: FrankPacketV2 = {
        schemaVersion: 3,
        id: existing?.id ?? normalizeNonEmptyString(input.id, `frank_v2_${Date.now()}_${randomUUID().slice(0, 8)}`),
        status: input.status === 'approved' ? 'approved' : existing?.status ?? 'draft',
        phase: normalizePhase(input.phase, existing?.phase ?? 'source'),
        legalDomain: 'Statute of Frauds',
        sourceFamily: 'uploaded_authority',
        title: normalizeNonEmptyString(input.title, existing?.title ?? 'Untitled Statute of Frauds packet'),
        selectedPack: normalizePackId(input.selectedPack ?? existing?.selectedPack),
        routingReason: normalizeOptionalString(input.routingReason, existing?.routingReason ?? ''),
        secondaryIssues: normalizeStringArray(input.secondaryIssues ?? existing?.secondaryIssues ?? []),
        routingConfidence: normalizeRoutingConfidence(input.routingConfidence ?? existing?.routingConfidence),
        sourceArtifacts: normalizeArtifacts(input.sourceArtifacts ?? existing?.sourceArtifacts ?? []),
        intakeChecklist: normalizeIntakeChecklist(input.intakeChecklist ?? existing?.intakeChecklist),
        sourceExtractionSheet: normalizeSourceExtractionSheet(
            input.sourceExtractionSheet ?? existing?.sourceExtractionSheet,
            normalizePackId(input.selectedPack ?? existing?.selectedPack),
        ),
        goldPacketMapping: normalizeGoldPacketMapping(input.goldPacketMapping ?? existing?.goldPacketMapping),
        likelyFailureModes: normalizeFailureModes(input.likelyFailureModes ?? existing?.likelyFailureModes),
        benchmarkAnswer: normalizeOptionalString(input.benchmarkAnswer, existing?.benchmarkAnswer ?? ''),
        reverseEngineeredQuestion: normalizeOptionalString(input.reverseEngineeredQuestion, existing?.reverseEngineeredQuestion ?? ''),
        karthicHandoff: normalizeKarthicHandoff(
            input.karthicHandoff ?? existing?.karthicHandoff,
            {
                id: existing?.id ?? normalizeNonEmptyString(input.id, `frank_v2_${Date.now()}_${randomUUID().slice(0, 8)}`),
                title: normalizeNonEmptyString(input.title, existing?.title ?? 'Untitled Statute of Frauds packet'),
                selectedPack: normalizePackId(input.selectedPack ?? existing?.selectedPack),
                routingReason: normalizeOptionalString(input.routingReason, existing?.routingReason ?? ''),
                sourceArtifacts: normalizeArtifacts(input.sourceArtifacts ?? existing?.sourceArtifacts ?? []),
                intakeChecklist: normalizeIntakeChecklist(input.intakeChecklist ?? existing?.intakeChecklist),
                sourceExtractionSheet: normalizeSourceExtractionSheet(
                    input.sourceExtractionSheet ?? existing?.sourceExtractionSheet,
                    normalizePackId(input.selectedPack ?? existing?.selectedPack),
                ),
                goldPacketMapping: normalizeGoldPacketMapping(input.goldPacketMapping ?? existing?.goldPacketMapping),
                likelyFailureModes: normalizeFailureModes(input.likelyFailureModes ?? existing?.likelyFailureModes),
                benchmarkAnswer: normalizeOptionalString(input.benchmarkAnswer, existing?.benchmarkAnswer ?? ''),
            },
        ),
        savedPrompts: Array.isArray(input.savedPrompts) ? input.savedPrompts : existing?.savedPrompts ?? [],
        benchmarkWarnings: normalizeStringArray(input.benchmarkWarnings ?? existing?.benchmarkWarnings ?? []),
        questionWarnings: normalizeStringArray(input.questionWarnings ?? existing?.questionWarnings ?? []),
        approvedAt: input.status === 'approved' ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    if (packet.benchmarkAnswer.trim()) {
        validateBenchmarkAnswerOrThrow(packet.benchmarkAnswer);
    }
    if (packet.reverseEngineeredQuestion.trim()) {
        validateReverseEngineeredQuestionOrThrow(packet.reverseEngineeredQuestion);
    }
    if (packet.status === 'approved') {
        validateFrankApprovalOrThrow(packet);
    }

    await writeArtifact(DATA_DIRECTORIES.frank, packet.id, packet);
    return packet;
}

export async function listKarthicRubricPacks() {
    const items = await listArtifacts<Record<string, unknown>>(DATA_DIRECTORIES.karthic);
    return items
        .map((item) => normalizeKarthicRubricPack(item))
        .filter((item): item is KarthicRubricPackV2 => Boolean(item));
}

export async function getKarthicRubricPack(id: string) {
    const item = await readArtifact<Record<string, unknown>>(DATA_DIRECTORIES.karthic, id);
    return item ? normalizeKarthicRubricPack(item) : null;
}

export async function generateKarthicRubricPack(input: {
    frankPacketId: string;
    id?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const frankPacket = await getRequiredFrankPacket(input.frankPacketId);
    if (frankPacket.status !== 'approved') {
        throw new Error('Frank packet must be approved before generating a rubric pack.');
    }
    if (!frankPacket.selectedPack) {
        throw new Error('Frank packet is missing a selected pack.');
    }

    const assets = await getFrankV2AssetBundle(frankPacket.selectedPack);
    const prompt = buildKarthicRowsPrompt({ packet: frankPacket, assets });
    const parsed = await generateJson({
        operation: 'Karthic v2 row rubric generation',
        prompt,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
    });

    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const now = new Date().toISOString();
    const prefillAudit = normalizeKarthicHandoff(frankPacket.karthicHandoff, {
        id: frankPacket.id,
        title: frankPacket.title,
        selectedPack: frankPacket.selectedPack,
        routingReason: frankPacket.routingReason,
        sourceArtifacts: frankPacket.sourceArtifacts,
        intakeChecklist: frankPacket.intakeChecklist,
        sourceExtractionSheet: frankPacket.sourceExtractionSheet,
        goldPacketMapping: frankPacket.goldPacketMapping,
        likelyFailureModes: frankPacket.likelyFailureModes,
        benchmarkAnswer: frankPacket.benchmarkAnswer,
    });
    validateKarthicHandoffForGenerationOrThrow(prefillAudit);
    const moduleBudgets = normalizeModuleBudgets(parsed.moduleBudgets, existing?.moduleBudgets);
    const anchorRows = normalizeRubricRows(parsed.anchorRows, 'anchor');
    const emergentRows = normalizeRubricRows(parsed.emergentRows, 'emergent');
    const rows = flattenIncludedRows(anchorRows, emergentRows, moduleBudgets);
    validateRubricRowsOrThrow(rows, anchorRows);
    const pack: KarthicRubricPackV2 = {
        schemaVersion: 3,
        id: existing?.id ?? `karthic_v2_${Date.now()}_${randomUUID().slice(0, 8)}`,
        frankPacketId: frankPacket.id,
        selectedPack: frankPacket.selectedPack,
        questionText: frankPacket.reverseEngineeredQuestion,
        status: existing?.status ?? 'draft',
        prefillAudit,
        moduleBudgets,
        anchorRows,
        emergentRows,
        rows,
        failureLabelMap: normalizeFailureLabelMap(parsed.failureLabelMap),
        decompositionLog: normalizeDecompositionLog(parsed.decompositionLog),
        variationPatchNotes: normalizeStringArray(parsed.variationPatchNotes),
        escalationNotes: normalizeEscalationNotes(parsed.escalationNotes, prefillAudit),
        savedPrompts: [
            ...(existing?.savedPrompts ?? []),
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'rubric_generation',
                title: `Rubric prompt · ${new Date().toLocaleString()}`,
                prompt,
                createdAt: now,
            },
        ],
        comparisonMethodNote: normalizeNonEmptyString(
            parsed.comparisonMethodNote,
            existing?.comparisonMethodNote ?? 'Score each cluster representative against the approved row-level rubric rather than against freeform benchmark prose alone.',
        ),
        approvedAt: existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    await writeArtifact(DATA_DIRECTORIES.karthic, pack.id, pack);
    return pack;
}

export async function saveKarthicRubricPack(input: Partial<KarthicRubricPackV2> & { frankPacketId: string }) {
    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const frankPacket = await getRequiredFrankPacket(input.frankPacketId);
    const now = new Date().toISOString();
    const prefillAudit = normalizeKarthicHandoff(
        input.prefillAudit ?? existing?.prefillAudit ?? frankPacket.karthicHandoff,
        {
            id: frankPacket.id,
            title: frankPacket.title,
            selectedPack: frankPacket.selectedPack,
            routingReason: frankPacket.routingReason,
            sourceArtifacts: frankPacket.sourceArtifacts,
            intakeChecklist: frankPacket.intakeChecklist,
            sourceExtractionSheet: frankPacket.sourceExtractionSheet,
            goldPacketMapping: frankPacket.goldPacketMapping,
            likelyFailureModes: frankPacket.likelyFailureModes,
            benchmarkAnswer: frankPacket.benchmarkAnswer,
        },
    );
    const moduleBudgets = normalizeModuleBudgets(input.moduleBudgets ?? existing?.moduleBudgets, existing?.moduleBudgets);
    const anchorRows = normalizeRubricRows(input.anchorRows ?? existing?.anchorRows ?? existing?.rows ?? [], 'anchor');
    const emergentRows = normalizeRubricRows(input.emergentRows ?? existing?.emergentRows ?? [], 'emergent');
    const rows = flattenIncludedRows(anchorRows, emergentRows, moduleBudgets);
    const pack: KarthicRubricPackV2 = {
        schemaVersion: 3,
        id: existing?.id ?? normalizeNonEmptyString(input.id, `karthic_v2_${Date.now()}_${randomUUID().slice(0, 8)}`),
        frankPacketId: frankPacket.id,
        selectedPack: frankPacket.selectedPack as FrankSofPackId,
        questionText: normalizeNonEmptyString(input.questionText, existing?.questionText ?? frankPacket.reverseEngineeredQuestion),
        status: input.status === 'approved' ? 'approved' : existing?.status ?? 'draft',
        prefillAudit,
        moduleBudgets,
        anchorRows,
        emergentRows,
        rows,
        failureLabelMap: normalizeFailureLabelMap(input.failureLabelMap ?? existing?.failureLabelMap),
        decompositionLog: normalizeDecompositionLog(input.decompositionLog ?? existing?.decompositionLog),
        variationPatchNotes: normalizeStringArray(input.variationPatchNotes ?? existing?.variationPatchNotes ?? []),
        escalationNotes: normalizeEscalationNotes(input.escalationNotes ?? existing?.escalationNotes, prefillAudit),
        savedPrompts: Array.isArray(input.savedPrompts) ? input.savedPrompts : existing?.savedPrompts ?? [],
        comparisonMethodNote: normalizeOptionalString(
            input.comparisonMethodNote,
            existing?.comparisonMethodNote ?? 'Score each cluster representative against the approved row-level rubric rather than against freeform benchmark prose alone.',
        ),
        approvedAt: input.status === 'approved' ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    validateRubricRowsOrThrow(pack.rows, pack.anchorRows);
    if (pack.status === 'approved') {
        if (!pack.questionText.trim()) {
            throw new Error('Question text is required before approving the rubric pack.');
        }
        validateReverseEngineeredQuestionOrThrow(pack.questionText);
        validateKarthicHandoffForApprovalOrThrow(pack.prefillAudit);
    }
    await writeArtifact(DATA_DIRECTORIES.karthic, pack.id, pack);
    return pack;
}

export async function listDashaRuns() {
    const items = await listArtifacts<Record<string, unknown>>(DATA_DIRECTORIES.dasha);
    return items
        .map((item) => normalizeDashaRun(item))
        .filter((item): item is DashaRunV2 => Boolean(item));
}

export async function getDashaRun(id: string) {
    const item = await readArtifact<Record<string, unknown>>(DATA_DIRECTORIES.dasha, id);
    return item ? normalizeDashaRun(item) : null;
}

export async function runDashaEvaluation(input: {
    rubricPackId: string;
    runMode: DashaRunMode;
    files: UploadFileInput[];
    selectedModels: DashaSelectedModel[];
    sampleCount: number;
}) {
    const pack = await getRequiredKarthicPack(input.rubricPackId);
    if (pack.status !== 'approved') {
        throw new Error('Rubric pack must be approved before Dasha can start.');
    }

    const id = `dasha_v2_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const inputArtifacts = input.files.length > 0 ? await saveUploadedArtifacts(id, input.files) : [];
    const draftRun: DashaRunV2 = {
        schemaVersion: 3,
        id,
        rubricPackId: pack.id,
        runMode: input.runMode,
        status: 'draft',
        inputArtifacts,
        questionText: pack.questionText,
        selectedModels: input.selectedModels,
        requestedResponseCount: clampNumber(Math.floor(toNumber(input.sampleCount, 120)), 1, 400),
        validResponseCount: 0,
        responses: [],
        clusters: [],
        rowResults: [],
        moduleSummaries: [],
        weightedSummary: {
            applicableWeightTotal: 0,
            weightedScore: null,
            notApplicableRowKeys: [],
        },
        clusterScorecards: [],
        primaryClusterId: null,
        clusteringMethod: 'pending',
        clusteringNotes: 'Dasha evaluation started and is running in the background.',
        createdAt: now,
        completedAt: null,
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, draftRun.id, draftRun);
    return draftRun;
}

export async function executeDashaRun(id: string) {
    const run = await getRequiredDashaRun(id);
    if (run.status !== 'draft') {
        return run;
    }
    const pack = await getRequiredKarthicPack(run.rubricPackId);
    return await finalizeDashaRun({
        run,
        pack,
    });
}

export function buildJudgeRubricFromPack(pack: KarthicRubricPackV2) {
    return pack.rows
        .filter((row) => row.include)
        .map((row) => [
            `${row.key} ${row.title} (${row.lockedWeight})`,
            `Module: ${RUBRIC_MODULE_LABELS[row.moduleId]}`,
            `Role: ${row.role}`,
            `Description: ${row.description}`,
            `NA guidance: ${row.naGuidance}`,
            `Golden target summary: ${row.goldenTarget.summary}`,
        ].join('\n'))
        .join('\n\n');
}

async function finalizeDashaRun(input: {
    run: DashaRunV2;
    pack: KarthicRubricPackV2;
}) {
    try {
        const responses = await generateDashaResponses(
            input.run.questionText,
            input.run.selectedModels,
            clampNumber(Math.floor(toNumber(input.run.requestedResponseCount, 120)), 1, 400),
        );
        const validResponses = responses.filter((response) => !response.error && response.responseText.trim());
        if (validResponses.length === 0) {
            return await finalizeFailedRun(input.run, 'No valid model responses were generated.');
        }

        const clusteringResult = await clusterResponses(validResponses);
        const clusterScorecards = input.run.runMode === 'score_and_cluster'
            ? await evaluateClustersAgainstPacket({
                questionText: input.run.questionText,
                pack: input.pack,
                handoff: input.pack.prefillAudit,
                clusters: clusteringResult.clusters,
                responses: validResponses,
            })
            : [];
        const primaryCluster = clusterScorecards[0] ?? null;
        const rowResults = primaryCluster ? buildPrimaryRowResults(primaryCluster, clusteringResult.clusters) : [];
        const moduleSummaries = primaryCluster?.moduleSummaries ?? [];
        const weightedSummary = primaryCluster
            ? {
                applicableWeightTotal: primaryCluster.rowScores.reduce((sum, row) => row.applicabilityStatus === 'applicable' ? sum + row.weight : sum, 0),
                weightedScore: primaryCluster.finalScore,
                notApplicableRowKeys: primaryCluster.rowScores.filter((row) => row.applicabilityStatus !== 'applicable').map((row) => row.rowKey),
            }
            : { applicableWeightTotal: 0, weightedScore: null, notApplicableRowKeys: [] };

        const completedRun: DashaRunV2 = {
            ...input.run,
            status: 'completed',
            validResponseCount: validResponses.length,
            responses,
            clusters: clusteringResult.clusters,
            rowResults,
            moduleSummaries,
            weightedSummary,
            clusterScorecards,
            primaryClusterId: primaryCluster?.clusterId ?? null,
            clusteringMethod: clusteringResult.method,
            clusteringNotes: input.run.runMode === 'cluster_only'
                ? `${clusteringResult.notes} Row scoring was skipped because this run was started in clustering-only mode.`
                : clusteringResult.notes,
            completedAt: new Date().toISOString(),
        };
        await writeArtifact(DATA_DIRECTORIES.dasha, completedRun.id, completedRun);
        return completedRun;
    } catch (error) {
        return await finalizeFailedRun(input.run, error instanceof Error ? error.message : 'Failed to run Dasha evaluation.');
    }
}

async function finalizeFailedRun(run: DashaRunV2, errorMessage: string) {
    const failedRun: DashaRunV2 = {
        ...run,
        status: 'failed',
        responses: [],
        clusters: [],
        rowResults: [],
        moduleSummaries: [],
        weightedSummary: {
            applicableWeightTotal: 0,
            weightedScore: null,
            notApplicableRowKeys: [],
        },
        clusterScorecards: [],
        primaryClusterId: null,
        clusteringMethod: 'not_run',
        clusteringNotes: 'Dasha evaluation terminated before clustering completed.',
        errorMessage,
        completedAt: new Date().toISOString(),
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, failedRun.id, failedRun);
    return failedRun;
}

async function evaluateClustersAgainstPacket(input: {
    questionText: string;
    pack: KarthicRubricPackV2;
    handoff: KarthicHandoff;
    clusters: DashaClusterRecord[];
    responses: DashaResponseRecord[];
}): Promise<DashaClusterScorecard[]> {
    const responseById = new Map(input.responses.map((response) => [response.id, response]));
    const unsorted: Array<DashaClusterScorecard | null> = await Promise.all(input.clusters.map(async (cluster) => {
        const representative = responseById.get(cluster.representativeResponseId);
        if (!representative) {
            return null;
        }
        const rowScores = await Promise.all(
            input.pack.rows
                .filter((row) => row.include)
                .map(async (row) => {
                    const evaluation = await evaluateRowAgainstResponse({
                        row,
                        questionText: input.questionText,
                        responseText: representative.responseText,
                    });
                    const score = evaluation.applicabilityStatus === 'applicable'
                        ? clampNullableAnchorScore(evaluation.score, null)
                        : null;
                    return {
                        rowKey: row.key,
                        moduleId: row.moduleId,
                        rowTitle: row.title,
                        weight: row.lockedWeight,
                        rowSource: row.rowSource,
                        role: row.role,
                        applicabilityStatus: evaluation.applicabilityStatus,
                        applicabilityExplanation: evaluation.applicabilityExplanation,
                        score,
                        weightedContribution: score === null ? 0 : roundToTwo((row.lockedWeight * score) / 4),
                        confidence: evaluation.confidence ?? null,
                        rationale: evaluation.rationale,
                        difference: evaluation.difference,
                        metadataTags: evaluation.metadataTags,
                    } satisfies DashaClusterRowScore;
                }),
        );
        const moduleSummaries = buildClusterModuleSummaries(rowScores);
        const subtotal = roundToTwo(rowScores.reduce((sum, row) => sum + row.weightedContribution, 0));
        const penaltiesApplied = detectAnswerLevelPenalties({
            handoff: input.handoff,
            responseText: representative.responseText,
            rowScores,
        });
        const totalPenalty = penaltiesApplied.reduce((sum, item) => sum + item.points, 0);
        const postPenaltyScore = roundToTwo(clampNumber(subtotal + totalPenalty, 0, 100));
        const capStatus = detectCapStatus({
            handoff: input.handoff,
            responseText: representative.responseText,
            penaltiesApplied,
            rowScores,
            postPenaltyScore,
        });
        const finalScore = capStatus.applied && typeof capStatus.capValue === 'number'
            ? Math.min(postPenaltyScore, capStatus.capValue)
            : postPenaltyScore;
        const averageConfidence = computeAverageConfidence(rowScores);
        const zakReviewFlag = buildZakReviewFlag({ handoff: input.handoff, penaltiesApplied, capStatus });

        return {
            clusterId: cluster.id,
            size: cluster.size,
            modelBreakdown: cluster.modelBreakdown,
            rowScores,
            moduleSummaries,
            subtotal,
            penaltiesApplied,
            capStatus,
            postPenaltyScore,
            finalScore,
            zakReviewFlag,
            averageConfidence,
            rank: null,
        } satisfies DashaClusterScorecard;
    }));

    const scorecards = unsorted.filter((item): item is DashaClusterScorecard => item !== null);
    return scorecards
        .sort((left, right) => {
            const finalDelta = right.finalScore - left.finalScore;
            if (finalDelta !== 0) {
                return finalDelta;
            }
            const capDelta = capSeverity(left.capStatus) - capSeverity(right.capStatus);
            if (capDelta !== 0) {
                return capDelta;
            }
            const sizeDelta = right.size - left.size;
            if (sizeDelta !== 0) {
                return sizeDelta;
            }
            const confidenceDelta = (right.averageConfidence ?? -1) - (left.averageConfidence ?? -1);
            if (confidenceDelta !== 0) {
                return confidenceDelta;
            }
            return left.clusterId.localeCompare(right.clusterId);
        })
        .map((item, index) => ({ ...item, rank: index + 1 }));
}

function buildPrimaryRowResults(scorecard: DashaClusterScorecard, clusters: DashaClusterRecord[]): RubricRowResult[] {
    return scorecard.rowScores.map((row) => ({
        rowKey: row.rowKey,
        moduleId: row.moduleId,
        rowTitle: row.rowTitle,
        weight: row.weight,
        applicabilityStatus: row.applicabilityStatus,
        applicabilityExplanation: row.applicabilityExplanation,
        centroidEvaluations: [
            {
                clusterId: scorecard.clusterId,
                applicabilityStatus: row.applicabilityStatus,
                applicabilityExplanation: row.applicabilityExplanation,
                score: row.score === null ? null : row.score * 25,
                confidence: row.confidence,
                rationale: row.rationale,
                difference: row.difference,
                metadataTags: row.metadataTags,
            },
        ],
        winningCentroidId: scorecard.clusterId,
        winningScore: row.score === null ? null : row.score * 25,
        rationale: row.rationale,
        winningModelMix: clusters.find((cluster) => cluster.id === scorecard.clusterId)?.modelBreakdown ?? [],
    }));
}

async function evaluateRowAgainstResponse(input: {
    row: KarthicRubricRow;
    questionText: string;
    responseText: string;
}) {
    const prompt = buildDashaRowEvaluationPrompt(input);
    const fallback = heuristicRowEvaluation(input);
    try {
        const parsed = await generateJson({
            operation: `Dasha row evaluation ${input.row.key}`,
            prompt,
        });
        return normalizeRowEvaluation(parsed, fallback);
    } catch {
        return fallback;
    }
}

function normalizeRowEvaluation(parsed: Record<string, unknown>, fallback: ReturnType<typeof heuristicRowEvaluation>) {
    const applicabilityStatus = parsed.applicabilityStatus === 'applicable' || parsed.applicabilityStatus === 'not_applicable'
        ? parsed.applicabilityStatus
        : fallback.applicabilityStatus;
    return {
        applicabilityStatus,
        applicabilityExplanation: normalizeNonEmptyString(parsed.applicabilityExplanation, fallback.applicabilityExplanation),
        score: applicabilityStatus === 'applicable'
            ? clampNullableAnchorScore(parsed.score, fallback.score)
            : null,
        confidence: clampNumber(toNumber(parsed.confidence, fallback.confidence), 0, 1),
        rationale: normalizeNonEmptyString(parsed.rationale, fallback.rationale),
        difference: {
            matchedGoldenPoints: normalizeStringArray(parsed.matchedGoldenPoints).length > 0 ? normalizeStringArray(parsed.matchedGoldenPoints) : fallback.difference.matchedGoldenPoints,
            missingGoldenPoints: normalizeStringArray(parsed.missingGoldenPoints).length > 0 ? normalizeStringArray(parsed.missingGoldenPoints) : fallback.difference.missingGoldenPoints,
            extraCentroidPoints: normalizeStringArray(parsed.extraCentroidPoints),
            contradictionPoints: normalizeStringArray(parsed.contradictionPoints),
            differenceSummary: normalizeNonEmptyString(parsed.differenceSummary, fallback.difference.differenceSummary),
        },
        metadataTags: {
            bottomLineOutcome: normalizeNonEmptyString(getNestedString(parsed, 'metadataTags', 'bottomLineOutcome'), fallback.metadataTags.bottomLineOutcome),
            outcomeCorrectness: normalizeNonEmptyString(getNestedString(parsed, 'metadataTags', 'outcomeCorrectness'), fallback.metadataTags.outcomeCorrectness),
            reasoningAlignment: normalizeNonEmptyString(getNestedString(parsed, 'metadataTags', 'reasoningAlignment'), fallback.metadataTags.reasoningAlignment),
            jurisdictionAssumption: normalizeNonEmptyString(getNestedString(parsed, 'metadataTags', 'jurisdictionAssumption'), fallback.metadataTags.jurisdictionAssumption),
        },
    };
}

function buildClusterModuleSummaries(rows: DashaClusterRowScore[]): ModuleSummary[] {
    return Object.entries(RUBRIC_MODULE_LABELS)
        .filter(([moduleId]) => moduleId !== 'module0')
        .map(([moduleId, label]) => {
            const moduleRows = rows.filter((row) => row.moduleId === moduleId);
            const applicableRows = moduleRows.filter((row) => row.applicabilityStatus === 'applicable' && typeof row.score === 'number');
            const averageScore = applicableRows.length > 0
                ? roundToTwo((applicableRows.reduce((sum, row) => sum + ((row.score ?? 0) * 25), 0)) / applicableRows.length)
                : null;
            return {
                moduleId: moduleId as RubricModuleId,
                label,
                averageScore,
                applicableRowCount: applicableRows.length,
                winningRowKeys: applicableRows.map((row) => row.rowKey),
            };
        });
}

function heuristicRowEvaluation(input: {
    row: KarthicRubricRow;
    questionText: string;
    responseText: string;
}) {
    const rowText = normalizeForSimilarity([
        input.row.title,
        input.row.description,
        input.row.goldenTarget.summary,
        ...input.row.goldenTarget.goldenContains,
        ...input.row.goldenTarget.contradictionFlags,
    ].join(' '));
    const responseText = normalizeForSimilarity(input.responseText);
    const overlap = jaccardSimilarity(rowText, responseText);
    const questionOverlap = jaccardSimilarity(normalizeForSimilarity(input.questionText), rowText);
    const applicable = questionOverlap > 0.06 || overlap > 0.05;
    const matchedGoldenPoints = input.row.goldenTarget.goldenContains.filter((point) => jaccardSimilarity(normalizeForSimilarity(point), responseText) > 0.08);
    const missingGoldenPoints = input.row.goldenTarget.goldenContains.filter((point) => !matchedGoldenPoints.includes(point));

    return {
        applicabilityStatus: applicable ? 'applicable' as const : 'not_applicable' as const,
        applicabilityExplanation: applicable ? `The representative answer engages with row ${input.row.key}.` : input.row.naGuidance,
        score: applicable ? clampNullableAnchorScore(Math.round(clampNumber(overlap * 10, 0, 4)), null) : null,
        confidence: roundToTwo(applicable ? Math.max(overlap, 0.35) : 0.4),
        rationale: applicable
            ? `Score derived from semantic overlap between the answer and the approved row ${input.row.key} target.`
            : `Marked not applicable under the stored NA guidance for row ${input.row.key}.`,
        difference: {
            matchedGoldenPoints,
            missingGoldenPoints,
            extraCentroidPoints: [],
            contradictionPoints: [],
            differenceSummary: applicable
                ? `Matched ${matchedGoldenPoints.length} expected points for row ${input.row.key}.`
                : `No meaningful coverage of row ${input.row.key} was detected.`,
        } satisfies RubricRowDifference,
        metadataTags: {
            bottomLineOutcome: 'No clear conclusion',
            outcomeCorrectness: 'Indeterminate',
            reasoningAlignment: 'Wrong result / poor reasoning',
            jurisdictionAssumption: 'Not clearly stated',
        },
    };
}

async function generateJson(input: {
    operation: string;
    prompt: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    requireOpenAiApiKey(input.operation);
    const model = normalizeOpenAiJsonModel(input.model);
    try {
        const response = await openai.chat.completions.create({
            model,
            temperature: 0.1,
            messages: [
                { role: 'system', content: 'Return valid JSON only. Do not wrap the JSON in markdown.' },
                { role: 'user', content: input.prompt },
            ],
            response_format: { type: 'json_object' },
        });
        const content = response.choices[0]?.message?.content ?? '';
        const parsed = safeJsonParse<Record<string, unknown>>(content);
        if (!parsed) {
            throw new Error('Model returned invalid JSON.');
        }
        return parsed;
    } catch (error) {
        throw new Error(`${input.operation} failed: ${describeError(error, 'OpenAI request failed.')}`);
    }
}

async function generateText(input: {
    operation: string;
    prompt: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    requireOpenAiApiKey(input.operation);
    try {
        return await generateModelResponse({
            provider: 'openai',
            model: normalizeOpenAiTextModel(input.model),
            systemPrompt: 'Follow the user instructions exactly and return only the requested text.',
            messages: [{ role: 'user', content: input.prompt }],
            temperature: 0.1,
            reasoningEffort: input.reasoningEffort,
        });
    } catch (error) {
        throw new Error(`${input.operation} failed: ${describeError(error, 'OpenAI request failed.')}`);
    }
}

async function generateDashaResponses(questionText: string, selectedModels: DashaSelectedModel[], sampleCount: number) {
    const samplingPlan = buildDashaSamplingPlan(selectedModels, sampleCount);
    const tasks = samplingPlan.map((task) => async (): Promise<DashaResponseRecord> => {
        const id = `response_${randomUUID().slice(0, 8)}`;
        const modelKey = `${task.selectedModel.provider}::${task.selectedModel.model}`;
        try {
            const responseText = await generateModelResponse({
                provider: task.selectedModel.provider,
                model: task.selectedModel.model,
                systemPrompt: 'Write a direct legal analysis answering the prompt. Do not use markdown headings unless the question calls for them.',
                messages: [{ role: 'user', content: questionText }],
                temperature: task.temperature,
                reasoningEffort: task.selectedModel.reasoningEffort ?? 'medium',
            });
            return {
                id,
                modelKey,
                provider: task.selectedModel.provider,
                model: task.selectedModel.model,
                sampleIndex: task.sampleIndex,
                responseText: responseText.trim(),
                clusterId: '',
            };
        } catch (error) {
            return {
                id,
                modelKey,
                provider: task.selectedModel.provider,
                model: task.selectedModel.model,
                sampleIndex: task.sampleIndex,
                responseText: '',
                clusterId: '',
                error: error instanceof Error ? error.message : 'Model generation failed.',
            };
        }
    });
    return await runWithConcurrency(tasks, 8);
}

function buildDashaSamplingPlan(selectedModels: DashaSelectedModel[], sampleCount: number) {
    if (selectedModels.length === 0 || sampleCount <= 0) {
        return [] as Array<{ selectedModel: DashaSelectedModel; sampleIndex: number; temperature: number }>;
    }
    const basePerModel = Math.floor(sampleCount / selectedModels.length);
    const remainder = sampleCount % selectedModels.length;
    const plan: Array<{ selectedModel: DashaSelectedModel; sampleIndex: number; temperature: number }> = [];
    selectedModels.forEach((selectedModel, modelIndex) => {
        const count = basePerModel + (modelIndex < remainder ? 1 : 0);
        for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
            plan.push({
                selectedModel,
                sampleIndex,
                temperature: buildSampleTemperature(selectedModel, sampleIndex),
            });
        }
    });
    return plan;
}

function buildSampleTemperature(selectedModel: DashaSelectedModel, sampleIndex: number) {
    const baseTemperature = selectedModel.temperature ?? 0.7;
    const offsets = [0, 0.08, -0.08, 0.14, -0.14];
    return roundToTwo(clampNumber(baseTemperature + offsets[sampleIndex % offsets.length], 0.2, 1));
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number) {
    if (tasks.length === 0) {
        return [] as T[];
    }
    const limit = Math.max(1, Math.floor(concurrency));
    const results = new Array<T>(tasks.length);
    let nextIndex = 0;
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (nextIndex < tasks.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await tasks[currentIndex]();
        }
    }));
    return results;
}

async function clusterResponses(responses: DashaResponseRecord[]): Promise<{
    clusters: DashaClusterRecord[];
    method: string;
    notes: string;
}> {
    const densityClustered = await clusterResponsesWithDensityPipeline(responses);
    if (densityClustered) {
        return densityClustered;
    }
    return {
        clusters: buildJaccardFallbackClusters(responses),
        method: 'jaccard_fallback',
        notes: 'Fell back to the Jaccard clustering heuristic because the Python density-clustering environment was unavailable.',
    };
}

async function clusterResponsesWithDensityPipeline(responses: DashaResponseRecord[]): Promise<{
    clusters: DashaClusterRecord[];
    method: string;
    notes: string;
} | null> {
    const pythonExecutable = await resolvePythonExecutable();
    if (!pythonExecutable) {
        return null;
    }
    const root = getRepoRoot();
    const tempDirectory = path.join(root, 'legal-workflow-data', 'tmp');
    const inputPath = path.join(tempDirectory, `frank_v2_cluster_input_${Date.now()}_${randomUUID().slice(0, 8)}.json`);
    const scriptPath = path.join(root, 'lsh', 'cluster_legal_workflow.py');
    await fs.mkdir(tempDirectory, { recursive: true });
    await fs.writeFile(inputPath, JSON.stringify({
        responses: responses.map((response) => ({ id: response.id, response: response.responseText })),
    }, null, 2), 'utf8');

    try {
        const { stdout } = await execFileAsync(pythonExecutable, [scriptPath, '--input', inputPath], {
            cwd: root,
            maxBuffer: 1024 * 1024 * 8,
        });
        const parsed = safeJsonParse<{
            clusters?: Array<{
                id?: unknown;
                sourceClusterId?: unknown;
                representativeResponseId?: unknown;
                memberResponseIds?: unknown;
            }>;
            method?: unknown;
            notes?: unknown;
        }>(stdout);
        if (!parsed?.clusters?.length) {
            return null;
        }
        const responseById = new Map(responses.map((response) => [response.id, response]));
        const rawClusters = parsed.clusters.map((cluster, index) => {
                const memberIds = Array.isArray(cluster.memberResponseIds)
                    ? cluster.memberResponseIds.map((item) => String(item).trim()).filter(Boolean)
                    : [];
                const members = memberIds
                    .map((memberId) => responseById.get(memberId))
                    .filter((member): member is DashaResponseRecord => Boolean(member));
                if (members.length === 0) {
                    return null;
                }
                const representativeId = String(cluster.representativeResponseId || members[0].id).trim() || members[0].id;
                const representative = responseById.get(representativeId) ?? members[0];
                const clusterId = String(cluster.id || `cluster_${index + 1}`).trim() || `cluster_${index + 1}`;
                members.forEach((member) => {
                    member.clusterId = clusterId;
                });
                return {
                    id: clusterId,
                    sourceClusterId: typeof cluster.sourceClusterId === 'string' && cluster.sourceClusterId.trim() ? cluster.sourceClusterId.trim() : clusterId,
                    representativeResponseId: representative.id,
                    representativeText: representative.responseText,
                    memberResponseIds: members.map((member) => member.id),
                    size: members.length,
                    modelBreakdown: summarizeModelBreakdown(members),
                } as DashaClusterRecord;
            });
        const clusters = rawClusters.filter((cluster): cluster is DashaClusterRecord => Boolean(cluster));
        return clusters.length > 0
            ? {
                clusters,
                method: typeof parsed.method === 'string' && parsed.method.trim() ? parsed.method.trim() : 'density_umap_hdbscan',
                notes: typeof parsed.notes === 'string' && parsed.notes.trim()
                    ? parsed.notes.trim()
                    : 'Clustered with the repo density-clustering pipeline and medoid-style representative selection.',
            }
            : null;
    } catch {
        return null;
    } finally {
        await fs.unlink(inputPath).catch(() => undefined);
    }
}

function buildJaccardFallbackClusters(responses: DashaResponseRecord[]) {
    const assigned = new Set<string>();
    const clusters: DashaClusterRecord[] = [];
    const texts = new Map(responses.map((response) => [response.id, normalizeForSimilarity(response.responseText)]));

    for (const response of responses) {
        if (assigned.has(response.id)) {
            continue;
        }
        const members = [response];
        assigned.add(response.id);
        const baseText = texts.get(response.id) ?? '';

        for (const candidate of responses) {
            if (assigned.has(candidate.id) || candidate.id === response.id) {
                continue;
            }
            if (jaccardSimilarity(baseText, texts.get(candidate.id) ?? '') >= 0.33) {
                members.push(candidate);
                assigned.add(candidate.id);
            }
        }

        const representative = members
            .map((member) => ({ member, score: averageSimilarity(member.id, members, texts) }))
            .sort((left, right) => right.score - left.score || right.member.responseText.length - left.member.responseText.length)[0]?.member ?? members[0];

        const clusterId = `cluster_${clusters.length + 1}`;
        members.forEach((member) => {
            member.clusterId = clusterId;
        });
        clusters.push({
            id: clusterId,
            sourceClusterId: clusterId,
            representativeResponseId: representative.id,
            representativeText: representative.responseText,
            memberResponseIds: members.map((member) => member.id),
            size: members.length,
            modelBreakdown: summarizeModelBreakdown(members),
        });
    }
    return clusters;
}

function summarizeModelBreakdown(members: DashaResponseRecord[]) {
    const byModel = new Map<string, { modelKey: string; provider: ModelProvider; model: string; count: number }>();
    for (const member of members) {
        const current = byModel.get(member.modelKey);
        if (current) {
            current.count += 1;
        } else {
            byModel.set(member.modelKey, {
                modelKey: member.modelKey,
                provider: member.provider,
                model: member.model,
                count: 1,
            });
        }
    }
    return Array.from(byModel.values()).sort((left, right) => right.count - left.count || left.modelKey.localeCompare(right.modelKey));
}

async function saveUploadedArtifacts(ownerId: string, files: UploadFileInput[]) {
    const artifactDirectory = path.join(await ensureDirectory(DATA_DIRECTORIES.artifacts), ownerId);
    await fs.mkdir(artifactDirectory, { recursive: true });
    const artifacts: ArtifactRecord[] = [];
    for (const file of files) {
        const safeName = sanitizeFileName(file.fileName || `${file.role}.pdf`);
        const artifactId = `artifact_${randomUUID().slice(0, 8)}`;
        const storedPath = path.join(artifactDirectory, `${artifactId}_${safeName}`);
        const extractedTextPath = path.join(artifactDirectory, `${artifactId}.txt`);
        await fs.writeFile(storedPath, file.bytes);
        const extractedText = await extractTextFromUploadedFile(file.bytes, safeName);
        await fs.writeFile(extractedTextPath, extractedText, 'utf8');
        artifacts.push({
            id: artifactId,
            role: file.role,
            fileName: safeName,
            storedPath,
            extractedTextPath,
            extractedText,
            uploadedAt: new Date().toISOString(),
        });
    }
    return artifacts;
}

async function deleteUploadedArtifacts(ownerId: string) {
    const artifactsRoot = await ensureDirectory(DATA_DIRECTORIES.artifacts);
    await fs.rm(path.join(artifactsRoot, ownerId), { recursive: true, force: true });
}

async function extractTextFromUploadedFile(bytes: Uint8Array, fileName: string) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.pdf') {
        try {
            return normalizeExtractedText(await getPdfTextFromBuffer(Buffer.from(bytes)));
        } catch {
            return '';
        }
    }
    return normalizeExtractedText(Buffer.from(bytes).toString('utf8'));
}

async function getPdfTextFromBuffer(buffer: Buffer) {
    const pdfParseModule = await import('pdf-parse');
    if (typeof ((pdfParseModule as unknown) as { default?: unknown }).default === 'function') {
        const parsed = await (((pdfParseModule as unknown) as { default: (data: Buffer) => Promise<{ text?: string }> }).default(buffer));
        return typeof parsed.text === 'string' ? parsed.text : '';
    }
    const PDFParse = ((pdfParseModule as unknown) as { PDFParse?: new (options: { data: Buffer | Uint8Array }) => { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> }; }).PDFParse;
    if (typeof PDFParse === 'function') {
        if (!pdfWorkerConfigured) {
            const candidates = [
                path.resolve(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'),
                path.resolve(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs'),
                path.resolve(process.cwd(), 'frontend/node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'),
                path.resolve(process.cwd(), 'frontend/node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs'),
            ];
            const workerPath = candidates.find((candidate) => fsSync.existsSync(candidate));
            if (workerPath) {
                try {
                    ((pdfParseModule as unknown) as { PDFParse: { setWorker?: (workerPath?: string) => void } }).PDFParse.setWorker?.(workerPath);
                } catch {
                    // Ignore worker fallback issues.
                }
            }
            pdfWorkerConfigured = true;
        }
        const parser = new PDFParse({ data: buffer });
        try {
            const parsed = await parser.getText();
            return typeof parsed.text === 'string' ? parsed.text : '';
        } finally {
            await parser.destroy().catch(() => undefined);
        }
    }
    throw new Error('Failed to load PDF parser.');
}

function buildSourceText(artifacts: ArtifactRecord[], maxLength: number) {
    return artifacts
        .map((artifact) => `# ${artifact.fileName}\n${artifact.extractedText}`.trim())
        .join('\n\n')
        .slice(0, maxLength)
        .trim();
}

function canGenerateFrankBenchmark(packet: FrankPacketV2) {
    if (!packet.selectedPack || !packet.intakeChecklist || !packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.likelyFailureModes) {
        return false;
    }
    if (packet.routingConfidence === 'weak') {
        return false;
    }
    if (packet.intakeChecklist.finalIntakeRating === 'Weak; support/contrast source only' || packet.intakeChecklist.finalIntakeRating === 'Not a strong gold-source candidate without additional authority') {
        return false;
    }
    if (packet.intakeChecklist.finalIntakeRating === 'Moderate; usable with supporting authority' && !hasSupportingAuthority(packet.sourceArtifacts)) {
        return false;
    }
    return true;
}

function buildFrankBenchmarkBlockReason(packet: FrankPacketV2) {
    if (packet.routingConfidence === 'weak') {
        return 'Routing confidence remains weak. Stop at extraction plus JD review flags.';
    }
    const rating = packet.intakeChecklist?.finalIntakeRating;
    if (rating === 'Weak; support/contrast source only' || rating === 'Not a strong gold-source candidate without additional authority') {
        return 'This source failed the intake stop rule and cannot progress to benchmark or question generation.';
    }
    if (rating === 'Moderate; usable with supporting authority' && !hasSupportingAuthority(packet.sourceArtifacts)) {
        return 'This source is only moderate and requires supporting authority before benchmark or question generation.';
    }
    return 'Extraction and mapping must be completed before benchmark generation.';
}

function hasSupportingAuthority(artifacts: ArtifactRecord[]) {
    return artifacts.some((artifact) => artifact.role === 'supporting_authority' || artifact.role === 'supplemental');
}

function validateFrankExtractionMappingOrThrow(input: {
    sourceExtractionSheet: FrankSourceExtractionSheet | null;
    goldPacketMapping: FrankGoldPacketMapping | null;
    likelyFailureModes: FrankLikelyFailureModes | null;
}) {
    const missingSections = [
        !input.sourceExtractionSheet ? 'sourceExtractionSheet' : null,
        !input.goldPacketMapping ? 'goldPacketMapping' : null,
        !input.likelyFailureModes ? 'likelyFailureModes' : null,
    ].filter((value): value is string => Boolean(value));

    if (missingSections.length > 0) {
        throw new Error(`Phase 2 returned an invalid extraction/mapping payload. Missing: ${missingSections.join(', ')}.`);
    }
}

function validateFrankApprovalOrThrow(packet: FrankPacketV2) {
    if (!packet.selectedPack || !packet.intakeChecklist || !packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.likelyFailureModes) {
        throw new Error('All Frank phases through extraction and mapping must be completed before approval.');
    }
    if (!canGenerateFrankBenchmark(packet)) {
        throw new Error(buildFrankBenchmarkBlockReason(packet));
    }
    if (!packet.benchmarkAnswer.trim()) {
        throw new Error('Benchmark answer is required before approval.');
    }
    if (!packet.reverseEngineeredQuestion.trim()) {
        throw new Error('Reverse-engineered question is required before approval.');
    }
    validateKarthicHandoffForApprovalOrThrow(packet.karthicHandoff);
}

function validateBenchmarkAnswerOrThrow(text: string) {
    const normalized = text.replace(/\r/g, '').trim();
    const expectedHeadingSets = FRANK_V2_BENCHMARK_HEADINGS.map((heading) => new Set(
        FRANK_V2_BENCHMARK_HEADING_ALIASES[heading].map((candidate) => normalizeBenchmarkHeadingLabel(candidate)),
    ));

    let expectedIndex = 0;
    for (const line of normalized.split('\n')) {
        const candidate = normalizeBenchmarkHeadingLabel(line);
        if (!candidate) {
            continue;
        }
        const matchedIndex = expectedHeadingSets.findIndex((headingSet) => headingSet.has(candidate));
        if (matchedIndex === -1) {
            continue;
        }
        if (matchedIndex < expectedIndex) {
            continue;
        }
        if (matchedIndex > expectedIndex) {
            throw new Error('Benchmark answer headings are missing or out of order.');
        }
        expectedIndex += 1;
        if (expectedIndex === FRANK_V2_BENCHMARK_HEADINGS.length) {
            return;
        }
    }

    if (expectedIndex < FRANK_V2_BENCHMARK_HEADINGS.length) {
        throw new Error(`Benchmark answer is missing required heading "${FRANK_V2_BENCHMARK_HEADINGS[expectedIndex]}".`);
    }
}

function normalizeBenchmarkHeadingLabel(value: string) {
    if (!value.trim()) {
        return '';
    }
    return value
        .normalize('NFKC')
        .replace(/\u00A0/g, ' ')
        .trim()
        .replace(/^#{1,6}\s*/, '')
        .replace(/^>\s*/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .replace(/^\*\*(.+)\*\*$/u, '$1')
        .replace(/^__(.+)__$/u, '$1')
        .replace(/^[*_`]+|[*_`]+$/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[：:]\s*$/u, '')
        .toLowerCase();
}

function validateReverseEngineeredQuestionOrThrow(text: string) {
    const normalized = text.replace(/\r/g, '').trim();
    if (!normalized) {
        throw new Error('Reverse-engineered question is empty.');
    }
    const forbiddenPatterns = [
        /^\s*Title\s*:/im,
        /^\s*Facts\s*:/im,
        /^\s*Tasks\s*:/im,
        /^\s*Answer Format\s*:/im,
        /^\s*\d+[.)]\s+/m,
    ];
    for (const pattern of forbiddenPatterns) {
        if (pattern.test(normalized)) {
            throw new Error('Reverse-engineered question still uses the deprecated task-packet format.');
        }
    }
    const callLine = normalized.split('\n').at(-1)?.trim() ?? '';
    if (!/(Analyze\.|Who has the better claim\? Analyze\.|Is the agreement enforceable\? Analyze\.|Does the claimant have the better argument for enforcement\? Analyze\.)$/i.test(callLine)) {
        throw new Error('Reverse-engineered question must end with a neutral exam-style call to analyze.');
    }
    const leakagePatterns = [
        /\bStatute of Frauds\b/i,
        /\bUCC\s*2-201\b/i,
        /\bmerchant confirmation\b/i,
        /\bpart performance\b/i,
        /\bpromissory estoppel\b/i,
    ];
    if (leakagePatterns.some((pattern) => pattern.test(callLine))) {
        throw new Error('Reverse-engineered question call leaks the controlling doctrine.');
    }
}

function collectBenchmarkWarnings(text: string) {
    const warnings: string[] = [];
    if (/\bit depends\b/i.test(text)) {
        warnings.push('Benchmark answer still uses generic hedging. Review "Strongest counterargument:" for specificity.');
    }
    return warnings;
}

function collectQuestionWarnings(text: string) {
    const warnings: string[] = [];
    if (!/\bAnalyze\.$/m.test(text.trim())) {
        warnings.push('Question does not end with a clear neutral call to analyze.');
    }
    return warnings;
}

function validateRubricRowsOrThrow(rows: KarthicRubricRow[], anchorRows: KarthicRubricRow[]) {
    if (anchorRows.length !== RUBRIC_ROW_SPECS.length) {
        throw new Error(`Rubric pack must contain exactly ${RUBRIC_ROW_SPECS.length} anchor rows.`);
    }
    for (const spec of RUBRIC_ROW_SPECS) {
        const row = anchorRows.find((item) => item.key === spec.key);
        if (!row) {
            throw new Error(`Rubric pack is missing row ${spec.key}.`);
        }
        if (row.moduleId !== spec.moduleId) {
            throw new Error(`Row ${spec.key} must belong to ${spec.moduleId}.`);
        }
        if (!row.title.trim() || !row.description.trim() || !row.naGuidance.trim() || !row.failureMode.trim()) {
            throw new Error(`Row ${spec.key} is incomplete.`);
        }
        if (!row.goldenTarget.summary.trim() || row.goldenTarget.goldenContains.length === 0 || !row.goldenTarget.comparisonGuidance.trim()) {
            throw new Error(`Row ${spec.key} is missing required golden-target fields.`);
        }
        if (!row.scoreAnchors['0'].trim() || !row.scoreAnchors['1'].trim() || !row.scoreAnchors['2'].trim() || !row.scoreAnchors['3'].trim() || !row.scoreAnchors['4'].trim()) {
            throw new Error(`Row ${spec.key} is missing scoring anchors.`);
        }
    }
    for (const row of rows) {
        if (!row.key.trim() || !row.title.trim() || !row.failureMode.trim()) {
            throw new Error(`Rubric row ${row.key || '(blank)'} is incomplete.`);
        }
    }
}

function normalizeFrankPacket(value: unknown): FrankPacketV2 | null {
    if (!isRecord(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 3)) {
        return null;
    }
    const sourceArtifacts = normalizeArtifacts(value.sourceArtifacts);
    const intakeChecklist = normalizeIntakeChecklist(value.intakeChecklist);
    const sourceExtractionSheet = normalizeSourceExtractionSheet(value.sourceExtractionSheet, normalizePackId(value.selectedPack));
    const goldPacketMapping = normalizeGoldPacketMapping(value.goldPacketMapping);
    const likelyFailureModes = normalizeFailureModes(value.likelyFailureModes);
    const benchmarkAnswer = normalizeOptionalString(value.benchmarkAnswer, '');
    return {
        schemaVersion: 3,
        id: normalizeNonEmptyString(value.id, `frank_v2_${randomUUID().slice(0, 8)}`),
        status: value.status === 'approved' ? 'approved' : 'draft',
        phase: normalizePhase(value.phase, 'source'),
        legalDomain: 'Statute of Frauds',
        sourceFamily: 'uploaded_authority',
        title: normalizeNonEmptyString(value.title, 'Untitled Statute of Frauds packet'),
        selectedPack: normalizePackId(value.selectedPack),
        routingReason: normalizeOptionalString(value.routingReason, ''),
        secondaryIssues: normalizeStringArray(value.secondaryIssues),
        routingConfidence: normalizeRoutingConfidence(value.routingConfidence),
        sourceArtifacts,
        intakeChecklist,
        sourceExtractionSheet,
        goldPacketMapping,
        likelyFailureModes,
        benchmarkAnswer,
        reverseEngineeredQuestion: normalizeOptionalString(value.reverseEngineeredQuestion, ''),
        karthicHandoff: normalizeKarthicHandoff(value.karthicHandoff, {
            id: normalizeNonEmptyString(value.id, `frank_v2_${randomUUID().slice(0, 8)}`),
            title: normalizeNonEmptyString(value.title, 'Untitled Statute of Frauds packet'),
            selectedPack: normalizePackId(value.selectedPack),
            routingReason: normalizeOptionalString(value.routingReason, ''),
            sourceArtifacts,
            intakeChecklist,
            sourceExtractionSheet,
            goldPacketMapping,
            likelyFailureModes,
            benchmarkAnswer,
        }),
        savedPrompts: Array.isArray(value.savedPrompts) ? value.savedPrompts as FrankPacketV2['savedPrompts'] : [],
        benchmarkWarnings: normalizeStringArray(value.benchmarkWarnings),
        questionWarnings: normalizeStringArray(value.questionWarnings),
        approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeNonEmptyString(value.updatedAt, new Date().toISOString()),
    };
}

function normalizeKarthicRubricPack(value: unknown): KarthicRubricPackV2 | null {
    if (!isRecord(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 3)) {
        return null;
    }
    const prefillAudit = normalizeKarthicHandoff(value.prefillAudit ?? value.karthicHandoff, {
        id: normalizeNonEmptyString(value.frankPacketId, ''),
    });
    const moduleBudgets = normalizeModuleBudgets(value.moduleBudgets);
    const anchorRows = normalizeRubricRows(value.anchorRows ?? value.rows, 'anchor');
    const emergentRows = normalizeRubricRows(value.emergentRows, 'emergent');
    const rows = flattenIncludedRows(anchorRows, emergentRows, moduleBudgets);
    return {
        schemaVersion: 3,
        id: normalizeNonEmptyString(value.id, `karthic_v2_${randomUUID().slice(0, 8)}`),
        frankPacketId: normalizeNonEmptyString(value.frankPacketId, ''),
        selectedPack: normalizePackId(value.selectedPack) ?? 'pack10',
        questionText: normalizeOptionalString(value.questionText, ''),
        status: value.status === 'approved' ? 'approved' : 'draft',
        prefillAudit,
        moduleBudgets,
        anchorRows,
        emergentRows,
        rows,
        failureLabelMap: normalizeFailureLabelMap(value.failureLabelMap),
        decompositionLog: normalizeDecompositionLog(value.decompositionLog),
        variationPatchNotes: normalizeStringArray(value.variationPatchNotes),
        escalationNotes: normalizeEscalationNotes(value.escalationNotes, prefillAudit),
        savedPrompts: Array.isArray(value.savedPrompts) ? value.savedPrompts as KarthicRubricPackV2['savedPrompts'] : [],
        comparisonMethodNote: normalizeOptionalString(value.comparisonMethodNote, ''),
        approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeNonEmptyString(value.updatedAt, new Date().toISOString()),
    };
}

function normalizeDashaRun(value: unknown): DashaRunV2 | null {
    if (!isRecord(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 3)) {
        return null;
    }
    return {
        schemaVersion: 3,
        id: normalizeNonEmptyString(value.id, `dasha_v2_${randomUUID().slice(0, 8)}`),
        rubricPackId: normalizeNonEmptyString(value.rubricPackId, ''),
        runMode: value.runMode === 'cluster_only' ? 'cluster_only' : 'score_and_cluster',
        status: value.status === 'completed' || value.status === 'failed' ? value.status : 'draft',
        inputArtifacts: normalizeArtifacts(value.inputArtifacts),
        questionText: normalizeOptionalString(value.questionText, ''),
        selectedModels: Array.isArray(value.selectedModels) ? value.selectedModels as DashaSelectedModel[] : [],
        requestedResponseCount: typeof value.requestedResponseCount === 'number' ? value.requestedResponseCount : undefined,
        validResponseCount: typeof value.validResponseCount === 'number' ? value.validResponseCount : undefined,
        responses: Array.isArray(value.responses) ? value.responses as DashaResponseRecord[] : [],
        clusters: Array.isArray(value.clusters) ? value.clusters as DashaClusterRecord[] : [],
        rowResults: Array.isArray(value.rowResults) ? value.rowResults as RubricRowResult[] : [],
        moduleSummaries: Array.isArray(value.moduleSummaries) ? value.moduleSummaries as ModuleSummary[] : [],
        weightedSummary: isRecord(value.weightedSummary)
            ? {
                applicableWeightTotal: toNumber(value.weightedSummary.applicableWeightTotal, 0),
                weightedScore: typeof value.weightedSummary.weightedScore === 'number' ? value.weightedSummary.weightedScore : null,
                notApplicableRowKeys: normalizeRubricRowKeys(value.weightedSummary.notApplicableRowKeys),
            }
            : { applicableWeightTotal: 0, weightedScore: null, notApplicableRowKeys: [] },
        clusterScorecards: normalizeClusterScorecards(value.clusterScorecards),
        primaryClusterId: typeof value.primaryClusterId === 'string' && value.primaryClusterId.trim() ? value.primaryClusterId.trim() : null,
        clusteringMethod: normalizeOptionalString(value.clusteringMethod, 'unknown'),
        clusteringNotes: typeof value.clusteringNotes === 'string' ? value.clusteringNotes : null,
        errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    };
}

function normalizeRubricRows(value: unknown, rowSource: 'anchor' | 'emergent'): KarthicRubricRow[] {
    const records = Array.isArray(value) ? value : [];
    const parsedRows = records
        .map((record) => normalizeRubricRow(record, rowSource))
        .filter((row): row is KarthicRubricRow => Boolean(row));

    if (rowSource === 'emergent') {
        return parsedRows;
    }

    const output: KarthicRubricRow[] = [];
    for (const spec of RUBRIC_ROW_SPECS) {
        const parsed = parsedRows.find((row) => row.key === spec.key);
        output.push(parsed ?? buildDefaultAnchorRow(spec.key));
    }
    return output;
}

function normalizeRubricRow(value: unknown, rowSource: 'anchor' | 'emergent'): KarthicRubricRow | null {
    if (!isRecord(value)) {
        return null;
    }
    const key = typeof value.key === 'string' && value.key.trim() ? value.key.trim() : null;
    const moduleId = typeof value.moduleId === 'string' && MODULE_IDS.has(value.moduleId as RubricModuleId) ? value.moduleId as RubricModuleId : null;
    if (!key || !moduleId) {
        return null;
    }
    const spec = RUBRIC_ROW_SPECS.find((row) => row.key === key);
    return {
        key,
        moduleId,
        rowSource,
        role: normalizeRubricRole(value.role, spec?.role ?? defaultRoleForModule(moduleId)),
        title: normalizeNonEmptyString(value.title, spec?.title ?? key),
        description: normalizeNonEmptyString(value.description, spec?.defaultDescription ?? ''),
        weight: clampNumber(toNumber(value.weight, toNumber(value.lockedWeight, spec?.defaultWeight ?? 1)), 1, 40),
        lockedWeight: clampNumber(toNumber(value.lockedWeight, toNumber(value.weight, spec?.defaultWeight ?? 1)), 1, 40),
        include: value.include === false ? false : true,
        naGuidance: normalizeNonEmptyString(value.naGuidance, `Mark row ${key} not applicable only if the question packet does not materially trigger this issue.`),
        failureMode: normalizeNonEmptyString(value.failureMode, `Earliest-gate failure on row ${key}.`),
        scoreAnchors: normalizeScoreAnchors(value.scoreAnchors),
        goldenTarget: normalizeGoldenTarget(value.goldenTarget),
    };
}

function buildDefaultAnchorRow(key: string): KarthicRubricRow {
    const spec = RUBRIC_ROW_SPECS.find((row) => row.key === key) ?? RUBRIC_ROW_SPECS[0];
    return {
        key,
        moduleId: spec.moduleId,
        rowSource: 'anchor',
        role: spec.role,
        title: spec.title,
        description: spec.defaultDescription,
        weight: spec.defaultWeight,
        lockedWeight: spec.defaultWeight,
        include: true,
        naGuidance: `Mark row ${key} not applicable only if the question packet does not materially trigger this issue.`,
        failureMode: `Failure to satisfy ${spec.title.toLowerCase()}.`,
        scoreAnchors: defaultScoreAnchors(spec.title),
        goldenTarget: {
            summary: `Assess whether the answer correctly handles ${spec.title.toLowerCase()}.`,
            goldenContains: [`The answer should directly address ${spec.title.toLowerCase()}.`],
            allowedOmissions: [],
            contradictionFlags: [],
            comparisonGuidance: `Compare the answer against row ${key} as the evaluation lens.`,
        },
    };
}

function normalizeGoldenTarget(value: unknown): RubricRowGoldenTarget {
    const record = isRecord(value) ? value : {};
    return {
        summary: normalizeNonEmptyString(record.summary, 'No summary provided.'),
        goldenContains: normalizeStringArray(record.goldenContains),
        allowedOmissions: normalizeStringArray(record.allowedOmissions),
        contradictionFlags: normalizeStringArray(record.contradictionFlags),
        comparisonGuidance: normalizeNonEmptyString(record.comparisonGuidance, 'Compare the centroid against this approved row target.'),
    };
}

function normalizeScoreAnchors(value: unknown): RubricRowScoreAnchors {
    const record = isRecord(value) ? value : {};
    return {
        '0': normalizeNonEmptyString(record['0'], 'Absent or materially wrong; would mislead the outcome.'),
        '1': normalizeNonEmptyString(record['1'], 'Mentioned but incorrect or superficial.'),
        '2': normalizeNonEmptyString(record['2'], 'Partly correct but missing a key element, exception, or application step.'),
        '3': normalizeNonEmptyString(record['3'], 'Mostly correct; minor gaps but still usable.'),
        '4': normalizeNonEmptyString(record['4'], 'Strong; correct rule, prioritized path, fact-specific application, and key counterpoints addressed.'),
    };
}

function normalizeModuleBudgets(value: unknown, fallback?: KarthicModuleBudget[]): KarthicModuleBudget[] {
    const records = Array.isArray(value) ? value : [];
    return (Object.entries(KARTHIC_MODULE_DEFAULT_BUDGETS) as Array<[Exclude<RubricModuleId, 'module0'>, number]>).map(([moduleId, defaultBudget]) => {
        const current = records.find((item) => isRecord(item) && item.moduleId === moduleId);
        const prior = fallback?.find((item) => item.moduleId === moduleId);
        const overrideBudget = current && typeof current.overrideBudget === 'number'
            ? clampNumber(current.overrideBudget, 1, 100)
            : prior?.overrideBudget ?? null;
        const finalBudget = overrideBudget ?? defaultBudget;
        return {
            moduleId,
            label: RUBRIC_MODULE_LABELS[moduleId],
            defaultBudget,
            overrideBudget,
            finalBudget,
            rationale: current && typeof current.rationale === 'string'
                ? current.rationale.trim()
                : prior?.rationale ?? '',
        };
    });
}

function normalizeFailureLabelMap(value: unknown): KarthicFailureLabelMapEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(isRecord)
        .map((item) => ({
            rowKey: normalizeNonEmptyString(item.rowKey, ''),
            label: normalizeNonEmptyString(item.label, ''),
            notes: normalizeOptionalString(item.notes, ''),
        }))
        .filter((item) => item.rowKey && item.label);
}

function normalizeDecompositionLog(value: unknown): KarthicDecompositionLogEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(isRecord)
        .map((item) => ({
            rowKey: normalizeNonEmptyString(item.rowKey, ''),
            action: normalizeDecompositionAction(item.action),
            note: normalizeOptionalString(item.note, ''),
        }))
        .filter((item) => item.rowKey);
}

function normalizeEscalationNotes(value: unknown, handoff: KarthicHandoff): string[] {
    const notes = normalizeStringArray(value);
    if (!handoff.clustered_centroids_or_archetypes_ref.trim()) {
        notes.push('Centroid or archetype reference is missing; rubric was generated without pre-Karthic centroid evidence and should be reviewed.');
    }
    return Array.from(new Set(notes));
}

function flattenIncludedRows(anchorRows: KarthicRubricRow[], emergentRows: KarthicRubricRow[], moduleBudgets: KarthicModuleBudget[]) {
    const rows = [...anchorRows, ...emergentRows].filter((row) => row.include);
    const budgetByModule = new Map(moduleBudgets.map((budget) => [budget.moduleId, budget.finalBudget]));
    return rows.map((row) => ({
        ...row,
        weight: row.lockedWeight,
        lockedWeight: roundToTwo(clampNumber(row.lockedWeight || row.weight || (row.moduleId === 'module0' ? 1 : (budgetByModule.get(row.moduleId) || 1)), 1, 100)),
    }));
}

function normalizeKarthicHandoff(value: unknown, seed: Partial<{
    id: string;
    title: string;
    selectedPack: FrankSofPackId | null;
    routingReason: string;
    sourceArtifacts: ArtifactRecord[];
    intakeChecklist: FrankSourceIntakeChecklist | null;
    sourceExtractionSheet: FrankSourceExtractionSheet | null;
    goldPacketMapping: FrankGoldPacketMapping | null;
    likelyFailureModes: FrankLikelyFailureModes | null;
    benchmarkAnswer: string;
}>): KarthicHandoff {
    const record = isRecord(value) ? value : {};
    const defaults = buildDefaultKarthicHandoff({
        id: seed.id ?? '',
        title: seed.title ?? '',
        selectedPack: seed.selectedPack ?? null,
        routingReason: seed.routingReason ?? '',
        sourceArtifacts: seed.sourceArtifacts ?? [],
        intakeChecklist: seed.intakeChecklist ?? null,
        sourceExtractionSheet: seed.sourceExtractionSheet ?? null,
        goldPacketMapping: seed.goldPacketMapping ?? null,
        likelyFailureModes: seed.likelyFailureModes ?? null,
        benchmarkAnswer: seed.benchmarkAnswer ?? '',
    });
    return {
        packet_id: normalizeNonEmptyString(record.packet_id, defaults.packet_id),
        date_created: normalizeNonEmptyString(record.date_created, defaults.date_created),
        created_by: normalizeNonEmptyString(record.created_by, defaults.created_by),
        source_authority: normalizeNonEmptyString(record.source_authority, defaults.source_authority),
        source_type: normalizeNonEmptyString(record.source_type, defaults.source_type),
        selected_pack: normalizeNonEmptyString(record.selected_pack, defaults.selected_pack),
        doctrine_family: normalizeNonEmptyString(record.doctrine_family, defaults.doctrine_family),
        benchmark_posture: normalizeNonEmptyString(record.benchmark_posture, defaults.benchmark_posture),
        variation_lane: normalizeVariationLane(record.variation_lane),
        source_grounded_vs_generalized: normalizeNonEmptyString(record.source_grounded_vs_generalized, defaults.source_grounded_vs_generalized),
        jurisdiction_assumption: normalizeNonEmptyString(record.jurisdiction_assumption, defaults.jurisdiction_assumption),
        likely_controlling_doctrine: normalizeNonEmptyString(record.likely_controlling_doctrine, defaults.likely_controlling_doctrine),
        required_gate_order: normalizeNonEmptyString(record.required_gate_order, defaults.required_gate_order),
        strongest_expected_counterargument: normalizeNonEmptyString(record.strongest_expected_counterargument, defaults.strongest_expected_counterargument),
        key_jurisdiction_sensitive_points: normalizeStringArray(record.key_jurisdiction_sensitive_points).length > 0
            ? normalizeStringArray(record.key_jurisdiction_sensitive_points)
            : defaults.key_jurisdiction_sensitive_points,
        output_shell: normalizeOutputShell(record.output_shell),
        custom_output_shell_text: normalizeOptionalString(record.custom_output_shell_text, ''),
        gold_answer_ref: normalizeNonEmptyString(record.gold_answer_ref, defaults.gold_answer_ref),
        doctrine_guide_or_pack_ref: normalizeNonEmptyString(record.doctrine_guide_or_pack_ref, defaults.doctrine_guide_or_pack_ref),
        failure_bank_ref: normalizeNonEmptyString(record.failure_bank_ref, defaults.failure_bank_ref),
        clustered_centroids_or_archetypes_ref: normalizeOptionalString(record.clustered_centroids_or_archetypes_ref, defaults.clustered_centroids_or_archetypes_ref),
        human_weight_overrides: normalizeNonEmptyString(record.human_weight_overrides, defaults.human_weight_overrides),
        failure_bank_status: normalizeNonEmptyString(record.failure_bank_status, defaults.failure_bank_status),
        cluster_confidence_or_escalation_flag: normalizeNonEmptyString(record.cluster_confidence_or_escalation_flag, defaults.cluster_confidence_or_escalation_flag),
        packet_readiness: normalizePacketReadiness(record.packet_readiness),
        missing_or_uncertain_items: normalizeStringArray(record.missing_or_uncertain_items),
        zak_review_needed_before_lock: record.zak_review_needed_before_lock === 'Yes' ? 'Yes' : 'No',
        prefill_audit_status: normalizePrefillAuditStatus(record.prefill_audit_status, defaults.prefill_audit_status),
    };
}

function normalizePrefillAuditStatus(value: unknown, fallback: KarthicHandoffAuditStatus): KarthicHandoffAuditStatus {
    const record = isRecord(value) ? value : {};
    return {
        selected_pack: normalizePrefillStatus(record.selected_pack, fallback.selected_pack),
        doctrine_family: normalizePrefillStatus(record.doctrine_family, fallback.doctrine_family),
        jurisdiction_assumption: normalizePrefillStatus(record.jurisdiction_assumption, fallback.jurisdiction_assumption),
        benchmark_posture: normalizePrefillStatus(record.benchmark_posture, fallback.benchmark_posture),
        likely_controlling_doctrine: normalizePrefillStatus(record.likely_controlling_doctrine, fallback.likely_controlling_doctrine),
        required_gate_order: normalizePrefillStatus(record.required_gate_order, fallback.required_gate_order),
        output_shell: normalizePrefillStatus(record.output_shell, fallback.output_shell),
        strongest_expected_counterargument: normalizePrefillStatus(record.strongest_expected_counterargument, fallback.strongest_expected_counterargument),
        gold_answer_ref: normalizePrefillStatus(record.gold_answer_ref, fallback.gold_answer_ref),
        doctrine_guide_or_pack_ref: normalizePrefillStatus(record.doctrine_guide_or_pack_ref, fallback.doctrine_guide_or_pack_ref),
        failure_bank_ref: normalizePrefillStatus(record.failure_bank_ref, fallback.failure_bank_ref),
        variation_lane: normalizePrefillStatus(record.variation_lane, fallback.variation_lane),
        human_weight_overrides: normalizePrefillStatus(record.human_weight_overrides, fallback.human_weight_overrides),
        packet_readiness: normalizePrefillStatus(record.packet_readiness, fallback.packet_readiness),
    };
}

function buildDefaultKarthicHandoff(seed: {
    id: string;
    title: string;
    selectedPack: FrankSofPackId | null;
    routingReason?: string;
    sourceArtifacts?: ArtifactRecord[];
    intakeChecklist?: FrankSourceIntakeChecklist | null;
    sourceExtractionSheet?: FrankSourceExtractionSheet | null;
    goldPacketMapping?: FrankGoldPacketMapping | null;
    likelyFailureModes?: FrankLikelyFailureModes | null;
    benchmarkAnswer?: string;
}): KarthicHandoff {
    const authority = seed.sourceArtifacts?.[0]?.fileName ?? seed.title ?? seed.id;
    const doctrineFamily = seed.goldPacketMapping?.doctrineFamily ?? seed.intakeChecklist?.targetDoctrineFamilyLikelyPack ?? '';
    const benchmarkPosture = seed.goldPacketMapping?.benchmarkPosture ?? seed.intakeChecklist?.benchmarkPosture ?? '';
    const likelyControllingDoctrine = seed.goldPacketMapping?.controllingTrigger ?? '';
    const requiredGateOrder = seed.goldPacketMapping?.requiredGateOrder?.join(' -> ') ?? '';
    const strongestExpectedCounterargument = seed.goldPacketMapping?.likelyJurisdictionSensitivePoints?.[0] ?? '';
    return {
        packet_id: seed.id,
        date_created: new Date().toISOString(),
        created_by: 'Frank v2',
        source_authority: authority,
        source_type: seed.sourceArtifacts?.[0]?.role ?? 'uploaded_authority',
        selected_pack: seed.selectedPack ?? '',
        doctrine_family: doctrineFamily,
        benchmark_posture: String(benchmarkPosture),
        variation_lane: 'A',
        source_grounded_vs_generalized: seed.routingReason ?? '',
        jurisdiction_assumption: seed.sourceExtractionSheet?.jurisdictionForum ?? '',
        likely_controlling_doctrine: likelyControllingDoctrine,
        required_gate_order: requiredGateOrder,
        strongest_expected_counterargument: strongestExpectedCounterargument,
        key_jurisdiction_sensitive_points: seed.goldPacketMapping?.likelyJurisdictionSensitivePoints ?? [],
        output_shell: 'core_cross_pack_v1',
        custom_output_shell_text: '',
        gold_answer_ref: seed.benchmarkAnswer?.trim() ? `packet:${seed.id}:benchmarkAnswer` : '',
        doctrine_guide_or_pack_ref: seed.selectedPack ? `pack:${seed.selectedPack}` : '',
        failure_bank_ref: seed.selectedPack ? `failure-bank:${seed.selectedPack}` : '',
        clustered_centroids_or_archetypes_ref: '',
        human_weight_overrides: 'None',
        failure_bank_status: seed.likelyFailureModes ? 'Ready' : 'Needs work',
        cluster_confidence_or_escalation_flag: '',
        packet_readiness: 'Needs work',
        missing_or_uncertain_items: [],
        zak_review_needed_before_lock: 'No',
        prefill_audit_status: {
            selected_pack: seed.selectedPack ? 'Fixed' : 'Needs human confirmation',
            doctrine_family: doctrineFamily ? 'Fixed' : 'Needs human confirmation',
            jurisdiction_assumption: seed.sourceExtractionSheet?.jurisdictionForum ? 'Fixed but jurisdiction-sensitive' : 'Needs human confirmation',
            benchmark_posture: benchmarkPosture ? 'Fixed' : 'Needs human confirmation',
            likely_controlling_doctrine: likelyControllingDoctrine ? 'Fixed' : 'Needs human confirmation',
            required_gate_order: requiredGateOrder ? 'Fixed' : 'Needs human confirmation',
            output_shell: 'Needs human confirmation',
            strongest_expected_counterargument: strongestExpectedCounterargument ? 'Fixed' : 'Needs human confirmation',
            gold_answer_ref: seed.benchmarkAnswer?.trim() ? 'Fixed' : 'Needs human confirmation',
            doctrine_guide_or_pack_ref: seed.selectedPack ? 'Fixed' : 'Needs human confirmation',
            failure_bank_ref: seed.selectedPack ? 'Fixed' : 'Needs human confirmation',
            variation_lane: 'Fixed',
            human_weight_overrides: 'Fixed',
            packet_readiness: 'Needs human confirmation',
        },
    };
}

function buildUpdatedKarthicHandoff(input: { packet: FrankPacketV2 }) {
    const base = normalizeKarthicHandoff(input.packet.karthicHandoff, {
        id: input.packet.id,
        title: input.packet.title,
        selectedPack: input.packet.selectedPack,
        routingReason: input.packet.routingReason,
        sourceArtifacts: input.packet.sourceArtifacts,
        intakeChecklist: input.packet.intakeChecklist,
        sourceExtractionSheet: input.packet.sourceExtractionSheet,
        goldPacketMapping: input.packet.goldPacketMapping,
        likelyFailureModes: input.packet.likelyFailureModes,
        benchmarkAnswer: input.packet.benchmarkAnswer,
    });
    const updated = {
        ...base,
        packet_id: input.packet.id,
        source_authority: input.packet.sourceArtifacts[0]?.fileName ?? base.source_authority,
        selected_pack: input.packet.selectedPack ?? base.selected_pack,
        doctrine_family: input.packet.goldPacketMapping?.doctrineFamily ?? base.doctrine_family,
        benchmark_posture: String(input.packet.goldPacketMapping?.benchmarkPosture ?? input.packet.intakeChecklist?.benchmarkPosture ?? base.benchmark_posture),
        jurisdiction_assumption: input.packet.sourceExtractionSheet?.jurisdictionForum ?? base.jurisdiction_assumption,
        likely_controlling_doctrine: input.packet.goldPacketMapping?.controllingTrigger ?? base.likely_controlling_doctrine,
        required_gate_order: input.packet.goldPacketMapping?.requiredGateOrder?.join(' -> ') ?? base.required_gate_order,
        key_jurisdiction_sensitive_points: input.packet.goldPacketMapping?.likelyJurisdictionSensitivePoints ?? base.key_jurisdiction_sensitive_points,
        gold_answer_ref: input.packet.benchmarkAnswer.trim() ? `packet:${input.packet.id}:benchmarkAnswer` : base.gold_answer_ref,
        doctrine_guide_or_pack_ref: input.packet.selectedPack ? `pack:${input.packet.selectedPack}` : base.doctrine_guide_or_pack_ref,
        failure_bank_ref: input.packet.selectedPack ? `failure-bank:${input.packet.selectedPack}` : base.failure_bank_ref,
    };
    updated.missing_or_uncertain_items = collectKarthicHandoffMissingItems(updated);
    updated.packet_readiness = updated.missing_or_uncertain_items.length === 0 ? updated.packet_readiness : 'Needs work';
    return updated;
}

function normalizeIntakeChecklist(value: unknown): FrankSourceIntakeChecklist | null {
    if (!isRecord(value)) {
        return null;
    }
    const finalIntakeRating = normalizeIntakeRating(value.finalIntakeRating);
    if (!finalIntakeRating) {
        return null;
    }
    const benchmarkPosture = VALID_BENCHMARK_POSTURES.has(value.benchmarkPosture as BenchmarkPosture)
        ? value.benchmarkPosture as BenchmarkPosture
        : 'generalizable_only_with_supporting_authority';
    return {
        candidateSource: normalizeNonEmptyString(value.candidateSource, 'Uploaded authority'),
        sourceTypeAuthorityLevel: normalizeNonEmptyString(value.sourceTypeAuthorityLevel, 'Unknown authority level'),
        targetDoctrineFamilyLikelyPack: normalizeNonEmptyString(value.targetDoctrineFamilyLikelyPack, 'Unclear doctrine family'),
        cleanLegalIssue: normalizeNonEmptyString(value.cleanLegalIssue, 'Legal issue not extracted.'),
        blackLetterRuleExtractable: normalizeStrength(value.blackLetterRuleExtractable),
        triggerFactsIdentifiable: normalizeStrength(value.triggerFactsIdentifiable),
        holdingUsableForBenchmarkDrafting: normalizeStrength(value.holdingUsableForBenchmarkDrafting),
        limitsBoundariesIdentifiable: normalizeStrength(value.limitsBoundariesIdentifiable),
        proceduralNoiseLevel: normalizeStrength(value.proceduralNoiseLevel),
        jurisdictionSensitivitySplitRisk: normalizeStrength(value.jurisdictionSensitivitySplitRisk),
        benchmarkAnswerSuitability: normalizeStrength(value.benchmarkAnswerSuitability),
        reverseEngineeringSuitabilityLabel: normalizeStrength(value.reverseEngineeringSuitabilityLabel),
        benchmarkPosture,
        failureModeYield: normalizeStrength(value.failureModeYield),
        jdReviewBurden: normalizeStringArray(value.jdReviewBurden),
        finalIntakeRating,
        recommendation: normalizeNonEmptyString(value.recommendation, 'Recommendation unavailable.'),
    };
}

function normalizeSourceExtractionSheet(value: unknown, fallbackPack: FrankSofPackId | null): FrankSourceExtractionSheet | null {
    if (!isRecord(value) || !fallbackPack) {
        return null;
    }
    return {
        selectedDoctrinePack: normalizePackId(value.selectedDoctrinePack) ?? fallbackPack,
        candidateSource: normalizeNonEmptyString(value.candidateSource, 'Uploaded authority'),
        sourceTypeAuthorityLevel: normalizeNonEmptyString(value.sourceTypeAuthorityLevel, 'Unknown authority level'),
        jurisdictionForum: normalizeNonEmptyString(value.jurisdictionForum, 'Jurisdiction not stated'),
        proceduralPosture: normalizeNonEmptyString(value.proceduralPosture, 'Procedural posture not stated'),
        cleanLegalIssue: normalizeNonEmptyString(value.cleanLegalIssue, 'Issue not extracted'),
        blackLetterRule: normalizeNonEmptyString(value.blackLetterRule, 'Rule not extracted'),
        triggerFacts: normalizeStringArray(value.triggerFacts),
        holdingOrBestSupportedAnswerPath: normalizeNonEmptyString(value.holdingOrBestSupportedAnswerPath, 'Holding path not extracted'),
        whyThatResultFollows: normalizeNonEmptyString(value.whyThatResultFollows, 'Reasoning path not extracted'),
        limitsBoundaries: normalizeStringArray(value.limitsBoundaries),
        sourceDoesNotDecide: normalizeStringArray(value.sourceDoesNotDecide),
        jurisdictionSensitivitySplitRisk: normalizeStringArray(value.jurisdictionSensitivitySplitRisk),
        benchmarkUseConfidence: normalizeNonEmptyString(value.benchmarkUseConfidence, 'Confidence not stated'),
        jdReviewNeeded: normalizeStringArray(value.jdReviewNeeded),
    };
}

function normalizeGoldPacketMapping(value: unknown): FrankGoldPacketMapping | null {
    if (!isRecord(value)) {
        return null;
    }
    const benchmarkPosture = value.benchmarkPosture === 'pack_specific_benchmark_only'
        || value.benchmarkPosture === 'portable_benchmark_within_selected_pack'
        || value.benchmarkPosture === 'generalizable_only_with_supporting_authority'
        ? value.benchmarkPosture
        : 'generalizable_only_with_supporting_authority';
    return {
        doctrineFamily: normalizeNonEmptyString(value.doctrineFamily, 'Doctrine family not provided'),
        controllingTrigger: normalizeNonEmptyString(value.controllingTrigger, 'Controlling trigger not provided'),
        requiredGateOrder: normalizeStringArray(value.requiredGateOrder),
        whatMakesDoctrineApply: normalizeStringArray(value.whatMakesDoctrineApply),
        whatDoesNotSatisfyIt: normalizeStringArray(value.whatDoesNotSatisfyIt),
        independentCompetingBarriers: normalizeStringArray(value.independentCompetingBarriers),
        possibleSubstitutesExceptions: normalizeStringArray(value.possibleSubstitutesExceptions),
        limitsOnSubstitutesExceptions: normalizeStringArray(value.limitsOnSubstitutesExceptions),
        likelyJurisdictionSensitivePoints: normalizeStringArray(value.likelyJurisdictionSensitivePoints),
        likelyModelMistakes: normalizeStringArray(value.likelyModelMistakes),
        candidateFactPatternIngredients: normalizeStringArray(value.candidateFactPatternIngredients),
        reverseEngineeringSuitability: normalizeNonEmptyString(value.reverseEngineeringSuitability, 'Reverse-engineering suitability not stated'),
        benchmarkPosture,
    };
}

function normalizeFailureModes(value: unknown): FrankLikelyFailureModes | null {
    if (!isRecord(value)) {
        return null;
    }
    return {
        FM1: normalizeNonEmptyString(value.FM1, 'Failure mode unavailable.'),
        FM2: normalizeNonEmptyString(value.FM2, 'Failure mode unavailable.'),
        FM3: normalizeNonEmptyString(value.FM3, 'Failure mode unavailable.'),
        FM4: normalizeNonEmptyString(value.FM4, 'Failure mode unavailable.'),
        FM5: normalizeNonEmptyString(value.FM5, 'Failure mode unavailable.'),
    };
}

function normalizeArtifacts(value: unknown): ArtifactRecord[] {
    return Array.isArray(value) ? value as ArtifactRecord[] : [];
}

function normalizeStrength(value: unknown) {
    return value === 'Strong' || value === 'Weak' ? value : 'Moderate';
}

function normalizeIntakeRating(value: unknown): IntakeRating | null {
    return value === 'Strong lead source'
        || value === 'Moderate; usable with supporting authority'
        || value === 'Weak; support/contrast source only'
        || value === 'Not a strong gold-source candidate without additional authority'
        ? value
        : null;
}

function normalizePackId(value: unknown): FrankSofPackId | null {
    return typeof value === 'string' && PACK_IDS.has(value as FrankSofPackId) ? value as FrankSofPackId : null;
}

function normalizePrefillStatus(value: unknown, fallback: KarthicPrefillStatus): KarthicPrefillStatus {
    return typeof value === 'string' && PREFILL_STATUSES.has(value as KarthicPrefillStatus)
        ? value as KarthicPrefillStatus
        : fallback;
}

function normalizeVariationLane(value: unknown): KarthicVariationLane {
    return typeof value === 'string' && VARIATION_LANES.has(value as KarthicVariationLane)
        ? value as KarthicVariationLane
        : 'A';
}

function normalizeOutputShell(value: unknown): KarthicOutputShell {
    return typeof value === 'string' && OUTPUT_SHELLS.has(value as KarthicOutputShell)
        ? value as KarthicOutputShell
        : 'core_cross_pack_v1';
}

function normalizePacketReadiness(value: unknown): KarthicPacketReadiness {
    return typeof value === 'string' && PACKET_READINESS.has(value as KarthicPacketReadiness)
        ? value as KarthicPacketReadiness
        : 'Needs work';
}

function normalizeRoutingConfidence(value: unknown): RoutingConfidence | null {
    return value === 'strong' || value === 'moderate' || value === 'weak' ? value : null;
}

function normalizePhase(value: unknown, fallback: FrankPhase): FrankPhase {
    return value === 'source' || value === 'routing_intake' || value === 'extraction_mapping' || value === 'benchmark' || value === 'question'
        ? value
        : fallback;
}

function normalizeRubricRowKeys(value: unknown): RubricRowKey[] {
    return Array.isArray(value)
        ? value.filter((item): item is RubricRowKey => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
        : [];
}

function normalizeRubricRole(value: unknown, fallback: RubricRowRole): RubricRowRole {
    return value === 'controlling' || value === 'secondary' || value === 'fallback' || value === 'cross_cutting'
        ? value
        : fallback;
}

function normalizeDecompositionAction(value: unknown): KarthicDecompositionLogEntry['action'] {
    return value === 'created' || value === 'split' || value === 'merged' || value === 'pruned' || value === 'retained'
        ? value
        : 'retained';
}

function normalizeOpenAiJsonModel(model?: string) {
    return model?.trim() || DEFAULT_OPENAI_JSON_MODEL;
}

function normalizeOpenAiTextModel(model?: string) {
    return model?.trim() || DEFAULT_OPENAI_TEXT_MODEL;
}

function getNestedString(value: Record<string, unknown>, parentKey: string, childKey: string) {
    const parent = value[parentKey];
    if (!isRecord(parent)) {
        return '';
    }
    return typeof parent[childKey] === 'string' ? parent[childKey] : '';
}

function clampNullableAnchorScore(value: unknown, fallback: 0 | 1 | 2 | 3 | 4 | null): 0 | 1 | 2 | 3 | 4 | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return clampNumber(Math.round(value), 0, 4) as 0 | 1 | 2 | 3 | 4;
    }
    return fallback;
}

function normalizeGeneratedText(value: string) {
    return value.replace(/\r/g, '').trim();
}

function normalizeOptionalString(value: unknown, fallback: string) {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNonEmptyString(value: unknown, fallback: string) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }
    return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean);
}

function normalizeClusterScorecards(value: unknown): DashaClusterScorecard[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(isRecord)
        .map((item) => ({
            clusterId: normalizeNonEmptyString(item.clusterId, ''),
            size: Math.max(0, Math.floor(toNumber(item.size, 0))),
            modelBreakdown: Array.isArray(item.modelBreakdown) ? item.modelBreakdown as DashaClusterScorecard['modelBreakdown'] : [],
            rowScores: Array.isArray(item.rowScores) ? item.rowScores as DashaClusterRowScore[] : [],
            moduleSummaries: Array.isArray(item.moduleSummaries) ? item.moduleSummaries as ModuleSummary[] : [],
            subtotal: toNumber(item.subtotal, 0),
            penaltiesApplied: Array.isArray(item.penaltiesApplied) ? item.penaltiesApplied as DashaPenaltyApplication[] : [],
            capStatus: isRecord(item.capStatus)
                ? {
                    code: typeof item.capStatus.code === 'string' ? item.capStatus.code : null,
                    applied: item.capStatus.applied === true,
                    capValue: typeof item.capStatus.capValue === 'number' ? item.capStatus.capValue : null,
                    note: normalizeOptionalString(item.capStatus.note, ''),
                }
                : { code: null, applied: false, capValue: null, note: '' },
            postPenaltyScore: toNumber(item.postPenaltyScore, 0),
            finalScore: toNumber(item.finalScore, 0),
            zakReviewFlag: item.zakReviewFlag === true,
            averageConfidence: typeof item.averageConfidence === 'number' ? item.averageConfidence : null,
            rank: typeof item.rank === 'number' ? item.rank : null,
        }))
        .filter((item) => item.clusterId);
}

function defaultRoleForModule(moduleId: RubricModuleId): RubricRowRole {
    if (moduleId === 'module3') {
        return 'fallback';
    }
    if (moduleId === 'module4') {
        return 'cross_cutting';
    }
    return 'secondary';
}

function defaultScoreAnchors(title: string): RubricRowScoreAnchors {
    return {
        '0': `Absent or materially wrong on ${title.toLowerCase()}; would mislead the outcome.`,
        '1': `Mentions ${title.toLowerCase()} but gets the test, trigger, or application wrong.`,
        '2': `Partly correct on ${title.toLowerCase()} but misses a key element, exception, or application step.`,
        '3': `Mostly correct on ${title.toLowerCase()} with only limited gaps.`,
        '4': `Strong on ${title.toLowerCase()}: correct rule, prioritization, and fact-specific application.`,
    };
}

function toNumber(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function roundToTwo(value: number) {
    return Math.round(value * 100) / 100;
}

function collectKarthicHandoffMissingItems(handoff: KarthicHandoff) {
    const checks: Array<[string, string]> = [
        ['selected_pack', handoff.selected_pack],
        ['doctrine_family', handoff.doctrine_family],
        ['jurisdiction_assumption', handoff.jurisdiction_assumption],
        ['benchmark_posture', handoff.benchmark_posture],
        ['likely_controlling_doctrine', handoff.likely_controlling_doctrine],
        ['required_gate_order', handoff.required_gate_order],
        ['output_shell', handoff.output_shell],
        ['strongest_expected_counterargument', handoff.strongest_expected_counterargument],
        ['gold_answer_ref', handoff.gold_answer_ref],
        ['doctrine_guide_or_pack_ref', handoff.doctrine_guide_or_pack_ref],
        ['failure_bank_ref', handoff.failure_bank_ref],
        ['variation_lane', handoff.variation_lane],
        ['human_weight_overrides', handoff.human_weight_overrides],
    ];
    return checks.filter(([, value]) => !String(value).trim()).map(([key]) => key);
}

function validateKarthicHandoffForGenerationOrThrow(handoff: KarthicHandoff) {
    const missing = collectKarthicHandoffMissingItems(handoff);
    if (missing.length > 0) {
        throw new Error(`Karthic handoff is incomplete. Missing locked fields: ${missing.join(', ')}.`);
    }
}

function validateKarthicHandoffForApprovalOrThrow(handoff: KarthicHandoff) {
    const missing = collectKarthicHandoffMissingItems(handoff);
    if (missing.length > 0) {
        throw new Error(`Karthic handoff is incomplete. Missing locked fields: ${missing.join(', ')}.`);
    }
    const unresolved = Object.entries(handoff.prefill_audit_status)
        .filter(([, status]) => status === 'Needs human confirmation')
        .map(([key]) => key);
    if (unresolved.length > 0) {
        throw new Error(`Karthic handoff still has unresolved audit fields: ${unresolved.join(', ')}.`);
    }
    if (handoff.packet_readiness !== 'Ready') {
        throw new Error('Karthic handoff packet_readiness must be Ready before approval.');
    }
}

function detectAnswerLevelPenalties(input: {
    handoff: KarthicHandoff;
    responseText: string;
    rowScores: DashaClusterRowScore[];
}): DashaPenaltyApplication[] {
    const response = normalizeForSimilarity(input.responseText);
    const penalties: DashaPenaltyApplication[] = [];
    const controllingRow = input.rowScores.find((row) => row.role === 'controlling') ?? input.rowScores.find((row) => row.rowKey === 'C');
    const conclusionRow = input.rowScores.find((row) => row.rowKey === 'J');

    if (controllingRow && (controllingRow.score === null || controllingRow.score <= 1)) {
        penalties.push({ code: 'P_ControllingDoctrineOmitted', points: -15, reason: 'Controlling-doctrine row scored absent or materially wrong.' });
    }
    if (input.handoff.selected_pack.includes('pack') && controllingRow && controllingRow.score === 0) {
        penalties.push({ code: 'P_WrongPackDriver', points: -15, reason: 'Answer appears to be driven by the wrong doctrinal pack.' });
    }
    if (/\bunless\b|\bmaybe\b|\bperhaps\b/.test(response) && input.handoff.variation_lane === 'A') {
        penalties.push({ code: 'P_ExcessiveHedging', points: -5, reason: 'Answer is overly hedged for a Lane A packet.' });
    }
    if (/\bpromissory estoppel\b|\bestoppel\b/.test(response) && !input.handoff.failure_bank_ref.toLowerCase().includes('estoppel')) {
        penalties.push({ code: 'P_RelianceByPerformance', points: -5, reason: 'Fallback reliance theory appears to displace the main doctrinal path.' });
    }
    if (/\bmerchant\b/.test(response) && !input.handoff.selected_pack.includes('pack40')) {
        penalties.push({ code: 'P_IrrelevantDoctrine', points: -5, reason: 'Answer introduces doctrine strongly associated with a different pack.' });
    }
    if (/\bsigned writing\b|\bsignature\b/.test(response) && /\bno writing\b/.test(response)) {
        penalties.push({ code: 'P_MaterialRuleMisstatement', points: -10, reason: 'Answer appears internally inconsistent on the writing/compliance rule.' });
    }
    if (/\bfacts? not given\b|\bif there were more facts\b/.test(response) && input.handoff.variation_lane === 'B') {
        penalties.push({ code: 'P_FalseDefinitenessOnDesignedAmbiguity', points: -10, reason: 'Lane B packet appears mishandled with false definiteness.' });
    }
    if (conclusionRow && (conclusionRow.score === null || conclusionRow.score <= 1)) {
        penalties.push({ code: 'P_MaterialFactOrRoleOrTimelineError', points: -10, reason: 'Conclusion/structure row indicates a materially unstable answer path.' });
    }

    const byCode = new Map<string, DashaPenaltyApplication>();
    for (const penalty of penalties) {
        if (!byCode.has(penalty.code)) {
            byCode.set(penalty.code, penalty);
        }
    }
    return Array.from(byCode.values());
}

function detectCapStatus(input: {
    handoff: KarthicHandoff;
    responseText: string;
    penaltiesApplied: DashaPenaltyApplication[];
    rowScores: DashaClusterRowScore[];
    postPenaltyScore: number;
}): DashaCapStatus {
    if (input.penaltiesApplied.some((item) => item.code === 'P_ControllingDoctrineOmitted')) {
        return { code: 'CAP_60_ControllingDoctrineOmitted', applied: true, capValue: 60, note: 'Controlling doctrine was omitted or materially missed.' };
    }
    if (input.penaltiesApplied.some((item) => item.code === 'P_WrongPackDriver')) {
        return { code: 'CAP_60_WrongPackDriver', applied: true, capValue: 60, note: 'Wrong doctrinal pack appears to control the answer.' };
    }
    const conclusionRow = input.rowScores.find((row) => row.rowKey === 'J');
    if (conclusionRow && conclusionRow.score !== null && conclusionRow.score <= 1) {
        return { code: 'CAP_70_NoClearConclusion', applied: true, capValue: 70, note: 'Answer never reaches a clear bottom line.' };
    }
    if (input.handoff.variation_lane === 'B' && input.penaltiesApplied.some((item) => item.code === 'P_FalseDefinitenessOnDesignedAmbiguity')) {
        return { code: 'CAP_75_FalseDefinitenessOnDesignedAmbiguity', applied: true, capValue: 75, note: 'Lane B ambiguity was treated with false definiteness.' };
    }
    return { code: null, applied: false, capValue: null, note: 'No cap applied.' };
}

function computeAverageConfidence(rowScores: DashaClusterRowScore[]) {
    const scores = rowScores.map((row) => row.confidence).filter((item): item is number => typeof item === 'number');
    return scores.length > 0 ? roundToTwo(scores.reduce((sum, item) => sum + item, 0) / scores.length) : null;
}

function buildZakReviewFlag(input: {
    handoff: KarthicHandoff;
    penaltiesApplied: DashaPenaltyApplication[];
    capStatus: DashaCapStatus;
}) {
    const totalPenaltyLoad = Math.abs(input.penaltiesApplied.reduce((sum, item) => sum + item.points, 0));
    return totalPenaltyLoad > 20
        || input.penaltiesApplied.length >= 2
        || input.capStatus.applied
        || input.handoff.cluster_confidence_or_escalation_flag.trim().length > 0
        || input.handoff.zak_review_needed_before_lock === 'Yes';
}

function capSeverity(capStatus: DashaCapStatus) {
    return capStatus.applied && typeof capStatus.capValue === 'number' ? capStatus.capValue : Number.POSITIVE_INFINITY;
}

function normalizeExtractedText(value: string) {
    return value.replace(/\u0000/g, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeForSimilarity(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function jaccardSimilarity(left: string, right: string) {
    const leftSet = new Set(left.split(' ').filter(Boolean));
    const rightSet = new Set(right.split(' ').filter(Boolean));
    if (leftSet.size === 0 || rightSet.size === 0) {
        return 0;
    }
    let intersection = 0;
    for (const token of leftSet) {
        if (rightSet.has(token)) {
            intersection += 1;
        }
    }
    const union = new Set([...leftSet, ...rightSet]).size;
    return union === 0 ? 0 : intersection / union;
}

function averageSimilarity(responseId: string, members: DashaResponseRecord[], textMap: Map<string, string>) {
    const target = textMap.get(responseId) ?? '';
    if (members.length <= 1) {
        return 1;
    }
    return members
        .filter((member) => member.id !== responseId)
        .reduce((sum, member) => sum + jaccardSimilarity(target, textMap.get(member.id) ?? ''), 0) / (members.length - 1);
}

function safeJsonParse<T = Record<string, unknown>>(value: string) {
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function sanitizeFileName(value: string) {
    return value
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 120);
}

function describeError(error: unknown, fallback: string) {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function requireOpenAiApiKey(operation: string) {
    if (!process.env.OPENAI_API_KEY?.trim()) {
        throw new Error(`${operation} failed: OPENAI_API_KEY is not set.`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getRepoRoot() {
    return path.basename(process.cwd()) === 'frontend' ? path.resolve(process.cwd(), '..') : process.cwd();
}

async function ensureDirectory(directoryKey: keyof typeof DATA_DIRECTORIES | string) {
    const root = path.basename(process.cwd()) === 'frontend'
        ? path.resolve(process.cwd(), '../legal-workflow-data')
        : path.resolve(process.cwd(), 'legal-workflow-data');
    const directory = path.join(root, directoryKey in DATA_DIRECTORIES ? DATA_DIRECTORIES[directoryKey as keyof typeof DATA_DIRECTORIES] : directoryKey);
    await fs.mkdir(directory, { recursive: true });
    return directory;
}

async function listArtifacts<T>(directoryKey: keyof typeof DATA_DIRECTORIES | string) {
    const directory = await ensureDirectory(directoryKey);
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    const items: T[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name) !== '.json') {
            continue;
        }
        const record = await safeReadJson<T>(path.join(directory, entry.name));
        if (record) {
            items.push(record);
        }
    }
    return items.sort((left, right) => String((right as Record<string, unknown>).updatedAt ?? '').localeCompare(String((left as Record<string, unknown>).updatedAt ?? '')));
}

async function readArtifact<T>(directoryKey: keyof typeof DATA_DIRECTORIES | string, id: string) {
    const directory = await ensureDirectory(directoryKey);
    return await safeReadJson<T>(path.join(directory, `${sanitizeFileName(id)}.json`));
}

async function deleteArtifact(directoryKey: keyof typeof DATA_DIRECTORIES | string, id: string) {
    const directory = await ensureDirectory(directoryKey);
    await fs.unlink(path.join(directory, `${sanitizeFileName(id)}.json`)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    });
}

async function writeArtifact<T>(directoryKey: keyof typeof DATA_DIRECTORIES | string, id: string, value: T) {
    const directory = await ensureDirectory(directoryKey);
    await fs.writeFile(path.join(directory, `${sanitizeFileName(id)}.json`), JSON.stringify(value, null, 2), 'utf8');
}

async function safeReadJson<T>(filePath: string) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

async function resolvePythonExecutable() {
    const root = getRepoRoot();
    const candidates = [
        path.join(root, 'lsh', '.venv', 'bin', 'python3'),
        path.join(root, '.venv', 'bin', 'python3'),
    ];
    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }
    return null;
}

async function getRequiredFrankPacket(id: string) {
    const packet = await getFrankPacket(id);
    if (!packet) {
        throw new Error('Frank packet not found.');
    }
    return packet;
}

async function getRequiredKarthicPack(id: string) {
    const pack = await getKarthicRubricPack(id);
    if (!pack) {
        throw new Error('Rubric pack not found.');
    }
    return pack;
}

async function getRequiredDashaRun(id: string) {
    const run = await getDashaRun(id);
    if (!run) {
        throw new Error('Dasha run not found.');
    }
    return run;
}

async function generateModelResponse({ provider, model, systemPrompt, messages, temperature, reasoningEffort }: GenerateModelOptions) {
    if (provider === 'anthropic') {
        return await generateAnthropicResponse({ model, systemPrompt, messages, temperature });
    }
    if (provider === 'gemini') {
        return await generateGeminiResponse({ model, systemPrompt, messages, temperature, reasoningEffort });
    }
    const isResponsesApi = model.startsWith('gpt-5');
    if (isResponsesApi) {
        const request: {
            model: string;
            input: string;
            instructions: string;
            text: { format: { type: 'text' }; verbosity: 'medium' };
            reasoning?: { effort: 'low' | 'medium' | 'high'; summary: 'auto' };
        } = {
            model,
            input: messages.map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`).join('\n'),
            instructions: systemPrompt,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
        };
        const mappedEffort = mapReasoningEffort(reasoningEffort);
        if (mappedEffort) {
            request.reasoning = {
                effort: mappedEffort,
                summary: 'auto',
            };
        }
        const response = await openai.responses.create(request);
        return extractResponsesText(response);
    }
    const response = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature,
    });
    return response.choices[0]?.message?.content || '';
}

async function generateAnthropicResponse(input: {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
}) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set.');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: input.model,
            max_tokens: 2200,
            temperature: input.temperature,
            system: input.systemPrompt,
            messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
        }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error((json as { error?: { message?: string } }).error?.message || 'Anthropic request failed.');
    }
    const parts = Array.isArray((json as { content?: Array<{ text?: string }> }).content)
        ? (json as { content: Array<{ text?: string }> }).content
        : [];
    return parts.map((part) => part.text).filter(Boolean).join('');
}

async function generateGeminiResponse(input: {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort?: ReasoningEffort;
}) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set.');
    }
    const contents = input.messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
    }));
    if (input.systemPrompt.trim()) {
        contents.unshift({ role: 'user', parts: [{ text: `System: ${input.systemPrompt}` }] });
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: input.temperature,
                ...(mapGeminiThinkingLevel(input.model, input.reasoningEffort)
                    ? { thinkingConfig: { thinkingLevel: mapGeminiThinkingLevel(input.model, input.reasoningEffort) } }
                    : {}),
            },
        }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error((json as { error?: { message?: string } }).error?.message || 'Gemini request failed.');
    }
    const candidate = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
    return (candidate?.content?.parts ?? []).map((part) => part.text).filter(Boolean).join('');
}

function mapReasoningEffort(reasoningEffort?: ReasoningEffort) {
    if (!reasoningEffort || reasoningEffort === 'none') {
        return null;
    }
    return reasoningEffort === 'xhigh' ? 'high' : reasoningEffort;
}

function mapGeminiThinkingLevel(model: string, reasoningEffort?: ReasoningEffort) {
    const mapped = mapReasoningEffort(reasoningEffort);
    if (!mapped) {
        return null;
    }
    const supportsOnlyLowHigh = model.includes('pro');
    if (supportsOnlyLowHigh) {
        return mapped === 'low' ? 'low' : 'high';
    }
    return mapped === 'high' ? 'high' : mapped;
}

function extractResponsesText(response: unknown) {
    if (!response || typeof response !== 'object') {
        return '';
    }
    const responseRecord = response as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    if (typeof responseRecord.output_text === 'string') {
        return responseRecord.output_text;
    }
    for (const block of responseRecord.output ?? []) {
        for (const content of block.content ?? []) {
            if (typeof content.text === 'string') {
                return content.text;
            }
        }
    }
    return '';
}
