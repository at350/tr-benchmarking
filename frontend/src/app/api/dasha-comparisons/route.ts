import path from 'path';
import { spawn } from 'child_process';

import { NextResponse } from 'next/server';

import { listDashaComparisons, runDashaComparison } from '@/lib/legal-workflow-v2-server';
import type { DashaComparisonKind, DashaSelectedModel } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const items = await listDashaComparisons();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list Dasha comparisons.', error);
        return NextResponse.json({ error: 'Failed to list Dasha comparisons.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const comparisonKind = body.comparisonKind === 'lane_b' ? 'lane_b' : 'lane_a';
        const baselineRubricPackId = typeof body.baselineRubricPackId === 'string'
            ? body.baselineRubricPackId.trim()
            : typeof body.rubricPackId === 'string'
                ? body.rubricPackId.trim()
                : '';
        const variantRubricPackId = typeof body.variantRubricPackId === 'string' ? body.variantRubricPackId.trim() : '';
        const questionVariancePackageId = typeof body.questionVariancePackageId === 'string'
            ? body.questionVariancePackageId.trim()
            : '';
        const parsedSampleCount = Number.parseInt(String(body.sampleCount ?? '120'), 10);
        const sampleCount = Number.isFinite(parsedSampleCount)
            ? Math.min(400, Math.max(1, parsedSampleCount))
            : 120;

        if (!baselineRubricPackId) {
            return NextResponse.json({ error: 'baselineRubricPackId is required.' }, { status: 400 });
        }
        if (!questionVariancePackageId) {
            return NextResponse.json({ error: 'questionVariancePackageId is required.' }, { status: 400 });
        }
        if (comparisonKind === 'lane_b' && !variantRubricPackId) {
            return NextResponse.json({ error: 'variantRubricPackId is required for Lane B.' }, { status: 400 });
        }
        if (!Array.isArray(body.selectedModels)) {
            return NextResponse.json({ error: 'selectedModels is required.' }, { status: 400 });
        }

        const selectedModels = body.selectedModels as DashaSelectedModel[];
        const item = await runDashaComparison({
            comparisonKind: comparisonKind as DashaComparisonKind,
            baselineRubricPackId,
            questionVariancePackageId,
            variantRubricPackId,
            selectedModels,
            sampleCount,
        });

        const workerScript = path.join(process.cwd(), 'scripts', 'dasha-comparison-worker.mjs');
        const child = spawn(process.execPath, [workerScript, new URL(req.url).origin, item.id], {
            cwd: process.cwd(),
            detached: true,
            env: process.env,
            stdio: 'ignore',
        });
        child.unref();

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to run Dasha comparison.', error);
        const message = error instanceof Error ? error.message : 'Failed to run Dasha comparison.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
