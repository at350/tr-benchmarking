import { NextResponse } from 'next/server';

import { createZakReview, listZakReviews } from '@/lib/legal-workflow-v2-server';
import type { ZakInvocationMode } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const items = await listZakReviews();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list Zak reviews.', error);
        const message = error instanceof Error ? error.message : 'Failed to list Zak reviews.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as {
            dashaRunId?: string;
            invocationMode?: ZakInvocationMode;
        };
        if (!body.dashaRunId?.trim()) {
            return NextResponse.json({ error: 'dashaRunId is required.' }, { status: 400 });
        }
        const item = await createZakReview({
            dashaRunId: body.dashaRunId,
            invocationMode: body.invocationMode,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to create Zak review.', error);
        const message = error instanceof Error ? error.message : 'Failed to create Zak review.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
