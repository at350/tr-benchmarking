import { NextResponse } from 'next/server';

import { getDashaRun } from '@/lib/legal-workflow-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const item = await getDashaRun(id);
        if (!item) {
            return NextResponse.json({ error: 'Dasha run not found.' }, { status: 404 });
        }
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to load Dasha run.', error);
        const message = error instanceof Error ? error.message : 'Failed to load Dasha run.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
