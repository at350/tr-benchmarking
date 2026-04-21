import { NextResponse } from 'next/server';

import { judgeDashaRun } from '@/lib/legal-workflow-v2-server';
import type { DashaJudgeModelSelection, ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const body = await req.json().catch(() => ({})) as {
            judgeModels?: DashaJudgeModelSelection[];
            judgeModel?: string;
            judgeReasoningEffort?: ReasoningEffort;
        };
        const item = await judgeDashaRun(id, {
            judgeModels: Array.isArray(body.judgeModels) ? body.judgeModels : undefined,
            judgeModel: typeof body.judgeModel === 'string' ? body.judgeModel.trim() || undefined : undefined,
            judgeReasoningEffort: typeof body.judgeReasoningEffort === 'string' ? body.judgeReasoningEffort : undefined,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to judge Dasha run.', error);
        const message = error instanceof Error ? error.message : 'Failed to judge Dasha run.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
