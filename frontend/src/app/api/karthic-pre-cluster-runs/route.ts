import { NextResponse } from 'next/server';

import { listKarthicPreClusterRuns, runKarthicPreCluster } from '@/lib/legal-workflow-v2-server';
import type { DashaSelectedModel } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    frankPacketId?: string;
    selectedModels?: DashaSelectedModel[];
    sampleCount?: number;
};

export async function GET() {
    try {
        const items = await listKarthicPreClusterRuns();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list pre-Karthic cluster runs.', error);
        return NextResponse.json({ error: 'Failed to list pre-Karthic cluster runs.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.frankPacketId?.trim()) {
            return NextResponse.json({ error: 'frankPacketId is required.' }, { status: 400 });
        }
        if (!Array.isArray(body.selectedModels) || body.selectedModels.length === 0) {
            return NextResponse.json({ error: 'selectedModels is required.' }, { status: 400 });
        }
        const item = await runKarthicPreCluster({
            frankPacketId: body.frankPacketId,
            selectedModels: body.selectedModels,
            sampleCount: Number(body.sampleCount ?? 24),
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to run pre-Karthic clustering.', error);
        const message = error instanceof Error ? error.message : 'Failed to run pre-Karthic clustering.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
