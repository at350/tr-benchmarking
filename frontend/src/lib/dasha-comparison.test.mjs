import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildDashaComparisonSummary,
    buildDashaModelSummaries,
    validateLaneAComparisonCandidate,
    validateLaneBComparisonCandidate,
} from './dasha-comparison.ts';

test('buildDashaModelSummaries propagates cluster scores back to each model', () => {
    const summaries = buildDashaModelSummaries({
        selectedModels: [
            { provider: 'openai', model: 'gpt-5.4' },
            { provider: 'anthropic', model: 'claude-opus-4-6' },
        ],
        responses: [
            {
                id: 'resp_a1',
                modelKey: 'openai::gpt-5.4',
                provider: 'openai',
                model: 'gpt-5.4',
                responseText: 'alpha',
                clusterId: 'cluster_1',
            },
            {
                id: 'resp_a2',
                modelKey: 'openai::gpt-5.4',
                provider: 'openai',
                model: 'gpt-5.4',
                responseText: 'beta',
                clusterId: 'cluster_2',
            },
            {
                id: 'resp_b1',
                modelKey: 'anthropic::claude-opus-4-6',
                provider: 'anthropic',
                model: 'claude-opus-4-6',
                responseText: 'gamma',
                clusterId: 'cluster_1',
            },
            {
                id: 'resp_b2',
                modelKey: 'anthropic::claude-opus-4-6',
                provider: 'anthropic',
                model: 'claude-opus-4-6',
                responseText: '',
                clusterId: '',
                error: 'timeout',
            },
        ],
        clusters: [
            {
                id: 'cluster_1',
                representativeResponseId: 'resp_a1',
                representativeText: 'alpha',
                memberResponseIds: ['resp_a1', 'resp_b1'],
                size: 2,
                modelBreakdown: [
                    { modelKey: 'openai::gpt-5.4', provider: 'openai', model: 'gpt-5.4', count: 1 },
                    { modelKey: 'anthropic::claude-opus-4-6', provider: 'anthropic', model: 'claude-opus-4-6', count: 1 },
                ],
            },
            {
                id: 'cluster_2',
                representativeResponseId: 'resp_a2',
                representativeText: 'beta',
                memberResponseIds: ['resp_a2'],
                size: 1,
                modelBreakdown: [
                    { modelKey: 'openai::gpt-5.4', provider: 'openai', model: 'gpt-5.4', count: 1 },
                ],
            },
        ],
        rowResults: [
            {
                rowKey: 'A',
                moduleId: 'module1',
                rowTitle: 'Issue spotting',
                weight: 100,
                applicabilityStatus: 'applicable',
                applicabilityExplanation: 'Applicable',
                centroidEvaluations: [
                    {
                        clusterId: 'cluster_1',
                        applicabilityStatus: 'applicable',
                        applicabilityExplanation: 'Applicable',
                        score: 90,
                        confidence: 0.9,
                        rationale: 'Strong',
                        difference: {
                            matchedGoldenPoints: [],
                            missingGoldenPoints: [],
                            extraCentroidPoints: [],
                            contradictionPoints: [],
                            differenceSummary: 'Strong',
                        },
                        metadataTags: {
                            bottomLineOutcome: 'Correct',
                            outcomeCorrectness: 'Correct',
                            reasoningAlignment: 'Aligned',
                            jurisdictionAssumption: 'Stated',
                        },
                    },
                    {
                        clusterId: 'cluster_2',
                        applicabilityStatus: 'applicable',
                        applicabilityExplanation: 'Applicable',
                        score: 40,
                        confidence: 0.8,
                        rationale: 'Weak',
                        difference: {
                            matchedGoldenPoints: [],
                            missingGoldenPoints: [],
                            extraCentroidPoints: [],
                            contradictionPoints: [],
                            differenceSummary: 'Weak',
                        },
                        metadataTags: {
                            bottomLineOutcome: 'Incorrect',
                            outcomeCorrectness: 'Incorrect',
                            reasoningAlignment: 'Misaligned',
                            jurisdictionAssumption: 'Stated',
                        },
                    },
                ],
                winningCentroidId: 'cluster_1',
                winningScore: 90,
                rationale: 'cluster_1 wins',
                winningModelMix: [],
            },
        ],
    });

    const openAiSummary = summaries.find((item) => item.modelKey === 'openai::gpt-5.4');
    const anthropicSummary = summaries.find((item) => item.modelKey === 'anthropic::claude-opus-4-6');

    assert.ok(openAiSummary);
    assert.equal(openAiSummary.validCount, 2);
    assert.equal(openAiSummary.errorCount, 0);
    assert.equal(openAiSummary.propagatedWeightedScore, 65);
    assert.equal(openAiSummary.dominantClusterId, 'cluster_1');
    assert.equal(openAiSummary.clusterContributions.length, 2);

    assert.ok(anthropicSummary);
    assert.equal(anthropicSummary.validCount, 1);
    assert.equal(anthropicSummary.errorCount, 1);
    assert.equal(anthropicSummary.propagatedWeightedScore, 90);
    assert.equal(anthropicSummary.dominantClusterId, 'cluster_1');
});

test('buildDashaComparisonSummary computes overall, module, and model deltas', () => {
    const summary = buildDashaComparisonSummary({
        baselineRun: {
            selectedModels: [{ provider: 'openai', model: 'gpt-5.4' }],
            weightedSummary: { applicableWeightTotal: 100, weightedScore: 82, notApplicableRowKeys: [] },
            moduleSummaries: [
                { moduleId: 'module1', label: 'Module 1', averageScore: 88, applicableRowCount: 2, winningRowKeys: ['A'] },
                { moduleId: 'module2', label: 'Module 2', averageScore: 76, applicableRowCount: 2, winningRowKeys: ['B'] },
            ],
            modelSummaries: [
                {
                    modelKey: 'openai::gpt-5.4',
                    provider: 'openai',
                    model: 'gpt-5.4',
                    validCount: 5,
                    errorCount: 0,
                    totalResponses: 5,
                    propagatedWeightedScore: 84,
                    dominantClusterId: 'cluster_1',
                    dominantClusterShare: 0.6,
                    clusterContributions: [],
                },
            ],
        },
        variantRun: {
            selectedModels: [{ provider: 'openai', model: 'gpt-5.4' }],
            weightedSummary: { applicableWeightTotal: 100, weightedScore: 74, notApplicableRowKeys: [] },
            moduleSummaries: [
                { moduleId: 'module1', label: 'Module 1', averageScore: 79, applicableRowCount: 2, winningRowKeys: ['A'] },
                { moduleId: 'module2', label: 'Module 2', averageScore: 69, applicableRowCount: 2, winningRowKeys: ['B'] },
            ],
            modelSummaries: [
                {
                    modelKey: 'openai::gpt-5.4',
                    provider: 'openai',
                    model: 'gpt-5.4',
                    validCount: 5,
                    errorCount: 0,
                    totalResponses: 5,
                    propagatedWeightedScore: 71,
                    dominantClusterId: 'cluster_4',
                    dominantClusterShare: 0.8,
                    clusterContributions: [],
                },
            ],
        },
    });

    assert.equal(summary.baselineWeightedScore, 82);
    assert.equal(summary.variantWeightedScore, 74);
    assert.equal(summary.weightedScoreDelta, -8);
    assert.deepEqual(summary.moduleDeltas.map((item) => item.scoreDelta), [-9, -7]);
    assert.equal(summary.modelDeltas[0]?.scoreDelta, -13);
    assert.equal(summary.modelDeltas[0]?.baselineDominantClusterId, 'cluster_1');
    assert.equal(summary.modelDeltas[0]?.variantDominantClusterId, 'cluster_4');
});

test('validateLaneAComparisonCandidate rejects non-canonical rubrics and unsafe packages', () => {
    assert.throws(
        () => validateLaneAComparisonCandidate({
            rubricPack: { questionSource: 'question_variance_active_package' },
            questionVariancePackage: { lane: 'lane_a', status: 'ready', variationStatus: 'safe' },
        }),
        /approved canonical rubric pack/,
    );

    assert.throws(
        () => validateLaneAComparisonCandidate({
            rubricPack: { questionSource: 'canonical' },
            questionVariancePackage: { lane: 'lane_b', status: 'ready', variationStatus: 'safe' },
        }),
        /lane_a/,
    );

    assert.throws(
        () => validateLaneAComparisonCandidate({
            rubricPack: { questionSource: 'canonical' },
            questionVariancePackage: { lane: 'lane_a', status: 'needs_targeted_revision', variationStatus: 'ambiguity_test' },
        }),
        /safe, ready/,
    );
});

test('validateLaneBComparisonCandidate rejects mismatched or unapproved variant rubric packs', () => {
    assert.throws(
        () => validateLaneBComparisonCandidate({
            baselineRubricPack: { questionSource: 'canonical', status: 'approved' },
            variantRubricPack: { questionSource: 'canonical', questionVariancePackageId: 'pkg_lane_b', status: 'approved' },
            questionVariancePackage: { id: 'pkg_lane_b', lane: 'lane_b', status: 'ready' },
        }),
        /active QuestionVariance package source/,
    );

    assert.throws(
        () => validateLaneBComparisonCandidate({
            baselineRubricPack: { questionSource: 'canonical', status: 'approved' },
            variantRubricPack: { questionSource: 'question_variance_active_package', questionVariancePackageId: 'pkg_lane_b', status: 'draft' },
            questionVariancePackage: { id: 'pkg_lane_b', lane: 'lane_b', status: 'ready' },
        }),
        /approved variant-specific rubric pack/,
    );

    assert.throws(
        () => validateLaneBComparisonCandidate({
            baselineRubricPack: { questionSource: 'canonical', status: 'approved' },
            variantRubricPack: { questionSource: 'question_variance_active_package', questionVariancePackageId: 'other_pkg', status: 'approved' },
            questionVariancePackage: { id: 'pkg_lane_b', lane: 'lane_b', status: 'ready' },
        }),
        /does not match/,
    );
});
