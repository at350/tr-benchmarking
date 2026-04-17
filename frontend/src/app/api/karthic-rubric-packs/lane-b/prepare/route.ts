import { NextResponse } from 'next/server';

import { prepareLaneBVariantRubricPack } from '@/lib/legal-workflow-v2-server';
import type { ReasoningEffort } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    frankPacketId?: string;
    questionVariancePackageId?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.frankPacketId?.trim()) {
            return NextResponse.json({ error: 'frankPacketId is required.' }, { status: 400 });
        }
        if (!body.questionVariancePackageId?.trim()) {
            return NextResponse.json({ error: 'questionVariancePackageId is required.' }, { status: 400 });
        }
        const item = await prepareLaneBVariantRubricPack({
            frankPacketId: body.frankPacketId,
            questionVariancePackageId: body.questionVariancePackageId,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to prepare Lane B rubric pack.', error);
        const message = error instanceof Error ? error.message : 'Failed to prepare Lane B rubric pack.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
