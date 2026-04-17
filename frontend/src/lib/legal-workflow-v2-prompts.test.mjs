import test from 'node:test';
import assert from 'node:assert/strict';

import { buildKarthicRowsPrompt } from './legal-workflow-v2-prompts.ts';

test('buildKarthicRowsPrompt includes Lane B variant context for QuestionVariance rubrics', () => {
    const prompt = buildKarthicRowsPrompt({
        packet: {
            selectedPack: 'pack10',
            benchmarkAnswer: 'Canonical benchmark answer',
            sourceExtractionSheet: { rule: 'baseline extraction' },
            goldPacketMapping: { benchmarkPosture: 'portable_benchmark_within_selected_pack' },
            likelyFailureModes: { FM1: 'Missing fact handling' },
            reverseEngineeredQuestion: 'Canonical question text',
        },
        assets: {
            sharedModuleSkeleton: 'shared skeleton',
            doctrinePack: 'doctrine pack',
            failureBank: 'failure bank',
        },
        questionText: 'Varied question text',
        questionSourceLabel: 'Active QuestionVariance package',
        canonicalQuestionText: 'Canonical question text',
        questionVariancePackage: {
            id: 'pkg_lane_b',
            lane: 'lane_b',
            variationType: 'Fact omission / ambiguity test',
            updatedModelAnswer: 'Updated variant answer',
            rubricPatchNotes: ['Add bounded-uncertainty criterion'],
            whyTheAnswerShouldStayTheSameOrChange: 'The answer should identify the missing control fact.',
        },
    });

    assert.match(prompt, /Canonical reverse-engineered question:\nCanonical question text/);
    assert.match(prompt, /Active QuestionVariance package:\nVaried question text/);
    assert.match(prompt, /Variant-specific updated model answer:\nUpdated variant answer/);
    assert.match(prompt, /Variant rubric patch notes:\n\["Add bounded-uncertainty criterion"\]/);
    assert.match(prompt, /adapt the rubric rows to the varied question's ambiguity \/ missing-facts posture/i);
});
