import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDashaModelSummaries } from './dasha-comparison.ts';

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
