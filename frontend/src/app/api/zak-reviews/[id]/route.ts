import { NextResponse } from 'next/server';

import { getZakReview, saveZakReview } from '@/lib/legal-workflow-v2-server';
import type { ZakReviewV1 } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const item = await getZakReview(id);
        if (!item) {
            return NextResponse.json({ error: 'Zak review not found.' }, { status: 404 });
        }
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to load Zak review.', error);
        const message = error instanceof Error ? error.message : 'Failed to load Zak review.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const body = await req.json() as ZakReviewV1;
        const item = await saveZakReview({
            ...body,
            id,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to save Zak review.', error);
        const message = error instanceof Error ? error.message : 'Failed to save Zak review.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
