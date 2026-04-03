import path from 'path';
import { spawn } from 'child_process';

import { NextResponse } from 'next/server';

import { listDashaRuns, runDashaEvaluation } from '@/lib/legal-workflow-server';
import type { ArtifactRole, DashaSelectedModel } from '@/lib/legal-workflow-types';

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
        const selectedModelsRaw = String(formData.get('selectedModels') || '').trim();
        const files = formData.getAll('files');

        if (!rubricPackId) {
            return NextResponse.json({ error: 'rubricPackId is required.' }, { status: 400 });
        }
        if (!selectedModelsRaw) {
            return NextResponse.json({ error: 'selectedModels is required.' }, { status: 400 });
        }

        let selectedModels: DashaSelectedModel[];
        try {
            selectedModels = JSON.parse(selectedModelsRaw) as DashaSelectedModel[];
        } catch {
            return NextResponse.json({ error: 'selectedModels must be valid JSON.' }, { status: 400 });
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
            files: normalizedFiles,
            selectedModels,
        });

        const workerScript = path.join(process.cwd(), 'scripts', 'dasha-run-worker.mjs');
        const child = spawn(process.execPath, [workerScript, new URL(req.url).origin, item.id], {
            cwd: process.cwd(),
            detached: true,
            env: process.env,
            stdio: 'ignore',
        });
        child.unref();

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to run Dasha evaluation.', error);
        const message = error instanceof Error ? error.message : 'Failed to run Dasha evaluation.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
