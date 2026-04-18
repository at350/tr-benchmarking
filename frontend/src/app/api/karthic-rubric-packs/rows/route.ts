import { NextResponse } from 'next/server';

import { generateKarthicRubricPack } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    frankPacketId?: string;
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
        const item = await generateKarthicRubricPack({
            frankPacketId: body.frankPacketId,
            id: body.id,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate Karthic v2 rubric rows.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate rubric rows.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
