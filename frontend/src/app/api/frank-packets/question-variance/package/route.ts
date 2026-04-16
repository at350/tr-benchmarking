import { NextResponse } from 'next/server';

import { clearQuestionVariancePackage, generateQuestionVariancePackage } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    id?: string;
    optionId?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
};

type DeleteBody = {
    id?: string;
    packageId?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.id?.trim() || !body.optionId?.trim()) {
            return NextResponse.json({ error: 'id and optionId are required.' }, { status: 400 });
        }
        const item = await generateQuestionVariancePackage({
            id: body.id,
            optionId: body.optionId,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate QuestionVariance package.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate QuestionVariance package.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const body = (await req.json()) as DeleteBody;
        if (!body.id?.trim()) {
            return NextResponse.json({ error: 'id is required.' }, { status: 400 });
        }
        const item = await clearQuestionVariancePackage({
            id: body.id,
            packageId: body.packageId,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to clear QuestionVariance package.', error);
        const message = error instanceof Error ? error.message : 'Failed to clear QuestionVariance package.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
