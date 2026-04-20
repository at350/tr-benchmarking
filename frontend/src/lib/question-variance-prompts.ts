import 'server-only';

import fs from 'fs/promises';
import path from 'path';

import { FRANK_V2_PACK_LABELS } from '@/lib/legal-workflow-v2-constants';
import { getFrankV2AssetBundle } from '@/lib/legal-workflow-v2-prompts';
import {
    QUESTION_VARIANCE_CONFUSION_LABELS,
    QUESTION_VARIANCE_FINAL_STATUS_LABELS,
    QUESTION_VARIANCE_LABELS,
    QUESTION_VARIANCE_LANE_LABELS,
    QUESTION_VARIANCE_PACKAGE_STATUS_LABELS,
    QUESTION_VARIANCE_RESULT_TYPE_LABELS,
    QUESTION_VARIANCE_REUSE_LABELS,
    QUESTION_VARIANCE_ROUTE_STATUS_LABELS,
} from '@/lib/question-variance-constants';
import type {
    ConfusionPattern,
    FrankPacketV2,
    FrankSofPackId,
    QuestionVarianceMenuOption,
    VariationExpectedResultType,
    VariationLane,
    VariationPackageStatus,
    VariationProvisionId,
    VariationReuseLevel,
    VariationRouteStatus,
    VariationStatus,
} from '@/lib/legal-workflow-v2-types';

const QUESTION_VARIANCE_CORE_FILES = {
    routingMatrix: 'B00_SoF_Routing_Matrix_and_Universal_Template.txt',
    variationModes: 'B01_Variation_Modes_Guide_v2.txt',
    menuProtocol: 'B02_Menu_and_Output_Protocol.txt',
    examplesRedFlags: 'B03_Examples_and_RedFlags.txt',
    packIndex: 'B10_SoF_Packs_Index_and_Usage.txt',
    confusionIndex: 'B30_SoF_Cross_Pack_Confusion_Set_Index_and_Usage.txt',
} as const;

const QUESTION_VARIANCE_PROVISION_FILES: Record<VariationProvisionId, string> = {
    marriage: 'B11_Marriage_Provision_Pack.txt',
    suretyship: 'B12_Suretyship_Provision_Pack.txt',
    one_year: 'B13_One_Year_Provision_Pack.txt',
    land: 'B14_Land_Provision_Pack.txt',
    ucc_2201: 'B15_UCC_2_201_Provision_Pack.txt',
    executor: 'B16_Executor_Provision_Pack.txt',
};

const QUESTION_VARIANCE_CONFUSION_FILES = {
    b31: 'B31_Marriage_and_Land_Dual_Trigger_Confusion_Set.txt',
    b32: 'B32_Executor_and_Suretyship_Overlap_Confusion_Set.txt',
    b33: 'B33_UCC_and_One_Year_Priority_Confusion_Set.txt',
    b34: 'B34_Land_and_One_Year_Lease_Confusion_Set.txt',
    b35: 'B35_UCC_and_Suretyship_Split_Transaction_Confusion_Set.txt',
    b36: 'B36_UCC_and_Land_Fixtures_or_Severance_Confusion_Set.txt',
} as const;

const assetCache = new Map<string, string>();

type QuestionVarianceCoreAssetKey = keyof typeof QUESTION_VARIANCE_CORE_FILES;
type QuestionVarianceConfusionSetId = keyof typeof QUESTION_VARIANCE_CONFUSION_FILES;

export type QuestionVarianceRoutingPromptInput = {
    packet: FrankPacketV2;
    sourceText: string;
};

export type QuestionVarianceMenuPromptInput = {
    packet: FrankPacketV2;
};

export type QuestionVariancePackagePromptInput = {
    packet: FrankPacketV2;
    option: QuestionVarianceMenuOption;
    selectedSwapOptions: QuestionVarianceMenuOption['exactSwapOptions'];
};

function resolveQuestionVarianceRoots() {
    const cwd = process.cwd();
    return path.basename(cwd) === 'frontend'
        ? [
            path.resolve(cwd, '../Frank2_QuestionVarianceInstructions'),
            path.resolve(cwd, '../QuestionVariance'),
        ]
        : [
            path.resolve(cwd, 'Frank2_QuestionVarianceInstructions'),
            path.resolve(cwd, 'QuestionVariance'),
        ];
}

async function readQuestionVarianceAsset(fileName: string) {
    const cached = assetCache.get(fileName);
    if (cached) {
        return cached;
    }
    for (const root of resolveQuestionVarianceRoots()) {
        try {
            const content = await fs.readFile(path.join(root, fileName), 'utf8');
            assetCache.set(fileName, content);
            return content;
        } catch {
            continue;
        }
    }
    throw new Error(`QuestionVariance asset "${fileName}" was not found in any configured asset root.`);
}

export async function getQuestionVarianceCoreAssets() {
    const entries = await Promise.all(
        (Object.entries(QUESTION_VARIANCE_CORE_FILES) as Array<[QuestionVarianceCoreAssetKey, string]>)
            .map(async ([key, fileName]) => [key, await readQuestionVarianceAsset(fileName)] as const),
    );
    return Object.fromEntries(entries) as Record<QuestionVarianceCoreAssetKey, string>;
}

export async function getQuestionVarianceProvisionAsset(provisionId: VariationProvisionId) {
    return await readQuestionVarianceAsset(QUESTION_VARIANCE_PROVISION_FILES[provisionId]);
}

export async function getQuestionVarianceConfusionAsset(confusionSetId: string | null) {
    if (!confusionSetId) {
        return null;
    }
    if (!(confusionSetId in QUESTION_VARIANCE_CONFUSION_FILES)) {
        return null;
    }
    return await readQuestionVarianceAsset(
        QUESTION_VARIANCE_CONFUSION_FILES[confusionSetId as QuestionVarianceConfusionSetId],
    );
}

function describeFrankPack(packId: FrankSofPackId | null) {
    return packId ? FRANK_V2_PACK_LABELS[packId] : 'Unrouted Frank packet';
}

export async function buildQuestionVarianceRoutingPrompt(input: QuestionVarianceRoutingPromptInput) {
    const coreAssets = await getQuestionVarianceCoreAssets();
    const frankAssets = input.packet.selectedPack ? await getFrankV2AssetBundle(input.packet.selectedPack) : null;
    return [
        'You are generating the routing and readiness result for the separate QuestionVariance workflow.',
        'This is downstream of a completed Frank benchmark answer and canonical reverse-engineered question.',
        'Return JSON only.',
        '',
        coreAssets.routingMatrix,
        '',
        coreAssets.packIndex,
        '',
        coreAssets.confusionIndex,
        '',
        frankAssets?.doctrinePack ?? 'No Frank doctrine pack context is available.',
        '',
        `Frank selected pack: ${describeFrankPack(input.packet.selectedPack)}`,
        '',
        'Use these exact enum values when they apply:',
        '- routeStatus: stable_route | multiple_plausible_routes | needs_classification_first | not_primarily_sof',
        '- primaryProvisionCandidate / secondaryCandidates: marriage | suretyship | one_year | land | ucc_2201 | executor',
        '- confusionPattern: dual_trigger | priority | split_transaction | needs_classification_first',
        '- confusionSetId: b31 | b32 | b33 | b34 | b35 | b36 | null',
        '',
        'Output shape:',
        JSON.stringify({
            routingResult: {
                inputType: 'string',
                routeStatus: 'stable_route',
                governingLawCandidate: 'string',
                primaryProvisionCandidate: 'marriage',
                secondaryCandidates: ['land'],
                controllingDoctrine: 'string',
                mainGateOrder: ['string'],
                variationReadiness: 'string',
                mainNoSilentChangeFacts: ['string'],
                confusionPattern: 'dual_trigger',
                confusionSetId: 'b31',
                menuRule: 'string',
            },
        }),
        '',
        'Canonical reverse-engineered question:',
        input.packet.reverseEngineeredQuestion,
        '',
        'Benchmark answer:',
        input.packet.benchmarkAnswer,
        '',
        'Gold packet mapping:',
        JSON.stringify(input.packet.goldPacketMapping),
        '',
        'Source text:',
        input.sourceText,
    ].join('\n');
}

export async function buildQuestionVarianceMenuPrompt(input: QuestionVarianceMenuPromptInput) {
    const coreAssets = await getQuestionVarianceCoreAssets();
    const routing = input.packet.questionVariance.routingResult;
    const provisionAsset = routing?.primaryProvisionCandidate
        ? await getQuestionVarianceProvisionAsset(routing.primaryProvisionCandidate)
        : null;
    const confusionAsset = await getQuestionVarianceConfusionAsset(routing?.confusionSetId ?? null);

    return [
        'You are generating the option menu for the separate QuestionVariance workflow.',
        'The route is already resolved enough to offer controlled options.',
        'Return JSON only.',
        '',
        coreAssets.variationModes,
        '',
        coreAssets.menuProtocol,
        '',
        coreAssets.examplesRedFlags,
        '',
        provisionAsset ?? 'No resolved provision pack is available.',
        '',
        confusionAsset ?? '',
        '',
        'Use these exact enum values when they apply:',
        '- resolvedProvisionId: marriage | suretyship | one_year | land | ucc_2201 | executor | null',
        '- lane: lane_a | lane_b',
        '- laneCode: A1 | A2 | A3 | A4 | B1 | B2',
        '- expectedAnswerReuse: reuse_as_is | cosmetic_edits_only | ambiguity_rewrite_required | unsafe',
        '',
        'Every option must describe the exact fact swap(s) available under that sub-lane. If a sub-lane allows multiple independent swaps inside the same legal question, include each swap separately in exactSwapOptions so the user can later choose one, several, or all of them.',
        '',
        'Output shape:',
        JSON.stringify({
            menu: {
                resolvedProvisionId: 'marriage',
                options: [{
                    label: 'string',
                    lane: 'lane_a',
                    laneCode: 'A1',
                    variationType: 'string',
                    whatChanges: 'string',
                    whyItFits: 'string',
                    expectedAnswerReuse: 'cosmetic_edits_only',
                    mainRedFlag: 'string',
                    exactSwapOptions: [{
                        id: 'swap_1',
                        label: 'Change deposit amount',
                        from: '$10',
                        to: '$100',
                        whatChanges: '$10 -> $100',
                    }],
                }],
            },
        }),
        '',
        'Routing result:',
        JSON.stringify(routing),
        '',
        'Canonical reverse-engineered question:',
        input.packet.reverseEngineeredQuestion,
        '',
        'Benchmark answer:',
        input.packet.benchmarkAnswer,
        '',
        'Gold packet mapping:',
        JSON.stringify(input.packet.goldPacketMapping),
    ].join('\n');
}

export async function buildQuestionVariancePackagePrompt(input: QuestionVariancePackagePromptInput) {
    const coreAssets = await getQuestionVarianceCoreAssets();
    const routing = input.packet.questionVariance.routingResult;
    const provisionAsset = routing?.primaryProvisionCandidate
        ? await getQuestionVarianceProvisionAsset(routing.primaryProvisionCandidate)
        : null;
    const confusionAsset = await getQuestionVarianceConfusionAsset(routing?.confusionSetId ?? null);

    return [
        'You are generating exactly one QuestionVariance package from an already-selected option.',
        'Return JSON only.',
        '',
        coreAssets.variationModes,
        '',
        coreAssets.menuProtocol,
        '',
        coreAssets.examplesRedFlags,
        '',
        provisionAsset ?? 'No resolved provision pack is available.',
        '',
        confusionAsset ?? '',
        '',
        'Use these exact enum values when they apply:',
        '- lane: lane_a | lane_b',
        '- laneCode: A1 | A2 | A3 | A4 | B1 | B2',
        '- expectedResultType: same_likely_outcome | same_doctrine_different_fact_salience | missing_facts_bounded_uncertainty | unsafe_to_vary',
        '- variationStatus: safe | unsafe | ambiguity_test',
        '- answerReuseLevel: reuse_as_is | cosmetic_edits_only | ambiguity_rewrite_required | unsafe',
        '- status: ready | needs_targeted_revision | unsafe',
        '',
        'Only apply the exact selected swap choices provided below. Do not silently add other swaps from the same sub-lane.',
        '',
        'Output shape:',
        JSON.stringify({
            package: {
                lane: 'lane_a',
                laneCode: 'A1',
                variationType: 'string',
                selectedSwapOptionIds: ['swap_1'],
                jurisdiction: 'string',
                controllingDoctrine: 'string',
                expectedResultType: 'same_likely_outcome',
                variationStatus: 'safe',
                answerReuseLevel: 'cosmetic_edits_only',
                variedLegalQuestion: 'string',
                updatedModelAnswer: 'string',
                swapLog: [{ from: 'string', to: 'string' }],
                rubricPatchNotes: ['string'],
                whyTheAnswerShouldStayTheSameOrChange: 'string',
                redFlags: ['string'],
                status: 'ready',
            },
        }),
        '',
        'Routing result:',
        JSON.stringify(routing),
        '',
        'Selected option:',
        JSON.stringify(input.option),
        '',
        'Selected exact swap choices:',
        JSON.stringify(input.selectedSwapOptions ?? []),
        '',
        'Canonical reverse-engineered question:',
        input.packet.reverseEngineeredQuestion,
        '',
        'Benchmark answer:',
        input.packet.benchmarkAnswer,
        '',
        'Gold packet mapping:',
        JSON.stringify(input.packet.goldPacketMapping),
    ].join('\n');
}
