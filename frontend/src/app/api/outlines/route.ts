import { NextResponse } from 'next/server';

import { listOutlines, resolveOutlinesDirectory } from '@/lib/outlines';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const outlinesDirectory = resolveOutlinesDirectory();
        if (!outlinesDirectory) {
            return NextResponse.json({ error: 'Outlines directory not found.' }, { status: 404 });
        }

        return NextResponse.json({
            outlines: listOutlines(),
            outlinesDirectory,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to load outlines.', error);
        return NextResponse.json({ error: 'Failed to load outlines.' }, { status: 500 });
    }
}
