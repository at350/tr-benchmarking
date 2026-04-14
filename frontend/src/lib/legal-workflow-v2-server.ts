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
    KarthicRubricPackV2,
    KarthicRubricRow,
    ModelProvider,
    ModuleSummary,
    ReasoningEffort,
    RoutingConfidence,
    RubricModuleId,
    RubricRowCentroidEvaluation,
    RubricRowDifference,
    RubricRowGoldenTarget,
    RubricRowKey,
    RubricRowResult,
    WeightedSummary,
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
const ROW_KEYS = new Set<RubricRowKey>(RUBRIC_ROW_SPECS.map((row) => row.key));
const MODULE_IDS = new Set<RubricModuleId>(['module0', 'module1', 'module2', 'module3', 'module4']);

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
            schemaVersion: 2,
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
        schemaVersion: 2,
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

    const rows = normalizeRubricRows(parsed.rows);
    validateRubricRowsOrThrow(rows);
    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const now = new Date().toISOString();
    const pack: KarthicRubricPackV2 = {
        schemaVersion: 2,
        id: existing?.id ?? `karthic_v2_${Date.now()}_${randomUUID().slice(0, 8)}`,
        frankPacketId: frankPacket.id,
        selectedPack: frankPacket.selectedPack,
        questionText: frankPacket.reverseEngineeredQuestion,
        status: existing?.status ?? 'draft',
        rows,
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
    const pack: KarthicRubricPackV2 = {
        schemaVersion: 2,
        id: existing?.id ?? normalizeNonEmptyString(input.id, `karthic_v2_${Date.now()}_${randomUUID().slice(0, 8)}`),
        frankPacketId: frankPacket.id,
        selectedPack: frankPacket.selectedPack as FrankSofPackId,
        questionText: normalizeNonEmptyString(input.questionText, existing?.questionText ?? frankPacket.reverseEngineeredQuestion),
        status: input.status === 'approved' ? 'approved' : existing?.status ?? 'draft',
        rows: normalizeRubricRows(input.rows ?? existing?.rows ?? []),
        savedPrompts: Array.isArray(input.savedPrompts) ? input.savedPrompts : existing?.savedPrompts ?? [],
        comparisonMethodNote: normalizeOptionalString(
            input.comparisonMethodNote,
            existing?.comparisonMethodNote ?? 'Score each cluster representative against the approved row-level rubric rather than against freeform benchmark prose alone.',
        ),
        approvedAt: input.status === 'approved' ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    validateRubricRowsOrThrow(pack.rows);
    if (pack.status === 'approved') {
        if (!pack.questionText.trim()) {
            throw new Error('Question text is required before approving the rubric pack.');
        }
        validateReverseEngineeredQuestionOrThrow(pack.questionText);
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
        schemaVersion: 2,
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
    return RUBRIC_ROW_SPECS
        .map((spec) => {
            const row = pack.rows.find((item) => item.key === spec.key);
            if (!row) {
                return null;
            }
            return [
                `${row.key} ${row.title} (${row.weight})`,
                `Module: ${RUBRIC_MODULE_LABELS[row.moduleId]}`,
                `Description: ${row.description}`,
                `NA guidance: ${row.naGuidance}`,
                `Golden target summary: ${row.goldenTarget.summary}`,
            ].join('\n');
        })
        .filter(Boolean)
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
        const rowResults: RubricRowResult[] = input.run.runMode === 'score_and_cluster'
            ? await evaluateClustersAgainstRows({
                questionText: input.run.questionText,
                pack: input.pack,
                clusters: clusteringResult.clusters,
                responses: validResponses,
            })
            : [];
        const moduleSummaries = buildModuleSummaries(rowResults);
        const weightedSummary = summarizeRowResults(rowResults);

        const completedRun: DashaRunV2 = {
            ...input.run,
            status: 'completed',
            validResponseCount: validResponses.length,
            responses,
            clusters: clusteringResult.clusters,
            rowResults,
            moduleSummaries,
            weightedSummary,
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
        clusteringMethod: 'not_run',
        clusteringNotes: 'Dasha evaluation terminated before clustering completed.',
        errorMessage,
        completedAt: new Date().toISOString(),
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, failedRun.id, failedRun);
    return failedRun;
}

async function evaluateClustersAgainstRows(input: {
    questionText: string;
    pack: KarthicRubricPackV2;
    clusters: DashaClusterRecord[];
    responses: DashaResponseRecord[];
}): Promise<RubricRowResult[]> {
    const responseById = new Map(input.responses.map((response) => [response.id, response]));
    return await Promise.all(input.pack.rows.map(async (row) => {
        const rawCentroidEvaluations = await Promise.all(input.clusters.map(async (cluster) => {
            const representative = responseById.get(cluster.representativeResponseId);
            if (!representative) {
                return null;
            }
            const evaluation = await evaluateRowAgainstResponse({
                row,
                questionText: input.questionText,
                responseText: representative.responseText,
            });
            return {
                clusterId: cluster.id,
                applicabilityStatus: evaluation.applicabilityStatus,
                applicabilityExplanation: evaluation.applicabilityExplanation,
                score: evaluation.score,
                confidence: evaluation.confidence ?? null,
                rationale: evaluation.rationale,
                difference: evaluation.difference,
                metadataTags: evaluation.metadataTags,
            } as RubricRowCentroidEvaluation;
        }));
        const centroidEvaluations = rawCentroidEvaluations.filter((item): item is RubricRowCentroidEvaluation => Boolean(item));

        const winning = chooseWinningCentroid(centroidEvaluations, input.clusters);
        return {
            rowKey: row.key,
            moduleId: row.moduleId,
            rowTitle: row.title,
            weight: row.weight,
            applicabilityStatus: winning?.applicabilityStatus ?? 'not_applicable',
            applicabilityExplanation: winning?.applicabilityExplanation ?? row.naGuidance,
            centroidEvaluations,
            winningCentroidId: winning?.clusterId ?? null,
            winningScore: winning?.score ?? null,
            rationale: winning?.rationale ?? 'No applicable centroid satisfied this row.',
            winningModelMix: winning ? (input.clusters.find((cluster) => cluster.id === winning.clusterId)?.modelBreakdown ?? []) : [],
        } as RubricRowResult;
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
            ? clampNullableScore(parsed.score, fallback.score)
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

function buildModuleSummaries(results: RubricRowResult[]): ModuleSummary[] {
    return Object.entries(RUBRIC_MODULE_LABELS)
        .filter(([moduleId]) => moduleId !== 'module0')
        .map(([moduleId, label]) => {
            const moduleRows = results.filter((result) => result.moduleId === moduleId);
            const applicableRows = moduleRows.filter((row) => row.applicabilityStatus === 'applicable' && typeof row.winningScore === 'number');
            const averageScore = applicableRows.length > 0
                ? roundToTwo(applicableRows.reduce((sum, row) => sum + (row.winningScore ?? 0), 0) / applicableRows.length)
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

function summarizeRowResults(results: RubricRowResult[]): WeightedSummary {
    let weightedTotal = 0;
    let applicableWeightTotal = 0;
    const notApplicableRowKeys: RubricRowKey[] = [];

    for (const result of results) {
        if (result.applicabilityStatus !== 'applicable' || typeof result.winningScore !== 'number') {
            notApplicableRowKeys.push(result.rowKey);
            continue;
        }
        applicableWeightTotal += result.weight;
        weightedTotal += result.weight * result.winningScore;
    }

    return {
        applicableWeightTotal,
        weightedScore: applicableWeightTotal > 0 ? roundToTwo(weightedTotal / applicableWeightTotal) : null,
        notApplicableRowKeys,
    };
}

function chooseWinningCentroid(evaluations: RubricRowCentroidEvaluation[], clusters: DashaClusterRecord[]) {
    const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const applicable = evaluations.filter((evaluation) => evaluation.applicabilityStatus === 'applicable' && typeof evaluation.score === 'number');
    if (applicable.length === 0) {
        return evaluations[0] ?? null;
    }
    return applicable.sort((left, right) => {
        const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
        if (scoreDelta !== 0) {
            return scoreDelta;
        }
        const confidenceDelta = (right.confidence ?? -1) - (left.confidence ?? -1);
        if (confidenceDelta !== 0) {
            return confidenceDelta;
        }
        const sizeDelta = (clusterById.get(right.clusterId)?.size ?? 0) - (clusterById.get(left.clusterId)?.size ?? 0);
        if (sizeDelta !== 0) {
            return sizeDelta;
        }
        return left.clusterId.localeCompare(right.clusterId);
    })[0];
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
        score: applicable ? Math.round(clampNumber(overlap * 240, 15, 96)) : null,
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

function validateRubricRowsOrThrow(rows: KarthicRubricRow[]) {
    if (rows.length !== RUBRIC_ROW_SPECS.length) {
        throw new Error(`Rubric pack must contain exactly ${RUBRIC_ROW_SPECS.length} rows.`);
    }
    for (const spec of RUBRIC_ROW_SPECS) {
        const row = rows.find((item) => item.key === spec.key);
        if (!row) {
            throw new Error(`Rubric pack is missing row ${spec.key}.`);
        }
        if (row.moduleId !== spec.moduleId) {
            throw new Error(`Row ${spec.key} must belong to ${spec.moduleId}.`);
        }
        if (!row.title.trim() || !row.description.trim() || !row.naGuidance.trim()) {
            throw new Error(`Row ${spec.key} is incomplete.`);
        }
        if (!row.goldenTarget.summary.trim() || row.goldenTarget.goldenContains.length === 0 || !row.goldenTarget.comparisonGuidance.trim()) {
            throw new Error(`Row ${spec.key} is missing required golden-target fields.`);
        }
    }
}

function normalizeFrankPacket(value: unknown): FrankPacketV2 | null {
    if (!isRecord(value) || value.schemaVersion !== 2) {
        return null;
    }
    const sourceArtifacts = normalizeArtifacts(value.sourceArtifacts);
    return {
        schemaVersion: 2,
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
        intakeChecklist: normalizeIntakeChecklist(value.intakeChecklist),
        sourceExtractionSheet: normalizeSourceExtractionSheet(value.sourceExtractionSheet, normalizePackId(value.selectedPack)),
        goldPacketMapping: normalizeGoldPacketMapping(value.goldPacketMapping),
        likelyFailureModes: normalizeFailureModes(value.likelyFailureModes),
        benchmarkAnswer: normalizeOptionalString(value.benchmarkAnswer, ''),
        reverseEngineeredQuestion: normalizeOptionalString(value.reverseEngineeredQuestion, ''),
        savedPrompts: Array.isArray(value.savedPrompts) ? value.savedPrompts as FrankPacketV2['savedPrompts'] : [],
        benchmarkWarnings: normalizeStringArray(value.benchmarkWarnings),
        questionWarnings: normalizeStringArray(value.questionWarnings),
        approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeNonEmptyString(value.updatedAt, new Date().toISOString()),
    };
}

function normalizeKarthicRubricPack(value: unknown): KarthicRubricPackV2 | null {
    if (!isRecord(value) || value.schemaVersion !== 2) {
        return null;
    }
    return {
        schemaVersion: 2,
        id: normalizeNonEmptyString(value.id, `karthic_v2_${randomUUID().slice(0, 8)}`),
        frankPacketId: normalizeNonEmptyString(value.frankPacketId, ''),
        selectedPack: normalizePackId(value.selectedPack) ?? 'pack10',
        questionText: normalizeOptionalString(value.questionText, ''),
        status: value.status === 'approved' ? 'approved' : 'draft',
        rows: normalizeRubricRows(value.rows),
        savedPrompts: Array.isArray(value.savedPrompts) ? value.savedPrompts as KarthicRubricPackV2['savedPrompts'] : [],
        comparisonMethodNote: normalizeOptionalString(value.comparisonMethodNote, ''),
        approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeNonEmptyString(value.updatedAt, new Date().toISOString()),
    };
}

function normalizeDashaRun(value: unknown): DashaRunV2 | null {
    if (!isRecord(value) || value.schemaVersion !== 2) {
        return null;
    }
    return {
        schemaVersion: 2,
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
        clusteringMethod: normalizeOptionalString(value.clusteringMethod, 'unknown'),
        clusteringNotes: typeof value.clusteringNotes === 'string' ? value.clusteringNotes : null,
        errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    };
}

function normalizeRubricRows(value: unknown): KarthicRubricRow[] {
    const records = Array.isArray(value) ? value : [];
    const parsedRows = records
        .map((record) => normalizeRubricRow(record))
        .filter((row): row is KarthicRubricRow => Boolean(row));

    const output: KarthicRubricRow[] = [];
    for (const spec of RUBRIC_ROW_SPECS) {
        const parsed = parsedRows.find((row) => row.key === spec.key);
        output.push(parsed ?? {
            key: spec.key,
            moduleId: spec.moduleId,
            title: spec.title,
            description: spec.defaultDescription,
            weight: spec.defaultWeight,
            naGuidance: `Mark row ${spec.key} not applicable only if the question packet does not materially trigger this issue.`,
            goldenTarget: {
                summary: `Assess whether the answer correctly handles ${spec.title.toLowerCase()}.`,
                goldenContains: [`The answer should directly address ${spec.title.toLowerCase()}.`],
                allowedOmissions: [],
                contradictionFlags: [],
                comparisonGuidance: `Compare the centroid against row ${spec.key} as the evaluation lens.`,
            },
        });
    }
    return output;
}

function normalizeRubricRow(value: unknown): KarthicRubricRow | null {
    if (!isRecord(value)) {
        return null;
    }
    const key = typeof value.key === 'string' && ROW_KEYS.has(value.key as RubricRowKey) ? value.key as RubricRowKey : null;
    const moduleId = typeof value.moduleId === 'string' && MODULE_IDS.has(value.moduleId as RubricModuleId) ? value.moduleId as RubricModuleId : null;
    if (!key || !moduleId) {
        return null;
    }
    const spec = RUBRIC_ROW_SPECS.find((row) => row.key === key);
    return {
        key,
        moduleId,
        title: normalizeNonEmptyString(value.title, spec?.title ?? key),
        description: normalizeNonEmptyString(value.description, spec?.defaultDescription ?? ''),
        weight: clampNumber(toNumber(value.weight, spec?.defaultWeight ?? 1), 1, 25),
        naGuidance: normalizeNonEmptyString(value.naGuidance, `Mark row ${key} not applicable only if the question packet does not materially trigger this issue.`),
        goldenTarget: normalizeGoldenTarget(value.goldenTarget),
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
        ? value.filter((item): item is RubricRowKey => typeof item === 'string' && ROW_KEYS.has(item as RubricRowKey))
        : [];
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

function clampNullableScore(value: unknown, fallback: number | null) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return clampNumber(value, 0, 100);
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

function toNumber(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function roundToTwo(value: number) {
    return Math.round(value * 100) / 100;
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
