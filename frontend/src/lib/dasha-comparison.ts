import type {
    DashaClusterRecord,
    DashaModelSummary,
    DashaResponseRecord,
    DashaSelectedModel,
    ModelProvider,
    RubricRowResult,
} from '@/lib/legal-workflow-v2-types';

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

function roundToTwo(value: number) {
    return Math.round(value * 100) / 100;
}
