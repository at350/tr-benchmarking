import type {
    DashaClusterRecord,
    DashaComparisonSummary,
    DashaModelSummary,
    DashaResponseRecord,
    DashaRunV2,
    DashaSelectedModel,
    ModelProvider,
    KarthicRubricPackV2,
    QuestionVariancePackage,
    RubricModuleId,
    RubricRowResult,
} from '@/lib/legal-workflow-v2-types';

const MODULE_ORDER: RubricModuleId[] = ['module0', 'module1', 'module2', 'module3', 'module4'];

export function buildDashaModelSummaries(input: {
    selectedModels: DashaSelectedModel[];
    responses: DashaResponseRecord[];
    clusters: DashaClusterRecord[];
    rowResults: RubricRowResult[];
    clusterScoreMap?: Map<string, number | null>;
}): DashaModelSummary[] {
    const clusterScoreMap = input.clusterScoreMap ?? buildClusterWeightedScoreMap(input.rowResults);
    const responseGroups = new Map<string, DashaResponseRecord[]>();
    input.responses.forEach((response) => {
        const current = responseGroups.get(response.modelKey);
        if (current) {
            current.push(response);
        } else {
            responseGroups.set(response.modelKey, [response]);
        }
    });

    const selectedModelByKey = new Map(
        input.selectedModels.map((item) => [buildModelKey(item.provider, item.model), item] as const),
    );
    const keys = new Set<string>([
        ...selectedModelByKey.keys(),
        ...responseGroups.keys(),
    ]);

    return Array.from(keys)
        .map((modelKey) => {
            const selectedModel = selectedModelByKey.get(modelKey);
            const modelResponses = responseGroups.get(modelKey) ?? [];
            const validResponses = modelResponses.filter(isValidResponse);
            const errorCount = modelResponses.length - validResponses.length;
            const byCluster = new Map<string, number>();

            validResponses.forEach((response) => {
                if (!response.clusterId) {
                    return;
                }
                byCluster.set(response.clusterId, (byCluster.get(response.clusterId) ?? 0) + 1);
            });

            const clusterContributions = Array.from(byCluster.entries())
                .map(([clusterId, count]) => ({
                    clusterId,
                    count,
                    share: validResponses.length > 0 ? roundToTwo(count / validResponses.length) : 0,
                    clusterWeightedScore: clusterScoreMap.get(clusterId) ?? null,
                }))
                .sort((left, right) => right.count - left.count || left.clusterId.localeCompare(right.clusterId));

            const scoredContributions = clusterContributions.filter(
                (entry): entry is typeof entry & { clusterWeightedScore: number } => typeof entry.clusterWeightedScore === 'number',
            );
            const scoredCountTotal = scoredContributions.reduce((sum, entry) => sum + entry.count, 0);
            const dominantCluster = clusterContributions[0] ?? null;
            const parsedModel = selectedModel
                ? selectedModel
                : parseModelKey(modelKey);

            return {
                modelKey,
                provider: parsedModel.provider,
                model: parsedModel.model,
                validCount: validResponses.length,
                errorCount,
                totalResponses: modelResponses.length,
                propagatedWeightedScore: scoredCountTotal > 0
                    ? roundToTwo(
                        scoredContributions.reduce((sum, entry) => sum + entry.count * entry.clusterWeightedScore, 0) / scoredCountTotal,
                    )
                    : null,
                dominantClusterId: dominantCluster?.clusterId ?? null,
                dominantClusterShare: dominantCluster?.share ?? 0,
                clusterContributions,
            } satisfies DashaModelSummary;
        })
        .sort((left, right) => {
            if (left.validCount !== right.validCount) {
                return right.validCount - left.validCount;
            }
            return left.modelKey.localeCompare(right.modelKey);
        });
}

export function buildDashaComparisonSummary(input: {
    baselineRun: Pick<DashaRunV2, 'selectedModels' | 'weightedSummary' | 'moduleSummaries' | 'modelSummaries'>;
    variantRun: Pick<DashaRunV2, 'selectedModels' | 'weightedSummary' | 'moduleSummaries' | 'modelSummaries'>;
}): DashaComparisonSummary {
    const baselineModules = new Map(input.baselineRun.moduleSummaries.map((item) => [item.moduleId, item] as const));
    const variantModules = new Map(input.variantRun.moduleSummaries.map((item) => [item.moduleId, item] as const));
    const moduleIds = new Set<RubricModuleId>([
        ...input.baselineRun.moduleSummaries.map((item) => item.moduleId),
        ...input.variantRun.moduleSummaries.map((item) => item.moduleId),
    ]);

    const moduleDeltas = Array.from(moduleIds)
        .map((moduleId) => {
            const baseline = baselineModules.get(moduleId) ?? null;
            const variant = variantModules.get(moduleId) ?? null;
            return {
                moduleId,
                label: baseline?.label ?? variant?.label ?? moduleId,
                baselineScore: baseline?.averageScore ?? null,
                variantScore: variant?.averageScore ?? null,
                scoreDelta: subtractNullable(variant?.averageScore ?? null, baseline?.averageScore ?? null),
            };
        })
        .sort((left, right) => {
            const leftIndex = MODULE_ORDER.indexOf(left.moduleId);
            const rightIndex = MODULE_ORDER.indexOf(right.moduleId);
            if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
            }
            return left.moduleId.localeCompare(right.moduleId);
        });

    const baselineModels = new Map(input.baselineRun.modelSummaries.map((item) => [item.modelKey, item] as const));
    const variantModels = new Map(input.variantRun.modelSummaries.map((item) => [item.modelKey, item] as const));
    const modelKeys = new Set<string>([
        ...input.baselineRun.selectedModels.map((item) => buildModelKey(item.provider, item.model)),
        ...input.variantRun.selectedModels.map((item) => buildModelKey(item.provider, item.model)),
        ...baselineModels.keys(),
        ...variantModels.keys(),
    ]);

    const modelDeltas = Array.from(modelKeys)
        .map((modelKey) => {
            const baseline = baselineModels.get(modelKey) ?? null;
            const variant = variantModels.get(modelKey) ?? null;
            const fallback = baseline
                ? { provider: baseline.provider, model: baseline.model }
                : variant
                    ? { provider: variant.provider, model: variant.model }
                    : parseModelKey(modelKey);
            return {
                modelKey,
                provider: fallback.provider,
                model: fallback.model,
                baselineScore: baseline?.propagatedWeightedScore ?? null,
                variantScore: variant?.propagatedWeightedScore ?? null,
                scoreDelta: subtractNullable(
                    variant?.propagatedWeightedScore ?? null,
                    baseline?.propagatedWeightedScore ?? null,
                ),
                baselineDominantClusterId: baseline?.dominantClusterId ?? null,
                variantDominantClusterId: variant?.dominantClusterId ?? null,
                baselineValidCount: baseline?.validCount ?? 0,
                variantValidCount: variant?.validCount ?? 0,
            };
        })
        .sort((left, right) => {
            const leftDelta = typeof left.scoreDelta === 'number' ? left.scoreDelta : Number.POSITIVE_INFINITY;
            const rightDelta = typeof right.scoreDelta === 'number' ? right.scoreDelta : Number.POSITIVE_INFINITY;
            if (leftDelta !== rightDelta) {
                return leftDelta - rightDelta;
            }
            return left.modelKey.localeCompare(right.modelKey);
        });

    return {
        baselineWeightedScore: input.baselineRun.weightedSummary.weightedScore,
        variantWeightedScore: input.variantRun.weightedSummary.weightedScore,
        weightedScoreDelta: subtractNullable(
            input.variantRun.weightedSummary.weightedScore,
            input.baselineRun.weightedSummary.weightedScore,
        ),
        moduleDeltas,
        modelDeltas,
    };
}

export function validateLaneAComparisonCandidate(input: {
    rubricPack: Pick<KarthicRubricPackV2, 'questionSource'>;
    questionVariancePackage: Pick<QuestionVariancePackage, 'lane' | 'status' | 'variationStatus'> | null;
}) {
    if (input.rubricPack.questionSource !== 'canonical') {
        throw new Error('Lane A comparison requires an approved canonical rubric pack.');
    }
    if (!input.questionVariancePackage) {
        throw new Error('Selected QuestionVariance package is not available on the rubric pack Frank packet.');
    }
    if (input.questionVariancePackage.lane !== 'lane_a') {
        throw new Error('Lane A comparison only supports QuestionVariance packages from lane_a.');
    }
    if (input.questionVariancePackage.status !== 'ready' || input.questionVariancePackage.variationStatus !== 'safe') {
        throw new Error('Lane A comparison requires a safe, ready QuestionVariance package.');
    }
}

function buildClusterWeightedScoreMap(rowResults: RubricRowResult[]) {
    const byCluster = new Map<string, { weightedTotal: number; weightTotal: number }>();

    rowResults.forEach((row) => {
        row.centroidEvaluations.forEach((evaluation) => {
            if (evaluation.applicabilityStatus !== 'applicable' || typeof evaluation.score !== 'number') {
                return;
            }
            const current = byCluster.get(evaluation.clusterId) ?? { weightedTotal: 0, weightTotal: 0 };
            current.weightedTotal += row.weight * evaluation.score;
            current.weightTotal += row.weight;
            byCluster.set(evaluation.clusterId, current);
        });
    });

    return new Map(
        Array.from(byCluster.entries()).map(([clusterId, value]) => [
            clusterId,
            value.weightTotal > 0 ? roundToTwo(value.weightedTotal / value.weightTotal) : null,
        ]),
    );
}

function buildModelKey(provider: ModelProvider, model: string) {
    return `${provider}::${model}`;
}

function parseModelKey(modelKey: string) {
    const [provider, ...modelParts] = modelKey.split('::');
    return {
        provider: provider as ModelProvider,
        model: modelParts.join('::'),
    };
}

function isValidResponse(response: DashaResponseRecord) {
    return !response.error && Boolean(response.responseText.trim());
}

function subtractNullable(left: number | null, right: number | null) {
    return typeof left === 'number' && typeof right === 'number'
        ? roundToTwo(left - right)
        : null;
}

function roundToTwo(value: number) {
    return Math.round(value * 100) / 100;
}
