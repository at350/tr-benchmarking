import { NextResponse } from 'next/server';

import { executeDashaComparison } from '@/lib/legal-workflow-v2-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const item = await executeDashaComparison(id);
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to execute Dasha comparison.', error);
        const message = error instanceof Error ? error.message : 'Failed to execute Dasha comparison.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
