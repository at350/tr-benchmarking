import { NextResponse } from 'next/server';

import { generateFrankBenchmark } from '@/lib/legal-workflow-v2-server';
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
        const item = await generateFrankBenchmark({
            id: body.id,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate Frank benchmark answer.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate benchmark answer.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
