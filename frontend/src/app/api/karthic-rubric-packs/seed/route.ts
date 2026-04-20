import { NextResponse } from 'next/server';

import { seedKarthicRubricPack } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    frankPacketId?: string;
    preClusterRunId?: string;
    id?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.frankPacketId?.trim()) {
            return NextResponse.json({ error: 'frankPacketId is required.' }, { status: 400 });
        }
        const item = await seedKarthicRubricPack({
            frankPacketId: body.frankPacketId,
            preClusterRunId: body.preClusterRunId,
            id: body.id,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate seed Karthic rubric pack.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate seed Karthic rubric pack.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
