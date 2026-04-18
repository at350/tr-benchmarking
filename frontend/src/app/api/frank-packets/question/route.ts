import { NextResponse } from 'next/server';

import { generateFrankQuestion } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
        const item = await generateFrankQuestion({
            id: body.id,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate Frank reverse-engineered question.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate reverse-engineered question.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
