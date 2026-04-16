import { NextResponse } from 'next/server';

import { clearQuestionVarianceMenu, generateQuestionVarianceRoutingAndMenu } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    id?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
};

type DeleteBody = {
    id?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.id?.trim()) {
            return NextResponse.json({ error: 'id is required.' }, { status: 400 });
        }
        const item = await generateQuestionVarianceRoutingAndMenu({
            id: body.id,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate QuestionVariance routing + menu.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate QuestionVariance routing + menu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const body = (await req.json()) as DeleteBody;
        if (!body.id?.trim()) {
            return NextResponse.json({ error: 'id is required.' }, { status: 400 });
        }
        const item = await clearQuestionVarianceMenu({ id: body.id });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to clear QuestionVariance menu.', error);
        const message = error instanceof Error ? error.message : 'Failed to clear QuestionVariance menu.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
