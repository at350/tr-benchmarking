import { NextResponse } from 'next/server';

import { generateQuestionVariancePackage } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    id?: string;
    optionId?: string;
    selectedSwapIds?: string[];
    model?: string;
    reasoningEffort?: ReasoningEffort;
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
            selectedSwapIds: Array.isArray(body.selectedSwapIds) ? body.selectedSwapIds : [],
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate question variation package.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate question variation package.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
