import 'server-only';

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

import OpenAI from 'openai';

import { buildDashaModelSummaries } from '@/lib/dasha-comparison';
import {
    DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND,
    FRANK_V2_BENCHMARK_HEADING_ALIASES,
    FRANK_V2_BENCHMARK_HEADINGS,
    RUBRIC_MODULE_LABELS,
    RUBRIC_ROW_SPECS,
} from '@/lib/legal-workflow-v2-constants';
import {
    buildDashaClusterFailureModesPrompt,
    buildDashaClusterAuditPrompt,
    buildDashaRowEvaluationPrompt,
    buildFrankBenchmarkPrompt,
    buildFrankExtractionMappingPrompt,
    buildFrankQuestionPrompt,
    buildFrankRoutingIntakePrompt,
    buildKarthicRefineRowsPrompt,
    buildKarthicSeedRowsPrompt,
    buildKarthicRowsPrompt,
    getDashaInstructionBundle,
    getFrankV2AssetBundle,
    getZakInstructionBundle,
} from '@/lib/legal-workflow-v2-prompts';
import {
    buildQuestionVarianceMenuPrompt,
    buildQuestionVariancePackagePrompt,
    buildQuestionVarianceRoutingPrompt,
} from '@/lib/question-variance-prompts';
import type {
    ArtifactRecord,
    ArtifactRole,
    BenchmarkPosture,
    ConfusionPattern,
    DashaAppliedCap,
    DashaAppliedPenalty,
    DashaCaseCitationAnalysis,
    DashaCaseExistenceSummary,
    DashaCitationAccuracyStatus,
    DashaClusterAnalysis,
    DashaClusterRecord,
    DashaComparisonRole,
    DashaJudgeAggregationRule,
    DashaJudgeModelSelection,
    DashaJudgePanelHomogeneityStatus,
    DashaJudgePanelMode,
    DashaJudgeSettings,
    DashaJudgeVoteRecord,
    DashaModelSummary,
    DashaPanelMajorityStatus,
    DashaResponseRecord,
    DashaRunMode,
    DashaRunV2,
    DashaSelectedModel,
    DashaSourceCaseReferenceStatus,
    DashaTrackSummary,
    FrankControllerCard,
    FrankGoldPacketMapping,
    FrankLikelyFailureModes,
    FrankPacketV2,
    FrankPhase,
    FrankGenerationSettings,
    FrankSofPackId,
    FrankSavedPromptKind,
    FrankSourceExtractionSheet,
    FrankSourceIntakeChecklist,
    IntakeRating,
    KarthicCapRule,
    KarthicCaseCitationVerificationMode,
    KarthicPenaltyRule,
    KarthicPreClusterRunV2,
    KarthicRefinementLogEntry,
    KarthicRubricPackV2,
    KarthicRubricRow,
    KarthicRubricTrack,
    KarthicRubricTrackId,
    KarthicScoringPolicy,
    ModelProvider,
    ModuleSummary,
    PromptGenerationSettingsByKind,
    QuestionSource,
    QuestionVarianceMenu,
    QuestionVarianceMenuOption,
    QuestionVariancePackage,
    QuestionVariancePhase,
    QuestionVarianceRoutingResult,
    QuestionVarianceState,
    ReasoningEffort,
    RoutingConfidence,
    RubricModuleId,
    RubricRowCentroidEvaluation,
    RubricRowDifference,
    RubricRowGoldenTarget,
    RubricRowKey,
    RubricRowResult,
    VariationExpectedResultType,
    VariationLane,
    VariationLaneCode,
    VariationPackageStatus,
    VariationProvisionId,
    VariationReuseLevel,
    VariationRouteStatus,
    VariationStatus,
    WeightedSummary,
    ZakDecisionRecord,
    ZakInvocationMode,
    ZakReviewCentroid,
    ZakReviewV1,
    ZakScoringSheetEntry,
} from '@/lib/legal-workflow-v2-types';

const execFileAsync = promisify(execFile);
let pdfWorkerConfigured = false;
let openaiClient: OpenAI | null = null;

const DATA_DIRECTORIES = {
    frank: 'frank-v2-packets',
    karthicPreCluster: 'karthic-v2-pre-cluster-runs',
    karthic: 'karthic-v2-rubric-packs',
    dasha: 'dasha-v2-runs',
    zak: 'zak-v1-reviews',
    artifacts: 'artifacts-v2',
} as const;

const DEFAULT_OPENAI_JSON_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_TEXT_MODEL = 'gpt-5.4-mini';
const DEFAULT_ANTHROPIC_JUDGE_MODEL = 'claude-opus-4-6';
const DEFAULT_GEMINI_JUDGE_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_DASHA_JUDGE_AGGREGATION_RULE: DashaJudgeAggregationRule = 'mean_final_score_then_strict_majority_first_place_votes';
const activeDashaAbortControllers = new Map<string, AbortController>();

class DashaRunCancelledError extends Error {
    constructor(message = 'Dasha run cancelled by user.') {
        super(message);
        this.name = 'DashaRunCancelledError';
    }
}

const DEFAULT_DASHA_JUDGE_SETTINGS: DashaJudgeSettings = {
    provider: 'openai',
    model: DEFAULT_OPENAI_JSON_MODEL,
    reasoningEffort: 'medium',
    selectedJudgeModels: [{
        provider: 'openai',
        model: DEFAULT_OPENAI_JSON_MODEL,
        reasoningEffort: 'medium',
    }],
    panelMode: 'single_model',
    panelSize: 1,
    homogeneityStatus: 'homogeneous',
    aggregationRule: DEFAULT_DASHA_JUDGE_AGGREGATION_RULE,
};
const PACK_IDS = new Set<FrankSofPackId>(['pack10', 'pack20', 'pack30', 'pack40']);
const ROW_KEYS = new Set<RubricRowKey>(RUBRIC_ROW_SPECS.map((row) => row.key));
const MODULE_IDS = new Set<RubricModuleId>(['module0', 'module1', 'module2', 'module3', 'module4']);
const VARIATION_PROVISION_IDS = new Set<VariationProvisionId>(['marriage', 'suretyship', 'one_year', 'land', 'ucc_2201', 'executor']);
const VARIATION_ROUTE_STATUSES = new Set<VariationRouteStatus>(['stable_route', 'multiple_plausible_routes', 'needs_classification_first', 'not_primarily_sof']);
const VARIATION_LANES = new Set<VariationLane>(['lane_a', 'lane_b']);
const VARIATION_REUSE_LEVELS = new Set<VariationReuseLevel>(['reuse_as_is', 'cosmetic_edits_only', 'ambiguity_rewrite_required', 'unsafe']);
const VARIATION_FINAL_STATUSES = new Set<VariationStatus>(['ready', 'needs_targeted_revision', 'unsafe']);
const VARIATION_PACKAGE_STATUSES = new Set<VariationPackageStatus>(['safe', 'unsafe', 'ambiguity_test']);
const VARIATION_EXPECTED_RESULT_TYPES = new Set<VariationExpectedResultType>(['same_likely_outcome', 'same_doctrine_different_fact_salience', 'missing_facts_bounded_uncertainty', 'unsafe_to_vary']);
const VARIATION_CONFUSION_PATTERNS = new Set<ConfusionPattern>(['dual_trigger', 'priority', 'split_transaction', 'needs_classification_first']);
const RUBRIC_QUESTION_SOURCES = new Set<QuestionSource>(['canonical', 'question_variance_active_package']);
const VALID_BENCHMARK_POSTURES = new Set<BenchmarkPosture>([
    'narrow_source_grounded_benchmark_only',
    'generalizable_only_with_supporting_authority',
    'portable_benchmark_under_stated_assumptions',
]);

const DEFAULT_KARTHIC_POLICY_FILES = [
    '08_Karthic_Rubric_Build_Spec_v1.md',
    '09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md',
    '50_Karthic_PreFill_Instructions.rtf',
];

const DEFAULT_KARTHIC_PENALTIES: Array<Omit<KarthicPenaltyRule, 'enabled' | 'notes'>> = [
    {
        code: 'P_ControllingDoctrineOmitted',
        label: 'Controlling doctrine omitted',
        points: 15,
        appliesWhen: 'The answer never identifies the dispositive doctrine or controlling gate.',
    },
    {
        code: 'P_WrongPackDriver',
        label: 'Wrong-pack driver',
        points: 15,
        appliesWhen: 'The answer is materially driven by a doctrine from the wrong pack.',
    },
    {
        code: 'P_MaterialRuleMisstatement',
        label: 'Material rule misstatement',
        points: 10,
        appliesWhen: 'The answer states a black-letter rule or test incorrectly in an outcome-relevant way.',
    },
    {
        code: 'P_MaterialFactOrRoleOrTimelineError',
        label: 'Material fact, role, or timeline error',
        points: 10,
        appliesWhen: 'The answer misstates a key fact, role, quantity, or timing point.',
    },
    {
        code: 'P_InventedComplianceFact',
        label: 'Invented compliance fact',
        points: 10,
        appliesWhen: 'The answer invents a writing, signature, admission, payment, or similar compliance fact.',
    },
    {
        code: 'P_ExceptionBleedOver',
        label: 'Exception bleed-over',
        points: 10,
        appliesWhen: 'The answer uses one exception or workaround to cure a different independent barrier.',
    },
    {
        code: 'P_IrrelevantDoctrine',
        label: 'Irrelevant doctrine',
        points: 5,
        appliesWhen: 'The answer leans on an obviously inapplicable doctrine that distracts from the correct path.',
    },
    {
        code: 'P_ExcessiveHedging',
        label: 'Excessive hedging',
        points: 5,
        appliesWhen: 'The answer substitutes vague uncertainty for actual analysis.',
    },
    {
        code: 'P_RelianceByPerformance',
        label: 'Reliance by performance',
        points: 5,
        appliesWhen: 'The answer treats requested performance alone as reliance or detriment.',
    },
    {
        code: 'P_JurisdictionDrift',
        label: 'Jurisdiction drift',
        points: 5,
        appliesWhen: 'The answer imports a jurisdiction-specific rule without naming the assumption.',
    },
    {
        code: 'P_HallucinatedCaseCitation',
        label: 'Hallucinated case citation',
        points: 10,
        appliesWhen: 'The answer cites a case that cannot be verified as real or gives a materially fabricated citation.',
    },
    {
        code: 'P_FalseDefinitenessOnDesignedAmbiguity',
        label: 'False definiteness on designed ambiguity',
        points: 10,
        appliesWhen: 'Lane B packets omit a control fact, but the answer still forces a definitive result.',
    },
];

const DEFAULT_KARTHIC_CAPS: Array<Omit<KarthicCapRule, 'enabled' | 'notes'>> = [
    {
        code: 'CAP_60_ControllingDoctrineOmitted',
        label: 'Controller miss cap',
        cap: 60,
        appliesWhen: 'Use when the answer misses the most dispositive doctrine or controlling gate.',
    },
    {
        code: 'CAP_60_WrongPackDriver',
        label: 'Wrong-pack cap',
        cap: 60,
        appliesWhen: 'Use when the answer is fundamentally driven by the wrong doctrine family.',
    },
    {
        code: 'CAP_70_NoClearConclusion',
        label: 'No clear conclusion cap',
        cap: 70,
        appliesWhen: 'Use when the answer names key doctrines but never lands on a bottom-line outcome.',
    },
    {
        code: 'CAP_75_InventedCoreCompliance',
        label: 'Invented compliance cap',
        cap: 75,
        appliesWhen: 'Use when the answer depends on a hallucinated compliance fact.',
    },
    {
        code: 'CAP_75_HallucinatedCoreAuthority',
        label: 'Hallucinated authority cap',
        cap: 75,
        appliesWhen: 'Use when the answer’s conclusion depends on a hallucinated case citation.',
    },
    {
        code: 'CAP_75_FalseDefinitenessOnDesignedAmbiguity',
        label: 'False definiteness cap',
        cap: 75,
        appliesWhen: 'Use when Lane B ambiguity is ignored in an outcome-distorting way.',
    },
];

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
    signal?: AbortSignal;
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

export async function deleteFrankPacket(id: string, options?: { cascade?: boolean }) {
    const packet = await getFrankPacket(id);
    if (!packet) {
        throw new Error('Frank packet not found.');
    }

    const rubricRefs = (await listKarthicRubricPacks()).filter((item) => item.frankPacketId === id);
    if (rubricRefs.length > 0 && !options?.cascade) {
        throw new Error('Cannot delete Frank packet while it is linked to a rubric pack.');
    }

    if (options?.cascade) {
        const rubricIds = new Set(rubricRefs.map((item) => item.id));
        const dashaRefs = (await listDashaRuns()).filter((item) => rubricIds.has(item.rubricPackId));
        const dashaIds = new Set(dashaRefs.map((item) => item.id));
        const zakRefs = (await listZakReviews()).filter((item) => dashaIds.has(item.dashaRunId));
        const karthicPreClusterRefs = (await listKarthicPreClusterRuns()).filter((item) => item.frankPacketId === id);

        for (const review of zakRefs) {
            await deleteArtifact(DATA_DIRECTORIES.zak, review.id);
        }
        for (const run of dashaRefs) {
            await deleteUploadedArtifacts(run.id);
            await deleteArtifact(DATA_DIRECTORIES.dasha, run.id);
        }
        for (const pack of rubricRefs) {
            await deleteArtifact(DATA_DIRECTORIES.karthic, pack.id);
        }
        for (const run of karthicPreClusterRefs) {
            await deleteArtifact(DATA_DIRECTORIES.karthicPreCluster, run.id);
        }
    }

    await deleteUploadedArtifacts(id);
    await deleteArtifact(DATA_DIRECTORIES.frank, id);
}

export async function draftFrankPacket(input: {
    title?: string;
    files: UploadFileInput[];
    model?: string;
    reasoningEffort?: ReasoningEffort;
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

        const generationSettings = withUpdatedPromptGenerationSetting(
            undefined,
            'routing_intake_generation',
            input.model,
            input.reasoningEffort,
        );
        const parsed = await generateJson({
            operation: 'Frank v2 routing and intake',
            prompt: buildFrankRoutingIntakePrompt({
                title: input.title?.trim() || sourceArtifacts[0]?.fileName || 'Uploaded authority packet',
                fileNames: sourceArtifacts.map((artifact) => artifact.fileName),
                sourceText,
            }),
            model: generationSettings.routing_intake_generation?.model,
            reasoningEffort: generationSettings.routing_intake_generation?.reasoningEffort,
        });

        const intakeChecklist = normalizeIntakeChecklist(parsed.intakeChecklist);
        const packet: FrankPacketV2 = withDerivedControllerCard({
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
            controllerCard: null,
            likelyFailureModes: null,
            benchmarkAnswer: '',
            reverseEngineeredQuestion: '',
            questionVariance: createEmptyQuestionVarianceState(),
            generationSettings,
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
        });

        await writeArtifact(DATA_DIRECTORIES.frank, packet.id, packet);
        return packet;
    } catch (error) {
        await deleteUploadedArtifacts(id).catch(() => undefined);
        throw error;
    }
}

export async function draftFrankPacketFromTemplate(input: {
    templatePacketId: string;
    title?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}): Promise<FrankPacketV2> {
    const templatePacket = await getRequiredFrankPacket(input.templatePacketId);
    if (templatePacket.sourceArtifacts.length === 0) {
        throw new Error('Selected benchmark template does not contain any source artifacts.');
    }

    const files = await Promise.all(templatePacket.sourceArtifacts.map(async (artifact) => ({
        role: artifact.role,
        fileName: artifact.fileName,
        bytes: new Uint8Array(await fs.readFile(artifact.storedPath)),
    })));

    return await draftFrankPacket({
        title: input.title?.trim() || templatePacket.title,
        files,
        model: input.model,
        reasoningEffort: input.reasoningEffort,
    });
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
    const generationSettings = withUpdatedPromptGenerationSetting(
        packet.generationSettings,
        'extraction_mapping_generation',
        input.model,
        input.reasoningEffort,
    );
    const parsed = await generateJson({
        operation: 'Frank v2 extraction and mapping',
        prompt,
        model: generationSettings.extraction_mapping_generation?.model,
        reasoningEffort: generationSettings.extraction_mapping_generation?.reasoningEffort,
    });
    const sourceExtractionSheet = normalizeSourceExtractionSheet(parsed.sourceExtractionSheet, packet.selectedPack);
    const goldPacketMapping = normalizeGoldPacketMapping(parsed.goldPacketMapping);
    const likelyFailureModes = normalizeFailureModes(parsed.likelyFailureModes);

    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        phase: 'extraction_mapping',
        sourceExtractionSheet,
        goldPacketMapping,
        likelyFailureModes,
        generationSettings,
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
    });

    validateFrankExtractionMappingOrThrow({
        sourceExtractionSheet,
        goldPacketMapping,
        controllerCard: nextPacket.controllerCard,
        likelyFailureModes,
    });
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
    const generationSettings = withUpdatedPromptGenerationSetting(
        packet.generationSettings,
        'benchmark_generation',
        input.model,
        input.reasoningEffort,
    );
    const benchmarkAnswer = normalizeGeneratedText(await generateText({
        operation: 'Frank v2 benchmark answer',
        prompt,
        model: generationSettings.benchmark_generation?.model,
        reasoningEffort: generationSettings.benchmark_generation?.reasoningEffort,
    }));

    validateBenchmarkAnswerOrThrow(benchmarkAnswer);
    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        phase: 'benchmark',
        benchmarkAnswer,
        benchmarkWarnings: collectBenchmarkWarnings(benchmarkAnswer),
        generationSettings,
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
    });
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
    const generationSettings = withUpdatedPromptGenerationSetting(
        packet.generationSettings,
        'question_generation',
        input.model,
        input.reasoningEffort,
    );
    const questionText = normalizeGeneratedText(await generateText({
        operation: 'Frank v2 reverse-engineered question',
        prompt,
        model: generationSettings.question_generation?.model,
        reasoningEffort: generationSettings.question_generation?.reasoningEffort,
    }));

    validateReverseEngineeredQuestionOrThrow(questionText);
    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        phase: 'question',
        reverseEngineeredQuestion: questionText,
        questionWarnings: collectQuestionWarnings(questionText),
        generationSettings,
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
    });
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function generateQuestionVarianceRoutingAndMenu(input: {
    id: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    validateQuestionVariancePrerequisitesOrThrow(packet);

    const sourceText = buildSourceText(packet.sourceArtifacts, 22000);
    const routingPrompt = await buildQuestionVarianceRoutingPrompt({ packet, sourceText });
    const generationSettings = withUpdatedPromptGenerationSetting(
        packet.generationSettings,
        'question_variance_routing_menu_generation',
        input.model,
        input.reasoningEffort,
    );
    const routingParsed = await generateJson({
        operation: 'QuestionVariance routing and readiness',
        prompt: routingPrompt,
        model: generationSettings.question_variance_routing_menu_generation?.model,
        reasoningEffort: generationSettings.question_variance_routing_menu_generation?.reasoningEffort,
    });
    const routingResult = normalizeQuestionVarianceRoutingResult(routingParsed.routingResult);
    validateQuestionVarianceRoutingOrThrow(routingResult);
    if (!routingResult) {
        throw new Error('QuestionVariance routing returned an invalid payload.');
    }

    const nextSavedPrompts = [
        ...packet.savedPrompts,
        {
            id: `prompt_${randomUUID().slice(0, 8)}`,
            kind: 'question_variance_routing_menu_generation' as const,
            title: `QuestionVariance routing + menu prompt · ${new Date().toLocaleString()}`,
            prompt: routingPrompt,
            createdAt: new Date().toISOString(),
        },
    ];

    let nextQuestionVariance: QuestionVarianceState = {
        ...normalizeQuestionVarianceState(packet.questionVariance),
        phase: 'routing',
        routingResult,
        warnings: [],
    };

    if (routingResult.routeStatus !== 'stable_route' || !routingResult.primaryProvisionCandidate) {
        nextQuestionVariance = {
            ...nextQuestionVariance,
            menu: null,
            packages: [],
            activePackageId: null,
            warnings: routingResult.routeStatus === 'not_primarily_sof'
                ? ['QuestionVariance routing determined that this packet is not primarily a Statute of Frauds variation candidate.']
                : [],
        };
    } else {
        const menuPrompt = await buildQuestionVarianceMenuPrompt({
            packet: {
                ...packet,
                questionVariance: nextQuestionVariance,
            },
        });
        const menuParsed = await generateJson({
            operation: 'QuestionVariance menu generation',
            prompt: menuPrompt,
            model: generationSettings.question_variance_routing_menu_generation?.model,
            reasoningEffort: generationSettings.question_variance_routing_menu_generation?.reasoningEffort,
        });
        const menu = normalizeQuestionVarianceMenu(menuParsed.menu);
        validateQuestionVarianceMenuOrThrow(menu);
        if (!menu) {
            throw new Error('QuestionVariance menu returned an invalid payload.');
        }
        const filteredPackages = retainPackagesForMenu(nextQuestionVariance.packages, menu.options);
        const activePackageId = filteredPackages.some((pkg) => pkg.id === nextQuestionVariance.activePackageId)
            ? nextQuestionVariance.activePackageId
            : null;
        const warnings = menu.options.length === 0
            ? ['QuestionVariance routing was stable, but no safe variation options were generated for this packet.']
            : [];
        nextQuestionVariance = {
            ...nextQuestionVariance,
            phase: 'menu',
            menu,
            packages: filteredPackages,
            activePackageId,
            warnings,
        };
        nextSavedPrompts.push({
            id: `prompt_${randomUUID().slice(0, 8)}`,
            kind: 'question_variance_routing_menu_generation',
            title: `QuestionVariance menu prompt · ${new Date().toLocaleString()}`,
            prompt: menuPrompt,
            createdAt: new Date().toISOString(),
        });
    }

    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        questionVariance: nextQuestionVariance,
        generationSettings,
        savedPrompts: nextSavedPrompts,
        updatedAt: new Date().toISOString(),
    });
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function generateQuestionVariancePackage(input: {
    id: string;
    optionId: string;
    selectedSwapIds?: string[];
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    validateQuestionVariancePrerequisitesOrThrow(packet);
    const questionVariance = normalizeQuestionVarianceState(packet.questionVariance);
    const routingResult = questionVariance.routingResult;
    if (!routingResult || routingResult.routeStatus !== 'stable_route') {
        throw new Error('QuestionVariance package generation requires a stable routing result first.');
    }
    if (!questionVariance.menu) {
        throw new Error('Generate the QuestionVariance menu before generating a package.');
    }
    const option = questionVariance.menu.options.find((item) => item.id === input.optionId);
    if (!option) {
        throw new Error('Selected QuestionVariance option is not present in the current menu.');
    }
    const selectedSwapIds = normalizeSelectedQuestionVarianceSwapIds(input.selectedSwapIds, option.exactSwapOptions);
    if (option.exactSwapOptions.length > 0 && selectedSwapIds.length === 0) {
        throw new Error('Select at least one exact variation before generating the package.');
    }
    const selectedSwapOptions = option.exactSwapOptions.filter((item) => selectedSwapIds.includes(item.id));

    const prompt = await buildQuestionVariancePackagePrompt({ packet, option, selectedSwapOptions });
    const generationSettings = withUpdatedPromptGenerationSetting(
        packet.generationSettings,
        'question_variance_package_generation',
        input.model,
        input.reasoningEffort,
    );
    const parsed = await generateJson({
        operation: 'QuestionVariance package generation',
        prompt,
        model: generationSettings.question_variance_package_generation?.model,
        reasoningEffort: generationSettings.question_variance_package_generation?.reasoningEffort,
    });
    const normalizedPackage = normalizeQuestionVariancePackage(parsed.package, option.id, option, selectedSwapIds);
    validateQuestionVariancePackageOrThrow(normalizedPackage);
    if (!normalizedPackage) {
        throw new Error('QuestionVariance package returned an invalid payload.');
    }

    const nextPackageSignature = buildQuestionVariancePackageSignature(option.id, selectedSwapIds);
    const existingPackages = questionVariance.packages.filter((item) =>
        buildQuestionVariancePackageSignature(item.selectedOptionId, item.selectedSwapOptionIds) !== nextPackageSignature,
    );
    const nextPackage: QuestionVariancePackage = {
        ...normalizedPackage,
        id: `qv_pkg_${randomUUID().slice(0, 8)}`,
        selectedOptionId: option.id,
        laneCode: option.laneCode,
        selectedSwapOptionIds: selectedSwapIds,
        createdAt: new Date().toISOString(),
    };

    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        questionVariance: {
            ...questionVariance,
            phase: 'package',
            packages: sortVariationPackagesByNewest([...existingPackages, nextPackage]),
            activePackageId: nextPackage.id,
        },
        generationSettings,
        savedPrompts: [
            ...packet.savedPrompts,
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'question_variance_package_generation',
                title: `QuestionVariance package prompt · ${new Date().toLocaleString()}`,
                prompt,
                createdAt: new Date().toISOString(),
            },
        ],
        updatedAt: new Date().toISOString(),
    });
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function setActiveQuestionVariancePackage(input: {
    id: string;
    packageId: string;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    const questionVariance = normalizeQuestionVarianceState(packet.questionVariance);
    if (!questionVariance.packages.some((item) => item.id === input.packageId)) {
        throw new Error('QuestionVariance package not found.');
    }
    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        questionVariance: {
            ...questionVariance,
            activePackageId: input.packageId,
        },
        updatedAt: new Date().toISOString(),
    });
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function clearQuestionVarianceMenu(input: {
    id: string;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    const questionVariance = normalizeQuestionVarianceState(packet.questionVariance);
    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        questionVariance: {
            ...questionVariance,
            phase: 'routing',
            menu: null,
            packages: [],
            activePackageId: null,
            warnings: [],
        },
        updatedAt: new Date().toISOString(),
    });
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function clearQuestionVariancePackage(input: {
    id: string;
    packageId?: string;
}) {
    const packet = await getRequiredFrankPacket(input.id);
    const questionVariance = normalizeQuestionVarianceState(packet.questionVariance);
    const packageId = input.packageId?.trim();
    const packages = packageId
        ? questionVariance.packages.filter((item) => item.id !== packageId)
        : [];
    const nextPacket: FrankPacketV2 = withDerivedControllerCard({
        ...packet,
        questionVariance: {
            ...questionVariance,
            phase: questionVariance.menu ? 'menu' : 'routing',
            packages,
            activePackageId: packages.some((item) => item.id === questionVariance.activePackageId)
                ? questionVariance.activePackageId
                : null,
        },
        updatedAt: new Date().toISOString(),
    });
    await writeArtifact(DATA_DIRECTORIES.frank, nextPacket.id, nextPacket);
    return nextPacket;
}

export async function saveFrankPacket(input: Partial<FrankPacketV2> & { id?: string }) {
    const existing = input.id ? await getFrankPacket(input.id) : null;
    const now = new Date().toISOString();
    const packet: FrankPacketV2 = withDerivedControllerCard({
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
        controllerCard: null,
        likelyFailureModes: normalizeFailureModes(input.likelyFailureModes ?? existing?.likelyFailureModes),
        benchmarkAnswer: normalizeOptionalString(input.benchmarkAnswer, existing?.benchmarkAnswer ?? ''),
        reverseEngineeredQuestion: normalizeOptionalString(input.reverseEngineeredQuestion, existing?.reverseEngineeredQuestion ?? ''),
        questionVariance: normalizeQuestionVarianceState(input.questionVariance ?? existing?.questionVariance),
        savedPrompts: Array.isArray(input.savedPrompts) ? input.savedPrompts : existing?.savedPrompts ?? [],
        generationSettings: normalizePromptGenerationSettings(input.generationSettings ?? existing?.generationSettings),
        benchmarkWarnings: normalizeStringArray(input.benchmarkWarnings ?? existing?.benchmarkWarnings ?? []),
        questionWarnings: normalizeStringArray(input.questionWarnings ?? existing?.questionWarnings ?? []),
        approvedAt: input.status === 'approved' ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    });

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

export async function listKarthicPreClusterRuns() {
    const items = await listArtifacts<Record<string, unknown>>(DATA_DIRECTORIES.karthicPreCluster);
    return items
        .map((item) => normalizeKarthicPreClusterRun(item))
        .filter((item): item is KarthicPreClusterRunV2 => Boolean(item));
}

export async function getKarthicPreClusterRun(id: string) {
    const item = await readArtifact<Record<string, unknown>>(DATA_DIRECTORIES.karthicPreCluster, id);
    return item ? normalizeKarthicPreClusterRun(item) : null;
}

export async function runKarthicPreCluster(input: {
    frankPacketId: string;
    selectedModels: DashaSelectedModel[];
    sampleCount: number;
}) {
    const frankPacket = await getRequiredFrankPacket(input.frankPacketId);
    if (frankPacket.status !== 'approved') {
        throw new Error('Frank packet must be approved before pre-Karthic clustering can start.');
    }
    if (!frankPacket.reverseEngineeredQuestion.trim()) {
        throw new Error('Frank packet is missing the reverse-engineered question.');
    }

    const id = `karthic_precluster_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const draftRun: KarthicPreClusterRunV2 = {
        schemaVersion: 2,
        id,
        frankPacketId: frankPacket.id,
        questionText: frankPacket.reverseEngineeredQuestion,
        status: 'draft',
        selectedModels: input.selectedModels,
        requestedResponseCount: clampNumber(Math.floor(toNumber(input.sampleCount, 24)), 1, 120),
        validResponseCount: 0,
        responses: [],
        clusters: [],
        clusterFailureModes: [],
        clusteringMethod: 'pending',
        clusteringNotes: 'Pre-Karthic clustering started.',
        createdAt: now,
        completedAt: null,
    };
    await writeArtifact(DATA_DIRECTORIES.karthicPreCluster, draftRun.id, draftRun);

    try {
        const responses = await generateDashaResponses(
            frankPacket.reverseEngineeredQuestion,
            input.selectedModels,
            draftRun.requestedResponseCount,
        );
        const validResponses = responses.filter((response) => !response.error && response.responseText.trim());
        if (validResponses.length === 0) {
            const failedRun: KarthicPreClusterRunV2 = {
                ...draftRun,
                status: 'failed',
                errorMessage: 'No valid model responses were generated during pre-Karthic clustering.',
                clusteringMethod: 'not_run',
                clusteringNotes: 'Pre-Karthic clustering terminated before any clusters were generated.',
                completedAt: new Date().toISOString(),
            };
            await writeArtifact(DATA_DIRECTORIES.karthicPreCluster, failedRun.id, failedRun);
            return failedRun;
        }

        const clusteringResult = await clusterResponses(validResponses);
        const clusterFailureModes = await deriveClusterFailureModes({
            benchmarkAnswer: frankPacket.benchmarkAnswer,
            likelyFailureModes: frankPacket.likelyFailureModes,
            clusters: clusteringResult.clusters,
        });

        const completedRun: KarthicPreClusterRunV2 = {
            ...draftRun,
            status: 'completed',
            validResponseCount: validResponses.length,
            responses,
            clusters: clusteringResult.clusters,
            clusterFailureModes,
            clusteringMethod: clusteringResult.method,
            clusteringNotes: clusteringResult.notes,
            completedAt: new Date().toISOString(),
        };
        await writeArtifact(DATA_DIRECTORIES.karthicPreCluster, completedRun.id, completedRun);
        return completedRun;
    } catch (error) {
        const failedRun: KarthicPreClusterRunV2 = {
            ...draftRun,
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Failed to complete pre-Karthic clustering.',
            clusteringMethod: 'failed',
            clusteringNotes: 'Pre-Karthic clustering failed before completion.',
            completedAt: new Date().toISOString(),
        };
        await writeArtifact(DATA_DIRECTORIES.karthicPreCluster, failedRun.id, failedRun);
        return failedRun;
    }
}

export async function seedKarthicRubricPack(input: {
    frankPacketId: string;
    preClusterRunId?: string;
    id?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const frankPacket = await getRequiredFrankPacket(input.frankPacketId);
    if (frankPacket.status !== 'approved') {
        throw new Error('Frank packet must be approved before generating a seed rubric pack.');
    }
    if (!frankPacket.selectedPack) {
        throw new Error('Frank packet is missing a selected pack.');
    }
    const assets = await getFrankV2AssetBundle(frankPacket.selectedPack);
    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const generationSettings = withUpdatedPromptGenerationSetting(
        existing?.generationSettings,
        'rubric_generation',
        input.model,
        input.reasoningEffort,
    );
    const scoringPolicy = existing?.scoringPolicy ?? createDefaultKarthicScoringPolicy(frankPacket.controllerCard);
    const selectedVariationPackage = getActiveQuestionVariancePackage(frankPacket);
    const shouldBuildSelectedVariationTrack = frankPacket.controllerCard?.dual_rubric_mode === 'on' && Boolean(selectedVariationPackage);
    const [basePrompt, selectedVariationPrompt] = await Promise.all([
        buildKarthicSeedRowsPrompt({
            packet: frankPacket,
            assets,
            questionText: frankPacket.reverseEngineeredQuestion,
            benchmarkAnswer: frankPacket.benchmarkAnswer,
            questionSourceLabel: 'Canonical reverse-engineered question',
            trackLabel: 'Original question',
            scoringPolicy,
        }),
        shouldBuildSelectedVariationTrack && selectedVariationPackage
            ? buildKarthicSeedRowsPrompt({
                packet: frankPacket,
                assets,
                questionText: selectedVariationPackage.variedLegalQuestion,
                benchmarkAnswer: selectedVariationPackage.updatedModelAnswer,
                questionSourceLabel: 'Selected variation question',
                trackLabel: 'Selected variation',
                scoringPolicy,
                selectedVariationPackage,
            })
            : Promise.resolve(null),
    ]);
    const [baseParsed, selectedVariationParsed] = await Promise.all([
        generateJson({
            operation: 'Karthic v2 seed rubric generation',
            prompt: basePrompt,
            model: generationSettings.rubric_generation?.model,
            reasoningEffort: generationSettings.rubric_generation?.reasoningEffort,
        }),
        selectedVariationPrompt
            ? generateJson({
                operation: 'Karthic v2 selected-variation seed rubric generation',
                prompt: selectedVariationPrompt,
                model: generationSettings.rubric_generation?.model,
                reasoningEffort: generationSettings.rubric_generation?.reasoningEffort,
            })
            : Promise.resolve(null),
    ]);
    const baseRows = normalizeRubricRows(baseParsed.rows);
    validateRubricRowsOrThrow(baseRows);

    let selectedVariationRows: KarthicRubricRow[] | undefined;
    if (selectedVariationParsed) {
        selectedVariationRows = normalizeRubricRows(selectedVariationParsed.rows);
        validateRubricRowsOrThrow(selectedVariationRows);
    }

    const now = new Date().toISOString();
    const tracks = createKarthicRubricTracks(frankPacket, {
        baseRows,
        baseSeedRows: baseRows,
        selectedVariationRows,
        selectedVariationSeedRows: selectedVariationRows,
    });
    const pack = withActiveRubricTrackAliases({
        schemaVersion: 2,
        id: existing?.id ?? `karthic_v2_${Date.now()}_${randomUUID().slice(0, 8)}`,
        frankPacketId: frankPacket.id,
        preClusterRunId: normalizeNullableString(input.preClusterRunId) ?? existing?.preClusterRunId ?? null,
        selectedPack: frankPacket.selectedPack,
        controllerCard: buildKarthicWorkflowControllerCard(frankPacket.controllerCard, scoringPolicy, existing?.status ?? 'draft'),
        activeTrack: existing?.activeTrack ?? 'base',
        tracks,
        questionSource: 'canonical',
        questionVariancePackageId: null,
        questionText: '',
        status: existing?.status ?? 'draft',
        seedRows: [],
        rows: [],
        scoringPolicy,
        clusterFailureModes: flattenLikelyFailureModes(frankPacket.likelyFailureModes),
        refinementLog: existing?.refinementLog ?? [],
        refinementStatus: 'seeded',
        generationSettings,
        savedPrompts: [
            ...(existing?.savedPrompts ?? []),
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'rubric_generation',
                title: `Seed base rubric prompt · ${new Date().toLocaleString()}`,
                prompt: basePrompt,
                createdAt: now,
            },
            ...(selectedVariationPrompt ? [{
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'rubric_generation' as const,
                title: `Seed variation rubric prompt · ${new Date().toLocaleString()}`,
                prompt: selectedVariationPrompt,
                createdAt: now,
            }] : []),
        ],
        comparisonMethodNote: normalizeNonEmptyString(
            baseParsed.comparisonMethodNote,
            existing?.comparisonMethodNote ?? 'Use benchmark-vs-centroid contrasts to keep only discriminative rubric rows.',
        ),
        approvedAt: existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    } satisfies KarthicRubricPackV2);
    await writeArtifact(DATA_DIRECTORIES.karthic, pack.id, pack);
    return pack;
}

export async function refineKarthicRubricPack(input: {
    id: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
}) {
    const existing = await getRequiredKarthicPack(input.id);
    const frankPacket = await getRequiredFrankPacket(existing.frankPacketId);
    if (!frankPacket.selectedPack) {
        throw new Error('Frank packet is missing a selected pack.');
    }
    const assets = await getFrankV2AssetBundle(frankPacket.selectedPack);
    const generationSettings = withUpdatedPromptGenerationSetting(
        existing.generationSettings,
        'rubric_generation',
        input.model,
        input.reasoningEffort,
    );
    const selectedVariationPackage = getActiveQuestionVariancePackage(frankPacket);
    const shouldRefineSelectedVariationTrack = Boolean(existing.tracks.selected_variation && selectedVariationPackage);
    const [basePrompt, selectedVariationPrompt] = await Promise.all([
        buildKarthicRefineRowsPrompt({
            packet: frankPacket,
            assets,
            questionText: existing.tracks.base.questionText,
            benchmarkAnswer: existing.tracks.base.benchmarkAnswer,
            trackLabel: existing.tracks.base.label,
            scoringPolicy: existing.scoringPolicy,
            currentRows: existing.tracks.base.rows,
        }),
        shouldRefineSelectedVariationTrack && selectedVariationPackage
            ? buildKarthicRefineRowsPrompt({
                packet: frankPacket,
                assets,
                questionText: existing.tracks.selected_variation!.questionText,
                benchmarkAnswer: existing.tracks.selected_variation!.benchmarkAnswer,
                trackLabel: existing.tracks.selected_variation!.label,
                scoringPolicy: existing.scoringPolicy,
                selectedVariationPackage,
                currentRows: existing.tracks.selected_variation!.rows,
            })
            : Promise.resolve(null),
    ]);
    const [baseParsed, selectedVariationParsed] = await Promise.all([
        generateJson({
            operation: 'Karthic v2 rubric refinement',
            prompt: basePrompt,
            model: generationSettings.rubric_generation?.model,
            reasoningEffort: generationSettings.rubric_generation?.reasoningEffort,
        }),
        selectedVariationPrompt
            ? generateJson({
                operation: 'Karthic v2 selected-variation rubric refinement',
                prompt: selectedVariationPrompt,
                model: generationSettings.rubric_generation?.model,
                reasoningEffort: generationSettings.rubric_generation?.reasoningEffort,
            })
            : Promise.resolve(null),
    ]);
    const baseRows = normalizeRubricRows(baseParsed.rows);
    validateRubricRowsOrThrow(baseRows);
    const baseRefinementLog = normalizeKarthicRefinementLog(baseParsed.refinementLog);
    let selectedVariationRows = existing.tracks.selected_variation?.rows;
    if (selectedVariationParsed) {
        selectedVariationRows = normalizeRubricRows(selectedVariationParsed.rows);
        validateRubricRowsOrThrow(selectedVariationRows);
    }
    const now = new Date().toISOString();
    const updatedTracks = createKarthicRubricTracks(frankPacket, {
        baseRows,
        baseSeedRows: existing.tracks.base.seedRows,
        selectedVariationRows,
        selectedVariationSeedRows: existing.tracks.selected_variation?.seedRows,
    });
    const pack = withActiveRubricTrackAliases({
        ...existing,
        controllerCard: buildKarthicWorkflowControllerCard(frankPacket.controllerCard, existing.scoringPolicy, existing.status),
        tracks: updatedTracks,
        clusterFailureModes: flattenLikelyFailureModes(frankPacket.likelyFailureModes),
        refinementLog: baseRefinementLog.length > 0 ? baseRefinementLog : buildFallbackRefinementLog(existing.tracks.base.rows, baseRows),
        refinementStatus: 'refined',
        generationSettings,
        savedPrompts: [
            ...existing.savedPrompts,
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'rubric_generation',
                title: `Refine base rubric prompt · ${new Date().toLocaleString()}`,
                prompt: basePrompt,
                createdAt: now,
            },
            ...(selectedVariationPrompt ? [{
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'rubric_generation' as const,
                title: `Refine variation rubric prompt · ${new Date().toLocaleString()}`,
                prompt: selectedVariationPrompt,
                createdAt: now,
            }] : []),
        ],
        comparisonMethodNote: normalizeNonEmptyString(
            baseParsed.comparisonMethodNote,
            existing.comparisonMethodNote || 'Use benchmark-vs-centroid contrasts to keep only discriminative rubric rows.',
        ),
        updatedAt: now,
    } satisfies KarthicRubricPackV2);
    await writeArtifact(DATA_DIRECTORIES.karthic, pack.id, pack);
    return pack;
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
    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const generationSettings = withUpdatedPromptGenerationSetting(
        existing?.generationSettings,
        'rubric_generation',
        input.model,
        input.reasoningEffort,
    );
    const scoringPolicy = existing?.scoringPolicy ?? createDefaultKarthicScoringPolicy(frankPacket.controllerCard);
    const basePrompt = await buildKarthicRowsPrompt({
        packet: frankPacket,
        assets,
        questionText: frankPacket.reverseEngineeredQuestion,
        benchmarkAnswer: frankPacket.benchmarkAnswer,
        questionSourceLabel: 'Canonical reverse-engineered question',
        trackLabel: 'Original question',
        scoringPolicy,
    });
    const baseParsed = await generateJson({
        operation: 'Karthic v2 row rubric generation',
        prompt: basePrompt,
        model: generationSettings.rubric_generation?.model,
        reasoningEffort: generationSettings.rubric_generation?.reasoningEffort,
    });

    const baseRows = normalizeRubricRows(baseParsed.rows);
    validateRubricRowsOrThrow(baseRows);
    const selectedVariationPackage = getActiveQuestionVariancePackage(frankPacket);
    let selectedVariationRows: KarthicRubricRow[] | undefined;
    let selectedVariationPrompt: string | null = null;
    if (frankPacket.controllerCard?.dual_rubric_mode === 'on' && selectedVariationPackage) {
        selectedVariationPrompt = await buildKarthicRowsPrompt({
            packet: frankPacket,
            assets,
            questionText: selectedVariationPackage.variedLegalQuestion,
            benchmarkAnswer: selectedVariationPackage.updatedModelAnswer,
            questionSourceLabel: 'Selected variation question',
            trackLabel: 'Selected variation',
            scoringPolicy,
            selectedVariationPackage,
        });
        const selectedVariationParsed = await generateJson({
            operation: 'Karthic v2 selected-variation rubric generation',
            prompt: selectedVariationPrompt,
            model: generationSettings.rubric_generation?.model,
            reasoningEffort: generationSettings.rubric_generation?.reasoningEffort,
        });
        selectedVariationRows = normalizeRubricRows(selectedVariationParsed.rows);
        validateRubricRowsOrThrow(selectedVariationRows);
    }
    const now = new Date().toISOString();
    const tracks = createKarthicRubricTracks(frankPacket, {
        baseRows,
        baseSeedRows: existing?.tracks.base.seedRows ?? baseRows,
        selectedVariationRows,
        selectedVariationSeedRows: existing?.tracks.selected_variation?.seedRows ?? selectedVariationRows,
    });
    const pack = withActiveRubricTrackAliases({
        schemaVersion: 2,
        id: existing?.id ?? `karthic_v2_${Date.now()}_${randomUUID().slice(0, 8)}`,
        frankPacketId: frankPacket.id,
        preClusterRunId: existing?.preClusterRunId ?? null,
        selectedPack: frankPacket.selectedPack,
        controllerCard: buildKarthicWorkflowControllerCard(frankPacket.controllerCard, scoringPolicy, existing?.status ?? 'draft'),
        activeTrack: existing?.activeTrack ?? 'base',
        tracks,
        questionSource: 'canonical',
        questionVariancePackageId: null,
        questionText: '',
        status: existing?.status ?? 'draft',
        seedRows: [],
        rows: [],
        scoringPolicy,
        clusterFailureModes: existing?.clusterFailureModes ?? [],
        refinementLog: existing?.refinementLog ?? [],
        refinementStatus: existing?.refinementStatus ?? 'seeded',
        generationSettings,
        savedPrompts: [
            ...(existing?.savedPrompts ?? []),
            {
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'rubric_generation',
                title: `Base rubric prompt · ${new Date().toLocaleString()}`,
                prompt: basePrompt,
                createdAt: now,
            },
            ...(selectedVariationPrompt ? [{
                id: `prompt_${randomUUID().slice(0, 8)}`,
                kind: 'rubric_generation' as const,
                title: `Variation rubric prompt · ${new Date().toLocaleString()}`,
                prompt: selectedVariationPrompt,
                createdAt: now,
            }] : []),
        ],
        comparisonMethodNote: normalizeNonEmptyString(
            baseParsed.comparisonMethodNote,
            existing?.comparisonMethodNote ?? 'Score each cluster representative against the approved row-level rubric rather than against freeform benchmark prose alone.',
        ),
        approvedAt: existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    } satisfies KarthicRubricPackV2);
    await writeArtifact(DATA_DIRECTORIES.karthic, pack.id, pack);
    return pack;
}

export async function saveKarthicRubricPack(input: Partial<KarthicRubricPackV2> & { frankPacketId: string }) {
    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const frankPacket = await getRequiredFrankPacket(input.frankPacketId);
    const now = new Date().toISOString();
    const fallbackTracks = existing?.tracks ?? createKarthicRubricTracks(frankPacket);
    const inputTracks = input.tracks ?? fallbackTracks;
    const baseTrack = defaultRubricTrack({
        ...fallbackTracks.base,
        ...inputTracks.base,
        id: 'base',
        questionSource: 'canonical',
        questionText: inputTracks.base?.questionText ?? fallbackTracks.base.questionText ?? frankPacket.reverseEngineeredQuestion,
        benchmarkAnswer: inputTracks.base?.benchmarkAnswer ?? fallbackTracks.base.benchmarkAnswer ?? frankPacket.benchmarkAnswer,
        seedRows: inputTracks.base?.seedRows ?? fallbackTracks.base.seedRows ?? input.seedRows ?? input.rows,
        rows: inputTracks.base?.rows ?? fallbackTracks.base.rows ?? input.rows,
    });
    const selectedVariationTrack = frankPacket.controllerCard?.dual_rubric_mode === 'on'
        ? defaultRubricTrack({
            ...(fallbackTracks.selected_variation ?? buildSelectedVariationRubricTrack(frankPacket) ?? {
                id: 'selected_variation' as const,
                label: 'Selected variation',
                questionSource: 'question_variance_active_package' as const,
                questionText: '',
                benchmarkAnswer: '',
            }),
            ...(inputTracks.selected_variation ?? {}),
            id: 'selected_variation',
            questionSource: 'question_variance_active_package',
            questionText: inputTracks.selected_variation?.questionText
                ?? fallbackTracks.selected_variation?.questionText
                ?? buildSelectedVariationRubricTrack(frankPacket)?.questionText
                ?? '',
            benchmarkAnswer: inputTracks.selected_variation?.benchmarkAnswer
                ?? fallbackTracks.selected_variation?.benchmarkAnswer
                ?? buildSelectedVariationRubricTrack(frankPacket)?.benchmarkAnswer
                ?? '',
            questionVariancePackageId: inputTracks.selected_variation?.questionVariancePackageId
                ?? fallbackTracks.selected_variation?.questionVariancePackageId
                ?? buildSelectedVariationRubricTrack(frankPacket)?.questionVariancePackageId
                ?? null,
            seedRows: inputTracks.selected_variation?.seedRows ?? fallbackTracks.selected_variation?.seedRows,
            rows: inputTracks.selected_variation?.rows ?? fallbackTracks.selected_variation?.rows,
        })
        : null;
    const activeTrack = input.activeTrack ?? existing?.activeTrack ?? 'base';
    const nextTracks: KarthicRubricPackV2['tracks'] = {
        base: baseTrack,
        selected_variation: selectedVariationTrack,
    };
    const pack = withActiveRubricTrackAliases({
        schemaVersion: 2,
        id: existing?.id ?? normalizeNonEmptyString(input.id, `karthic_v2_${Date.now()}_${randomUUID().slice(0, 8)}`),
        frankPacketId: frankPacket.id,
        preClusterRunId: normalizeNullableString(input.preClusterRunId) ?? existing?.preClusterRunId ?? null,
        selectedPack: frankPacket.selectedPack as FrankSofPackId,
        controllerCard: buildKarthicWorkflowControllerCard(
            frankPacket.controllerCard,
            normalizeKarthicScoringPolicy(
                input.scoringPolicy ?? existing?.scoringPolicy,
                existing?.scoringPolicy ?? createDefaultKarthicScoringPolicy(frankPacket.controllerCard),
                frankPacket.controllerCard,
            ),
            input.status === 'approved' ? 'approved' : existing?.status ?? 'draft',
        ),
        activeTrack: activeTrack === 'selected_variation' && !selectedVariationTrack ? 'base' : activeTrack,
        tracks: nextTracks,
        questionSource: 'canonical',
        questionVariancePackageId: null,
        questionText: '',
        status: input.status === 'approved' ? 'approved' : existing?.status ?? 'draft',
        seedRows: [],
        rows: [],
        scoringPolicy: normalizeKarthicScoringPolicy(
            input.scoringPolicy ?? existing?.scoringPolicy,
            existing?.scoringPolicy ?? createDefaultKarthicScoringPolicy(frankPacket.controllerCard),
            frankPacket.controllerCard,
        ),
        clusterFailureModes: normalizeStringArray(input.clusterFailureModes ?? existing?.clusterFailureModes ?? []),
        refinementLog: normalizeKarthicRefinementLog(input.refinementLog ?? existing?.refinementLog ?? []),
        refinementStatus: normalizeKarthicRefinementStatus(input.refinementStatus, existing?.refinementStatus ?? 'not_started'),
        savedPrompts: Array.isArray(input.savedPrompts) ? input.savedPrompts : existing?.savedPrompts ?? [],
        generationSettings: normalizePromptGenerationSettings(input.generationSettings ?? existing?.generationSettings),
        comparisonMethodNote: normalizeOptionalString(
            input.comparisonMethodNote,
            existing?.comparisonMethodNote ?? 'Score each cluster representative against the approved row-level rubric rather than against freeform benchmark prose alone.',
        ),
        approvedAt: input.status === 'approved' ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    } satisfies KarthicRubricPackV2);
    validateRubricRowsOrThrow(pack.tracks.base.rows);
    if (pack.tracks.selected_variation) {
        validateRubricRowsOrThrow(pack.tracks.selected_variation.rows);
    }
    if (pack.status === 'approved') {
        if (pack.refinementStatus !== 'refined' && pack.refinementStatus !== 'approved') {
            throw new Error('Rubric refinement must be completed before approval.');
        }
        if (!pack.questionText.trim()) {
            throw new Error('Question text is required before approving the rubric pack.');
        }
        validateReverseEngineeredQuestionOrThrow(pack.questionText);
        pack.refinementStatus = 'approved';
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

export async function listZakReviews() {
    const items = await listArtifacts<Record<string, unknown>>(DATA_DIRECTORIES.zak);
    return items
        .map((item) => normalizeZakReview(item))
        .filter((item): item is ZakReviewV1 => Boolean(item));
}

export async function getZakReview(id: string) {
    const item = await readArtifact<Record<string, unknown>>(DATA_DIRECTORIES.zak, id);
    return item ? normalizeZakReview(item) : null;
}

export async function createZakReview(input: {
    dashaRunId: string;
    invocationMode?: ZakInvocationMode;
}) {
    const run = await getRequiredDashaRun(input.dashaRunId);
    if (run.status !== 'completed' || run.workflowStage !== 'judged') {
        throw new Error('Zak review requires a completed judged Dasha run.');
    }
    const existing = (await listZakReviews())
        .find((item) => item.dashaRunId === run.id && item.status === 'draft' && item.invocationMode === (input.invocationMode ?? 'manual_review'));
    if (existing) {
        return existing;
    }
    const pack = await getRequiredKarthicPack(run.rubricPackId);
    const review = await buildZakReviewFromRun({
        run,
        pack,
        invocationMode: input.invocationMode ?? 'manual_review',
    });
    await writeArtifact(DATA_DIRECTORIES.zak, review.id, review);
    return review;
}

export async function saveZakReview(reviewInput: ZakReviewV1) {
    const existing = await getRequiredZakReview(reviewInput.id);
    const review = normalizeZakReview({
        ...existing,
        ...reviewInput,
        updatedAt: new Date().toISOString(),
        completedAt: reviewInput.status === 'completed'
            ? (reviewInput.completedAt ?? existing.completedAt ?? new Date().toISOString())
            : null,
    });
    if (!review) {
        throw new Error('Zak review payload is invalid.');
    }
    await writeArtifact(DATA_DIRECTORIES.zak, review.id, review);
    return review;
}

export async function runDashaEvaluation(input: {
    rubricPackId: string;
    rubricTrackId?: KarthicRubricTrackId;
    runMode: DashaRunMode;
    files: UploadFileInput[];
    selectedModels: DashaSelectedModel[];
    sampleCount: number;
    questionText?: string;
    judgeModels?: DashaJudgeModelSelection[];
    judgeModel?: string;
    judgeReasoningEffort?: ReasoningEffort;
}) {
    const pack = await getRequiredKarthicPack(input.rubricPackId);
    if (pack.status !== 'approved') {
        throw new Error('Rubric pack must be approved before Dasha can start.');
    }
    if (pack.refinementStatus !== 'approved' && pack.refinementStatus !== 'refined') {
        throw new Error('Rubric pack must be refined before Dasha can start.');
    }
    return await createDraftDashaRun({
        pack,
        rubricTrackId: input.rubricTrackId,
        runMode: input.runMode,
        files: input.files,
        selectedModels: input.selectedModels,
        sampleCount: input.sampleCount,
        questionText: input.questionText,
        judgeModels: input.judgeModels,
        judgeModel: input.judgeModel,
        judgeReasoningEffort: input.judgeReasoningEffort,
    });
}

export async function executeDashaRun(id: string) {
    const run = await getRequiredDashaRun(id);
    if (run.status !== 'draft' || run.workflowStage !== 'cluster_pending') {
        return run;
    }
    const pack = await getRequiredKarthicPack(run.rubricPackId);
    return await finalizeDashaClustering({
        run,
        pack,
    });
}

export async function stopDashaRun(id: string) {
    const run = await getRequiredDashaRun(id);
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
        return run;
    }

    const now = new Date().toISOString();
    const cancelledRun: DashaRunV2 = {
        ...run,
        status: 'cancelled',
        clusteringNotes: run.workflowStage === 'cluster_pending'
            ? 'Dasha run was cancelled by user before clustering completed.'
            : 'Dasha run was cancelled by user.',
        errorMessage: 'Cancelled by user.',
        cancelRequestedAt: run.cancelRequestedAt ?? now,
        cancelledAt: now,
        completedAt: now,
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, cancelledRun.id, cancelledRun);

    const abortController = activeDashaAbortControllers.get(id);
    if (abortController && !abortController.signal.aborted) {
        abortController.abort(new DashaRunCancelledError());
    }

    return cancelledRun;
}

export async function judgeDashaRun(id: string, input?: {
    judgeModels?: DashaJudgeModelSelection[];
    judgeModel?: string;
    judgeReasoningEffort?: ReasoningEffort;
}) {
    const run = await getRequiredDashaRun(id);
    if (run.status !== 'draft' || run.workflowStage !== 'clustered') {
        return run;
    }
    const pack = await getRequiredKarthicPack(run.rubricPackId);
    return await finalizeDashaJudging({
        run,
        pack,
        judgeModels: input?.judgeModels,
        judgeModel: input?.judgeModel,
        judgeReasoningEffort: input?.judgeReasoningEffort,
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

async function createDraftDashaRun(input: {
    pack: KarthicRubricPackV2;
    rubricTrackId?: KarthicRubricTrackId;
    runMode: DashaRunMode;
    files: UploadFileInput[];
    selectedModels: DashaSelectedModel[];
    sampleCount: number;
    questionText?: string;
    judgeModels?: DashaJudgeModelSelection[];
    judgeModel?: string;
    judgeReasoningEffort?: ReasoningEffort;
}) {
    const id = `dasha_v2_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const inputArtifacts = input.files.length > 0 ? await saveUploadedArtifacts(id, input.files) : [];
    const rubricTrackId = input.rubricTrackId ?? input.pack.activeTrack;
    const activeTrack = getRubricTrack(input.pack, rubricTrackId) ?? input.pack.tracks.base;
    const judgeSettings = normalizeDashaJudgeSettings({
        selectedJudgeModels: input.judgeModels,
        model: input.judgeModel,
        reasoningEffort: input.judgeReasoningEffort,
    });
    const draftRun: DashaRunV2 = {
        schemaVersion: 2,
        id,
        rubricPackId: input.pack.id,
        rubricTrackId,
        runMode: input.runMode,
        status: 'draft',
        workflowStage: 'cluster_pending',
        inputArtifacts,
        questionText: normalizeNonEmptyString(input.questionText, activeTrack.questionText),
        questionSource: activeTrack.questionSource,
        questionVariancePackageId: activeTrack.questionVariancePackageId,
        comparisonId: null,
        comparisonRole: null,
        selectedModels: input.selectedModels,
        judgeSettings,
        judgeModelRoster: judgeSettings.selectedJudgeModels,
        judgePanelMode: judgeSettings.panelMode,
        judgePanelSize: judgeSettings.panelSize,
        judgePanelHomogeneityStatus: judgeSettings.homogeneityStatus,
        judgeAggregationRule: judgeSettings.aggregationRule,
        judgeVoteRecord: [],
        requestedResponseCount: clampNumber(Math.floor(toNumber(input.sampleCount, 120)), 1, 400),
        validResponseCount: 0,
        responses: [],
        clusters: [],
        clusterAnalyses: [],
        rowResults: [],
        moduleSummaries: [],
        weightedSummary: {
            applicableWeightTotal: 0,
            weightedScore: null,
            notApplicableRowKeys: [],
        },
        modelSummaries: [],
        trackSummary: null,
        clusteringMethod: 'pending',
        clusteringNotes: 'Dasha evaluation started and is running in the background.',
        cancelRequestedAt: null,
        cancelledAt: null,
        createdAt: now,
        completedAt: null,
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, draftRun.id, draftRun);
    return draftRun;
}

async function finalizeDashaClustering(input: {
    run: DashaRunV2;
    pack: KarthicRubricPackV2;
}) {
    const abortController = new AbortController();
    activeDashaAbortControllers.set(input.run.id, abortController);
    try {
        throwIfDashaRunCancelled(abortController.signal);
        const responses = await generateDashaResponses(
            input.run.questionText,
            input.run.selectedModels,
            clampNumber(Math.floor(toNumber(input.run.requestedResponseCount, 120)), 1, 400),
            abortController.signal,
        );
        throwIfDashaRunCancelled(abortController.signal);
        const validResponses = responses.filter((response) => !response.error && response.responseText.trim());
        if (validResponses.length === 0) {
            return await finalizeFailedRun(input.run, 'No valid model responses were generated.');
        }

        throwIfRunWasCancelled(await getDashaRun(input.run.id));
        const clusteringResult = await clusterResponses(validResponses);
        throwIfRunWasCancelled(await getDashaRun(input.run.id));
        if (input.run.runMode === 'cluster_only') {
            const completedRun: DashaRunV2 = {
                ...input.run,
                status: 'completed',
                workflowStage: 'clustered',
                validResponseCount: validResponses.length,
                responses,
                clusters: clusteringResult.clusters,
                clusterAnalyses: [],
                rowResults: [],
                moduleSummaries: [],
                weightedSummary: {
                    applicableWeightTotal: 0,
                    weightedScore: null,
                    notApplicableRowKeys: [],
                },
                modelSummaries: buildDashaModelSummaries({
                    selectedModels: input.run.selectedModels,
                    responses,
                    clusters: clusteringResult.clusters,
                    rowResults: [],
                }),
                trackSummary: null,
                clusteringMethod: clusteringResult.method,
                clusteringNotes: `${clusteringResult.notes} Row scoring was skipped because this run was started in clustering-only mode.`,
                cancelRequestedAt: null,
                cancelledAt: null,
                completedAt: new Date().toISOString(),
            };
            await writeArtifact(DATA_DIRECTORIES.dasha, completedRun.id, completedRun);
            return completedRun;
        }

        const clusteredRun: DashaRunV2 = {
            ...input.run,
            status: 'draft',
            workflowStage: 'clustered',
            validResponseCount: validResponses.length,
            responses,
            clusters: clusteringResult.clusters,
            clusteringMethod: clusteringResult.method,
            clusteringNotes: clusteringResult.notes,
            cancelRequestedAt: null,
            cancelledAt: null,
            completedAt: null,
        };
        await writeArtifact(DATA_DIRECTORIES.dasha, clusteredRun.id, clusteredRun);
        return clusteredRun;
    } catch (error) {
        if (isDashaRunCancelledError(error)) {
            return await finalizeCancelledRun(input.run);
        }
        return await finalizeFailedRun(input.run, error instanceof Error ? error.message : 'Failed to run Dasha evaluation.');
    } finally {
        activeDashaAbortControllers.delete(input.run.id);
    }
}

async function finalizeDashaJudging(input: {
    run: DashaRunV2;
    pack: KarthicRubricPackV2;
    judgeModels?: DashaJudgeModelSelection[];
    judgeModel?: string;
    judgeReasoningEffort?: ReasoningEffort;
}) {
    try {
        const validResponses = input.run.responses.filter((response) => !response.error && response.responseText.trim());
        const judgeSettings = normalizeDashaJudgeSettings({
            selectedJudgeModels: input.judgeModels,
            model: input.judgeModel ?? input.run.judgeSettings.model,
            reasoningEffort: input.judgeReasoningEffort ?? input.run.judgeSettings.reasoningEffort,
        });
        const rubricTrack = getRubricTrack(input.pack, input.run.rubricTrackId) ?? input.pack.tracks.base;
        const frankPacket = await getRequiredFrankPacket(input.pack.frankPacketId);
        const dashaInstructions = await getDashaInstructionBundle();
        const panelArtifacts = await evaluateDashaJudgePanel({
            run: input.run,
            pack: input.pack,
            frankPacket,
            judgeSettings,
            rows: rubricTrack.rows,
            responses: validResponses,
            instructions: dashaInstructions,
        });
        const rowResults = panelArtifacts.rowResults;
        const moduleSummaries = buildModuleSummaries(rowResults);
        const clusterAnalyses = panelArtifacts.clusterAnalyses;
        const weightedSummary = summarizeDashaTrack(rowResults, clusterAnalyses);
        const trackSummary = buildDashaTrackSummary({
            run: input.run,
            judgeSettings,
            clusterAnalyses,
            judgeVoteRecord: panelArtifacts.judgeVoteRecord,
        });
        const finalizedClusterAnalyses = trackSummary?.bestCentroidZakReviewFlag
            ? clusterAnalyses.map((analysis) => ({
                ...analysis,
                zakReviewFlag: trackSummary.disputedCentroidIds.includes(analysis.clusterId),
            }))
            : clusterAnalyses;
        const finalScoreByClusterId = new Map(finalizedClusterAnalyses.map((analysis) => [analysis.clusterId, analysis.finalScore] as const));
        const modelSummaries = buildDashaModelSummaries({
            selectedModels: input.run.selectedModels,
            responses: input.run.responses,
            clusters: input.run.clusters,
            rowResults,
            clusterScoreMap: finalScoreByClusterId,
        });

        const completedRun: DashaRunV2 = {
            ...input.run,
            status: 'completed',
            workflowStage: 'judged',
            judgeSettings,
            judgeModelRoster: judgeSettings.selectedJudgeModels,
            judgePanelMode: judgeSettings.panelMode,
            judgePanelSize: judgeSettings.panelSize,
            judgePanelHomogeneityStatus: judgeSettings.homogeneityStatus,
            judgeAggregationRule: judgeSettings.aggregationRule,
            judgeVoteRecord: panelArtifacts.judgeVoteRecord,
            clusterAnalyses: finalizedClusterAnalyses,
            rowResults,
            moduleSummaries,
            weightedSummary,
            modelSummaries,
            trackSummary,
            cancelRequestedAt: null,
            cancelledAt: null,
            completedAt: new Date().toISOString(),
        };
        await writeArtifact(DATA_DIRECTORIES.dasha, completedRun.id, completedRun);
        if (trackSummary?.bestCentroidZakReviewFlag) {
            await ensureAutomaticZakReview(completedRun);
        }
        return completedRun;
    } catch (error) {
        return await finalizeFailedRun(input.run, error instanceof Error ? error.message : 'Failed to judge clustered Dasha run.');
    }
}

async function finalizeFailedRun(run: DashaRunV2, errorMessage: string) {
    const failedRun: DashaRunV2 = {
        ...run,
        status: 'failed',
        workflowStage: run.workflowStage,
        responses: [],
        clusters: [],
        clusterAnalyses: [],
        rowResults: [],
        moduleSummaries: [],
        weightedSummary: {
            applicableWeightTotal: 0,
            weightedScore: null,
            notApplicableRowKeys: [],
        },
        modelSummaries: [],
        trackSummary: null,
        clusteringMethod: 'not_run',
        clusteringNotes: 'Dasha evaluation terminated before clustering completed.',
        errorMessage,
        cancelRequestedAt: run.cancelRequestedAt,
        cancelledAt: null,
        completedAt: new Date().toISOString(),
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, failedRun.id, failedRun);
    return failedRun;
}

async function finalizeCancelledRun(run: DashaRunV2) {
    const existing = await getDashaRun(run.id);
    if (existing?.status === 'cancelled') {
        return existing;
    }

    const now = new Date().toISOString();
    const cancelledRun: DashaRunV2 = {
        ...run,
        status: 'cancelled',
        clusteringMethod: run.clusteringMethod === 'pending' ? 'not_run' : run.clusteringMethod,
        clusteringNotes: 'Dasha run was cancelled by user before completion.',
        errorMessage: 'Cancelled by user.',
        cancelRequestedAt: run.cancelRequestedAt ?? now,
        cancelledAt: now,
        completedAt: now,
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, cancelledRun.id, cancelledRun);
    return cancelledRun;
}

function throwIfDashaRunCancelled(signal?: AbortSignal | null) {
    if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new DashaRunCancelledError();
    }
}

function throwIfRunWasCancelled(run: DashaRunV2 | null) {
    if (run?.status === 'cancelled') {
        throw new DashaRunCancelledError();
    }
}

function isDashaRunCancelledError(error: unknown) {
    return error instanceof DashaRunCancelledError
        || (error instanceof Error && error.name === 'AbortError')
        || (error instanceof Error && error.message.toLowerCase().includes('cancel'));
}

type DashaSingleJudgeArtifacts = {
    judge: DashaJudgeModelSelection;
    rowResults: RubricRowResult[];
    clusterAnalyses: DashaClusterAnalysis[];
    voteRecord: DashaJudgeVoteRecord;
};

async function evaluateDashaJudgePanel(input: {
    run: DashaRunV2;
    pack: KarthicRubricPackV2;
    frankPacket: FrankPacketV2;
    rows: KarthicRubricRow[];
    responses: DashaResponseRecord[];
    judgeSettings: DashaJudgeSettings;
    instructions: Awaited<ReturnType<typeof getDashaInstructionBundle>>;
}) {
    const judgeArtifacts: DashaSingleJudgeArtifacts[] = [];

    for (const judge of input.judgeSettings.selectedJudgeModels) {
        const singleJudgeSettings = normalizeDashaJudgeSettings({
            selectedJudgeModels: [judge],
        });
        const rowResults = await evaluateClustersAgainstRows({
            questionText: input.run.questionText,
            rows: input.rows,
            clusters: input.run.clusters,
            responses: input.responses,
            judgeSettings: singleJudgeSettings,
        });
        const clusterAnalyses = await analyzeDashaClusters({
            run: input.run,
            pack: input.pack,
            frankPacket: input.frankPacket,
            rowResults,
            judgeSettings: singleJudgeSettings,
            instructions: input.instructions,
        });
        judgeArtifacts.push({
            judge,
            rowResults,
            clusterAnalyses,
            voteRecord: buildDashaJudgeVoteRecord({
                judge,
                clusterAnalyses,
            }),
        });
    }

    return {
        rowResults: aggregateDashaJudgeRowResults({
            judgeArtifacts,
            rows: input.rows,
            clusters: input.run.clusters,
        }),
        clusterAnalyses: aggregateDashaJudgeClusterAnalyses({
            judgeArtifacts,
            clusters: input.run.clusters,
        }),
        judgeVoteRecord: judgeArtifacts.map((artifact) => artifact.voteRecord),
    };
}

function buildDashaJudgeVoteRecord(input: {
    judge: DashaJudgeModelSelection;
    clusterAnalyses: DashaClusterAnalysis[];
}): DashaJudgeVoteRecord {
    const ranked = input.clusterAnalyses.slice().sort(compareDashaClusterAnalyses);
    const best = ranked[0] ?? null;
    return {
        judgeId: `${input.judge.provider}::${input.judge.model}::${input.judge.reasoningEffort}`,
        provider: input.judge.provider,
        model: input.judge.model,
        reasoningEffort: input.judge.reasoningEffort,
        modelFamily: getDashaJudgeModelFamily(input.judge.provider, input.judge.model),
        rankedCentroidList: ranked.map((analysis) => analysis.clusterId),
        topCentroidId: best?.clusterId ?? null,
        topCentroidScore: best?.finalScore ?? null,
        centroidFinalScores: ranked.map((analysis) => ({
            clusterId: analysis.clusterId,
            subtotal: analysis.subtotal,
            finalScore: analysis.finalScore,
        })),
    };
}

function aggregateDashaJudgeRowResults(input: {
    judgeArtifacts: DashaSingleJudgeArtifacts[];
    rows: KarthicRubricRow[];
    clusters: DashaClusterRecord[];
}): RubricRowResult[] {
    if (input.judgeArtifacts.length === 0) {
        return [];
    }
    const judgeCount = input.judgeArtifacts.length;
    const clusterById = new Map(input.clusters.map((cluster) => [cluster.id, cluster] as const));

    return input.rows.map((row) => {
        const rowBundles = input.judgeArtifacts
            .map((artifact) => artifact.rowResults.find((result) => result.rowKey === row.key) ?? null)
            .filter((result): result is RubricRowResult => Boolean(result));

        const centroidEvaluations = input.clusters.map((cluster) => {
            const judgeEvaluations = rowBundles
                .map((result) => result.centroidEvaluations.find((evaluation) => evaluation.clusterId === cluster.id) ?? null)
                .filter((evaluation): evaluation is RubricRowCentroidEvaluation => Boolean(evaluation));
            return aggregateJudgeCentroidEvaluation({
                clusterId: cluster.id,
                judgeCount,
                judgeEvaluations,
                fallbackNaGuidance: row.naGuidance,
            });
        }).filter((evaluation): evaluation is RubricRowCentroidEvaluation => Boolean(evaluation));

        const winning = chooseWinningCentroid(centroidEvaluations, input.clusters);
        const applicableJudgeCount = rowBundles.filter((result) => result.applicabilityStatus === 'applicable').length;

        return {
            rowKey: row.key,
            moduleId: row.moduleId,
            rowTitle: row.title,
            weight: row.weight,
            applicabilityStatus: winning?.applicabilityStatus ?? 'not_applicable',
            applicabilityExplanation: applicableJudgeCount > 0
                ? `Applicable according to ${applicableJudgeCount}/${judgeCount} judges.`
                : row.naGuidance,
            centroidEvaluations,
            winningCentroidId: winning?.clusterId ?? null,
            winningScore: winning?.score ?? null,
            rationale: winning
                ? `Panel aggregate across ${judgeCount} judges. ${winning.rationale}`.trim()
                : 'No applicable centroid satisfied this row after panel aggregation.',
            winningModelMix: winning ? (clusterById.get(winning.clusterId)?.modelBreakdown ?? []) : [],
        };
    });
}

function aggregateJudgeCentroidEvaluation(input: {
    clusterId: string;
    judgeCount: number;
    judgeEvaluations: RubricRowCentroidEvaluation[];
    fallbackNaGuidance: string;
}): RubricRowCentroidEvaluation | null {
    if (input.judgeEvaluations.length === 0) {
        return null;
    }
    const applicable = input.judgeEvaluations.filter((evaluation) => evaluation.applicabilityStatus === 'applicable' && typeof evaluation.score === 'number');
    const representative = applicable[0] ?? input.judgeEvaluations[0];
    const meanScore = averageNullableNumbers(applicable.map((evaluation) => evaluation.score));
    const meanConfidence = averageNullableNumbers(input.judgeEvaluations.map((evaluation) => evaluation.confidence));

    return {
        clusterId: input.clusterId,
        applicabilityStatus: applicable.length > 0 ? 'applicable' : 'not_applicable',
        applicabilityExplanation: applicable.length > 0
            ? `Applicable according to ${applicable.length}/${input.judgeCount} judges.`
            : input.fallbackNaGuidance,
        score: applicable.length > 0 ? meanScore : null,
        confidence: meanConfidence,
        rationale: applicable.length > 0
            ? `Mean panel score across ${applicable.length}/${input.judgeCount} judges. ${representative?.rationale ?? ''}`.trim()
            : representative?.rationale ?? 'No judge marked this centroid applicable for the row.',
        difference: representative?.difference ?? {
            matchedGoldenPoints: [],
            missingGoldenPoints: [],
            extraCentroidPoints: [],
            contradictionPoints: [],
            differenceSummary: 'No difference summary recorded.',
        },
        metadataTags: representative?.metadataTags ?? {
            bottomLineOutcome: 'No clear conclusion',
            outcomeCorrectness: 'Indeterminate',
            reasoningAlignment: 'Wrong result / poor reasoning',
            jurisdictionAssumption: 'Not clearly stated',
        },
    };
}

function aggregateDashaJudgeClusterAnalyses(input: {
    judgeArtifacts: DashaSingleJudgeArtifacts[];
    clusters: DashaClusterRecord[];
}): DashaClusterAnalysis[] {
    const judgeCount = input.judgeArtifacts.length;
    return input.clusters.map((cluster) => {
        const analyses = input.judgeArtifacts
            .map((artifact) => artifact.clusterAnalyses.find((analysis) => analysis.clusterId === cluster.id) ?? null)
            .filter((analysis): analysis is DashaClusterAnalysis => Boolean(analysis));
        const representative = analyses[0];
        const dominantModel = [...cluster.modelBreakdown].sort((left, right) => right.count - left.count || left.model.localeCompare(right.model))[0] ?? null;

        return {
            clusterId: cluster.id,
            evaluationTrack: representative?.evaluationTrack ?? 'evaluation_track_original',
            questionVersion: representative?.questionVersion ?? 'original',
            rubricType: representative?.rubricType ?? 'base_rubric',
            clusterSizeTotal: cluster.size,
            representedModelCount: cluster.modelBreakdown.length,
            dominantModelName: dominantModel?.model ?? null,
            dominantModelCount: dominantModel?.count ?? 0,
            dominantModelShare: cluster.size > 0 && dominantModel ? roundToTwo(dominantModel.count / cluster.size) : 0,
            subtotal: averageNullableNumbers(analyses.map((analysis) => analysis.subtotal)),
            penaltiesApplied: aggregateDashaJudgePenalties(analyses, judgeCount),
            capApplied: aggregateDashaJudgeCap(analyses, judgeCount),
            finalScore: averageNullableNumbers(analyses.map((analysis) => analysis.finalScore)),
            disagreementFlag: analyses.some((analysis) => analysis.disagreementFlag),
            zakReviewFlag: false,
            trackSummaryNote: judgeCount > 1
                ? `Panel aggregate from ${judgeCount} judges.`
                : representative?.trackSummaryNote ?? '',
            caseCitation: aggregateDashaJudgeCaseCitationAnalyses(analyses),
        };
    });
}

function aggregateDashaJudgePenalties(analyses: DashaClusterAnalysis[], judgeCount: number): DashaAppliedPenalty[] {
    const penaltyMap = new Map<string, { penalty: DashaAppliedPenalty; count: number }>();
    for (const analysis of analyses) {
        for (const penalty of analysis.penaltiesApplied) {
            const existing = penaltyMap.get(penalty.code);
            if (existing) {
                existing.count += 1;
            } else {
                penaltyMap.set(penalty.code, { penalty, count: 1 });
            }
        }
    }
    return [...penaltyMap.values()]
        .sort((left, right) => right.count - left.count || left.penalty.code.localeCompare(right.penalty.code))
        .map(({ penalty, count }) => ({
            ...penalty,
            reason: `Triggered by ${count}/${judgeCount} judges. ${penalty.reason}`.trim(),
        }));
}

function aggregateDashaJudgeCap(analyses: DashaClusterAnalysis[], judgeCount: number): DashaAppliedCap | null {
    const capMap = new Map<string, { cap: DashaAppliedCap; count: number }>();
    for (const analysis of analyses) {
        if (!analysis.capApplied) {
            continue;
        }
        const existing = capMap.get(analysis.capApplied.code);
        if (existing) {
            existing.count += 1;
        } else {
            capMap.set(analysis.capApplied.code, { cap: analysis.capApplied, count: 1 });
        }
    }
    const selected = [...capMap.values()]
        .sort((left, right) => right.count - left.count || left.cap.cap - right.cap.cap || left.cap.code.localeCompare(right.cap.code))[0];
    return selected
        ? {
            ...selected.cap,
            reason: `Triggered by ${selected.count}/${judgeCount} judges. ${selected.cap.reason}`.trim(),
        }
        : null;
}

function aggregateDashaJudgeCaseCitationAnalyses(analyses: DashaClusterAnalysis[]): DashaCaseCitationAnalysis {
    const fallback = analyses[0]?.caseCitation ?? {
        caseMentionStatus: 'none' as const,
        extractedCaseMentions: [],
        verifiedCaseMentions: [],
        hallucinatedCaseMentions: [],
        citedCaseCountTotal: 0,
        verifiedCaseCount: 0,
        hallucinatedCaseCount: 0,
        caseExistenceSummary: 'no_case' as const,
        citationAccuracyStatus: 'not_applicable' as const,
        sourceCaseReferenceStatus: 'not_applicable' as const,
        sourceCaseReferenceNote: 'No case mention detected.',
        caseVerificationReviewFlag: false,
        note: 'No case mentioned.',
    };
    const extractedCaseMentions = [...new Set(analyses.flatMap((analysis) => analysis.caseCitation.extractedCaseMentions))];
    const verifiedCaseMentions = [...new Set(analyses.flatMap((analysis) => analysis.caseCitation.verifiedCaseMentions))];
    const hallucinatedCaseMentions = [...new Set(analyses.flatMap((analysis) => analysis.caseCitation.hallucinatedCaseMentions))];
    const caseMentionStatus = analyses.some((analysis) => analysis.caseCitation.caseMentionStatus === 'mentioned') ? 'mentioned' : 'none';
    const sourceStatuses = analyses.map((analysis) => analysis.caseCitation.sourceCaseReferenceStatus);
    const sourceCaseReferenceStatus = sourceStatuses.includes('source_case_and_other_cases')
        ? 'source_case_and_other_cases'
        : sourceStatuses.includes('source_case_cited')
            ? 'source_case_cited'
            : sourceStatuses.includes('other_case_only')
                ? 'other_case_only'
                : 'not_applicable';

    return {
        caseMentionStatus,
        extractedCaseMentions,
        verifiedCaseMentions,
        hallucinatedCaseMentions,
        citedCaseCountTotal: extractedCaseMentions.length,
        verifiedCaseCount: verifiedCaseMentions.length,
        hallucinatedCaseCount: hallucinatedCaseMentions.length,
        caseExistenceSummary: hallucinatedCaseMentions.length > 0
            ? verifiedCaseMentions.length > 0 ? 'mixed' : 'all_unverified'
            : verifiedCaseMentions.length > 0 ? 'all_verified' : caseMentionStatus === 'mentioned' ? 'all_unverified' : 'no_case',
        citationAccuracyStatus: hallucinatedCaseMentions.length > 0
            ? 'hallucinated_or_unverifiable'
            : verifiedCaseMentions.length > 0
                ? 'verified_correct'
                : caseMentionStatus === 'mentioned'
                    ? 'hallucinated_or_unverifiable'
                    : 'not_applicable',
        sourceCaseReferenceStatus,
        sourceCaseReferenceNote: fallback.sourceCaseReferenceNote,
        caseVerificationReviewFlag: analyses.some((analysis) => analysis.caseCitation.caseVerificationReviewFlag),
        note: analyses.length > 1
            ? `Panel aggregate from ${analyses.length} judges. ${fallback.note}`.trim()
            : fallback.note,
    };
}

async function analyzeDashaClusters(input: {
    run: DashaRunV2;
    pack: KarthicRubricPackV2;
    frankPacket: FrankPacketV2;
    rowResults: RubricRowResult[];
    judgeSettings: DashaJudgeSettings;
    instructions: Awaited<ReturnType<typeof getDashaInstructionBundle>>;
}) {
    const responseById = new Map(input.run.responses.map((response) => [response.id, response] as const));
    const caseVerificationContext = buildDashaCaseVerificationContext(input.pack, input.frankPacket);

    return await Promise.all(input.run.clusters.map(async (cluster) => {
        const representative = responseById.get(cluster.representativeResponseId);
        const clusterRowScores = buildClusterRowScoreSummary(cluster.id, input.rowResults);
        const subtotal = computeClusterSubtotal(cluster.id, input.rowResults);
        const modelBreakdown = cluster.modelBreakdown.map((entry) => ({
            model: entry.model,
            count: entry.count,
            share: cluster.size > 0 ? roundToTwo(entry.count / cluster.size) : 0,
        }));
        const dominantModel = [...cluster.modelBreakdown].sort((left, right) => right.count - left.count || left.model.localeCompare(right.model))[0] ?? null;
        const fallback = buildFallbackDashaClusterAnalysis({
            run: input.run,
            cluster,
            subtotal,
            representativeText: representative?.responseText ?? cluster.representativeText,
            caseVerificationOperatingMode: caseVerificationContext.caseVerificationOperatingMode,
            workflowSourceCaseName: caseVerificationContext.workflowSourceCaseName,
            workflowSourceCaseCitation: caseVerificationContext.workflowSourceCaseCitation,
        });

        if (!representative) {
            return fallback;
        }

        try {
            const parsed = await generateJson({
                operation: `Dasha cluster audit ${cluster.id}`,
                prompt: buildDashaClusterAuditPrompt({
                    instructions: input.instructions,
                    questionText: input.run.questionText,
                    rubricType: input.run.rubricTrackId === 'selected_variation' ? 'selected_variation_rubric' : 'base_rubric',
                    evaluationTrack: input.run.rubricTrackId === 'selected_variation' ? 'evaluation_track_selected_variation' : 'evaluation_track_original',
                    questionVersion: input.run.rubricTrackId === 'selected_variation' ? 'selected_variation' : 'original',
                    representativeText: representative.responseText,
                    clusterMetadata: {
                        clusterId: cluster.id,
                        clusterSizeTotal: cluster.size,
                        modelBreakdown,
                        representedModelCount: cluster.modelBreakdown.length,
                        dominantModelName: dominantModel?.model ?? null,
                        dominantModelShare: cluster.size > 0 && dominantModel ? roundToTwo(dominantModel.count / cluster.size) : 0,
                    },
                    rowScores: clusterRowScores,
                    scoringPolicy: input.pack.scoringPolicy,
                    workflowSourceType: caseVerificationContext.workflowSourceType,
                    caseCitationVerificationMode: caseVerificationContext.caseCitationVerificationMode,
                    workflowSourceCaseName: caseVerificationContext.workflowSourceCaseName,
                    workflowSourceCaseCitation: caseVerificationContext.workflowSourceCaseCitation,
                    sourceCaseMonitoring: caseVerificationContext.sourceCaseMonitoring,
                    caseCitationScoringRule: caseVerificationContext.caseCitationScoringRule,
                    caseVerificationOperatingMode: caseVerificationContext.caseVerificationOperatingMode,
                    caseExistenceCheckMethod: caseVerificationContext.caseExistenceCheckMethod,
                }),
                provider: input.judgeSettings.provider,
                model: input.judgeSettings.model,
                reasoningEffort: input.judgeSettings.reasoningEffort,
                tools: shouldUseWebSearchForCitationAudit(representative.responseText, caseVerificationContext.caseCitationVerificationMode)
                    ? [{
                        type: 'web_search_preview',
                        search_context_size: 'medium',
                        user_location: {
                            type: 'approximate',
                            city: 'Chicago',
                            region: 'Illinois',
                            country: 'US',
                            timezone: 'America/Chicago',
                        },
                    }]
                    : undefined,
            });

            return normalizeDashaClusterAnalysis({
                parsed,
                fallback,
                cluster,
                run: input.run,
                scoringPolicy: input.pack.scoringPolicy,
                subtotal,
                caseVerificationOperatingMode: caseVerificationContext.caseVerificationOperatingMode,
            });
        } catch {
            return fallback;
        }
    }));
}

function buildClusterRowScoreSummary(clusterId: string, rowResults: RubricRowResult[]) {
    return rowResults.map((row) => {
        const evaluation = row.centroidEvaluations.find((item) => item.clusterId === clusterId);
        return {
            rowKey: row.rowKey,
            rowTitle: row.rowTitle,
            moduleLabel: RUBRIC_MODULE_LABELS[row.moduleId],
            weight: row.weight,
            score: evaluation?.score ?? null,
            applicabilityStatus: evaluation?.applicabilityStatus ?? 'not_applicable',
            rationale: evaluation?.rationale ?? 'No rationale recorded.',
            differenceSummary: evaluation?.difference.differenceSummary ?? 'No difference summary recorded.',
        };
    });
}

function computeClusterSubtotal(clusterId: string, rowResults: RubricRowResult[]) {
    let weightedTotal = 0;
    let weightTotal = 0;
    for (const row of rowResults) {
        const evaluation = row.centroidEvaluations.find((item) => item.clusterId === clusterId);
        if (evaluation?.applicabilityStatus !== 'applicable' || typeof evaluation.score !== 'number') {
            continue;
        }
        weightedTotal += row.weight * evaluation.score;
        weightTotal += row.weight;
    }
    return weightTotal > 0 ? roundToTwo(weightedTotal / weightTotal) : null;
}

function buildFallbackDashaClusterAnalysis(input: {
    run: DashaRunV2;
    cluster: DashaClusterRecord;
    subtotal: number | null;
    representativeText: string;
    caseVerificationOperatingMode: FrankControllerCard['case_verification_operating_mode'];
    workflowSourceCaseName: string | null;
    workflowSourceCaseCitation: string | null;
}): DashaClusterAnalysis {
    const extractedMentions = extractCaseLikeMentions(input.representativeText);
    const dominantModel = [...input.cluster.modelBreakdown].sort((left, right) => right.count - left.count || left.model.localeCompare(right.model))[0] ?? null;
    const cautiousMode = input.caseVerificationOperatingMode === 'cautious';
    const sourceCaseReferenceStatus = classifySourceCaseReferenceStatus({
        extractedCaseMentions: extractedMentions,
        workflowSourceCaseName: input.workflowSourceCaseName,
        workflowSourceCaseCitation: input.workflowSourceCaseCitation,
    });
    return {
        clusterId: input.cluster.id,
        evaluationTrack: input.run.rubricTrackId === 'selected_variation' ? 'evaluation_track_selected_variation' : 'evaluation_track_original',
        questionVersion: input.run.rubricTrackId === 'selected_variation' ? 'selected_variation' : 'original',
        rubricType: input.run.rubricTrackId === 'selected_variation' ? 'selected_variation_rubric' : 'base_rubric',
        clusterSizeTotal: input.cluster.size,
        representedModelCount: input.cluster.modelBreakdown.length,
        dominantModelName: dominantModel?.model ?? null,
        dominantModelCount: dominantModel?.count ?? 0,
        dominantModelShare: input.cluster.size > 0 && dominantModel ? roundToTwo(dominantModel.count / input.cluster.size) : 0,
        subtotal: input.subtotal,
        penaltiesApplied: [],
        capApplied: null,
        finalScore: input.subtotal,
        disagreementFlag: false,
        zakReviewFlag: false,
        trackSummaryNote: 'Fallback cluster audit used because the Dasha audit prompt did not complete.',
        caseCitation: {
            caseMentionStatus: extractedMentions.length > 0 ? 'mentioned' : 'none',
            extractedCaseMentions: extractedMentions,
            verifiedCaseMentions: [],
            hallucinatedCaseMentions: cautiousMode ? [] : extractedMentions,
            citedCaseCountTotal: extractedMentions.length,
            verifiedCaseCount: 0,
            hallucinatedCaseCount: cautiousMode ? 0 : extractedMentions.length,
            caseExistenceSummary: extractedMentions.length > 0 ? 'all_unverified' : 'no_case',
            citationAccuracyStatus: extractedMentions.length > 0 ? 'hallucinated_or_unverifiable' : 'not_applicable',
            sourceCaseReferenceStatus,
            sourceCaseReferenceNote: buildSourceCaseReferenceNote(sourceCaseReferenceStatus),
            caseVerificationReviewFlag: cautiousMode && extractedMentions.length > 0,
            note: extractedMentions.length > 0
                ? cautiousMode
                    ? 'Case mentioned; could not be verified.'
                    : 'Case mentioned; no web-verifiable authority match found in demo mode.'
                : 'No case mentioned.',
        },
    };
}

function normalizeDashaClusterAnalysis(input: {
    parsed: Record<string, unknown>;
    fallback: DashaClusterAnalysis;
    cluster: DashaClusterRecord;
    run: DashaRunV2;
    scoringPolicy: KarthicScoringPolicy;
    subtotal: number | null;
    caseVerificationOperatingMode: FrankControllerCard['case_verification_operating_mode'];
}): DashaClusterAnalysis {
    const penaltyCodes = new Set(normalizeStringArray(input.parsed.triggeredPenaltyCodes));
    const capCodes = new Set(normalizeStringArray(input.parsed.triggeredCapCodes));
    const caseCitation = normalizeDashaCaseCitationAnalysis(
        isRecord(input.parsed.caseCitation) ? input.parsed.caseCitation : null,
        input.fallback.caseCitation,
        input.caseVerificationOperatingMode,
    );

    if (caseCitation.hallucinatedCaseMentions.length > 0) {
        penaltyCodes.add('P_HallucinatedCaseCitation');
    }

    const penaltiesApplied = input.scoringPolicy.penalties
        .filter((rule) => rule.enabled && penaltyCodes.has(rule.code))
        .map((rule) => ({
            code: rule.code,
            label: rule.label,
            points: rule.points,
            reason: normalizeNonEmptyString(getPenaltyReason(input.parsed, rule.code), rule.appliesWhen),
        } satisfies DashaAppliedPenalty));

    const capCandidates = input.scoringPolicy.caps
        .filter((rule) => rule.enabled && capCodes.has(rule.code))
        .map((rule) => ({
            code: rule.code,
            label: rule.label,
            cap: rule.cap,
            reason: normalizeNonEmptyString(getCapReason(input.parsed, rule.code), rule.appliesWhen),
        } satisfies DashaAppliedCap))
        .sort((left, right) => left.cap - right.cap || left.code.localeCompare(right.code));
    const capApplied = capCandidates[0] ?? null;

    const subtotal = input.subtotal;
    const totalPenalty = penaltiesApplied.reduce((sum, penalty) => sum + penalty.points, 0);
    const uncappedScore = typeof subtotal === 'number' ? roundToTwo(clampNumber(subtotal - totalPenalty, 0, 100)) : null;
    const finalScore = typeof uncappedScore === 'number' && capApplied
        ? roundToTwo(Math.min(uncappedScore, capApplied.cap))
        : uncappedScore;
    const dominantModel = [...input.cluster.modelBreakdown].sort((left, right) => right.count - left.count || left.model.localeCompare(right.model))[0] ?? null;

    return {
        clusterId: input.cluster.id,
        evaluationTrack: input.fallback.evaluationTrack,
        questionVersion: input.fallback.questionVersion,
        rubricType: input.fallback.rubricType,
        clusterSizeTotal: input.cluster.size,
        representedModelCount: input.cluster.modelBreakdown.length,
        dominantModelName: dominantModel?.model ?? null,
        dominantModelCount: dominantModel?.count ?? 0,
        dominantModelShare: input.cluster.size > 0 && dominantModel ? roundToTwo(dominantModel.count / input.cluster.size) : 0,
        subtotal,
        penaltiesApplied,
        capApplied,
        finalScore,
        disagreementFlag: Boolean(input.parsed.disagreementFlag),
        zakReviewFlag: false,
        trackSummaryNote: normalizeNonEmptyString(input.parsed.trackSummaryNote, input.fallback.trackSummaryNote),
        caseCitation,
    };
}

function normalizeDashaCaseCitationAnalysis(
    value: Record<string, unknown> | null,
    fallback: DashaCaseCitationAnalysis,
    caseVerificationOperatingMode: FrankControllerCard['case_verification_operating_mode'] = 'cautious',
): DashaCaseCitationAnalysis {
    if (!value) {
        return applyCaseCitationVerificationModeRules(fallback, caseVerificationOperatingMode);
    }
    return applyCaseCitationVerificationModeRules({
        caseMentionStatus: value.caseMentionStatus === 'mentioned' ? 'mentioned' : value.caseMentionStatus === 'none' ? 'none' : fallback.caseMentionStatus,
        extractedCaseMentions: normalizeStringArray(value.extractedCaseMentions),
        verifiedCaseMentions: normalizeStringArray(value.verifiedCaseMentions),
        hallucinatedCaseMentions: normalizeStringArray(value.hallucinatedCaseMentions),
        citedCaseCountTotal: clampNumber(Math.floor(toNumber(value.citedCaseCountTotal, fallback.citedCaseCountTotal)), 0, 100),
        verifiedCaseCount: clampNumber(Math.floor(toNumber(value.verifiedCaseCount, fallback.verifiedCaseCount)), 0, 100),
        hallucinatedCaseCount: clampNumber(Math.floor(toNumber(value.hallucinatedCaseCount, fallback.hallucinatedCaseCount)), 0, 100),
        caseExistenceSummary: normalizeDashaCaseExistenceSummary(value.caseExistenceSummary, fallback.caseExistenceSummary),
        citationAccuracyStatus: normalizeDashaCitationAccuracyStatus(value.citationAccuracyStatus, fallback.citationAccuracyStatus),
        sourceCaseReferenceStatus: normalizeDashaSourceCaseReferenceStatus(value.sourceCaseReferenceStatus, fallback.sourceCaseReferenceStatus),
        sourceCaseReferenceNote: normalizeNonEmptyString(value.sourceCaseReferenceNote, fallback.sourceCaseReferenceNote),
        caseVerificationReviewFlag: Boolean(value.caseVerificationReviewFlag),
        note: normalizeNonEmptyString(value.note, fallback.note),
    }, caseVerificationOperatingMode);
}

function applyCaseCitationVerificationModeRules(
    analysis: DashaCaseCitationAnalysis,
    caseVerificationOperatingMode: FrankControllerCard['case_verification_operating_mode'],
): DashaCaseCitationAnalysis {
    if (analysis.caseMentionStatus !== 'mentioned') {
        return analysis;
    }
    const hasVerifiedCases = analysis.verifiedCaseMentions.length > 0 || analysis.verifiedCaseCount > 0;
    const hasHallucinatedCases = analysis.hallucinatedCaseMentions.length > 0 || analysis.hallucinatedCaseCount > 0;
    const ambiguousVerification = !hasVerifiedCases && !hasHallucinatedCases;

    if (caseVerificationOperatingMode === 'cautious' && ambiguousVerification) {
        return {
            ...analysis,
            hallucinatedCaseMentions: [],
            hallucinatedCaseCount: 0,
            caseExistenceSummary: 'all_unverified',
            citationAccuracyStatus: 'hallucinated_or_unverifiable',
            caseVerificationReviewFlag: true,
            note: 'Case mentioned; could not be verified.',
        };
    }

    return analysis;
}

function normalizeDashaCitationAccuracyStatus(value: unknown, fallback: DashaCitationAccuracyStatus): DashaCitationAccuracyStatus {
    return value === 'verified_correct'
        || value === 'verified_partly_correct'
        || value === 'hallucinated_or_unverifiable'
        || value === 'not_applicable'
        ? value
        : fallback;
}

function normalizeDashaCaseExistenceSummary(value: unknown, fallback: DashaCaseExistenceSummary): DashaCaseExistenceSummary {
    return value === 'no_case'
        || value === 'all_verified'
        || value === 'mixed'
        || value === 'all_unverified'
        ? value
        : fallback;
}

function normalizeDashaSourceCaseReferenceStatus(value: unknown, fallback: DashaSourceCaseReferenceStatus): DashaSourceCaseReferenceStatus {
    return value === 'source_case_cited'
        || value === 'other_case_only'
        || value === 'source_case_and_other_cases'
        || value === 'not_applicable'
        ? value
        : fallback;
}

function getPenaltyReason(parsed: Record<string, unknown>, code: string) {
    const penalties = isRecord(parsed.penaltyReasons) ? parsed.penaltyReasons : null;
    return penalties && typeof penalties[code] === 'string' ? penalties[code] : '';
}

function getCapReason(parsed: Record<string, unknown>, code: string) {
    const caps = isRecord(parsed.capReasons) ? parsed.capReasons : null;
    return caps && typeof caps[code] === 'string' ? caps[code] : '';
}

function summarizeDashaTrack(rowResults: RubricRowResult[], clusterAnalyses: DashaClusterAnalysis[]): WeightedSummary {
    const bestCluster = chooseBestDashaCluster(clusterAnalyses);
    const notApplicableRowKeys = rowResults
        .filter((row) => row.applicabilityStatus !== 'applicable' || typeof row.winningScore !== 'number')
        .map((row) => row.rowKey);

    return {
        applicableWeightTotal: rowResults
            .filter((row) => row.applicabilityStatus === 'applicable' && typeof row.winningScore === 'number')
            .reduce((sum, row) => sum + row.weight, 0),
        weightedScore: bestCluster?.finalScore ?? null,
        notApplicableRowKeys,
    };
}

function buildDashaTrackSummary(input: {
    run: DashaRunV2;
    judgeSettings: DashaJudgeSettings;
    clusterAnalyses: DashaClusterAnalysis[];
    judgeVoteRecord: DashaJudgeVoteRecord[];
}): DashaTrackSummary | null {
    if (input.clusterAnalyses.length === 0) {
        return null;
    }
    const ranked = input.clusterAnalyses
        .slice()
        .sort((left, right) => compareDashaClusterAnalyses(left, right));
    const best = ranked[0] ?? null;
    const questionVersion = input.run.rubricTrackId === 'selected_variation' ? 'selected_variation' : 'original';
    const voteCounts = buildDashaJudgeVoteCounts(input.judgeVoteRecord, ranked.map((analysis) => analysis.clusterId));
    const topVoteEntry = voteCounts[0] ?? null;
    const panelMajorityStatus: DashaPanelMajorityStatus = input.judgeVoteRecord.length === 0
        ? 'not_applicable'
        : topVoteEntry && topVoteEntry.voteCount > input.judgeVoteRecord.length / 2
            ? 'majority'
            : 'no_majority';
    const disputedCentroidIds = panelMajorityStatus === 'no_majority'
        ? buildDisputedCentroidIds(voteCounts)
        : [];
    const topCentroidVoteSplit = buildDashaTopCentroidVoteSplit(voteCounts, input.judgeVoteRecord.length);

    return {
        evaluationTrack: input.run.rubricTrackId === 'selected_variation' ? 'evaluation_track_selected_variation' : 'evaluation_track_original',
        questionVersion,
        rubricType: input.run.rubricTrackId === 'selected_variation' ? 'selected_variation_rubric' : 'base_rubric',
        judgePanelMode: input.judgeSettings.panelMode,
        judgeModelRoster: input.judgeSettings.selectedJudgeModels,
        judgePanelHomogeneityStatus: input.judgeSettings.homogeneityStatus,
        judgeAggregationRule: input.judgeSettings.aggregationRule,
        rankedCentroidList: ranked.map((analysis) => analysis.clusterId),
        disputedCentroidIds,
        bestCentroidByScore: best?.clusterId ?? null,
        bestCentroidScore: best?.finalScore ?? null,
        topCentroidVoteSplit,
        panelMajorityStatus,
        bestCentroidZakReviewFlag: panelMajorityStatus === 'no_majority',
        trackSummary: best
            ? panelMajorityStatus === 'no_majority'
                ? `Top centroid decision is disputed on the ${questionVersion} track because no centroid won a strict majority of first-place judge votes.`
                : `Best centroid is ${best.clusterId} at ${formatNullableScore(best.finalScore)} after panel aggregation on the ${questionVersion} track.`
            : 'No judged centroid summary is available.',
    };
}

function chooseBestDashaCluster(clusterAnalyses: DashaClusterAnalysis[]) {
    return clusterAnalyses.slice().sort(compareDashaClusterAnalyses)[0] ?? null;
}

function compareDashaClusterAnalyses(left: DashaClusterAnalysis, right: DashaClusterAnalysis) {
    const finalDelta = (right.finalScore ?? -1) - (left.finalScore ?? -1);
    if (finalDelta !== 0) {
        return finalDelta;
    }
    const subtotalDelta = (right.subtotal ?? -1) - (left.subtotal ?? -1);
    if (subtotalDelta !== 0) {
        return subtotalDelta;
    }
    const sizeDelta = right.clusterSizeTotal - left.clusterSizeTotal;
    if (sizeDelta !== 0) {
        return sizeDelta;
    }
    return left.clusterId.localeCompare(right.clusterId);
}

function buildDashaJudgeVoteCounts(judgeVoteRecord: DashaJudgeVoteRecord[], rankedClusterIds: string[]) {
    const voteMap = new Map(rankedClusterIds.map((clusterId) => [clusterId, 0]));
    for (const vote of judgeVoteRecord) {
        if (!vote.topCentroidId) {
            continue;
        }
        voteMap.set(vote.topCentroidId, (voteMap.get(vote.topCentroidId) ?? 0) + 1);
    }
    return [...voteMap.entries()]
        .map(([clusterId, voteCount]) => ({ clusterId, voteCount }))
        .sort((left, right) => right.voteCount - left.voteCount || rankedClusterIds.indexOf(left.clusterId) - rankedClusterIds.indexOf(right.clusterId));
}

function buildDisputedCentroidIds(voteCounts: Array<{ clusterId: string; voteCount: number }>) {
    const topVoteCount = voteCounts[0]?.voteCount ?? 0;
    if (topVoteCount <= 0) {
        return [];
    }
    const leaders = voteCounts.filter((entry) => entry.voteCount === topVoteCount).map((entry) => entry.clusterId);
    if (leaders.length > 1) {
        return leaders;
    }
    const contenders = voteCounts.filter((entry) => entry.voteCount > 0).map((entry) => entry.clusterId);
    return contenders.length > 0 ? contenders : leaders;
}

function buildDashaTopCentroidVoteSplit(voteCounts: Array<{ clusterId: string; voteCount: number }>, judgeCount: number) {
    if (judgeCount <= 0 || voteCounts.length === 0) {
        return 'not_applicable';
    }
    return voteCounts
        .map((entry) => `${entry.clusterId}: ${entry.voteCount}/${judgeCount}`)
        .join(', ');
}

function averageNullableNumbers(values: Array<number | null | undefined>) {
    const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return numericValues.length > 0
        ? roundToTwo(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
        : null;
}

async function ensureAutomaticZakReview(run: DashaRunV2) {
    const existing = (await listZakReviews())
        .find((item) => item.dashaRunId === run.id && item.invocationMode === 'automatic_dasha_non_majority' && item.status === 'draft');
    if (existing) {
        return existing;
    }
    const pack = await getRequiredKarthicPack(run.rubricPackId);
    const review = await buildZakReviewFromRun({
        run,
        pack,
        invocationMode: 'automatic_dasha_non_majority',
    });
    await writeArtifact(DATA_DIRECTORIES.zak, review.id, review);
    return review;
}

async function buildZakReviewFromRun(input: {
    run: DashaRunV2;
    pack: KarthicRubricPackV2;
    invocationMode: ZakInvocationMode;
}): Promise<ZakReviewV1> {
    await getZakInstructionBundle();
    const rubricTrack = getRubricTrack(input.pack, input.run.rubricTrackId) ?? input.pack.tracks.base;
    const disputedCentroidIds = input.run.trackSummary?.disputedCentroidIds?.length
        ? input.run.trackSummary.disputedCentroidIds
        : [input.run.trackSummary?.bestCentroidByScore].filter((value): value is string => Boolean(value));
    const disputedCentroids = disputedCentroidIds
        .map((centroidId) => buildZakReviewCentroid({
            centroidId,
            run: input.run,
            rowResults: input.run.rowResults,
        }))
        .filter((item): item is ZakReviewCentroid => Boolean(item));
    const packetReviewReady = disputedCentroids.length > 0
        && rubricTrack.rows.length > 0
        && disputedCentroids.every((item) => item.centroidText.trim().length > 0);
    const printablePacketStatus = packetReviewReady ? 'ready' as const : 'not_ready' as const;
    const scoringSheet = buildZakScoringSheet(disputedCentroids, rubricTrack.rows);
    const decisionRecord: ZakDecisionRecord = {
        smeSelectedBestCentroid: 'none',
        smeConfidence: 'not_provided',
        controllingRowsDrivingDecision: [],
        rubricInstabilityNotes: '',
        upstreamRevisionNeededNotes: '',
    };
    const now = new Date().toISOString();

    return {
        schemaVersion: 1,
        id: `zak_v1_${Date.now()}_${randomUUID().slice(0, 8)}`,
        status: 'draft',
        invocationMode: input.invocationMode,
        dashaRunId: input.run.id,
        rubricPackId: input.pack.id,
        rubricTrackId: input.run.rubricTrackId,
        frankPacketId: input.pack.frankPacketId,
        evaluationTrack: input.run.trackSummary?.evaluationTrack ?? (input.run.rubricTrackId === 'selected_variation' ? 'evaluation_track_selected_variation' : 'evaluation_track_original'),
        questionVersion: input.run.trackSummary?.questionVersion ?? (input.run.rubricTrackId === 'selected_variation' ? 'selected_variation' : 'original'),
        rubricType: input.run.trackSummary?.rubricType ?? (input.run.rubricTrackId === 'selected_variation' ? 'selected_variation_rubric' : 'base_rubric'),
        dualRubricMode: input.pack.controllerCard?.dual_rubric_mode ?? 'off',
        selectedLaneCode: input.pack.controllerCard?.selected_lane_code ?? 'none',
        topCentroidVoteSplit: input.run.trackSummary?.topCentroidVoteSplit ?? 'not_applicable',
        judgeModelRoster: input.run.judgeModelRoster,
        judgePanelMode: input.run.judgePanelMode,
        judgeAggregationRule: input.run.judgeAggregationRule,
        disputedCentroidIds,
        packetReviewReady,
        printablePacketStatus,
        printablePacketContentsSummary: packetReviewReady
            ? `Active question, ${rubricTrack.rows.length} rubric rows, ${disputedCentroids.length} disputed centroid packet(s), judge panel metadata, and the real top-centroid vote split are assembled for SME review.`
            : 'The Zak packet is incomplete because the active rubric or disputed centroid materials are missing.',
        printablePacketCanBeAssembled: packetReviewReady,
        activeQuestionText: input.run.questionText,
        activeRubricRows: rubricTrack.rows,
        disputedCentroids,
        scoringSheet,
        decisionRecord,
        scoreLockStatus: 'not_ready',
        upstreamRevisionTarget: 'none',
        dispositionNote: input.invocationMode === 'automatic_dasha_non_majority'
            ? 'Auto-created from a Dasha no-majority disputed-best-centroid result.'
            : 'Manual Zak review packet created from the selected judged Dasha run.',
        exportAvailabilityNote: 'The structured Zak review packet is ready for on-screen SME review and can drive a combined printable export from the same stored fields.',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
    };
}

function buildZakReviewCentroid(input: {
    centroidId: string;
    run: DashaRunV2;
    rowResults: RubricRowResult[];
}): ZakReviewCentroid | null {
    const cluster = input.run.clusters.find((item) => item.id === input.centroidId);
    const analysis = input.run.clusterAnalyses.find((item) => item.clusterId === input.centroidId);
    if (!cluster || !analysis) {
        return null;
    }
    return {
        centroidId: cluster.id,
        centroidText: cluster.representativeText,
        dashaRowScoringSummary: buildClusterRowScoreSummary(cluster.id, input.rowResults).map((row) => ({
            rowKey: row.rowKey,
            rowTitle: row.rowTitle,
            moduleId: normalizeRubricModuleIdFromLabel(row.moduleLabel),
            moduleLabel: row.moduleLabel,
            weight: row.weight,
            score: row.score,
            applicabilityStatus: row.applicabilityStatus,
            rationale: row.rationale,
            differenceSummary: row.differenceSummary,
        })),
        subtotal: analysis.subtotal,
        penaltiesApplied: analysis.penaltiesApplied,
        capApplied: analysis.capApplied,
        finalScore: analysis.finalScore,
        clusterSizeTotal: analysis.clusterSizeTotal,
        modelBreakdown: cluster.modelBreakdown,
        representedModelCount: analysis.representedModelCount,
        dominantModelName: analysis.dominantModelName,
        dominantModelShare: analysis.dominantModelShare,
        caseCitation: analysis.caseCitation,
        shortKarthicEscalationNote: analysis.trackSummaryNote,
    };
}

function buildZakScoringSheet(disputedCentroids: ZakReviewCentroid[], rows: KarthicRubricRow[]): ZakScoringSheetEntry[] {
    return disputedCentroids.flatMap((centroid) => rows.map((row) => ({
        centroidId: centroid.centroidId,
        rowKey: row.key,
        rowLabel: row.title,
        shortRowPurpose: row.description,
        scoringReminder: 'Apply the active 0-4 rubric anchors for this row and record only the SME-facing justification.',
        smeScore: null,
        smeNote: '',
    })));
}

function normalizeRubricModuleIdFromLabel(label: string): RubricModuleId {
    const match = Object.entries(RUBRIC_MODULE_LABELS).find(([, value]) => value === label);
    return (match?.[0] as RubricModuleId | undefined) ?? 'module1';
}

function buildDashaCaseVerificationContext(
    pack: Pick<KarthicRubricPackV2, 'controllerCard' | 'scoringPolicy'>,
    frankPacket: Pick<FrankPacketV2, 'controllerCard'>,
) {
    const controllerCard = pack.controllerCard ?? frankPacket.controllerCard;
    const workflowSourceCaseName = normalizeNullableControllerCardValue(controllerCard?.workflow_source_case_name);
    const workflowSourceCaseCitation = normalizeNullableControllerCardValue(controllerCard?.workflow_source_case_citation);
    return {
        workflowSourceType: controllerCard?.workflow_source_type ?? 'mixed',
        caseCitationVerificationMode: controllerCard?.case_citation_verification_mode ?? pack.scoringPolicy.caseCitationVerificationMode,
        workflowSourceCaseName,
        workflowSourceCaseCitation,
        sourceCaseMonitoring: controllerCard?.source_case_monitoring ?? 'off',
        caseCitationScoringRule: controllerCard?.case_citation_scoring_rule ?? 'hallucinated_only_penalty',
        caseVerificationOperatingMode: controllerCard?.case_verification_operating_mode ?? 'cautious',
        caseExistenceCheckMethod: controllerCard?.case_existence_check_method ?? 'web_search',
    };
}

function classifySourceCaseReferenceStatus(input: {
    extractedCaseMentions: string[];
    workflowSourceCaseName: string | null;
    workflowSourceCaseCitation: string | null;
}): DashaCaseCitationAnalysis['sourceCaseReferenceStatus'] {
    if (input.extractedCaseMentions.length === 0) {
        return 'not_applicable';
    }
    const hasSourceReference = input.workflowSourceCaseName
        ? input.extractedCaseMentions.some((mention) => {
            const mentionNormalized = normalizeForSimilarity(mention);
            const sourceNormalized = normalizeForSimilarity(input.workflowSourceCaseName ?? '');
            return mentionNormalized.includes(sourceNormalized)
                || sourceNormalized.includes(mentionNormalized)
                || jaccardSimilarity(mentionNormalized, sourceNormalized) > 0.55;
        })
        : false;
    if (hasSourceReference) {
        return input.extractedCaseMentions.length > 1
            ? 'source_case_and_other_cases'
            : 'source_case_cited';
    }
    return 'other_case_only';
}

function buildSourceCaseReferenceNote(status: DashaCaseCitationAnalysis['sourceCaseReferenceStatus']) {
    if (status === 'source_case_and_other_cases' || status === 'source_case_cited') {
        return 'Response cites the workflow source case used to build this benchmark.';
    }
    if (status === 'other_case_only') {
        return 'Response cites cases other than the workflow source case.';
    }
    return 'No case mention detected.';
}

function normalizeNullableControllerCardValue(value: unknown) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized && normalized.toLowerCase() !== 'none'
        ? normalized
        : null;
}

function shouldUseWebSearchForCitationAudit(text: string, mode: KarthicScoringPolicy['caseCitationVerificationMode']) {
    return mode === 'on' && extractCaseLikeMentions(text).length > 0;
}

function extractCaseLikeMentions(text: string) {
    const matches = [
        ...text.matchAll(/\b([A-Z][A-Za-z'&.-]+(?:\s+[A-Z][A-Za-z'&.-]+){0,5}\s+v\.\s+[A-Z][A-Za-z'&.-]+(?:\s+[A-Z][A-Za-z'&.-]+){0,5})\b/g),
        ...text.matchAll(/\b((?:In re|Ex parte)\s+[A-Z][A-Za-z'&.-]+(?:\s+[A-Z][A-Za-z'&.-]+){0,5})\b/g),
    ]
        .map((match) => match[1]?.trim() ?? '')
        .filter(Boolean);
    return [...new Set(matches)];
}

function formatNullableScore(value: number | null) {
    return typeof value === 'number' ? value.toFixed(2) : 'N/A';
}

async function evaluateClustersAgainstRows(input: {
    questionText: string;
    rows: KarthicRubricRow[];
    clusters: DashaClusterRecord[];
    responses: DashaResponseRecord[];
    judgeSettings: DashaJudgeSettings;
}): Promise<RubricRowResult[]> {
    const responseById = new Map(input.responses.map((response) => [response.id, response]));
    return await Promise.all(input.rows.map(async (row) => {
        const rawCentroidEvaluations = await Promise.all(input.clusters.map(async (cluster) => {
            const representative = responseById.get(cluster.representativeResponseId);
            if (!representative) {
                return null;
            }
            const evaluation = await evaluateRowAgainstResponse({
                row,
                questionText: input.questionText,
                responseText: representative.responseText,
                judgeSettings: input.judgeSettings,
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
    judgeSettings: DashaJudgeSettings;
}) {
    const prompt = buildDashaRowEvaluationPrompt(input);
    const fallback = heuristicRowEvaluation(input);
    try {
        const parsed = await generateJson({
            operation: `Dasha row evaluation ${input.row.key}`,
            prompt,
            provider: input.judgeSettings.provider,
            model: input.judgeSettings.model,
            reasoningEffort: input.judgeSettings.reasoningEffort,
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
    provider?: ModelProvider;
    model?: string;
    reasoningEffort?: ReasoningEffort;
    tools?: Array<{
        type: 'web_search_preview';
        search_context_size?: 'low' | 'medium' | 'high';
        user_location?: {
            type: 'approximate';
            city?: string;
            region?: string;
            country?: string;
            timezone?: string;
        };
    }>;
}) {
    const provider = normalizeModelProvider(input.provider, 'openai');
    const model = normalizeJudgeModelForProvider(provider, input.model);
    try {
        if (provider !== 'openai') {
            const response = await generateModelResponse({
                provider,
                model,
                systemPrompt: 'Return only a JSON object that satisfies the requested shape. Do not wrap the JSON in markdown.',
                messages: [{ role: 'user', content: input.prompt }],
                temperature: 0.1,
                reasoningEffort: input.reasoningEffort,
            });
            const parsed = parseJsonObjectResponse(response);
            if (!parsed) {
                throw new Error('Model returned invalid JSON.');
            }
            return parsed;
        }
        requireOpenAiApiKey(input.operation);
        const request: {
            model: string;
            input: string;
            instructions: string;
            text: {
                verbosity: 'medium';
                format: {
                    type: 'json_object';
                };
            };
            reasoning?: { effort: 'low' | 'medium' | 'high'; summary: 'auto' };
            tools?: Array<{
                type: 'web_search_preview';
                search_context_size?: 'low' | 'medium' | 'high';
                user_location?: {
                    type: 'approximate';
                    city?: string;
                    region?: string;
                    country?: string;
                    timezone?: string;
                };
            }>;
        } = {
            model,
            input: input.prompt,
            instructions: 'Return only a JSON object that satisfies the requested shape. Do not wrap the JSON in markdown.',
            text: {
                verbosity: 'medium',
                format: {
                    type: 'json_object',
                },
            },
        };
        if (input.tools?.length) {
            request.tools = input.tools;
        }
        const mappedEffort = model.startsWith('gpt-5') ? mapReasoningEffort(input.reasoningEffort) : null;
        if (mappedEffort) {
            request.reasoning = {
                effort: mappedEffort,
                summary: 'auto',
            };
        }
        const response = await getOpenAiClient().responses.create(request);
        const parsed = parseJsonObjectResponse(extractResponsesText(response));
        if (!parsed) {
            throw new Error('Model returned invalid JSON.');
        }
        return parsed;
    } catch (error) {
        const providerLabel = provider === 'anthropic' ? 'Anthropic' : provider === 'gemini' ? 'Gemini' : 'OpenAI';
        throw new Error(`${input.operation} failed: ${describeError(error, `${providerLabel} request failed.`)}`);
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

async function generateDashaResponses(
    questionText: string,
    selectedModels: DashaSelectedModel[],
    sampleCount: number,
    signal?: AbortSignal,
) {
    const samplingPlan = buildDashaSamplingPlan(selectedModels, sampleCount);
    const tasks = samplingPlan.map((task) => async (): Promise<DashaResponseRecord> => {
        throwIfDashaRunCancelled(signal);
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
                signal,
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
            if (isDashaRunCancelledError(error)) {
                throw error;
            }
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
    return await runWithConcurrency(tasks, 8, signal);
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

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number, signal?: AbortSignal) {
    if (tasks.length === 0) {
        return [] as T[];
    }
    const limit = Math.max(1, Math.floor(concurrency));
    const results = new Array<T>(tasks.length);
    let nextIndex = 0;
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (nextIndex < tasks.length) {
            throwIfDashaRunCancelled(signal);
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await tasks[currentIndex]();
        }
    }));
    throwIfDashaRunCancelled(signal);
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
    if (!packet.selectedPack || !packet.intakeChecklist || !packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.controllerCard || !packet.likelyFailureModes) {
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

function withDerivedControllerCard(packet: FrankPacketV2): FrankPacketV2 {
    return {
        ...packet,
        controllerCard: buildFrankControllerCard(packet),
    };
}

function buildFrankControllerCard(packet: FrankPacketV2): FrankControllerCard | null {
    if (!packet.selectedPack || !packet.sourceExtractionSheet || !packet.goldPacketMapping) {
        return null;
    }

    const activePackage = packet.questionVariance.packages.find((item) => item.id === packet.questionVariance.activePackageId) ?? null;
    const activeOption = packet.questionVariance.menu?.options.find((item) => item.id === activePackage?.selectedOptionId) ?? null;
    const selectedLaneCode = inferControllerCardLaneCode(activeOption, activePackage);
    const variationLane = selectedLaneCode === 'none'
        ? 'none'
        : selectedLaneCode.startsWith('A')
            ? 'A'
            : 'B';
    const selectedVariationQuestionText = activePackage?.variedLegalQuestion ?? '';
    const currentQuestionText = selectedVariationQuestionText || packet.reverseEngineeredQuestion;
    const selectedVariationFactDeltas = activePackage?.swapLog.map((entry) => `${entry.from} -> ${entry.to}`) ?? [];
    const selectedVariationSummary = activePackage
        ? [activeOption?.label ?? activePackage.variationType, activePackage.whyTheAnswerShouldStayTheSameOrChange]
            .filter(Boolean)
            .join(' — ')
        : '';
    const workflowSourceType = inferControllerCardWorkflowSourceType(packet);
    const workflowSourceCaseName = inferControllerCardWorkflowSourceCaseName(packet, workflowSourceType);
    const workflowSourceCaseCitation = inferControllerCardWorkflowSourceCaseCitation(packet, workflowSourceType);
    const caseCitationVerificationMode: FrankControllerCard['case_citation_verification_mode'] = 'off';

    return {
        selected_pack: packet.selectedPack,
        doctrine_family: packet.goldPacketMapping.doctrineFamily,
        jurisdiction_assumption: extractBenchmarkSection(packet.benchmarkAnswer, 'Jurisdiction assumption:'),
        benchmark_posture: packet.goldPacketMapping.benchmarkPosture,
        current_question_text: currentQuestionText,
        gold_answer: packet.benchmarkAnswer,
        likely_controlling_doctrine: extractBenchmarkSection(packet.benchmarkAnswer, 'Controlling doctrine:'),
        correct_trigger_test: packet.goldPacketMapping.controllingTrigger,
        trigger_facts: packet.sourceExtractionSheet.triggerFacts,
        non_triggered_sibling_gates: packet.secondaryIssues,
        required_gate_order: packet.goldPacketMapping.requiredGateOrder,
        writing_status: inferControllerCardWritingStatus(currentQuestionText, packet.benchmarkAnswer),
        strongest_counterargument: extractBenchmarkSection(packet.benchmarkAnswer, 'Strongest counterargument:'),
        allowed_fallbacks: packet.goldPacketMapping.possibleSubstitutesExceptions,
        fallback_limits: packet.goldPacketMapping.limitsOnSubstitutesExceptions,
        omitted_control_fact: inferOmittedControlFact(selectedLaneCode, activePackage),
        variation_lane: variationLane,
        selected_lane_code: selectedLaneCode,
        variation_menu_options: (packet.questionVariance.menu?.options ?? [])
            .map((option) => option.laneCode || inferControllerCardLaneCode(option, null))
            .filter((code, index, values) => values.indexOf(code) === index),
        selected_variation_summary: selectedVariationSummary,
        selected_variation_fact_deltas: selectedVariationFactDeltas,
        rubric_patch_scope: selectedLaneCode === 'none' ? 'base rubric only' : 'selected variation only',
        failure_bank: getFailureBankLabel(packet.selectedPack),
        base_question_text: packet.reverseEngineeredQuestion,
        base_gold_answer: packet.benchmarkAnswer,
        selected_variation_question_text: selectedVariationQuestionText,
        selected_variation_answer_posture: inferSelectedVariationAnswerPosture(activePackage),
        dual_rubric_mode: selectedLaneCode === 'none' ? 'off' : 'on',
        rubric_separation_rule: 'strict',
        evaluation_tracks: selectedLaneCode === 'none' ? 'original_only' : 'original_and_selected_variation',
        packet_status: inferControllerCardPacketStatus(packet),
        frank_phase_complete: inferControllerCardFrankPhaseComplete(packet),
        rubric_status: 'not_started',
        evaluation_status: 'not_ready',
        workflow_source_type: workflowSourceType,
        workflow_source_case_name: workflowSourceCaseName,
        workflow_source_case_citation: workflowSourceCaseCitation,
        case_citation_verification_mode: caseCitationVerificationMode,
        source_case_monitoring: inferControllerCardSourceCaseMonitoring(workflowSourceType, workflowSourceCaseName, workflowSourceCaseCitation),
        case_citation_scoring_rule: 'hallucinated_only_penalty',
        case_verification_operating_mode: 'cautious',
        case_existence_check_method: 'web_search',
    };
}

function getFailureBankLabel(packId: FrankSofPackId) {
    switch (packId) {
        case 'pack10':
            return '11_FAILURE_BANK_ORAL_PROMISE.txt';
        case 'pack20':
            return '21_FAILURE_BANK_LAND.txt';
        case 'pack30':
            return '31_FAILURE_BANK_EXECUTOR.txt';
        case 'pack40':
            return '41_FAILURE_BANK_UCC_2201.txt';
        default:
            return '';
    }
}

function inferControllerCardLaneCode(
    option: QuestionVarianceMenuOption | null,
    pkg: QuestionVariancePackage | null,
): FrankControllerCard['selected_lane_code'] {
    if (!option && !pkg) {
        return 'none';
    }
    if (option?.laneCode) {
        return option.laneCode;
    }
    if (pkg?.laneCode) {
        return pkg.laneCode;
    }
    const candidateTexts = [
        option?.label,
        option?.variationType,
        pkg?.variationType,
        pkg?.selectedOptionId,
    ].filter((value): value is string => Boolean(value));

    return inferQuestionVarianceLaneCodeFromText(candidateTexts);
}

function inferControllerCardWritingStatus(questionText: string, benchmarkAnswer: string): FrankControllerCard['writing_status'] {
    const haystack = `${questionText}\n${benchmarkAnswer}`.toLowerCase();
    if (/\b(dispute|disputed|whether)\b.{0,40}\b(writing|signed|signature|memorandum)\b/.test(haystack)) {
        return 'disputed';
    }
    if (/\b(no writing|not in writing|nothing was signed|unsigned|oral promise|oral agreement|lacks the required writing)\b/.test(haystack)) {
        return 'absent';
    }
    if (/\b(signed writing|written agreement|written contract|signed memorandum|merchant confirmation|signed by the party)\b/.test(haystack)) {
        return 'present';
    }
    return 'omitted';
}

function inferOmittedControlFact(
    selectedLaneCode: FrankControllerCard['selected_lane_code'],
    pkg: QuestionVariancePackage | null,
) {
    if (selectedLaneCode === 'none' || selectedLaneCode.startsWith('A')) {
        return 'none';
    }
    return pkg?.swapLog[0]?.from
        || pkg?.rubricPatchNotes[0]
        || 'review needed';
}

function inferSelectedVariationAnswerPosture(
    pkg: QuestionVariancePackage | null,
): FrankControllerCard['selected_variation_answer_posture'] {
    if (!pkg) {
        return 'same_as_base';
    }
    switch (pkg.answerReuseLevel) {
        case 'ambiguity_rewrite_required':
            return 'ambiguity_rewrite';
        case 'cosmetic_edits_only':
            return 'localized_edit';
        case 'reuse_as_is':
        case 'unsafe':
        default:
            return 'same_as_base';
    }
}

function inferControllerCardFrankPhaseComplete(packet: FrankPacketV2): FrankControllerCard['frank_phase_complete'] {
    if (packet.reverseEngineeredQuestion.trim()) {
        return 3;
    }
    if (packet.benchmarkAnswer.trim()) {
        return 2;
    }
    return 1;
}

function inferControllerCardPacketStatus(packet: FrankPacketV2): FrankControllerCard['packet_status'] {
    if (!packet.benchmarkAnswer.trim()) {
        return 'phase1_only';
    }
    if (!packet.reverseEngineeredQuestion.trim()) {
        return 'benchmark_complete';
    }
    const readyForKarthic = Boolean(
        packet.selectedPack
        && packet.sourceExtractionSheet
        && packet.goldPacketMapping
        && packet.sourceExtractionSheet.triggerFacts.length > 0
        && packet.goldPacketMapping.requiredGateOrder.length > 0
        && extractBenchmarkSection(packet.benchmarkAnswer, 'Strongest counterargument:').trim(),
    );
    if (!readyForKarthic) {
        return 'question_complete';
    }
    return 'ready_for_karthic';
}

function inferControllerCardWorkflowSourceType(packet: FrankPacketV2): FrankControllerCard['workflow_source_type'] {
    const sourceLabel = [
        packet.sourceExtractionSheet?.sourceTypeAuthorityLevel,
        packet.intakeChecklist?.sourceTypeAuthorityLevel,
        packet.sourceArtifacts[0]?.fileName,
        packet.sourceArtifacts[0]?.extractedText.slice(0, 1200),
    ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
    if (sourceLabel.includes('restatement')) {
        return 'Restatement';
    }
    if (sourceLabel.includes('statute') || sourceLabel.includes('ucc') || sourceLabel.includes(' code ') || sourceLabel.includes('§')) {
        return 'statute';
    }
    if (sourceLabel.includes('treatise') || sourceLabel.includes('hornbook') || sourceLabel.includes('doctrine source')) {
        return 'doctrine source';
    }
    const candidateSource = normalizeNonEmptyString(
        packet.sourceExtractionSheet?.candidateSource,
        packet.intakeChecklist?.candidateSource ?? packet.title,
    );
    if (packet.sourceArtifacts.some((artifact) => artifact.role === 'anchor_case') || /\b(v\.|in re|ex parte)\b/i.test(candidateSource)) {
        return 'case';
    }
    return packet.sourceArtifacts.length > 1 ? 'mixed' : 'mixed';
}

function inferControllerCardWorkflowSourceCaseName(
    packet: FrankPacketV2,
    workflowSourceType: FrankControllerCard['workflow_source_type'],
) {
    if (workflowSourceType !== 'case') {
        return 'none';
    }
    return normalizeNonEmptyString(
        packet.sourceExtractionSheet?.candidateSource,
        packet.intakeChecklist?.candidateSource ?? packet.title,
    );
}

function inferControllerCardWorkflowSourceCaseCitation(
    packet: FrankPacketV2,
    workflowSourceType: FrankControllerCard['workflow_source_type'],
) {
    if (workflowSourceType !== 'case') {
        return 'none';
    }
    const text = packet.sourceArtifacts[0]?.extractedText ?? '';
    const match = text.match(/\b\d{1,4}\s+[A-Z][A-Za-z.\d-]*\s+\d{1,4}\b/);
    return match?.[0]?.trim() ?? 'none';
}

function inferControllerCardSourceCaseMonitoring(
    workflowSourceType: FrankControllerCard['workflow_source_type'],
    workflowSourceCaseName: string,
    workflowSourceCaseCitation: string,
): FrankControllerCard['source_case_monitoring'] {
    return workflowSourceType === 'case'
        && (workflowSourceCaseName !== 'none' || workflowSourceCaseCitation !== 'none')
        ? 'on'
        : 'off';
}

function normalizeFrankControllerCard(value: unknown): FrankControllerCard | null {
    if (!isRecord(value)) {
        return null;
    }
    const normalized = {
        selected_pack: normalizePackId(value.selected_pack) ?? '',
        doctrine_family: normalizeOptionalString(value.doctrine_family, ''),
        jurisdiction_assumption: normalizeOptionalString(value.jurisdiction_assumption, ''),
        benchmark_posture: normalizeOptionalString(value.benchmark_posture, ''),
        current_question_text: normalizeOptionalString(value.current_question_text, ''),
        gold_answer: normalizeOptionalString(value.gold_answer, ''),
        likely_controlling_doctrine: normalizeOptionalString(value.likely_controlling_doctrine, ''),
        correct_trigger_test: normalizeOptionalString(value.correct_trigger_test, ''),
        trigger_facts: normalizeStringArray(value.trigger_facts),
        non_triggered_sibling_gates: normalizeStringArray(value.non_triggered_sibling_gates),
        required_gate_order: normalizeStringArray(value.required_gate_order),
        writing_status: value.writing_status === 'present' || value.writing_status === 'absent' || value.writing_status === 'omitted' || value.writing_status === 'disputed'
            ? value.writing_status
            : 'omitted',
        strongest_counterargument: normalizeOptionalString(value.strongest_counterargument, ''),
        allowed_fallbacks: normalizeStringArray(value.allowed_fallbacks),
        fallback_limits: normalizeStringArray(value.fallback_limits),
        omitted_control_fact: normalizeOptionalString(value.omitted_control_fact, 'none'),
        variation_lane: value.variation_lane === 'A' || value.variation_lane === 'B' || value.variation_lane === 'none'
            ? value.variation_lane
            : 'none',
        selected_lane_code: value.selected_lane_code === 'A1' || value.selected_lane_code === 'A2' || value.selected_lane_code === 'A3' || value.selected_lane_code === 'A4' || value.selected_lane_code === 'B1' || value.selected_lane_code === 'B2' || value.selected_lane_code === 'none'
            ? value.selected_lane_code
            : 'none',
        variation_menu_options: normalizeStringArray(value.variation_menu_options),
        selected_variation_summary: normalizeOptionalString(value.selected_variation_summary, ''),
        selected_variation_fact_deltas: normalizeStringArray(value.selected_variation_fact_deltas),
        rubric_patch_scope: value.rubric_patch_scope === 'selected variation only' ? 'selected variation only' : 'base rubric only',
        failure_bank: normalizeOptionalString(value.failure_bank, ''),
        base_question_text: normalizeOptionalString(value.base_question_text, ''),
        base_gold_answer: normalizeOptionalString(value.base_gold_answer, ''),
        selected_variation_question_text: normalizeOptionalString(value.selected_variation_question_text, ''),
        selected_variation_answer_posture: value.selected_variation_answer_posture === 'localized_edit' || value.selected_variation_answer_posture === 'ambiguity_rewrite'
            ? value.selected_variation_answer_posture
            : 'same_as_base',
        dual_rubric_mode: value.dual_rubric_mode === 'on' ? 'on' : 'off',
        rubric_separation_rule: 'strict',
        evaluation_tracks: value.evaluation_tracks === 'original_and_selected_variation'
            ? 'original_and_selected_variation'
            : 'original_only',
    } satisfies Omit<
        FrankControllerCard,
        | 'packet_status'
        | 'frank_phase_complete'
        | 'rubric_status'
        | 'evaluation_status'
        | 'workflow_source_type'
        | 'workflow_source_case_name'
        | 'workflow_source_case_citation'
        | 'case_citation_verification_mode'
        | 'source_case_monitoring'
        | 'case_citation_scoring_rule'
        | 'case_verification_operating_mode'
        | 'case_existence_check_method'
    >;
    const inferredPacketStatus: FrankControllerCard['packet_status'] = normalized.current_question_text.trim()
        ? 'ready_for_karthic'
        : normalized.gold_answer.trim()
            ? 'benchmark_complete'
            : 'phase1_only';
    return {
        ...normalized,
        packet_status: value.packet_status === 'phase1_only' || value.packet_status === 'benchmark_complete' || value.packet_status === 'question_complete' || value.packet_status === 'ready_for_karthic' || value.packet_status === 'ready_for_dasha'
            ? value.packet_status
            : inferredPacketStatus,
        frank_phase_complete: value.frank_phase_complete === 1 || value.frank_phase_complete === 2 || value.frank_phase_complete === 3
            ? value.frank_phase_complete
            : (normalized.current_question_text.trim() ? 3 : normalized.gold_answer.trim() ? 2 : 1),
        rubric_status: value.rubric_status === 'draft' || value.rubric_status === 'locked'
            ? value.rubric_status
            : 'not_started',
        evaluation_status: value.evaluation_status === 'ready' ? 'ready' : 'not_ready',
        workflow_source_type: value.workflow_source_type === 'case' || value.workflow_source_type === 'statute' || value.workflow_source_type === 'Restatement' || value.workflow_source_type === 'doctrine source' || value.workflow_source_type === 'mixed'
            ? value.workflow_source_type
            : 'mixed',
        workflow_source_case_name: normalizeOptionalString(value.workflow_source_case_name, 'none'),
        workflow_source_case_citation: normalizeOptionalString(value.workflow_source_case_citation, 'none'),
        case_citation_verification_mode: normalizeKarthicCaseCitationVerificationMode(value.case_citation_verification_mode, 'off'),
        source_case_monitoring: value.source_case_monitoring === 'on' ? 'on' : 'off',
        case_citation_scoring_rule: value.case_citation_scoring_rule === 'metadata_only'
            ? 'metadata_only'
            : 'hallucinated_only_penalty',
        case_verification_operating_mode: value.case_verification_operating_mode === 'demo_search_fail_equals_nonexistent'
            ? 'demo_search_fail_equals_nonexistent'
            : 'cautious',
        case_existence_check_method: 'web_search',
    };
}

function extractBenchmarkSection(
    text: string,
    heading: (typeof FRANK_V2_BENCHMARK_HEADINGS)[number],
) {
    if (!text.trim()) {
        return '';
    }
    const targetHeadings = new Set(
        FRANK_V2_BENCHMARK_HEADING_ALIASES[heading].map((value) => normalizeBenchmarkHeadingLabel(value)),
    );
    const allHeadings = new Map(
        FRANK_V2_BENCHMARK_HEADINGS.flatMap((value) =>
            FRANK_V2_BENCHMARK_HEADING_ALIASES[value].map((alias) => [normalizeBenchmarkHeadingLabel(alias), value] as const),
        ),
    );

    const lines = text.replace(/\r/g, '').split('\n');
    let capturing = false;
    const collected: string[] = [];

    for (const line of lines) {
        const normalizedLine = normalizeBenchmarkHeadingLabel(line);
        const matchedHeading = allHeadings.get(normalizedLine);
        if (matchedHeading) {
            if (capturing) {
                break;
            }
            capturing = targetHeadings.has(normalizedLine);
            continue;
        }
        if (capturing) {
            collected.push(line);
        }
    }

    return collected.join('\n').trim();
}

function validateFrankExtractionMappingOrThrow(input: {
    sourceExtractionSheet: FrankSourceExtractionSheet | null;
    goldPacketMapping: FrankGoldPacketMapping | null;
    controllerCard: FrankControllerCard | null;
    likelyFailureModes: FrankLikelyFailureModes | null;
}) {
    const missingSections = [
        !input.sourceExtractionSheet ? 'sourceExtractionSheet' : null,
        !input.goldPacketMapping ? 'goldPacketMapping' : null,
        !input.controllerCard ? 'controllerCard' : null,
        !input.likelyFailureModes ? 'likelyFailureModes' : null,
    ].filter((value): value is string => Boolean(value));

    if (missingSections.length > 0) {
        throw new Error(`Phase 2 returned an invalid extraction/mapping payload. Missing: ${missingSections.join(', ')}.`);
    }
}

function validateFrankApprovalOrThrow(packet: FrankPacketV2) {
    if (!packet.selectedPack || !packet.intakeChecklist || !packet.sourceExtractionSheet || !packet.goldPacketMapping || !packet.controllerCard || !packet.likelyFailureModes) {
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

function getActiveQuestionVariancePackage(packet: FrankPacketV2) {
    const activePackageId = packet.questionVariance.activePackageId;
    if (!activePackageId) {
        return null;
    }
    return packet.questionVariance.packages.find((item) => item.id === activePackageId) ?? null;
}

function defaultRubricTrack(input: {
    id: KarthicRubricTrackId;
    label: string;
    questionSource: QuestionSource;
    questionVariancePackageId?: string | null;
    questionText: string;
    benchmarkAnswer: string;
    seedRows?: KarthicRubricRow[];
    rows?: KarthicRubricRow[];
    preservationNotes?: string[];
    patchNotes?: string[];
    deltaSummary?: string[];
}): KarthicRubricTrack {
    const seedRows = normalizeRubricRows(input.seedRows ?? input.rows ?? []);
    const rows = normalizeRubricRows(input.rows ?? input.seedRows ?? []);
    return {
        id: input.id,
        label: input.label,
        questionSource: input.questionSource,
        questionVariancePackageId: input.questionVariancePackageId ?? null,
        questionText: normalizeOptionalString(input.questionText, ''),
        benchmarkAnswer: normalizeOptionalString(input.benchmarkAnswer, ''),
        seedRows,
        rows,
        preservationNotes: normalizeStringArray(input.preservationNotes),
        patchNotes: normalizeStringArray(input.patchNotes),
        deltaSummary: normalizeStringArray(input.deltaSummary),
    };
}

function buildBaseRubricTrack(packet: FrankPacketV2, rows?: KarthicRubricRow[], seedRows?: KarthicRubricRow[]) {
    return defaultRubricTrack({
        id: 'base',
        label: 'Original question',
        questionSource: 'canonical',
        questionText: packet.reverseEngineeredQuestion,
        benchmarkAnswer: packet.benchmarkAnswer,
        rows,
        seedRows,
        preservationNotes: ['Base rubric stays tied to the original Frank question and benchmark answer.'],
    });
}

function buildSelectedVariationRubricTrack(packet: FrankPacketV2, rows?: KarthicRubricRow[], seedRows?: KarthicRubricRow[]) {
    const activePackage = getActiveQuestionVariancePackage(packet);
    if (!activePackage) {
        return null;
    }
    return defaultRubricTrack({
        id: 'selected_variation',
        label: 'Selected variation',
        questionSource: 'question_variance_active_package',
        questionVariancePackageId: activePackage.id,
        questionText: activePackage.variedLegalQuestion,
        benchmarkAnswer: activePackage.updatedModelAnswer,
        rows,
        seedRows,
        preservationNotes: ['Selected-variation rubric stays tied only to the adopted Frank2 option.'],
        patchNotes: activePackage.rubricPatchNotes,
        deltaSummary: packet.controllerCard?.selected_variation_fact_deltas ?? [],
    });
}

function createDefaultKarthicScoringPolicy(
    controllerCard: FrankControllerCard | null,
    mode: KarthicCaseCitationVerificationMode = 'off',
): KarthicScoringPolicy {
    const effectiveMode = controllerCard?.case_citation_verification_mode === 'on'
        ? controllerCard.case_citation_verification_mode
        : mode;
    return {
        sourceFiles: effectiveMode === 'on'
            ? [...DEFAULT_KARTHIC_POLICY_FILES, '58_Case_Citation_Verification_Protocol_v2.md']
            : [...DEFAULT_KARTHIC_POLICY_FILES],
        caseCitationVerificationMode: effectiveMode,
        zakReviewPenaltyThreshold: 20,
        penalties: DEFAULT_KARTHIC_PENALTIES
            .filter((rule) => rule.code !== 'P_FalseDefinitenessOnDesignedAmbiguity' || controllerCard?.variation_lane === 'B')
            .map((rule) => ({
                ...rule,
                enabled: rule.code !== 'P_HallucinatedCaseCitation' || effectiveMode === 'on',
                notes: '',
            })),
        caps: DEFAULT_KARTHIC_CAPS
            .filter((rule) => rule.code !== 'CAP_75_FalseDefinitenessOnDesignedAmbiguity' || controllerCard?.variation_lane === 'B')
            .map((rule) => ({
                ...rule,
                enabled: rule.code !== 'CAP_75_HallucinatedCoreAuthority' || effectiveMode === 'on',
                notes: '',
            })),
        notes: [
            'Score rows first, then overlays, then at most one cap.',
            'Keep penalties editable at the Karthic stage so Dasha inherits the approved policy instead of improvising it.',
        ],
    };
}

function buildKarthicWorkflowControllerCard(
    controllerCard: FrankControllerCard | null,
    scoringPolicy: KarthicScoringPolicy,
    status: KarthicRubricPackV2['status'],
): FrankControllerCard | null {
    if (!controllerCard) {
        return null;
    }
    const rubricStatus: FrankControllerCard['rubric_status'] = status === 'approved' ? 'locked' : 'draft';
    const packetStatus: FrankControllerCard['packet_status'] = status === 'approved' ? 'ready_for_dasha' : 'ready_for_karthic';
    return {
        ...controllerCard,
        packet_status: packetStatus,
        rubric_status: rubricStatus,
        evaluation_status: status === 'approved' ? 'ready' : 'not_ready',
        case_citation_verification_mode: scoringPolicy.caseCitationVerificationMode,
    };
}

function getRubricTrack(
    pack: Pick<KarthicRubricPackV2, 'tracks'>,
    trackId: KarthicRubricTrackId,
) {
    return trackId === 'selected_variation'
        ? pack.tracks.selected_variation
        : pack.tracks.base;
}

function withActiveRubricTrackAliases(pack: KarthicRubricPackV2): KarthicRubricPackV2 {
    const activeTrack = getRubricTrack(pack, pack.activeTrack) ?? pack.tracks.base;
    return {
        ...pack,
        questionSource: activeTrack.questionSource,
        questionVariancePackageId: activeTrack.questionVariancePackageId,
        questionText: activeTrack.questionText,
        seedRows: activeTrack.seedRows,
        rows: activeTrack.rows,
    };
}

function setPackTrackRows(
    pack: KarthicRubricPackV2,
    trackId: KarthicRubricTrackId,
    input: Partial<Pick<KarthicRubricTrack, 'rows' | 'seedRows'>>,
) {
    const target = getRubricTrack(pack, trackId);
    if (!target) {
        return pack;
    }
    const nextTrack: KarthicRubricTrack = {
        ...target,
        rows: input.rows ? normalizeRubricRows(input.rows) : target.rows,
        seedRows: input.seedRows ? normalizeRubricRows(input.seedRows) : target.seedRows,
    };
    const nextPack: KarthicRubricPackV2 = {
        ...pack,
        tracks: {
            ...pack.tracks,
            [trackId]: nextTrack,
        },
    };
    return withActiveRubricTrackAliases(nextPack);
}

function createKarthicRubricTracks(
    packet: FrankPacketV2,
    input?: {
        baseRows?: KarthicRubricRow[];
        baseSeedRows?: KarthicRubricRow[];
        selectedVariationRows?: KarthicRubricRow[];
        selectedVariationSeedRows?: KarthicRubricRow[];
    },
) {
    const base = buildBaseRubricTrack(packet, input?.baseRows, input?.baseSeedRows);
    const selectedVariation = packet.controllerCard?.dual_rubric_mode === 'on'
        ? buildSelectedVariationRubricTrack(packet, input?.selectedVariationRows, input?.selectedVariationSeedRows)
        : null;
    return {
        base,
        selected_variation: selectedVariation,
    } satisfies KarthicRubricPackV2['tracks'];
}

function flattenLikelyFailureModes(modes: FrankLikelyFailureModes | null) {
    if (!modes) {
        return [] as string[];
    }
    return [modes.FM1, modes.FM2, modes.FM3, modes.FM4, modes.FM5].filter((value) => value.trim().length > 0);
}

function createEmptyQuestionVarianceState(): QuestionVarianceState {
    return {
        phase: 'routing',
        routingResult: null,
        menu: null,
        packages: [],
        activePackageId: null,
        warnings: [],
    };
}

function normalizeQuestionVarianceState(value: unknown): QuestionVarianceState {
    if (!isRecord(value)) {
        return createEmptyQuestionVarianceState();
    }
    const menu = normalizeQuestionVarianceMenu(value.menu);
    const packages = normalizeQuestionVariancePackages(value.packages);
    const activePackageId = normalizeNullableString(value.activePackageId);
    return {
        phase: normalizeQuestionVariancePhase(value.phase, 'routing'),
        routingResult: normalizeQuestionVarianceRoutingResult(value.routingResult),
        menu,
        packages,
        activePackageId: activePackageId && packages.some((item) => item.id === activePackageId) ? activePackageId : null,
        warnings: normalizeStringArray(value.warnings),
    };
}

function normalizeQuestionVarianceRoutingResult(value: unknown): QuestionVarianceRoutingResult | null {
    if (!isRecord(value)) {
        return null;
    }
    return {
        inputType: normalizeNonEmptyString(value.inputType, 'Canonical benchmark question'),
        routeStatus: normalizeQuestionVarianceRouteStatus(value.routeStatus, 'needs_classification_first'),
        governingLawCandidate: normalizeNonEmptyString(value.governingLawCandidate, 'Unclear governing-law candidate'),
        primaryProvisionCandidate: normalizeQuestionVarianceProvisionId(value.primaryProvisionCandidate),
        secondaryCandidates: normalizeQuestionVarianceProvisionIds(value.secondaryCandidates),
        controllingDoctrine: normalizeNonEmptyString(value.controllingDoctrine, 'Controlling doctrine not provided'),
        mainGateOrder: normalizeStringArray(value.mainGateOrder),
        variationReadiness: normalizeNonEmptyString(value.variationReadiness, 'Variation readiness not stated'),
        mainNoSilentChangeFacts: normalizeStringArray(value.mainNoSilentChangeFacts),
        confusionPattern: normalizeConfusionPattern(value.confusionPattern),
        confusionSetId: normalizeNullableString(value.confusionSetId),
        menuRule: normalizeNullableString(value.menuRule),
    };
}

function normalizeQuestionVarianceMenu(value: unknown): QuestionVarianceMenu | null {
    if (!isRecord(value)) {
        return null;
    }
    return {
        generatedAt: normalizeNonEmptyString(value.generatedAt, new Date().toISOString()),
        resolvedProvisionId: normalizeQuestionVarianceProvisionId(value.resolvedProvisionId),
        options: normalizeQuestionVarianceMenuOptions(value.options),
    };
}

function normalizeQuestionVarianceMenuOptions(value: unknown): QuestionVarianceMenuOption[] {
    const options = Array.isArray(value) ? value : [];
    return options
        .map((item) => normalizeQuestionVarianceMenuOption(item))
        .filter((item): item is QuestionVarianceMenuOption => Boolean(item))
        .slice(0, 6);
}

function normalizeQuestionVarianceMenuOption(value: unknown): QuestionVarianceMenuOption | null {
    if (!isRecord(value)) {
        return null;
    }
    const label = normalizeNonEmptyString(value.label, '');
    const lane = normalizeQuestionVarianceLane(value.lane, 'lane_a');
    const laneCode = normalizeQuestionVarianceLaneCode(
        value.laneCode,
        inferQuestionVarianceLaneCodeFromText(
            [
                normalizeNullableString(value.label),
                normalizeNullableString(value.variationType),
                normalizeNullableString(value.id),
            ],
            lane === 'lane_a' ? 'A1' : 'B1',
        ),
    );
    const variationType = normalizeNonEmptyString(value.variationType, '');
    if (!label || !variationType) {
        return null;
    }
    const exactSwapOptions = normalizeQuestionVarianceExactSwapOptions(value.exactSwapOptions, {
        lane,
        laneCode,
        label,
        whatChanges: normalizeNonEmptyString(value.whatChanges, 'What changes was not provided.'),
    });
    return {
        id: buildQuestionVarianceOptionId({
            id: normalizeNullableString(value.id),
            lane,
            laneCode,
            label,
            variationType,
        }),
        label,
        lane,
        laneCode,
        variationType,
        whatChanges: normalizeNonEmptyString(value.whatChanges, 'What changes was not provided.'),
        whyItFits: normalizeNonEmptyString(value.whyItFits, 'Why it fits was not provided.'),
        expectedAnswerReuse: normalizeQuestionVarianceReuseLevel(value.expectedAnswerReuse, 'unsafe'),
        mainRedFlag: normalizeNonEmptyString(value.mainRedFlag, 'Main red flag was not provided.'),
        exactSwapOptions,
    };
}

function normalizeQuestionVariancePackages(value: unknown): QuestionVariancePackage[] {
    const packages = Array.isArray(value) ? value : [];
    return sortVariationPackagesByNewest(
        packages
            .map((item) => normalizeQuestionVariancePackage(item))
            .filter((item): item is QuestionVariancePackage => Boolean(item)),
    );
}

function normalizeQuestionVariancePackage(
    value: unknown,
    fallbackSelectedOptionId?: string,
    fallbackOption?: QuestionVarianceMenuOption,
    fallbackSelectedSwapIds?: string[],
): QuestionVariancePackage | null {
    if (!isRecord(value)) {
        return null;
    }
    const variedLegalQuestion = normalizeOptionalString(value.variedLegalQuestion, '');
    if (!variedLegalQuestion) {
        return null;
    }
    const laneCode = normalizeQuestionVarianceLaneCode(
        value.laneCode,
        fallbackOption?.laneCode ?? inferQuestionVarianceLaneCodeFromText(
            [
                normalizeNullableString(value.variationType),
                normalizeNullableString(value.selectedOptionId),
            ],
            normalizeQuestionVarianceLane(value.lane, 'lane_a') === 'lane_a' ? 'A1' : 'B1',
        ),
    );
    const selectedSwapOptionIds = normalizeSelectedQuestionVarianceSwapIds(
        Array.isArray(value.selectedSwapOptionIds) ? value.selectedSwapOptionIds : fallbackSelectedSwapIds,
        fallbackOption?.exactSwapOptions ?? [],
    );
    return {
        id: normalizeNonEmptyString(value.id, `qv_pkg_${randomUUID().slice(0, 8)}`),
        selectedOptionId: normalizeNonEmptyString(value.selectedOptionId, fallbackSelectedOptionId ?? ''),
        lane: normalizeQuestionVarianceLane(value.lane, 'lane_a'),
        laneCode,
        variationType: normalizeNonEmptyString(value.variationType, 'Variation type unavailable'),
        selectedSwapOptionIds,
        jurisdiction: normalizeNonEmptyString(value.jurisdiction, 'Jurisdiction not stated'),
        controllingDoctrine: normalizeNonEmptyString(value.controllingDoctrine, 'Controlling doctrine not provided'),
        expectedResultType: normalizeQuestionVarianceExpectedResultType(value.expectedResultType, 'unsafe_to_vary'),
        variationStatus: normalizeQuestionVariancePackageStatus(value.variationStatus, 'unsafe'),
        answerReuseLevel: normalizeQuestionVarianceReuseLevel(value.answerReuseLevel, 'unsafe'),
        variedLegalQuestion,
        updatedModelAnswer: normalizeNonEmptyString(value.updatedModelAnswer, 'Unsafe to reuse without substantive revision.'),
        swapLog: normalizeQuestionVarianceSwapLog(value.swapLog),
        rubricPatchNotes: normalizeStringArray(value.rubricPatchNotes),
        whyTheAnswerShouldStayTheSameOrChange: normalizeNonEmptyString(
            value.whyTheAnswerShouldStayTheSameOrChange,
            'Reason for the package result was not provided.',
        ),
        redFlags: normalizeStringArray(value.redFlags),
        status: normalizeQuestionVarianceFinalStatus(value.status, 'unsafe'),
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
    };
}

function normalizeQuestionVarianceSwapLog(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as QuestionVariancePackage['swapLog'];
    }
    return value
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }
            const from = normalizeNonEmptyString(item.from, '');
            const to = normalizeNonEmptyString(item.to, '');
            return from || to ? { from, to } : null;
        })
        .filter((item): item is QuestionVariancePackage['swapLog'][number] => Boolean(item));
}

function normalizeQuestionVarianceExactSwapOptions(
    value: unknown,
    fallback: {
        lane: VariationLane;
        laneCode: VariationLaneCode;
        label: string;
        whatChanges: string;
    },
): QuestionVarianceMenuOption['exactSwapOptions'] {
    const raw = Array.isArray(value) ? value : [];
    const normalized = raw
        .map((item, index) => {
            if (!isRecord(item)) {
                return null;
            }
            const label = normalizeNonEmptyString(item.label, '');
            const from = normalizeNonEmptyString(item.from, '');
            const to = normalizeNonEmptyString(item.to, '');
            const whatChanges = normalizeNonEmptyString(item.whatChanges, '');
            const derivedWhatChanges = whatChanges || [from, to].filter(Boolean).join(' -> ');
            if (!label && !derivedWhatChanges) {
                return null;
            }
            return {
                id: normalizeNonEmptyString(
                    item.id,
                    sanitizeFileName(`${fallback.laneCode}_${label || derivedWhatChanges || index + 1}`.toLowerCase()),
                ),
                label: label || `Variation ${index + 1}`,
                from,
                to,
                whatChanges: derivedWhatChanges || fallback.whatChanges,
            };
        })
        .filter((item): item is QuestionVarianceMenuOption['exactSwapOptions'][number] => Boolean(item));
    if (normalized.length > 0) {
        return normalized;
    }
    return [{
        id: sanitizeFileName(`${fallback.lane}_${fallback.laneCode}_${fallback.label}`.toLowerCase()),
        label: fallback.label,
        from: '',
        to: '',
        whatChanges: fallback.whatChanges,
    }];
}

function normalizeSelectedQuestionVarianceSwapIds(
    value: unknown,
    exactSwapOptions: QuestionVarianceMenuOption['exactSwapOptions'],
) {
    const validIds = new Set(exactSwapOptions.map((item) => item.id));
    if (validIds.size === 0) {
        return [] as string[];
    }
    const requested = Array.isArray(value) ? value : [];
    const normalized = requested
        .map((item) => normalizeNullableString(item))
        .filter((item): item is string => typeof item === 'string' && validIds.has(item));
    return [...new Set(normalized)];
}

function validateQuestionVariancePrerequisitesOrThrow(packet: FrankPacketV2) {
    if (!packet.selectedPack || !packet.goldPacketMapping || !packet.sourceExtractionSheet) {
        throw new Error('QuestionVariance requires completed Frank extraction and mapping first.');
    }
    if (!packet.benchmarkAnswer.trim()) {
        throw new Error('Generate the benchmark answer before using QuestionVariance.');
    }
    if (!packet.reverseEngineeredQuestion.trim()) {
        throw new Error('Generate the canonical reverse-engineered question before using QuestionVariance.');
    }
    validateReverseEngineeredQuestionOrThrow(packet.reverseEngineeredQuestion);
}

function validateQuestionVarianceRoutingOrThrow(routingResult: QuestionVarianceRoutingResult | null) {
    if (!routingResult) {
        throw new Error('QuestionVariance routing returned an invalid payload.');
    }
    if (!routingResult.controllingDoctrine.trim()) {
        throw new Error('QuestionVariance routing is missing the controlling doctrine.');
    }
}

function validateQuestionVarianceMenuOrThrow(menu: QuestionVarianceMenu | null) {
    if (!menu) {
        throw new Error('QuestionVariance menu returned an invalid payload.');
    }
    if (menu.options.length > 6) {
        throw new Error('QuestionVariance menu may not contain more than 6 options.');
    }
}

function validateQuestionVariancePackageOrThrow(pkg: QuestionVariancePackage | null) {
    if (!pkg) {
        throw new Error('QuestionVariance package returned an invalid payload.');
    }
    validateReverseEngineeredQuestionOrThrow(pkg.variedLegalQuestion);
    if (!pkg.selectedOptionId.trim()) {
        throw new Error('QuestionVariance package is missing its selected option reference.');
    }
    if (pkg.selectedSwapOptionIds.length === 0) {
        throw new Error('QuestionVariance package must include at least one selected exact swap.');
    }
}

function retainPackagesForMenu(packages: QuestionVariancePackage[], options: QuestionVarianceMenuOption[]) {
    const optionIds = new Set(options.map((option) => option.id));
    return sortVariationPackagesByNewest(packages.filter((pkg) => optionIds.has(pkg.selectedOptionId)));
}

function sortVariationPackagesByNewest(packages: QuestionVariancePackage[]) {
    return [...packages].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

function buildQuestionVarianceOptionId(input: {
    id: string | null;
    lane: VariationLane;
    laneCode: VariationLaneCode;
    label: string;
    variationType: string;
}) {
    return input.id?.trim()
        || sanitizeFileName(`${input.lane}_${input.laneCode}_${input.label}_${input.variationType}`.toLowerCase());
}

function buildQuestionVariancePackageSignature(selectedOptionId: string, selectedSwapOptionIds: string[]) {
    return `${selectedOptionId}::${[...selectedSwapOptionIds].sort().join('|')}`;
}

function inferQuestionVarianceLaneCodeFromText(
    values: Array<string | null | undefined>,
    fallback: VariationLaneCode = 'A1',
): VariationLaneCode {
    const haystack = values.filter(Boolean).join(' ');
    const match = haystack.match(/\b(A[1-4]|B[1-2])\b/i);
    if (match) {
        return match[1].toUpperCase() as VariationLaneCode;
    }
    const normalized = haystack.toLowerCase();
    if (normalized.includes('variable swap')) return 'A1';
    if (normalized.includes('threshold-preserving numeric shift')) return 'A2';
    if (normalized.includes('specificity shift')) return 'A3';
    if (normalized.includes('salience injection')) return 'A4';
    if (normalized.includes('fact omission') || normalized.includes('ambiguity test')) return 'B1';
    if (normalized.includes('controlled generalization')) return 'B2';
    return fallback;
}

function normalizeQuestionVarianceLaneCode(value: unknown, fallback: VariationLaneCode): VariationLaneCode {
    return value === 'A1' || value === 'A2' || value === 'A3' || value === 'A4' || value === 'B1' || value === 'B2'
        ? value
        : fallback;
}

function normalizeFrankPacket(value: unknown): FrankPacketV2 | null {
    if (!isRecord(value) || value.schemaVersion !== 2) {
        return null;
    }
    const sourceArtifacts = normalizeArtifacts(value.sourceArtifacts);
    return withDerivedControllerCard({
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
        controllerCard: null,
        likelyFailureModes: normalizeFailureModes(value.likelyFailureModes),
        benchmarkAnswer: normalizeOptionalString(value.benchmarkAnswer, ''),
        reverseEngineeredQuestion: normalizeOptionalString(value.reverseEngineeredQuestion, ''),
        questionVariance: normalizeQuestionVarianceState(value.questionVariance),
        savedPrompts: Array.isArray(value.savedPrompts) ? value.savedPrompts as FrankPacketV2['savedPrompts'] : [],
        generationSettings: normalizePromptGenerationSettings(value.generationSettings),
        benchmarkWarnings: normalizeStringArray(value.benchmarkWarnings),
        questionWarnings: normalizeStringArray(value.questionWarnings),
        approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeNonEmptyString(value.updatedAt, new Date().toISOString()),
    });
}

function normalizeKarthicRubricPack(value: unknown): KarthicRubricPackV2 | null {
    if (!isRecord(value) || value.schemaVersion !== 2) {
        return null;
    }
    const tracksRecord = isRecord(value.tracks) ? value.tracks : null;
    const controllerCard = normalizeFrankControllerCard(value.controllerCard);
    const fallbackPolicy = createDefaultKarthicScoringPolicy(controllerCard);
    const baseTrack = normalizeKarthicRubricTrack(
        tracksRecord?.base,
        buildBaseRubricTrack({
            schemaVersion: 2,
            id: '',
            status: 'draft',
            phase: 'question',
            legalDomain: 'Statute of Frauds',
            sourceFamily: 'uploaded_authority',
            title: '',
            selectedPack: normalizePackId(value.selectedPack),
            routingReason: '',
            secondaryIssues: [],
            routingConfidence: null,
            sourceArtifacts: [],
            intakeChecklist: null,
            sourceExtractionSheet: null,
            goldPacketMapping: null,
            controllerCard,
            likelyFailureModes: null,
            benchmarkAnswer: normalizeOptionalString(isRecord(tracksRecord?.base) ? tracksRecord.base.benchmarkAnswer : value.benchmarkAnswer, ''),
            reverseEngineeredQuestion: normalizeOptionalString(isRecord(tracksRecord?.base) ? tracksRecord.base.questionText : value.questionText, ''),
            questionVariance: createEmptyQuestionVarianceState(),
            savedPrompts: [],
            generationSettings: {},
            benchmarkWarnings: [],
            questionWarnings: [],
            approvedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        } satisfies FrankPacketV2, normalizeRubricRows(value.rows), normalizeRubricRows(value.seedRows ?? value.rows)),
    )!;
    const selectedVariationTrack = normalizeKarthicRubricTrack(
        tracksRecord?.selected_variation,
        null,
    );
    const pack = {
        schemaVersion: 2,
        id: normalizeNonEmptyString(value.id, `karthic_v2_${randomUUID().slice(0, 8)}`),
        frankPacketId: normalizeNonEmptyString(value.frankPacketId, ''),
        preClusterRunId: normalizeNullableString(value.preClusterRunId),
        selectedPack: normalizePackId(value.selectedPack) ?? 'pack10',
        controllerCard,
        activeTrack: normalizeKarthicRubricTrackId(value.activeTrack, selectedVariationTrack ? 'base' : 'base'),
        tracks: {
            base: baseTrack,
            selected_variation: selectedVariationTrack,
        },
        questionSource: 'canonical',
        questionVariancePackageId: null,
        questionText: '',
        status: value.status === 'approved' ? 'approved' : 'draft',
        seedRows: [],
        rows: [],
        scoringPolicy: normalizeKarthicScoringPolicy(value.scoringPolicy, fallbackPolicy, controllerCard),
        clusterFailureModes: normalizeStringArray(value.clusterFailureModes),
        refinementLog: normalizeKarthicRefinementLog(value.refinementLog),
        refinementStatus: normalizeKarthicRefinementStatus(value.refinementStatus, value.status === 'approved' ? 'approved' : 'not_started'),
        savedPrompts: Array.isArray(value.savedPrompts) ? value.savedPrompts as KarthicRubricPackV2['savedPrompts'] : [],
        generationSettings: normalizePromptGenerationSettings(value.generationSettings),
        comparisonMethodNote: normalizeOptionalString(value.comparisonMethodNote, ''),
        approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeNonEmptyString(value.updatedAt, new Date().toISOString()),
    } satisfies KarthicRubricPackV2;
    return withActiveRubricTrackAliases({
        ...pack,
        activeTrack: pack.activeTrack === 'selected_variation' && !pack.tracks.selected_variation ? 'base' : pack.activeTrack,
    });
}

function normalizeKarthicPreClusterRun(value: unknown): KarthicPreClusterRunV2 | null {
    if (!isRecord(value) || value.schemaVersion !== 2) {
        return null;
    }
    const status = value.status === 'completed' || value.status === 'failed' ? value.status : 'draft';
    return {
        schemaVersion: 2,
        id: normalizeNonEmptyString(value.id, `karthic_precluster_${randomUUID().slice(0, 8)}`),
        frankPacketId: normalizeNonEmptyString(value.frankPacketId, ''),
        questionText: normalizeOptionalString(value.questionText, ''),
        status,
        selectedModels: Array.isArray(value.selectedModels) ? value.selectedModels as DashaSelectedModel[] : [],
        requestedResponseCount: clampNumber(Math.floor(toNumber(value.requestedResponseCount, 24)), 1, 120),
        validResponseCount: Math.max(0, Math.floor(toNumber(value.validResponseCount, 0))),
        responses: Array.isArray(value.responses) ? value.responses as DashaResponseRecord[] : [],
        clusters: Array.isArray(value.clusters) ? value.clusters as DashaClusterRecord[] : [],
        clusterFailureModes: normalizeStringArray(value.clusterFailureModes),
        clusteringMethod: normalizeOptionalString(value.clusteringMethod, status === 'completed' ? 'unknown' : 'pending'),
        clusteringNotes: typeof value.clusteringNotes === 'string' ? value.clusteringNotes : null,
        errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    };
}

function normalizeDashaRun(value: unknown): DashaRunV2 | null {
    if (!isRecord(value) || value.schemaVersion !== 2) {
        return null;
    }
    const judgeSettings = normalizeDashaJudgeSettings(isRecord(value.judgeSettings)
        ? {
            selectedJudgeModels: Array.isArray(value.judgeSettings.selectedJudgeModels) ? value.judgeSettings.selectedJudgeModels : null,
            model: typeof value.judgeSettings.model === 'string' ? value.judgeSettings.model : null,
            reasoningEffort: typeof value.judgeSettings.reasoningEffort === 'string' ? value.judgeSettings.reasoningEffort : null,
        }
        : null);
    return {
        schemaVersion: 2,
        id: normalizeNonEmptyString(value.id, `dasha_v2_${randomUUID().slice(0, 8)}`),
        rubricPackId: normalizeNonEmptyString(value.rubricPackId, ''),
        rubricTrackId: normalizeKarthicRubricTrackId(value.rubricTrackId, 'base'),
        runMode: value.runMode === 'cluster_only' ? 'cluster_only' : 'score_and_cluster',
        status: normalizeDashaRunStatus(value.status),
        workflowStage: normalizeDashaWorkflowStage(value.workflowStage, value.status === 'completed' ? 'judged' : 'cluster_pending'),
        inputArtifacts: normalizeArtifacts(value.inputArtifacts),
        questionText: normalizeOptionalString(value.questionText, ''),
        questionSource: normalizeQuestionSource(value.questionSource, 'canonical'),
        questionVariancePackageId: normalizeNullableString(value.questionVariancePackageId),
        comparisonId: normalizeNullableString(value.comparisonId),
        comparisonRole: normalizeDashaComparisonRole(value.comparisonRole),
        selectedModels: Array.isArray(value.selectedModels) ? value.selectedModels as DashaSelectedModel[] : [],
        judgeSettings,
        judgeModelRoster: normalizeDashaJudgeModelSelections(value.judgeModelRoster).length > 0
            ? normalizeDashaJudgeModelSelections(value.judgeModelRoster)
            : judgeSettings.selectedJudgeModels,
        judgePanelMode: normalizeDashaJudgePanelMode(value.judgePanelMode, judgeSettings.panelMode),
        judgePanelSize: clampNumber(Math.floor(toNumber(value.judgePanelSize, judgeSettings.panelSize)), 1, 12),
        judgePanelHomogeneityStatus: normalizeDashaJudgePanelHomogeneityStatus(value.judgePanelHomogeneityStatus, judgeSettings.homogeneityStatus),
        judgeAggregationRule: normalizeDashaJudgeAggregationRule(value.judgeAggregationRule, judgeSettings.aggregationRule),
        judgeVoteRecord: normalizeDashaJudgeVoteRecord(value.judgeVoteRecord),
        requestedResponseCount: typeof value.requestedResponseCount === 'number' ? value.requestedResponseCount : undefined,
        validResponseCount: typeof value.validResponseCount === 'number' ? value.validResponseCount : undefined,
        responses: Array.isArray(value.responses) ? value.responses as DashaResponseRecord[] : [],
        clusters: Array.isArray(value.clusters) ? value.clusters as DashaClusterRecord[] : [],
        clusterAnalyses: normalizeDashaClusterAnalyses(value.clusterAnalyses),
        rowResults: Array.isArray(value.rowResults) ? value.rowResults as RubricRowResult[] : [],
        moduleSummaries: Array.isArray(value.moduleSummaries) ? value.moduleSummaries as ModuleSummary[] : [],
        weightedSummary: isRecord(value.weightedSummary)
            ? {
                applicableWeightTotal: toNumber(value.weightedSummary.applicableWeightTotal, 0),
                weightedScore: typeof value.weightedSummary.weightedScore === 'number' ? value.weightedSummary.weightedScore : null,
                notApplicableRowKeys: normalizeRubricRowKeys(value.weightedSummary.notApplicableRowKeys),
            }
            : { applicableWeightTotal: 0, weightedScore: null, notApplicableRowKeys: [] },
        modelSummaries: normalizeDashaModelSummaries(value.modelSummaries),
        trackSummary: normalizeDashaTrackSummary(value.trackSummary),
        clusteringMethod: normalizeOptionalString(value.clusteringMethod, 'unknown'),
        clusteringNotes: typeof value.clusteringNotes === 'string' ? value.clusteringNotes : null,
        errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
        cancelRequestedAt: typeof value.cancelRequestedAt === 'string' ? value.cancelRequestedAt : null,
        cancelledAt: typeof value.cancelledAt === 'string' ? value.cancelledAt : null,
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    };
}

function normalizeKarthicRefinementLog(value: unknown): KarthicRefinementLogEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }
            const rowKey = normalizeRubricRowKey(entry.rowKey);
            if (!rowKey) {
                return null;
            }
            return {
                iteration: Math.max(1, Math.floor(toNumber(entry.iteration, 1))),
                action: normalizeKarthicRefinementAction(entry.action),
                rowKey,
                rationale: normalizeNonEmptyString(entry.rationale, 'No rationale provided.'),
                sourceClusterIds: normalizeStringArray(entry.sourceClusterIds),
            } satisfies KarthicRefinementLogEntry;
        })
        .filter((entry): entry is KarthicRefinementLogEntry => Boolean(entry));
}

function normalizeKarthicRefinementAction(value: unknown): KarthicRefinementLogEntry['action'] {
    switch (value) {
        case 'added':
        case 'rewritten':
        case 'dropped':
        case 'kept':
            return value;
        default:
            return 'kept';
    }
}

function normalizeKarthicRubricTrackId(value: unknown, fallback: KarthicRubricTrackId): KarthicRubricTrackId {
    return value === 'selected_variation' || value === 'base'
        ? value
        : fallback;
}

function normalizeKarthicRubricTrack(value: unknown, fallback: KarthicRubricTrack | null): KarthicRubricTrack | null {
    if (!isRecord(value)) {
        return fallback;
    }
    const fallbackTrack = fallback ?? defaultRubricTrack({
        id: 'base',
        label: 'Original question',
        questionSource: 'canonical',
        questionText: '',
        benchmarkAnswer: '',
    });
    return defaultRubricTrack({
        id: normalizeKarthicRubricTrackId(value.id, fallbackTrack.id),
        label: normalizeNonEmptyString(value.label, fallbackTrack.label),
        questionSource: normalizeQuestionSource(value.questionSource, fallbackTrack.questionSource),
        questionVariancePackageId: normalizeNullableString(value.questionVariancePackageId) ?? fallbackTrack.questionVariancePackageId,
        questionText: normalizeOptionalString(value.questionText, fallbackTrack.questionText),
        benchmarkAnswer: normalizeOptionalString(value.benchmarkAnswer, fallbackTrack.benchmarkAnswer),
        seedRows: normalizeRubricRows(value.seedRows ?? fallbackTrack.seedRows),
        rows: normalizeRubricRows(value.rows ?? fallbackTrack.rows),
        preservationNotes: normalizeStringArray(value.preservationNotes ?? fallbackTrack.preservationNotes),
        patchNotes: normalizeStringArray(value.patchNotes ?? fallbackTrack.patchNotes),
        deltaSummary: normalizeStringArray(value.deltaSummary ?? fallbackTrack.deltaSummary),
    });
}

function normalizeKarthicScoringPolicy(
    value: unknown,
    fallback: KarthicScoringPolicy,
    controllerCard: FrankControllerCard | null,
): KarthicScoringPolicy {
    const record = isRecord(value) ? value : {};
    const mode = normalizeKarthicCaseCitationVerificationMode(record.caseCitationVerificationMode, fallback.caseCitationVerificationMode);
    return {
        sourceFiles: normalizeStringArray(record.sourceFiles).length > 0
            ? normalizeStringArray(record.sourceFiles)
            : createDefaultKarthicScoringPolicy(controllerCard, mode).sourceFiles,
        caseCitationVerificationMode: mode,
        zakReviewPenaltyThreshold: clampNumber(toNumber(record.zakReviewPenaltyThreshold, fallback.zakReviewPenaltyThreshold), 1, 100),
        penalties: normalizeKarthicPenaltyRules(record.penalties, fallback.penalties, controllerCard, mode),
        caps: normalizeKarthicCapRules(record.caps, fallback.caps, controllerCard, mode),
        notes: normalizeStringArray(record.notes ?? fallback.notes),
    };
}

function normalizeKarthicCaseCitationVerificationMode(
    value: unknown,
    fallback: KarthicCaseCitationVerificationMode,
): KarthicCaseCitationVerificationMode {
    return value === 'on' || value === 'off'
        ? value
        : fallback;
}

function normalizeKarthicPenaltyRules(
    value: unknown,
    fallback: KarthicPenaltyRule[],
    controllerCard: FrankControllerCard | null,
    mode: KarthicCaseCitationVerificationMode,
) {
    const byCode = new Map((Array.isArray(value) ? value : []).filter(isRecord).map((item) => [String(item.code), item]));
    return createDefaultKarthicScoringPolicy(controllerCard, mode).penalties.map((rule) => {
        const override = byCode.get(rule.code);
        const fallbackRule = fallback.find((item) => item.code === rule.code) ?? rule;
        return {
            code: rule.code,
            label: normalizeNonEmptyString(override?.label, fallbackRule.label),
            points: clampNumber(toNumber(override?.points, fallbackRule.points), 0, 25),
            enabled: typeof override?.enabled === 'boolean' ? override.enabled : fallbackRule.enabled,
            appliesWhen: normalizeNonEmptyString(override?.appliesWhen, fallbackRule.appliesWhen),
            notes: normalizeOptionalString(override?.notes, fallbackRule.notes),
        } satisfies KarthicPenaltyRule;
    });
}

function normalizeKarthicCapRules(
    value: unknown,
    fallback: KarthicCapRule[],
    controllerCard: FrankControllerCard | null,
    mode: KarthicCaseCitationVerificationMode,
) {
    const byCode = new Map((Array.isArray(value) ? value : []).filter(isRecord).map((item) => [String(item.code), item]));
    return createDefaultKarthicScoringPolicy(controllerCard, mode).caps.map((rule) => {
        const override = byCode.get(rule.code);
        const fallbackRule = fallback.find((item) => item.code === rule.code) ?? rule;
        return {
            code: rule.code,
            label: normalizeNonEmptyString(override?.label, fallbackRule.label),
            cap: clampNumber(toNumber(override?.cap, fallbackRule.cap), 1, 100),
            enabled: typeof override?.enabled === 'boolean' ? override.enabled : fallbackRule.enabled,
            appliesWhen: normalizeNonEmptyString(override?.appliesWhen, fallbackRule.appliesWhen),
            notes: normalizeOptionalString(override?.notes, fallbackRule.notes),
        } satisfies KarthicCapRule;
    });
}

function normalizeKarthicRefinementStatus(value: unknown, fallback: KarthicRubricPackV2['refinementStatus']): KarthicRubricPackV2['refinementStatus'] {
    switch (value) {
        case 'not_started':
        case 'seeded':
        case 'refined':
        case 'approved':
            return value;
        default:
            return fallback;
    }
}

function normalizeDashaRunStatus(value: unknown): DashaRunV2['status'] {
    switch (value) {
        case 'completed':
        case 'failed':
        case 'cancelled':
            return value;
        default:
            return 'draft';
    }
}

function normalizeDashaWorkflowStage(value: unknown, fallback: DashaRunV2['workflowStage']): DashaRunV2['workflowStage'] {
    switch (value) {
        case 'cluster_pending':
        case 'clustered':
        case 'judged':
            return value;
        default:
            return fallback;
    }
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

function normalizeQuestionVarianceProvisionId(value: unknown): VariationProvisionId | null {
    return typeof value === 'string' && VARIATION_PROVISION_IDS.has(value as VariationProvisionId)
        ? value as VariationProvisionId
        : null;
}

function normalizeQuestionVarianceProvisionIds(value: unknown): VariationProvisionId[] {
    return Array.isArray(value)
        ? value.filter((item): item is VariationProvisionId => typeof item === 'string' && VARIATION_PROVISION_IDS.has(item as VariationProvisionId))
        : [];
}

function normalizeQuestionVarianceRouteStatus(value: unknown, fallback: VariationRouteStatus): VariationRouteStatus {
    return typeof value === 'string' && VARIATION_ROUTE_STATUSES.has(value as VariationRouteStatus)
        ? value as VariationRouteStatus
        : fallback;
}

function normalizeQuestionVarianceLane(value: unknown, fallback: VariationLane): VariationLane {
    return typeof value === 'string' && VARIATION_LANES.has(value as VariationLane)
        ? value as VariationLane
        : fallback;
}

function normalizeQuestionVarianceReuseLevel(value: unknown, fallback: VariationReuseLevel): VariationReuseLevel {
    return typeof value === 'string' && VARIATION_REUSE_LEVELS.has(value as VariationReuseLevel)
        ? value as VariationReuseLevel
        : fallback;
}

function normalizeQuestionVarianceFinalStatus(value: unknown, fallback: VariationStatus): VariationStatus {
    return typeof value === 'string' && VARIATION_FINAL_STATUSES.has(value as VariationStatus)
        ? value as VariationStatus
        : fallback;
}

function normalizeQuestionVariancePackageStatus(value: unknown, fallback: VariationPackageStatus): VariationPackageStatus {
    return typeof value === 'string' && VARIATION_PACKAGE_STATUSES.has(value as VariationPackageStatus)
        ? value as VariationPackageStatus
        : fallback;
}

function normalizeQuestionVarianceExpectedResultType(value: unknown, fallback: VariationExpectedResultType): VariationExpectedResultType {
    return typeof value === 'string' && VARIATION_EXPECTED_RESULT_TYPES.has(value as VariationExpectedResultType)
        ? value as VariationExpectedResultType
        : fallback;
}

function normalizeConfusionPattern(value: unknown): ConfusionPattern | null {
    return typeof value === 'string' && VARIATION_CONFUSION_PATTERNS.has(value as ConfusionPattern)
        ? value as ConfusionPattern
        : null;
}

function normalizeQuestionVariancePhase(value: unknown, fallback: QuestionVariancePhase): QuestionVariancePhase {
    return value === 'routing' || value === 'menu' || value === 'package' ? value : fallback;
}

function normalizeQuestionSource(value: unknown, fallback: QuestionSource): QuestionSource {
    return typeof value === 'string' && RUBRIC_QUESTION_SOURCES.has(value as QuestionSource)
        ? value as QuestionSource
        : fallback;
}

function normalizeDashaComparisonRole(value: unknown): DashaComparisonRole | null {
    return value === 'baseline' || value === 'variant' ? value : null;
}

function normalizeRoutingConfidence(value: unknown): RoutingConfidence | null {
    return value === 'strong' || value === 'moderate' || value === 'weak' ? value : null;
}

function normalizePhase(value: unknown, fallback: FrankPhase): FrankPhase {
    return value === 'source' || value === 'routing_intake' || value === 'extraction_mapping' || value === 'benchmark' || value === 'question'
        ? value
        : fallback;
}

function normalizeReasoningEffortValue(value: unknown, fallback: ReasoningEffort): ReasoningEffort {
    return value === 'none' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
        ? value
        : fallback;
}

function normalizePromptGenerationSettings(value: unknown): PromptGenerationSettingsByKind {
    const record = isRecord(value) ? value : {};
    const entries = Object.entries(DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND).map(([kind, defaultSetting]) => [
        kind,
        normalizePromptGenerationSetting(record[kind], defaultSetting),
    ] as const);
    return Object.fromEntries(entries) as PromptGenerationSettingsByKind;
}

function normalizePromptGenerationSetting(value: unknown, fallback: FrankGenerationSettings): FrankGenerationSettings {
    const record = isRecord(value) ? value : {};
    return {
        model: normalizeNonEmptyString(record.model, fallback.model),
        reasoningEffort: normalizeReasoningEffortValue(record.reasoningEffort, fallback.reasoningEffort),
    };
}

function withUpdatedPromptGenerationSetting(
    settings: PromptGenerationSettingsByKind | undefined,
    kind: FrankSavedPromptKind,
    model?: string,
    reasoningEffort?: ReasoningEffort,
) {
    const nextSettings = normalizePromptGenerationSettings(settings);
    nextSettings[kind] = normalizePromptGenerationSetting(
        {
            model,
            reasoningEffort,
        },
        nextSettings[kind] ?? DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND[kind] ?? DEFAULT_PROMPT_GENERATION_SETTINGS_BY_KIND.routing_intake_generation!,
    );
    return nextSettings;
}

function normalizeRubricRowKeys(value: unknown): RubricRowKey[] {
    return Array.isArray(value)
        ? value.filter((item): item is RubricRowKey => typeof item === 'string' && ROW_KEYS.has(item as RubricRowKey))
        : [];
}

function normalizeRubricRowKey(value: unknown): RubricRowKey | null {
    return typeof value === 'string' && ROW_KEYS.has(value as RubricRowKey) ? value as RubricRowKey : null;
}

function normalizeOpenAiJsonModel(model?: string) {
    return model?.trim() || DEFAULT_OPENAI_JSON_MODEL;
}

function normalizeOpenAiTextModel(model?: string) {
    return model?.trim() || DEFAULT_OPENAI_TEXT_MODEL;
}

function normalizeDashaJudgeSettings(value: {
    provider?: ModelProvider | string | null;
    selectedJudgeModels?: unknown;
    model?: string | null;
    reasoningEffort?: ReasoningEffort | string | null;
} | null | undefined): DashaJudgeSettings {
    const selectedJudgeModels = normalizeDashaJudgeModelSelections(value?.selectedJudgeModels);
    const fallbackProvider = normalizeModelProvider(value?.provider, 'openai');
    const fallbackReasoningEffort = normalizeReasoningEffortValue(
        value?.reasoningEffort,
        DEFAULT_DASHA_JUDGE_SETTINGS.reasoningEffort,
    );
    const fallbackModel = normalizeJudgeModelForProvider(fallbackProvider, value?.model ?? undefined);
    const normalizedModels = selectedJudgeModels.length > 0
        ? selectedJudgeModels
        : [{
            provider: fallbackProvider,
            model: fallbackModel,
            reasoningEffort: fallbackReasoningEffort,
        }];
    const primaryJudge = normalizedModels[0] ?? DEFAULT_DASHA_JUDGE_SETTINGS.selectedJudgeModels[0];
    const panelMode = normalizedModels.length > 1 ? 'multi_model_panel' : 'single_model';
    const homogeneityStatus = getDashaJudgePanelHomogeneityStatus(normalizedModels);

    return {
        provider: primaryJudge.provider,
        model: primaryJudge.model,
        reasoningEffort: primaryJudge.reasoningEffort,
        selectedJudgeModels: normalizedModels,
        panelMode,
        panelSize: normalizedModels.length,
        homogeneityStatus,
        aggregationRule: DEFAULT_DASHA_JUDGE_AGGREGATION_RULE,
    };
}

function normalizeDashaJudgeModelSelections(value: unknown): DashaJudgeModelSelection[] {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const normalized = raw
        .map((entry) => {
            if (!isRecord(entry)) {
                return null;
            }
            const model = typeof entry.model === 'string' ? entry.model.trim() : '';
            if (!model) {
                return null;
            }
            const provider = normalizeModelProvider(entry.provider, 'openai');
            const reasoningEffort = normalizeReasoningEffortValue(entry.reasoningEffort, DEFAULT_DASHA_JUDGE_SETTINGS.reasoningEffort);
            const key = `${provider}::${model}::${reasoningEffort}`;
            if (seen.has(key)) {
                return null;
            }
            seen.add(key);
            return {
                provider,
                model,
                reasoningEffort,
            };
        })
        .filter((entry): entry is DashaJudgeModelSelection => Boolean(entry));
    return normalized;
}

function normalizeDashaJudgePanelMode(value: unknown, fallback: DashaJudgePanelMode): DashaJudgePanelMode {
    return value === 'single_model' || value === 'multi_model_panel'
        ? value
        : fallback;
}

function normalizeDashaJudgePanelHomogeneityStatus(value: unknown, fallback: DashaJudgePanelHomogeneityStatus): DashaJudgePanelHomogeneityStatus {
    return value === 'homogeneous' || value === 'heterogeneous'
        ? value
        : fallback;
}

function normalizeDashaJudgeAggregationRule(value: unknown, fallback: DashaJudgeAggregationRule): DashaJudgeAggregationRule {
    return value === DEFAULT_DASHA_JUDGE_AGGREGATION_RULE
        ? value
        : fallback;
}

function getDashaJudgePanelHomogeneityStatus(selectedJudgeModels: DashaJudgeModelSelection[]): DashaJudgePanelHomogeneityStatus {
    const families = new Set(selectedJudgeModels.map((judge) => getDashaJudgeModelFamily(judge.provider, judge.model)));
    return families.size > 1 ? 'heterogeneous' : 'homogeneous';
}

function getDashaJudgeModelFamily(provider: ModelProvider, model: string) {
    const normalized = model.trim().toLowerCase();
    if (provider === 'openai' && normalized.startsWith('gpt-')) {
        return 'gpt';
    }
    if (provider === 'anthropic' && normalized.startsWith('claude-')) {
        return 'claude';
    }
    if (provider === 'gemini' && normalized.startsWith('gemini-')) {
        return 'gemini';
    }
    const family = normalized.split('-')[0]?.trim();
    return family || 'unknown';
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

function normalizeNullableString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseModelKey(modelKey: string) {
    const [provider, ...modelParts] = modelKey.split('::');
    if (modelParts.length === 0) {
        return {
            provider: 'openai' as ModelProvider,
            model: provider,
        };
    }
    return {
        provider: normalizeModelProvider(provider, 'openai'),
        model: modelParts.join('::'),
    };
}

function normalizeDashaModelSummaries(value: unknown): DashaModelSummary[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => normalizeDashaModelSummary(item))
        .filter((item): item is DashaModelSummary => Boolean(item));
}

function normalizeDashaClusterAnalyses(value: unknown): DashaClusterAnalysis[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => normalizeDashaClusterAnalysisRecord(item))
        .filter((item): item is DashaClusterAnalysis => Boolean(item));
}

function normalizeDashaClusterAnalysisRecord(value: unknown): DashaClusterAnalysis | null {
    if (!isRecord(value)) {
        return null;
    }
    const clusterId = normalizeNonEmptyString(value.clusterId, '');
    if (!clusterId) {
        return null;
    }
    return {
        clusterId,
        evaluationTrack: normalizeNonEmptyString(value.evaluationTrack, 'evaluation_track_original'),
        questionVersion: normalizeNonEmptyString(value.questionVersion, 'original'),
        rubricType: normalizeNonEmptyString(value.rubricType, 'base_rubric'),
        clusterSizeTotal: clampNumber(Math.floor(toNumber(value.clusterSizeTotal, 0)), 0, 400),
        representedModelCount: clampNumber(Math.floor(toNumber(value.representedModelCount, 0)), 0, 400),
        dominantModelName: normalizeNullableString(value.dominantModelName),
        dominantModelCount: clampNumber(Math.floor(toNumber(value.dominantModelCount, 0)), 0, 400),
        dominantModelShare: typeof value.dominantModelShare === 'number' ? value.dominantModelShare : 0,
        subtotal: typeof value.subtotal === 'number' ? value.subtotal : null,
        penaltiesApplied: Array.isArray(value.penaltiesApplied)
            ? value.penaltiesApplied
                .map((entry) => {
                    if (!isRecord(entry)) {
                        return null;
                    }
                    const code = normalizeNonEmptyString(entry.code, '');
                    if (!code) {
                        return null;
                    }
                    return {
                        code,
                        label: normalizeNonEmptyString(entry.label, code),
                        points: clampNumber(Math.floor(toNumber(entry.points, 0)), 0, 100),
                        reason: normalizeNonEmptyString(entry.reason, ''),
                    } satisfies DashaAppliedPenalty;
                })
                .filter((entry): entry is DashaAppliedPenalty => Boolean(entry))
            : [],
        capApplied: isRecord(value.capApplied)
            ? {
                code: normalizeNonEmptyString(value.capApplied.code, ''),
                label: normalizeNonEmptyString(value.capApplied.label, ''),
                cap: clampNumber(Math.floor(toNumber(value.capApplied.cap, 100)), 0, 100),
                reason: normalizeNonEmptyString(value.capApplied.reason, ''),
            }
            : null,
        finalScore: typeof value.finalScore === 'number' ? value.finalScore : null,
        disagreementFlag: Boolean(value.disagreementFlag),
        zakReviewFlag: Boolean(value.zakReviewFlag),
        trackSummaryNote: normalizeNonEmptyString(value.trackSummaryNote, ''),
        caseCitation: normalizeDashaCaseCitationAnalysis(
            isRecord(value.caseCitation) ? value.caseCitation : null,
            {
                caseMentionStatus: 'none',
                extractedCaseMentions: [],
                verifiedCaseMentions: [],
                hallucinatedCaseMentions: [],
                citedCaseCountTotal: 0,
                verifiedCaseCount: 0,
                hallucinatedCaseCount: 0,
                caseExistenceSummary: 'no_case',
                citationAccuracyStatus: 'not_applicable',
                sourceCaseReferenceStatus: 'not_applicable',
                sourceCaseReferenceNote: '',
                caseVerificationReviewFlag: false,
                note: '',
            },
        ),
    };
}

function normalizeDashaTrackSummary(value: unknown): DashaTrackSummary | null {
    if (!isRecord(value)) {
        return null;
    }
    return {
        evaluationTrack: normalizeNonEmptyString(value.evaluationTrack, 'evaluation_track_original'),
        questionVersion: normalizeNonEmptyString(value.questionVersion, 'original'),
        rubricType: normalizeNonEmptyString(value.rubricType, 'base_rubric'),
        judgePanelMode: normalizeDashaJudgePanelMode(value.judgePanelMode, 'single_model'),
        judgeModelRoster: normalizeDashaJudgeModelSelections(value.judgeModelRoster),
        judgePanelHomogeneityStatus: normalizeDashaJudgePanelHomogeneityStatus(value.judgePanelHomogeneityStatus, 'homogeneous'),
        judgeAggregationRule: normalizeDashaJudgeAggregationRule(value.judgeAggregationRule, DEFAULT_DASHA_JUDGE_AGGREGATION_RULE),
        rankedCentroidList: normalizeStringArray(value.rankedCentroidList),
        disputedCentroidIds: normalizeStringArray(value.disputedCentroidIds),
        bestCentroidByScore: normalizeNullableString(value.bestCentroidByScore),
        bestCentroidScore: typeof value.bestCentroidScore === 'number' ? value.bestCentroidScore : null,
        topCentroidVoteSplit: normalizeNonEmptyString(value.topCentroidVoteSplit, 'not_applicable'),
        panelMajorityStatus: normalizeDashaPanelMajorityStatus(value.panelMajorityStatus),
        bestCentroidZakReviewFlag: Boolean(value.bestCentroidZakReviewFlag),
        trackSummary: normalizeNonEmptyString(value.trackSummary, ''),
    };
}

function normalizeDashaPanelMajorityStatus(value: unknown): DashaPanelMajorityStatus {
    return value === 'majority' || value === 'no_majority' || value === 'not_applicable'
        ? value
        : 'not_applicable';
}

function normalizeDashaJudgeVoteRecord(value: unknown): DashaJudgeVoteRecord[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry, index) => {
            if (!isRecord(entry)) {
                return null;
            }
            const provider = normalizeModelProvider(entry.provider, 'openai');
            const model = normalizeJudgeModelForProvider(provider, typeof entry.model === 'string' ? entry.model : undefined);
            return {
                judgeId: normalizeNonEmptyString(entry.judgeId, `judge_${index + 1}`),
                provider,
                model,
                reasoningEffort: normalizeReasoningEffortValue(entry.reasoningEffort, DEFAULT_DASHA_JUDGE_SETTINGS.reasoningEffort),
                modelFamily: normalizeNonEmptyString(entry.modelFamily, getDashaJudgeModelFamily(provider, model)),
                rankedCentroidList: normalizeStringArray(entry.rankedCentroidList),
                topCentroidId: normalizeNullableString(entry.topCentroidId),
                topCentroidScore: typeof entry.topCentroidScore === 'number' ? entry.topCentroidScore : null,
                centroidFinalScores: Array.isArray(entry.centroidFinalScores)
                    ? entry.centroidFinalScores
                        .map((scoreEntry) => {
                            if (!isRecord(scoreEntry)) {
                                return null;
                            }
                            const clusterId = normalizeNonEmptyString(scoreEntry.clusterId, '');
                            if (!clusterId) {
                                return null;
                            }
                            return {
                                clusterId,
                                subtotal: typeof scoreEntry.subtotal === 'number' ? scoreEntry.subtotal : null,
                                finalScore: typeof scoreEntry.finalScore === 'number' ? scoreEntry.finalScore : null,
                            };
                        })
                        .filter((scoreEntry): scoreEntry is DashaJudgeVoteRecord['centroidFinalScores'][number] => Boolean(scoreEntry))
                    : [],
            } satisfies DashaJudgeVoteRecord;
        })
        .filter((entry): entry is DashaJudgeVoteRecord => Boolean(entry));
}

function normalizeZakReview(value: unknown): ZakReviewV1 | null {
    if (!isRecord(value) || value.schemaVersion !== 1) {
        return null;
    }
    return {
        schemaVersion: 1,
        id: normalizeNonEmptyString(value.id, `zak_v1_${randomUUID().slice(0, 8)}`),
        status: value.status === 'completed' || value.status === 'failed' ? value.status : 'draft',
        invocationMode: value.invocationMode === 'automatic_dasha_non_majority' ? 'automatic_dasha_non_majority' : 'manual_review',
        dashaRunId: normalizeNonEmptyString(value.dashaRunId, ''),
        rubricPackId: normalizeNonEmptyString(value.rubricPackId, ''),
        rubricTrackId: normalizeKarthicRubricTrackId(value.rubricTrackId, 'base'),
        frankPacketId: normalizeNonEmptyString(value.frankPacketId, ''),
        evaluationTrack: normalizeNonEmptyString(value.evaluationTrack, 'evaluation_track_original'),
        questionVersion: normalizeNonEmptyString(value.questionVersion, 'original'),
        rubricType: normalizeNonEmptyString(value.rubricType, 'base_rubric'),
        dualRubricMode: value.dualRubricMode === 'on' ? 'on' : 'off',
        selectedLaneCode: normalizeFrankControllerCard({
            selected_lane_code: value.selectedLaneCode,
        })?.selected_lane_code ?? 'none',
        topCentroidVoteSplit: normalizeNonEmptyString(value.topCentroidVoteSplit, 'not_applicable'),
        judgeModelRoster: normalizeDashaJudgeModelSelections(value.judgeModelRoster),
        judgePanelMode: normalizeDashaJudgePanelMode(value.judgePanelMode, 'single_model'),
        judgeAggregationRule: normalizeDashaJudgeAggregationRule(value.judgeAggregationRule, DEFAULT_DASHA_JUDGE_AGGREGATION_RULE),
        disputedCentroidIds: normalizeStringArray(value.disputedCentroidIds),
        packetReviewReady: Boolean(value.packetReviewReady),
        printablePacketStatus: value.printablePacketStatus === 'ready' ? 'ready' : 'not_ready',
        printablePacketContentsSummary: normalizeNonEmptyString(value.printablePacketContentsSummary, ''),
        printablePacketCanBeAssembled: Boolean(value.printablePacketCanBeAssembled),
        activeQuestionText: normalizeOptionalString(value.activeQuestionText, ''),
        activeRubricRows: normalizeRubricRows(value.activeRubricRows),
        disputedCentroids: normalizeZakReviewCentroids(value.disputedCentroids),
        scoringSheet: normalizeZakScoringSheetEntries(value.scoringSheet),
        decisionRecord: normalizeZakDecisionRecord(value.decisionRecord),
        scoreLockStatus: value.scoreLockStatus === 'ready' ? 'ready' : 'not_ready',
        upstreamRevisionTarget: value.upstreamRevisionTarget === 'Frank' || value.upstreamRevisionTarget === 'Karthic' || value.upstreamRevisionTarget === 'Dasha'
            ? value.upstreamRevisionTarget
            : 'none',
        dispositionNote: normalizeNonEmptyString(value.dispositionNote, ''),
        exportAvailabilityNote: normalizeNonEmptyString(value.exportAvailabilityNote, ''),
        createdAt: normalizeNonEmptyString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeNonEmptyString(value.updatedAt, new Date().toISOString()),
        completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
        errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    };
}

function normalizeZakReviewCentroids(value: unknown): ZakReviewCentroid[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }
            const centroidId = normalizeNonEmptyString(item.centroidId, '');
            if (!centroidId) {
                return null;
            }
            return {
                centroidId,
                centroidText: normalizeOptionalString(item.centroidText, ''),
                dashaRowScoringSummary: Array.isArray(item.dashaRowScoringSummary)
                    ? item.dashaRowScoringSummary
                        .map((row) => {
                            if (!isRecord(row)) {
                                return null;
                            }
                            const rowKey = normalizeRubricRowKey(row.rowKey);
                            const moduleId = typeof row.moduleId === 'string' && MODULE_IDS.has(row.moduleId as RubricModuleId)
                                ? row.moduleId as RubricModuleId
                                : 'module1';
                            if (!rowKey) {
                                return null;
                            }
                            return {
                                rowKey,
                                rowTitle: normalizeNonEmptyString(row.rowTitle, rowKey),
                                moduleId,
                                moduleLabel: normalizeNonEmptyString(row.moduleLabel, RUBRIC_MODULE_LABELS[moduleId]),
                                weight: clampNumber(Math.floor(toNumber(row.weight, 1)), 1, 25),
                                score: typeof row.score === 'number' ? row.score : null,
                                applicabilityStatus: row.applicabilityStatus === 'applicable' ? 'applicable' : 'not_applicable',
                                rationale: normalizeNonEmptyString(row.rationale, ''),
                                differenceSummary: normalizeNonEmptyString(row.differenceSummary, ''),
                            };
                        })
                        .filter((row): row is ZakReviewCentroid['dashaRowScoringSummary'][number] => Boolean(row))
                    : [],
                subtotal: typeof item.subtotal === 'number' ? item.subtotal : null,
                penaltiesApplied: Array.isArray(item.penaltiesApplied) ? item.penaltiesApplied as DashaAppliedPenalty[] : [],
                capApplied: isRecord(item.capApplied) ? item.capApplied as DashaAppliedCap : null,
                finalScore: typeof item.finalScore === 'number' ? item.finalScore : null,
                clusterSizeTotal: clampNumber(Math.floor(toNumber(item.clusterSizeTotal, 0)), 0, 400),
                modelBreakdown: Array.isArray(item.modelBreakdown) ? item.modelBreakdown as DashaClusterRecord['modelBreakdown'] : [],
                representedModelCount: clampNumber(Math.floor(toNumber(item.representedModelCount, 0)), 0, 400),
                dominantModelName: normalizeNullableString(item.dominantModelName),
                dominantModelShare: typeof item.dominantModelShare === 'number' ? item.dominantModelShare : 0,
                caseCitation: normalizeDashaCaseCitationAnalysis(isRecord(item.caseCitation) ? item.caseCitation : null, {
                    caseMentionStatus: 'none',
                    extractedCaseMentions: [],
                    verifiedCaseMentions: [],
                    hallucinatedCaseMentions: [],
                    citedCaseCountTotal: 0,
                    verifiedCaseCount: 0,
                    hallucinatedCaseCount: 0,
                    caseExistenceSummary: 'no_case',
                    citationAccuracyStatus: 'not_applicable',
                    sourceCaseReferenceStatus: 'not_applicable',
                    sourceCaseReferenceNote: '',
                    caseVerificationReviewFlag: false,
                    note: '',
                }),
                shortKarthicEscalationNote: normalizeNonEmptyString(item.shortKarthicEscalationNote, ''),
            } satisfies ZakReviewCentroid;
        })
        .filter((item): item is ZakReviewCentroid => Boolean(item));
}

function normalizeZakScoringSheetEntries(value: unknown): ZakScoringSheetEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => {
            if (!isRecord(item)) {
                return null;
            }
            const rowKey = normalizeRubricRowKey(item.rowKey);
            const centroidId = normalizeNonEmptyString(item.centroidId, '');
            if (!rowKey || !centroidId) {
                return null;
            }
            return {
                centroidId,
                rowKey,
                rowLabel: normalizeNonEmptyString(item.rowLabel, rowKey),
                shortRowPurpose: normalizeNonEmptyString(item.shortRowPurpose, ''),
                scoringReminder: normalizeNonEmptyString(item.scoringReminder, ''),
                smeScore: typeof item.smeScore === 'number' ? clampNumber(item.smeScore, 0, 4) : null,
                smeNote: normalizeOptionalString(item.smeNote, ''),
            } satisfies ZakScoringSheetEntry;
        })
        .filter((item): item is ZakScoringSheetEntry => Boolean(item));
}

function normalizeZakDecisionRecord(value: unknown): ZakDecisionRecord {
    const record = isRecord(value) ? value : {};
    return {
        smeSelectedBestCentroid: normalizeNonEmptyString(record.smeSelectedBestCentroid, 'none'),
        smeConfidence: record.smeConfidence === 'high' || record.smeConfidence === 'medium' || record.smeConfidence === 'low'
            ? record.smeConfidence
            : 'not_provided',
        controllingRowsDrivingDecision: normalizeStringArray(record.controllingRowsDrivingDecision),
        rubricInstabilityNotes: normalizeOptionalString(record.rubricInstabilityNotes, ''),
        upstreamRevisionNeededNotes: normalizeOptionalString(record.upstreamRevisionNeededNotes, ''),
    };
}

function normalizeDashaModelSummary(value: unknown): DashaModelSummary | null {
    if (!isRecord(value)) {
        return null;
    }
    const modelKey = normalizeNonEmptyString(value.modelKey, '');
    if (!modelKey) {
        return null;
    }
    const parsed = parseModelKey(modelKey);
    return {
        modelKey,
        provider: typeof value.provider === 'string' ? value.provider as ModelProvider : parsed.provider,
        model: normalizeNonEmptyString(value.model, parsed.model),
        validCount: clampNumber(Math.floor(toNumber(value.validCount, 0)), 0, 400),
        errorCount: clampNumber(Math.floor(toNumber(value.errorCount, 0)), 0, 400),
        totalResponses: clampNumber(Math.floor(toNumber(value.totalResponses, 0)), 0, 400),
        propagatedWeightedScore: typeof value.propagatedWeightedScore === 'number' ? value.propagatedWeightedScore : null,
        dominantClusterId: normalizeNullableString(value.dominantClusterId),
        dominantClusterShare: typeof value.dominantClusterShare === 'number' ? value.dominantClusterShare : 0,
        clusterContributions: Array.isArray(value.clusterContributions)
            ? value.clusterContributions
                .map((entry) => {
                    if (!isRecord(entry)) {
                        return null;
                    }
                    const clusterId = normalizeNonEmptyString(entry.clusterId, '');
                    if (!clusterId) {
                        return null;
                    }
                    return {
                        clusterId,
                        count: clampNumber(Math.floor(toNumber(entry.count, 0)), 0, 400),
                        share: typeof entry.share === 'number' ? entry.share : 0,
                        clusterWeightedScore: typeof entry.clusterWeightedScore === 'number' ? entry.clusterWeightedScore : null,
                    };
                })
                .filter((entry): entry is DashaModelSummary['clusterContributions'][number] => Boolean(entry))
            : [],
    };
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

function parseJsonObjectResponse(value: string) {
    const direct = safeJsonParse<Record<string, unknown>>(value);
    if (direct && isRecord(direct)) {
        return direct;
    }
    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        const fenced = safeJsonParse<Record<string, unknown>>(fencedMatch[1].trim());
        if (fenced && isRecord(fenced)) {
            return fenced;
        }
    }
    const objectStart = value.indexOf('{');
    const objectEnd = value.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
        const sliced = safeJsonParse<Record<string, unknown>>(value.slice(objectStart, objectEnd + 1));
        if (sliced && isRecord(sliced)) {
            return sliced;
        }
    }
    return null;
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

function getOpenAiClient() {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeModelProvider(value: unknown, fallback: ModelProvider): ModelProvider {
    return value === 'openai' || value === 'anthropic' || value === 'gemini'
        ? value
        : fallback;
}

function getDefaultJudgeModelForProvider(provider: ModelProvider) {
    if (provider === 'anthropic') {
        return DEFAULT_ANTHROPIC_JUDGE_MODEL;
    }
    if (provider === 'gemini') {
        return DEFAULT_GEMINI_JUDGE_MODEL;
    }
    return DEFAULT_OPENAI_JSON_MODEL;
}

function normalizeJudgeModelForProvider(provider: ModelProvider, model?: string) {
    return model?.trim() || getDefaultJudgeModelForProvider(provider);
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
    const itemsById = new Map<string, { item: T; fileName: string }>();
    const anonymousItems: T[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name) !== '.json') {
            continue;
        }
        const record = await safeReadJson<T>(path.join(directory, entry.name));
        if (record) {
            const recordId = typeof (record as Record<string, unknown>).id === 'string'
                ? String((record as Record<string, unknown>).id).trim()
                : '';
            if (!recordId) {
                anonymousItems.push(record);
                continue;
            }

            const existing = itemsById.get(recordId);
            if (!existing) {
                itemsById.set(recordId, { item: record, fileName: entry.name });
                continue;
            }

            const canonicalFileName = `${sanitizeFileName(recordId)}.json`;
            const existingIsCanonical = existing.fileName === canonicalFileName;
            const nextIsCanonical = entry.name === canonicalFileName;

            if (nextIsCanonical && !existingIsCanonical) {
                itemsById.set(recordId, { item: record, fileName: entry.name });
                continue;
            }
            if (existingIsCanonical && !nextIsCanonical) {
                continue;
            }

            const existingUpdatedAt = String((existing.item as Record<string, unknown>).updatedAt ?? '');
            const nextUpdatedAt = String((record as Record<string, unknown>).updatedAt ?? '');
            if (nextUpdatedAt.localeCompare(existingUpdatedAt) > 0) {
                itemsById.set(recordId, { item: record, fileName: entry.name });
            }
        }
    }
    return [...itemsById.values(), ...anonymousItems.map((item) => ({ item, fileName: '' }))]
        .map((entry) => entry.item)
        .sort((left, right) => String((right as Record<string, unknown>).updatedAt ?? '').localeCompare(String((left as Record<string, unknown>).updatedAt ?? '')));
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

async function getRequiredKarthicPreClusterRun(id: string) {
    const run = await getKarthicPreClusterRun(id);
    if (!run) {
        throw new Error('Pre-Karthic cluster run not found.');
    }
    return run;
}

async function getRequiredDashaRun(id: string) {
    const run = await getDashaRun(id);
    if (!run) {
        throw new Error('Dasha run not found.');
    }
    return run;
}

async function getRequiredZakReview(id: string) {
    const review = await getZakReview(id);
    if (!review) {
        throw new Error('Zak review not found.');
    }
    return review;
}

async function deriveClusterFailureModes(input: {
    benchmarkAnswer: string;
    likelyFailureModes: FrankLikelyFailureModes | null;
    clusters: DashaClusterRecord[];
}) {
    const serializedFailureModes = input.likelyFailureModes
        ? Object.entries(input.likelyFailureModes).map(([key, value]) => `${key}: ${value}`).join('\n')
        : 'No likely failure modes were provided.';
    const clusterContext = input.clusters.map((cluster) => [
        `${cluster.id} (${cluster.size} responses)`,
        `Representative: ${cluster.representativeText}`,
        `Models: ${cluster.modelBreakdown.map((entry) => `${entry.modelKey} x${entry.count}`).join(', ') || 'Unknown'}`,
    ].join('\n')).join('\n\n');

    try {
        const parsed = await generateJson({
            operation: 'Karthic cluster failure mode synthesis',
            prompt: buildDashaClusterFailureModesPrompt({
                benchmarkAnswer: input.benchmarkAnswer,
                likelyFailureModes: serializedFailureModes,
                clusterContext,
            }),
        });
        const items = normalizeStringArray(parsed.clusterFailureModes);
        if (items.length > 0) {
            return items;
        }
    } catch {
        // Fall back below.
    }

    return input.clusters.map((cluster) => {
        const overlap = roundToTwo(jaccardSimilarity(
            normalizeForSimilarity(input.benchmarkAnswer),
            normalizeForSimilarity(cluster.representativeText),
        ));
        return `${cluster.id}: benchmark overlap ${overlap}. Review this representative against stored failure modes and missing benchmark points.`;
    });
}

function buildFallbackRefinementLog(previousRows: KarthicRubricRow[], nextRows: KarthicRubricRow[]) {
    return nextRows.map((row) => {
        const previous = previousRows.find((item) => item.key === row.key);
        const changed = !previous
            || previous.title !== row.title
            || previous.description !== row.description
            || previous.weight !== row.weight
            || previous.naGuidance !== row.naGuidance
            || JSON.stringify(previous.goldenTarget) !== JSON.stringify(row.goldenTarget);
        return {
            iteration: 1,
            action: changed ? 'rewritten' : 'kept',
            rowKey: row.key,
            rationale: changed
                ? 'Row was sharpened during rubric refinement using centroid-vs-benchmark contrasts.'
                : 'Row remained sufficiently discriminative during refinement.',
            sourceClusterIds: [],
        } satisfies KarthicRefinementLogEntry;
    });
}

async function generateModelResponse({ provider, model, systemPrompt, messages, temperature, reasoningEffort, signal }: GenerateModelOptions) {
    if (provider === 'anthropic') {
        return await generateAnthropicResponse({ model, systemPrompt, messages, temperature, signal });
    }
    if (provider === 'gemini') {
        return await generateGeminiResponse({ model, systemPrompt, messages, temperature, reasoningEffort, signal });
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
        const response = await getOpenAiClient().responses.create(request, { signal });
        return extractResponsesText(response);
    }
    const response = await getOpenAiClient().chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature,
    }, { signal });
    return response.choices[0]?.message?.content || '';
}

async function generateAnthropicResponse(input: {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    signal?: AbortSignal;
}) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set.');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: input.signal,
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
    signal?: AbortSignal;
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
        signal: input.signal,
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
