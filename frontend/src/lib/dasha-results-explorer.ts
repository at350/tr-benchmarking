import { RUBRIC_MODULE_LABELS } from '@/lib/legal-workflow-v2-constants';
import type {
    DashaClusterRecord,
    DashaResponseRecord,
    DashaRunV2,
    DashaSelectedModel,
    ModelProvider,
    RubricModuleId,
    RubricRowCentroidEvaluation,
    RubricRowKey,
    RubricRowResult,
} from '@/lib/legal-workflow-v2-types';

export type DashaExplorerView = 'compare' | 'diagnose' | 'explain';

export type DashaExplorerClusterScore = {
    clusterId: string;
    score: number | null;
    applicabilityStatus: 'applicable' | 'not_applicable';
    rationale: string;
    differenceSummary: string;
    missingGoldenPoints: string[];
    contradictionPoints: string[];
    metadataTags: RubricRowCentroidEvaluation['metadataTags'] | null;
    isWinner: boolean;
};

export type DashaExplorerRow = {
    rowKey: RubricRowKey;
    rowTitle: string;
    moduleId: RubricModuleId;
    moduleLabel: string;
    weight: number;
    applicabilityStatus: RubricRowResult['applicabilityStatus'];
    applicabilityExplanation: string;
    winningClusterId: string | null;
    winningScore: number | null;
    winningModelMix: RubricRowResult['winningModelMix'];
    rationale: string;
    bestScore: number | null;
    secondBestScore: number | null;
    margin: number;
    separation: number;
    weightedPenalty: number;
    clusterScores: DashaExplorerClusterScore[];
};

export type DashaExplorerModuleClusterScore = {
    clusterId: string;
    score: number | null;
    isWinner: boolean;
};

export type DashaExplorerModule = {
    moduleId: RubricModuleId;
    label: string;
    rowKeys: RubricRowKey[];
    clusterScores: DashaExplorerModuleClusterScore[];
    winningClusterId: string | null;
    bestScore: number | null;
    secondBestScore: number | null;
    separation: number;
};

export type DashaExplorerModelParticipation = {
    modelKey: string;
    provider: ModelProvider;
    model: string;
    validCount: number;
    errorCount: number;
    totalResponses: number;
    clusterParticipation: Array<{
        clusterId: string;
        count: number;
        share: number;
    }>;
    dominantClusterId: string | null;
    dominantClusterShare: number;
    spreadLabel: string;
    hasNoValidResponses: boolean;
};

export type DashaExplorerCluster = {
    clusterId: string;
    size: number;
    representativeText: string;
    representativeResponseId: string;
    modelBreakdown: DashaClusterRecord['modelBreakdown'];
    weightedScore: number | null;
    winsCount: number;
    summaryTags: {
        bottomLineOutcome: string;
        reasoningAlignment: string;
        jurisdictionAssumption: string;
    };
    moduleScores: DashaExplorerModuleClusterScore[];
    strengths: Array<{
        rowKey: RubricRowKey;
        rowTitle: string;
        score: number | null;
        moduleLabel: string;
    }>;
    watchouts: Array<{
        rowKey: RubricRowKey;
        rowTitle: string;
        score: number | null;
        focus: string;
        moduleLabel: string;
    }>;
};

export type DashaExplorerData = {
    runStatus: DashaRunV2['status'];
    runMode: DashaRunV2['runMode'];
    hasScoring: boolean;
    clusterCount: number;
    failedModelCount: number;
    scoredRowCount: number;
    requestedResponses: number;
    validResponses: number;
    weightedScore: number | null;
    clusteringMethod: string;
    clusteringNotes: string | null;
    summarySentence: string;
    overallWinningClusterId: string | null;
    overallWinningClusterWins: number;
    modelParticipations: DashaExplorerModelParticipation[];
    clusters: DashaExplorerCluster[];
    rows: DashaExplorerRow[];
    modules: DashaExplorerModule[];
    penaltyRows: DashaExplorerRow[];
    separationRows: DashaExplorerRow[];
    primaryComparisonClusterIds: string[];
};

export function deriveDashaExplorerData(run: DashaRunV2): DashaExplorerData {
    const clusterOrder = run.clusters.map((cluster) => cluster.id);
    const rowEntries = deriveRows(run.rowResults, clusterOrder);
    const moduleEntries = deriveModules(rowEntries, clusterOrder);
    const clusterEntries = deriveClusters(run, rowEntries, moduleEntries);
    const modelParticipations = deriveModelParticipations(run.selectedModels, run.responses);
    const overallWinningCluster = chooseOverallWinningCluster(clusterEntries, run.clusters);
    const scoredRowCount = rowEntries.filter((row) => row.winningScore !== null).length;
    const failedModelCount = modelParticipations.filter((model) => model.hasNoValidResponses).length;
    const requestedResponses = run.requestedResponseCount ?? run.responses.length;
    const validResponses = run.validResponseCount ?? run.responses.filter(isValidResponse).length;
    const hasScoring = run.runMode === 'score_and_cluster' && rowEntries.length > 0;
    const summarySentence = buildSummarySentence({
        validResponses,
        clusterCount: run.clusters.length,
        hasScoring,
        overallWinningClusterId: overallWinningCluster?.clusterId ?? null,
        overallWinningClusterWins: overallWinningCluster?.winsCount ?? 0,
        scoredRowCount,
        failedModelCount,
        runStatus: run.status,
    });

    const primaryComparisonClusterIds = clusterEntries
        .slice()
        .sort(compareClustersForOverview)
        .slice(0, 2)
        .map((cluster) => cluster.clusterId);

    return {
        runStatus: run.status,
        runMode: run.runMode,
        hasScoring,
        clusterCount: run.clusters.length,
        failedModelCount,
        scoredRowCount,
        requestedResponses,
        validResponses,
        weightedScore: run.weightedSummary.weightedScore,
        clusteringMethod: run.clusteringMethod,
        clusteringNotes: run.clusteringNotes,
        summarySentence,
        overallWinningClusterId: overallWinningCluster?.clusterId ?? null,
        overallWinningClusterWins: overallWinningCluster?.winsCount ?? 0,
        modelParticipations,
        clusters: clusterEntries,
        rows: rowEntries,
        modules: moduleEntries,
        penaltyRows: rowEntries
            .slice()
            .sort((left, right) => right.weightedPenalty - left.weightedPenalty || right.weight - left.weight || left.rowKey.localeCompare(right.rowKey)),
        separationRows: rowEntries
            .slice()
            .sort((left, right) => right.separation - left.separation || right.weight - left.weight || left.rowKey.localeCompare(right.rowKey)),
        primaryComparisonClusterIds,
    };
}

function deriveRows(rowResults: RubricRowResult[], clusterOrder: string[]): DashaExplorerRow[] {
    return rowResults.map((row) => {
        const clusterScores = clusterOrder.map((clusterId) => {
            const evaluation = row.centroidEvaluations.find((item) => item.clusterId === clusterId);
            return {
                clusterId,
                score: evaluation?.score ?? null,
                applicabilityStatus: evaluation?.applicabilityStatus ?? 'not_applicable',
                rationale: evaluation?.rationale ?? 'No evaluation recorded.',
                differenceSummary: evaluation?.difference.differenceSummary ?? 'No difference summary recorded.',
                missingGoldenPoints: evaluation?.difference.missingGoldenPoints ?? [],
                contradictionPoints: evaluation?.difference.contradictionPoints ?? [],
                metadataTags: evaluation?.metadataTags ?? null,
                isWinner: row.winningCentroidId === clusterId,
            } satisfies DashaExplorerClusterScore;
        });
        const numericScores = clusterScores
            .map((item) => item.score)
            .filter((value): value is number => typeof value === 'number')
            .sort((left, right) => right - left);
        const bestScore = numericScores[0] ?? null;
        const secondBestScore = numericScores[1] ?? null;
        const margin = bestScore !== null && secondBestScore !== null ? roundToTwo(bestScore - secondBestScore) : 0;
        return {
            rowKey: row.rowKey,
            rowTitle: row.rowTitle,
            moduleId: row.moduleId,
            moduleLabel: RUBRIC_MODULE_LABELS[row.moduleId],
            weight: row.weight,
            applicabilityStatus: row.applicabilityStatus,
            applicabilityExplanation: row.applicabilityExplanation,
            winningClusterId: row.winningCentroidId,
            winningScore: row.winningScore,
            winningModelMix: row.winningModelMix,
            rationale: row.rationale,
            bestScore,
            secondBestScore,
            margin,
            separation: margin,
            weightedPenalty: typeof row.winningScore === 'number' ? roundToTwo((row.weight * (100 - row.winningScore)) / 100) : 0,
            clusterScores,
        } satisfies DashaExplorerRow;
    });
}

function deriveModules(rows: DashaExplorerRow[], clusterOrder: string[]): DashaExplorerModule[] {
    const grouped = new Map<RubricModuleId, DashaExplorerRow[]>();
    rows.forEach((row) => {
        const current = grouped.get(row.moduleId);
        if (current) {
            current.push(row);
        } else {
            grouped.set(row.moduleId, [row]);
        }
    });

    return Array.from(grouped.entries()).map(([moduleId, moduleRows]) => {
        const clusterScores = clusterOrder.map((clusterId) => {
            const scores = moduleRows
                .map((row) => row.clusterScores.find((score) => score.clusterId === clusterId)?.score)
                .filter((score): score is number => typeof score === 'number');
            return {
                clusterId,
                score: scores.length > 0 ? roundToTwo(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
                isWinner: false,
            };
        });
        const numericScores = clusterScores
            .map((item) => item.score)
            .filter((value): value is number => typeof value === 'number')
            .sort((left, right) => right - left);
        const bestScore = numericScores[0] ?? null;
        const secondBestScore = numericScores[1] ?? null;
        const winningClusterId = clusterScores.find((item) => item.score !== null && item.score === bestScore)?.clusterId ?? null;
        return {
            moduleId,
            label: RUBRIC_MODULE_LABELS[moduleId],
            rowKeys: moduleRows.map((row) => row.rowKey),
            clusterScores: clusterScores.map((item) => ({
                ...item,
                isWinner: item.clusterId === winningClusterId && item.score !== null,
            })),
            winningClusterId,
            bestScore,
            secondBestScore,
            separation: bestScore !== null && secondBestScore !== null ? roundToTwo(bestScore - secondBestScore) : 0,
        } satisfies DashaExplorerModule;
    });
}

function deriveClusters(run: DashaRunV2, rows: DashaExplorerRow[], modules: DashaExplorerModule[]): DashaExplorerCluster[] {
    return run.clusters.map((cluster) => {
        const winsCount = rows.filter((row) => row.winningClusterId === cluster.id).length;
        const weightedScore = computeClusterWeightedScore(cluster.id, rows);
        const summaryTags = deriveClusterSummaryTags(cluster.id, rows);
        const moduleScores = modules.map((module) => {
            const score = module.clusterScores.find((item) => item.clusterId === cluster.id)?.score ?? null;
            return {
                clusterId: cluster.id,
                score,
                isWinner: module.winningClusterId === cluster.id && score !== null,
            } satisfies DashaExplorerModuleClusterScore;
        });
        const scoredRows = rows
            .map((row) => ({
                row,
                score: row.clusterScores.find((item) => item.clusterId === cluster.id)?.score ?? null,
            }))
            .filter((item) => item.score !== null);
        const strengths = scoredRows
            .slice()
            .sort((left, right) => (right.score ?? -1) - (left.score ?? -1) || right.row.weight - left.row.weight || left.row.rowKey.localeCompare(right.row.rowKey))
            .slice(0, 3)
            .map((item) => ({
                rowKey: item.row.rowKey,
                rowTitle: item.row.rowTitle,
                score: item.score,
                moduleLabel: item.row.moduleLabel,
            }));
        const watchouts = scoredRows
            .slice()
            .sort((left, right) => (left.score ?? 101) - (right.score ?? 101) || right.row.weight - left.row.weight || left.row.rowKey.localeCompare(right.row.rowKey))
            .slice(0, 3)
            .map((item) => {
                const clusterScore = item.row.clusterScores.find((score) => score.clusterId === cluster.id);
                return {
                    rowKey: item.row.rowKey,
                    rowTitle: item.row.rowTitle,
                    score: item.score,
                    focus: clusterScore?.missingGoldenPoints[0] || clusterScore?.differenceSummary || item.row.rationale,
                    moduleLabel: item.row.moduleLabel,
                };
            });
        return {
            clusterId: cluster.id,
            size: cluster.size,
            representativeText: cluster.representativeText,
            representativeResponseId: cluster.representativeResponseId,
            modelBreakdown: cluster.modelBreakdown,
            weightedScore,
            winsCount,
            summaryTags,
            moduleScores,
            strengths,
            watchouts,
        } satisfies DashaExplorerCluster;
    });
}

function deriveModelParticipations(selectedModels: DashaSelectedModel[], responses: DashaResponseRecord[]): DashaExplorerModelParticipation[] {
    const responseGroups = new Map<string, DashaResponseRecord[]>();
    responses.forEach((response) => {
        const current = responseGroups.get(response.modelKey);
        if (current) {
            current.push(response);
        } else {
            responseGroups.set(response.modelKey, [response]);
        }
    });

    const keys = new Set<string>([
        ...selectedModels.map((item) => buildModelKey(item.provider, item.model)),
        ...responseGroups.keys(),
    ]);

    return Array.from(keys).map((modelKey) => {
        const [provider, ...modelParts] = modelKey.split('::');
        const model = modelParts.join('::');
        const modelResponses = responseGroups.get(modelKey) ?? [];
        const validResponses = modelResponses.filter(isValidResponse);
        const errorCount = modelResponses.filter((response) => !isValidResponse(response)).length;
        const byCluster = new Map<string, number>();
        validResponses.forEach((response) => {
            if (!response.clusterId) {
                return;
            }
            byCluster.set(response.clusterId, (byCluster.get(response.clusterId) ?? 0) + 1);
        });
        const clusterParticipation = Array.from(byCluster.entries())
            .map(([clusterId, count]) => ({
                clusterId,
                count,
                share: validResponses.length > 0 ? roundToTwo(count / validResponses.length) : 0,
            }))
            .sort((left, right) => right.count - left.count || left.clusterId.localeCompare(right.clusterId));
        const dominant = clusterParticipation[0];
        return {
            modelKey,
            provider: provider as ModelProvider,
            model,
            validCount: validResponses.length,
            errorCount,
            totalResponses: modelResponses.length,
            clusterParticipation,
            dominantClusterId: dominant?.clusterId ?? null,
            dominantClusterShare: dominant?.share ?? 0,
            spreadLabel: buildSpreadLabel(clusterParticipation, validResponses.length),
            hasNoValidResponses: validResponses.length === 0,
        } satisfies DashaExplorerModelParticipation;
    }).sort((left, right) => {
        if (left.hasNoValidResponses !== right.hasNoValidResponses) {
            return left.hasNoValidResponses ? 1 : -1;
        }
        return right.validCount - left.validCount || left.modelKey.localeCompare(right.modelKey);
    });
}

function deriveClusterSummaryTags(clusterId: string, rows: DashaExplorerRow[]) {
    const tags = {
        bottomLineOutcome: tallyTag(rows, clusterId, 'bottomLineOutcome'),
        reasoningAlignment: tallyTag(rows, clusterId, 'reasoningAlignment'),
        jurisdictionAssumption: tallyTag(rows, clusterId, 'jurisdictionAssumption'),
    };
    return tags;
}

function tallyTag(
    rows: DashaExplorerRow[],
    clusterId: string,
    key: keyof RubricRowCentroidEvaluation['metadataTags'],
) {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
        const value = row.clusterScores.find((score) => score.clusterId === clusterId)?.metadataTags?.[key];
        if (!value) {
            return;
        }
        counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? 'Unavailable';
}

function computeClusterWeightedScore(clusterId: string, rows: DashaExplorerRow[]) {
    let weightedTotal = 0;
    let applicableWeightTotal = 0;

    rows.forEach((row) => {
        const score = row.clusterScores.find((item) => item.clusterId === clusterId);
        if (score?.applicabilityStatus !== 'applicable' || typeof score.score !== 'number') {
            return;
        }
        applicableWeightTotal += row.weight;
        weightedTotal += row.weight * score.score;
    });

    return applicableWeightTotal > 0 ? roundToTwo(weightedTotal / applicableWeightTotal) : null;
}

function buildSummarySentence(input: {
    validResponses: number;
    clusterCount: number;
    hasScoring: boolean;
    overallWinningClusterId: string | null;
    overallWinningClusterWins: number;
    scoredRowCount: number;
    failedModelCount: number;
    runStatus: DashaRunV2['status'];
}) {
    if (input.runStatus === 'failed') {
        return 'This run failed before Dasha could produce a complete cluster analysis.';
    }
    if (input.runStatus === 'draft') {
        return 'Dasha is still generating responses and building clusters for this run.';
    }

    const responsePart = `${input.validResponses} valid ${input.validResponses === 1 ? 'answer' : 'answers'} formed ${input.clusterCount} ${input.clusterCount === 1 ? 'cluster' : 'clusters'}`;
    const failureSuffix = input.failedModelCount > 0
        ? ` ${input.failedModelCount} selected ${input.failedModelCount === 1 ? 'model had' : 'models had'} no valid answers.`
        : '';

    if (!input.hasScoring || !input.overallWinningClusterId || input.scoredRowCount === 0) {
        return `${responsePart}; rubric scoring was skipped.${failureSuffix}`.trim();
    }

    return `${responsePart}; ${input.overallWinningClusterId} won ${input.overallWinningClusterWins}/${input.scoredRowCount} scored rows.${failureSuffix}`.trim();
}

function chooseOverallWinningCluster(clusters: DashaExplorerCluster[], rawClusters: DashaClusterRecord[]) {
    const rawLookup = new Map(rawClusters.map((cluster) => [cluster.id, cluster]));
    return clusters
        .slice()
        .sort((left, right) => compareClustersForOverview(left, right, rawLookup))[0] ?? null;
}

function compareClustersForOverview(
    left: Pick<DashaExplorerCluster, 'clusterId' | 'winsCount' | 'weightedScore' | 'size'>,
    right: Pick<DashaExplorerCluster, 'clusterId' | 'winsCount' | 'weightedScore' | 'size'>,
    rawLookup?: Map<string, DashaClusterRecord>,
) {
    const winDelta = right.winsCount - left.winsCount;
    if (winDelta !== 0) {
        return winDelta;
    }
    const rightScore = right.weightedScore ?? -1;
    const leftScore = left.weightedScore ?? -1;
    if (rightScore !== leftScore) {
        return rightScore - leftScore;
    }
    const sizeDelta = (rawLookup?.get(right.clusterId)?.size ?? right.size ?? 0) - (rawLookup?.get(left.clusterId)?.size ?? left.size ?? 0);
    if (sizeDelta !== 0) {
        return sizeDelta;
    }
    return left.clusterId.localeCompare(right.clusterId);
}

function buildModelKey(provider: ModelProvider, model: string) {
    return `${provider}::${model}`;
}

function buildSpreadLabel(clusterParticipation: Array<{ clusterId: string; count: number; share: number }>, validCount: number) {
    if (validCount === 0 || clusterParticipation.length === 0) {
        return 'No valid responses';
    }
    if (clusterParticipation.length === 1) {
        return `Pure in ${clusterParticipation[0].clusterId}`;
    }
    const dominant = clusterParticipation[0];
    if (dominant && dominant.share >= 0.75) {
        return `Mostly ${dominant.clusterId}`;
    }
    return `Mixed across ${clusterParticipation.length} clusters`;
}

function isValidResponse(response: DashaResponseRecord) {
    return !response.error && response.responseText.trim().length > 0;
}

function roundToTwo(value: number) {
    return Math.round(value * 100) / 100;
}
