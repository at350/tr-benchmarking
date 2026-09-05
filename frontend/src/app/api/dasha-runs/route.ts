import { NextResponse } from 'next/server';

import { validateUploads } from '@/lib/uploads';

import { executeDashaRun, listDashaRuns, runDashaEvaluation } from '@/lib/legal-workflow-v2-server';
import type { ArtifactRole, DashaJudgeModelSelection, DashaRunMode, DashaSelectedModel, KarthicRubricTrackId, ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_ROLES = new Set<ArtifactRole>(['question_packet', 'issue_statement', 'evidence_packet', 'supplemental']);

export async function GET() {
    try {
        const items = await listDashaRuns();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list Dasha runs.', error);
        return NextResponse.json({ error: 'Failed to list Dasha runs.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const rubricPackId = String(formData.get('rubricPackId') || '').trim();
        const rubricTrackId = String(formData.get('rubricTrackId') || 'base').trim() as KarthicRubricTrackId;
        const runMode = String(formData.get('runMode') || 'score_and_cluster').trim() as DashaRunMode;
        const selectedModelsRaw = String(formData.get('selectedModels') || '').trim();
        const sampleCountRaw = String(formData.get('sampleCount') || '').trim();
        const judgeModelsRaw = String(formData.get('judgeModels') || '').trim();
        const judgeModel = String(formData.get('judgeModel') || '').trim();
        const judgeReasoningEffort = String(formData.get('judgeReasoningEffort') || '').trim() as ReasoningEffort;
        const files = formData.getAll('files');

        if (!rubricPackId) {
            return NextResponse.json({ error: 'rubricPackId is required.' }, { status: 400 });
        }
        if (!selectedModelsRaw) {
            return NextResponse.json({ error: 'selectedModels is required.' }, { status: 400 });
        }

        const parsedSampleCount = Number.parseInt(sampleCountRaw || '200', 10);
        const sampleCount = Number.isFinite(parsedSampleCount)
            ? Math.min(400, Math.max(1, parsedSampleCount))
            : 200;

        let selectedModels: DashaSelectedModel[];
        try {
            selectedModels = JSON.parse(selectedModelsRaw) as DashaSelectedModel[];
        } catch {
            return NextResponse.json({ error: 'selectedModels must be valid JSON.' }, { status: 400 });
        }

        let judgeModels: DashaJudgeModelSelection[] | undefined;
        if (judgeModelsRaw) {
            try {
                judgeModels = JSON.parse(judgeModelsRaw) as DashaJudgeModelSelection[];
            } catch {
                return NextResponse.json({ error: 'judgeModels must be valid JSON.' }, { status: 400 });
            }
        }

        const uploadProblem = validateUploads(files);
        if (uploadProblem) {
            return NextResponse.json({ error: uploadProblem.error }, { status: uploadProblem.status });
        }

        const normalizedFiles = await Promise.all(files.map(async (entry, index) => {
            if (!(entry instanceof File)) {
                throw new Error('Invalid file upload.');
            }
            const roleValue = String(formData.get(`role_${index}`) || 'supplemental').trim() as ArtifactRole;
            const role = VALID_ROLES.has(roleValue) ? roleValue : 'supplemental';
            return {
                role,
                fileName: entry.name,
                bytes: new Uint8Array(await entry.arrayBuffer()),
            };
        }));

        const item = await runDashaEvaluation({
            rubricPackId,
            rubricTrackId,
            runMode,
            files: normalizedFiles,
            selectedModels,
            sampleCount,
            judgeModels,
            judgeModel: judgeModel || undefined,
            judgeReasoningEffort: judgeReasoningEffort || undefined,
        });

        // The evaluation can take many minutes, so it runs after this response is sent.
        // Progress and results are written to the run's JSON file, which the UI polls.
        void executeDashaRun(item.id).catch((error) => {
            console.error(`Dasha run ${item.id} failed.`, error);
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to run Dasha evaluation.', error);
        const message = error instanceof Error ? error.message : 'Failed to run Dasha evaluation.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
