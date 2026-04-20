import { NextResponse } from 'next/server';

import { refineKarthicRubricPack } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

type RequestBody = {
    id?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.id?.trim()) {
            return NextResponse.json({ error: 'id is required.' }, { status: 400 });
        }
        const item = await refineKarthicRubricPack({
            id: body.id,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to refine Karthic rubric pack.', error);
        const message = error instanceof Error ? error.message : 'Failed to refine Karthic rubric pack.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
