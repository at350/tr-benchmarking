import fs from 'fs/promises';
import path from 'path';

import { FRANK_V2_BENCHMARK_HEADINGS, FRANK_V2_PACK_LABELS, RUBRIC_MODULE_LABELS, RUBRIC_ROW_SPECS } from '@/lib/legal-workflow-v2-constants';
import type { FrankPacketV2, FrankSofPackId, KarthicPreClusterRunV2, KarthicRubricRow } from '@/lib/legal-workflow-v2-types';

type AssetKey =
    | 'main'
    | 'workflow'
    | 'sourceIntake'
    | 'outputShape'
    | 'questionWriting'
    | 'routingMatrix'
    | 'selfAudit'
    | 'sharedModuleSkeleton'
    | 'doctrinePack'
    | 'failureBank'
    | 'workedExample'
    | 'cleanExample';

type AssetRegistryEntry = Record<AssetKey, string>;

const CORE_ASSET_FILES = {
    main: '00_MAIN_GPT_INSTRUCTIONS.txt',
    workflow: '01_CORE_WORKFLOW_TEMPLATE.txt',
    sourceIntake: '02_CORE_SOURCE_INTAKE_CHECKLIST.txt',
    outputShape: '03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt',
    questionWriting: '04_CORE_QUESTION_WRITING_CHECKLIST.txt',
    routingMatrix: '05_SOF_ROUTING_MATRIX.txt',
    selfAudit: '06_CORE_SELF_AUDIT.txt',
    sharedModuleSkeleton: '07_SHARED_MODULE_SKELETON.txt',
} satisfies Record<Exclude<AssetKey, 'doctrinePack' | 'failureBank' | 'workedExample' | 'cleanExample'>, string>;

const PACK_ASSET_FILES: Record<FrankSofPackId, Pick<AssetRegistryEntry, 'doctrinePack' | 'failureBank' | 'workedExample' | 'cleanExample'>> = {
    pack10: {
        doctrinePack: '10_DOCTRINE_PACK_ORAL_PROMISE.txt',
        failureBank: '11_FAILURE_BANK_ORAL_PROMISE.txt',
        workedExample: '12_WORKED_SOURCE_EXAMPLE_ORAL_PROMISE.txt',
        cleanExample: '13_CLEAN_BENCHMARK_EXAMPLE_ORAL_PROMISE.txt',
    },
    pack20: {
        doctrinePack: '20_DOCTRINE_PACK_LAND.txt',
        failureBank: '21_FAILURE_BANK_LAND.txt',
        workedExample: '22_WORKED_SOURCE_EXAMPLE_LAND.txt',
        cleanExample: '23_CLEAN_BENCHMARK_EXAMPLE_LAND.txt',
    },
    pack30: {
        doctrinePack: '30_DOCTRINE_PACK_EXECUTOR.txt',
        failureBank: '31_FAILURE_BANK_EXECUTOR.txt',
        workedExample: '32_WORKED_SOURCE_EXAMPLE_EXECUTOR.txt',
        cleanExample: '33_CLEAN_BENCHMARK_EXAMPLE_EXECUTOR.txt',
    },
    pack40: {
        doctrinePack: '40_DOCTRINE_PACK_UCC_2201.txt',
        failureBank: '41_FAILURE_BANK_UCC_2201.txt',
        workedExample: '42_WORKED_SOURCE_EXAMPLE_UCC_2201.txt',
        cleanExample: '43_CLEAN_BENCHMARK_EXAMPLE_UCC_2201.txt',
    },
};

const assetCache = new Map<string, string>();

function resolveAssetsRoot() {
    return path.basename(process.cwd()) === 'frontend'
        ? path.resolve(process.cwd(), 'src/lib/frank-v2-assets')
        : path.resolve(process.cwd(), 'frontend/src/lib/frank-v2-assets');
}

async function readAsset(fileName: string) {
    const cached = assetCache.get(fileName);
    if (cached) {
        return cached;
    }
    const content = await fs.readFile(path.join(resolveAssetsRoot(), fileName), 'utf8');
    assetCache.set(fileName, content);
    return content;
}

export async function getFrankV2AssetBundle(packId: FrankSofPackId) {
    const packFiles = PACK_ASSET_FILES[packId];
    const bundleEntries = await Promise.all(([
        ...Object.entries(CORE_ASSET_FILES),
        ...Object.entries(packFiles),
    ] as Array<[AssetKey, string]>).map(async ([key, fileName]) => [key, await readAsset(fileName)] as const));

    return Object.fromEntries(bundleEntries) as AssetRegistryEntry;
}

export function buildFrankRoutingIntakePrompt(input: {
    title: string;
    fileNames: string[];
    sourceText: string;
}) {
    return [
        'You are running Phase 1 of the Frank v2 Statute-of-Frauds packet workflow.',
        'Select the best-fit Statute of Frauds pack, explain the routing choice, then complete the source-intake checklist.',
        'If the source is not really a Statute of Frauds source, say so and rate it weak or not usable.',
        '',
        `Title hint: ${input.title}`,
        `Uploaded files: ${input.fileNames.join(', ')}`,
        '',
        'Return JSON only with these keys:',
        JSON.stringify({
            title: 'string',
            selectedPack: 'pack10',
            routingReason: 'string',
            secondaryIssues: ['string'],
            routingConfidence: 'strong',
            intakeChecklist: {
                candidateSource: 'string',
                sourceTypeAuthorityLevel: 'string',
                targetDoctrineFamilyLikelyPack: 'string',
                cleanLegalIssue: 'string',
                blackLetterRuleExtractable: 'Strong',
                triggerFactsIdentifiable: 'Strong',
                holdingUsableForBenchmarkDrafting: 'Strong',
                limitsBoundariesIdentifiable: 'Strong',
                proceduralNoiseLevel: 'Strong',
                jurisdictionSensitivitySplitRisk: 'Strong',
                benchmarkAnswerSuitability: 'Strong',
                reverseEngineeringSuitabilityLabel: 'Strong',
                benchmarkPosture: 'portable_benchmark_under_stated_assumptions',
                failureModeYield: 'Strong',
                jdReviewBurden: ['string'],
                finalIntakeRating: 'Strong lead source',
                recommendation: 'string',
            },
        }),
        '',
        'Source text:',
        input.sourceText,
    ].join('\n');
}

export function buildFrankExtractionMappingPrompt(input: {
    packet: FrankPacketV2;
    assets: Awaited<ReturnType<typeof getFrankV2AssetBundle>>;
    sourceText: string;
}) {
    return [
        input.assets.main,
        '',
        input.assets.workflow,
        '',
        input.assets.sourceIntake,
        '',
        input.assets.routingMatrix,
        '',
        input.assets.doctrinePack,
        '',
        input.assets.failureBank,
        '',
        `Selected pack: ${input.packet.selectedPack ? FRANK_V2_PACK_LABELS[input.packet.selectedPack] : 'Unrouted'}`,
        `Routing reason: ${input.packet.routingReason}`,
        `Routing confidence: ${input.packet.routingConfidence ?? 'unknown'}`,
        `Intake final rating: ${input.packet.intakeChecklist?.finalIntakeRating ?? 'unknown'}`,
        '',
        'Run Phase 2 only. Produce:',
        '1. Source extraction sheet',
        '2. Gold packet mapping',
        '3. Likely failure modes FM1-FM5',
        '',
        'Return JSON only with this exact top-level shape:',
        JSON.stringify({
            sourceExtractionSheet: {
                selectedDoctrinePack: input.packet.selectedPack ?? 'pack10',
                candidateSource: 'string',
                sourceTypeAuthorityLevel: 'string',
                jurisdictionForum: 'string',
                proceduralPosture: 'string',
                cleanLegalIssue: 'string',
                blackLetterRule: 'string',
                triggerFacts: ['string'],
                holdingOrBestSupportedAnswerPath: 'string',
                whyThatResultFollows: 'string',
                limitsBoundaries: ['string'],
                sourceDoesNotDecide: ['string'],
                jurisdictionSensitivitySplitRisk: ['string'],
                benchmarkUseConfidence: 'string',
                jdReviewNeeded: ['string'],
            },
            goldPacketMapping: {
                doctrineFamily: 'string',
                controllingTrigger: 'string',
                requiredGateOrder: ['string'],
                whatMakesDoctrineApply: ['string'],
                whatDoesNotSatisfyIt: ['string'],
                independentCompetingBarriers: ['string'],
                possibleSubstitutesExceptions: ['string'],
                limitsOnSubstitutesExceptions: ['string'],
                likelyJurisdictionSensitivePoints: ['string'],
                likelyModelMistakes: ['string'],
                candidateFactPatternIngredients: ['string'],
                reverseEngineeringSuitability: 'string',
                benchmarkPosture: 'portable_benchmark_within_selected_pack',
            },
            likelyFailureModes: {
                FM1: 'string',
                FM2: 'string',
                FM3: 'string',
                FM4: 'string',
                FM5: 'string',
            },
        }),
        'Source text:',
        input.sourceText,
    ].join('\n');
}

export function buildFrankBenchmarkPrompt(input: {
    packet: FrankPacketV2;
    assets: Awaited<ReturnType<typeof getFrankV2AssetBundle>>;
    sourceText: string;
}) {
    return [
        input.assets.main,
        '',
        input.assets.workflow,
        '',
        input.assets.outputShape,
        '',
        input.assets.selfAudit,
        '',
        input.assets.doctrinePack,
        '',
        `Selected pack: ${input.packet.selectedPack ? FRANK_V2_PACK_LABELS[input.packet.selectedPack] : 'Unrouted'}`,
        `Benchmark posture: ${input.packet.goldPacketMapping?.benchmarkPosture ?? input.packet.intakeChecklist?.benchmarkPosture ?? 'unknown'}`,
        '',
        'Run Phase 3 only.',
        `Return the clean benchmark answer using exactly these headings in order:\n${FRANK_V2_BENCHMARK_HEADINGS.join('\n')}`,
        '',
        'Extraction sheet:',
        JSON.stringify(input.packet.sourceExtractionSheet),
        '',
        'Gold packet mapping:',
        JSON.stringify(input.packet.goldPacketMapping),
        '',
        'Likely failure modes:',
        JSON.stringify(input.packet.likelyFailureModes),
        '',
        'Source text:',
        input.sourceText,
    ].join('\n');
}

export function buildFrankQuestionPrompt(input: {
    packet: FrankPacketV2;
    assets: Awaited<ReturnType<typeof getFrankV2AssetBundle>>;
}) {
    return [
        input.assets.main,
        '',
        input.assets.workflow,
        '',
        input.assets.questionWriting,
        '',
        input.assets.doctrinePack,
        '',
        `Selected pack: ${input.packet.selectedPack ? FRANK_V2_PACK_LABELS[input.packet.selectedPack] : 'Unrouted'}`,
        `Benchmark posture: ${input.packet.goldPacketMapping?.benchmarkPosture ?? input.packet.intakeChecklist?.benchmarkPosture ?? 'unknown'}`,
        '',
        'Run Phase 4 only.',
        'Return one neutral reverse-engineered question and nothing else.',
        'Do not use numbered tasks or answer-format sections.',
        'Do not name the controlling doctrine in the call of the question.',
        '',
        'Benchmark answer:',
        input.packet.benchmarkAnswer,
        '',
        'Gold packet mapping:',
        JSON.stringify(input.packet.goldPacketMapping),
    ].join('\n');
}

export function buildKarthicRowsPrompt(input: {
    packet: FrankPacketV2;
    assets: Awaited<ReturnType<typeof getFrankV2AssetBundle>>;
    questionText: string;
    questionSourceLabel: string;
    clusterContext?: string;
}) {
    return [
        input.assets.sharedModuleSkeleton,
        '',
        input.assets.doctrinePack,
        '',
        input.assets.failureBank,
        '',
        `Selected pack: ${input.packet.selectedPack ? FRANK_V2_PACK_LABELS[input.packet.selectedPack] : 'Unrouted'}`,
        `${input.questionSourceLabel}:\n${input.questionText}`,
        '',
        `Benchmark answer:\n${input.packet.benchmarkAnswer}`,
        '',
        `Extraction sheet:\n${JSON.stringify(input.packet.sourceExtractionSheet)}`,
        '',
        `Gold packet mapping:\n${JSON.stringify(input.packet.goldPacketMapping)}`,
        '',
        `Likely failure modes:\n${JSON.stringify(input.packet.likelyFailureModes)}`,
        input.clusterContext ? `\nSample response clusters:\n${input.clusterContext}` : '',
        '',
        'Draft one rubric row object for each of these row keys in order:',
        RUBRIC_ROW_SPECS.map((row) => `${row.key} (${RUBRIC_MODULE_LABELS[row.moduleId]}): ${row.title}`).join('\n'),
        '',
        'Preserve the fixed row keys, module assignments, and default weights unless a pack-specific reason requires a modest adjustment.',
        'Return JSON only of the form {"rows":[...],"comparisonMethodNote":"..."}',
    ].join('\n');
}

export function buildKarthicSeedRowsPrompt(input: {
    packet: FrankPacketV2;
    assets: Awaited<ReturnType<typeof getFrankV2AssetBundle>>;
    questionText: string;
    questionSourceLabel: string;
    preClusterRun: KarthicPreClusterRunV2;
}) {
    return buildKarthicRowsPrompt({
        packet: input.packet,
        assets: input.assets,
        questionText: input.questionText,
        questionSourceLabel: input.questionSourceLabel,
        clusterContext: [
            input.preClusterRun.clusters.map((cluster) => [
                `${cluster.id} (${cluster.size} responses)`,
                `Representative: ${cluster.representativeText}`,
                `Models: ${cluster.modelBreakdown.map((entry) => `${entry.modelKey} x${entry.count}`).join(', ') || 'Unknown'}`,
            ].join('\n')).join('\n\n'),
            input.preClusterRun.clusterFailureModes.length > 0
                ? `Cluster failure modes:\n${input.preClusterRun.clusterFailureModes.join('\n')}`
                : '',
        ].filter(Boolean).join('\n\n'),
    });
}

export function buildKarthicRefineRowsPrompt(input: {
    packet: FrankPacketV2;
    assets: Awaited<ReturnType<typeof getFrankV2AssetBundle>>;
    questionText: string;
    preClusterRun: KarthicPreClusterRunV2;
    currentRows: KarthicRubricRow[];
}) {
    return [
        input.assets.sharedModuleSkeleton,
        '',
        input.assets.doctrinePack,
        '',
        input.assets.failureBank,
        '',
        `Selected pack: ${input.packet.selectedPack ? FRANK_V2_PACK_LABELS[input.packet.selectedPack] : 'Unrouted'}`,
        `Question:\n${input.questionText}`,
        '',
        `Benchmark answer:\n${input.packet.benchmarkAnswer}`,
        '',
        `Likely failure modes:\n${JSON.stringify(input.packet.likelyFailureModes)}`,
        '',
        `Current rubric rows:\n${JSON.stringify(input.currentRows, null, 2)}`,
        '',
        `Cluster representatives:\n${input.preClusterRun.clusters.map((cluster) => JSON.stringify({
            id: cluster.id,
            size: cluster.size,
            representativeText: cluster.representativeText,
            modelBreakdown: cluster.modelBreakdown,
        }, null, 2)).join('\n\n')}`,
        '',
        `Cluster failure modes:\n${input.preClusterRun.clusterFailureModes.join('\n') || 'None recorded.'}`,
        '',
        'Refine the rubric using RRD-lite rules.',
        'Keep or rewrite a row only if it distinguishes benchmark-aligned reasoning from wrong or incomplete centroid reasoning, captures an important missed failure mode, or sharpens a too-broad row.',
        'Rewrite or conceptually drop a row if it scores benchmark and wrong centroids similarly, rewards wrong centroids more than benchmark-aligned ones, or duplicates another row.',
        'Preserve the fixed row keys and module assignments. Do not invent extra rows beyond the existing row-key framework.',
        'Return JSON only with shape {"rows":[...],"refinementLog":[...],"comparisonMethodNote":"..."} where refinementLog items contain iteration, action, rowKey, rationale, and sourceClusterIds.',
    ].join('\n');
}

export function buildDashaClusterFailureModesPrompt(input: {
    benchmarkAnswer: string;
    likelyFailureModes: string;
    clusterContext: string;
}) {
    return [
        'You are summarizing pre-Karthic cluster failure modes.',
        'Compare each cluster representative against the benchmark answer and the stored likely failure modes.',
        'Return JSON only with shape {"clusterFailureModes":["string"]}.',
        '',
        `Benchmark answer:\n${input.benchmarkAnswer}`,
        '',
        `Stored likely failure modes:\n${input.likelyFailureModes}`,
        '',
        `Cluster representatives:\n${input.clusterContext}`,
        '',
        'Each output item should be concise and tie a cluster to a likely error pattern or missing benchmark feature.',
    ].join('\n');
}

export function buildDashaRowEvaluationPrompt(input: {
    row: KarthicRubricRow;
    questionText: string;
    responseText: string;
}) {
    return [
        'You are a Dasha v2 row judge.',
        'Evaluate one cluster representative against one approved rubric row only.',
        'Return JSON only.',
        '',
        `Row key: ${input.row.key}`,
        `Module: ${RUBRIC_MODULE_LABELS[input.row.moduleId]}`,
        `Row title: ${input.row.title}`,
        `Description: ${input.row.description}`,
        `NA guidance: ${input.row.naGuidance}`,
        `Golden target summary: ${input.row.goldenTarget.summary}`,
        `Golden contains: ${input.row.goldenTarget.goldenContains.join(' | ') || 'None provided'}`,
        `Allowed omissions: ${input.row.goldenTarget.allowedOmissions.join(' | ') || 'None provided'}`,
        `Contradiction flags: ${input.row.goldenTarget.contradictionFlags.join(' | ') || 'None provided'}`,
        `Comparison guidance: ${input.row.goldenTarget.comparisonGuidance}`,
        '',
        'Return JSON with keys:',
        JSON.stringify({
            applicabilityStatus: 'applicable',
            applicabilityExplanation: 'string',
            score: 0,
            confidence: 0.5,
            matchedGoldenPoints: ['string'],
            missingGoldenPoints: ['string'],
            extraCentroidPoints: ['string'],
            contradictionPoints: ['string'],
            differenceSummary: 'string',
            rationale: 'string',
            metadataTags: {
                bottomLineOutcome: 'Enforceable',
                outcomeCorrectness: 'Correct',
                reasoningAlignment: 'Right result / right reason',
                jurisdictionAssumption: 'string',
            },
        }),
        '',
        'Use score 0-100 only if applicable. If not applicable, use score null.',
        '',
        'Question:',
        input.questionText,
        '',
        'Representative answer:',
        input.responseText,
    ].join('\n');
}

export function buildDynamicJudgeRubricBlock(rows: KarthicRubricRow[]) {
    return rows.map((row) => {
        return [
            `${row.key} ${row.title} (${row.weight})`,
            `Module: ${RUBRIC_MODULE_LABELS[row.moduleId]}`,
            `Description: ${row.description}`,
            `NA guidance: ${row.naGuidance}`,
            `Golden target summary: ${row.goldenTarget.summary}`,
        ].join('\n');
    }).join('\n\n');
}
