import { NextResponse } from 'next/server';

import { refineKarthicRubricPack } from '@/lib/legal-workflow-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RefineRequest = {
    packId?: string;
    contrastiveStrongAnswer?: string;
    contrastiveMediocreAnswer?: string;
    domainIds?: string[];
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RefineRequest;
        if (!body.packId) {
            return NextResponse.json({ error: 'packId is required.' }, { status: 400 });
        }

        const item = await refineKarthicRubricPack({
            packId: body.packId,
            contrastiveStrongAnswer: body.contrastiveStrongAnswer,
            contrastiveMediocreAnswer: body.contrastiveMediocreAnswer,
            domainIds: body.domainIds,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to refine Karthic rubric pack.', error);
        const message = error instanceof Error ? error.message : 'Failed to refine Karthic rubric pack.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
