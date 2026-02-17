import { NextResponse } from 'next/server';

import { getLshResultsDirectory, listLshRunSummaries } from '@/lib/lsh-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const resultsDirectory = getLshResultsDirectory();
        if (!resultsDirectory) {
            return NextResponse.json({ error: 'LSH results directory not found.' }, { status: 404 });
        }

        const runs = listLshRunSummaries();
        return NextResponse.json({
            runs,
            resultsDirectory,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to load LSH runs.', error);
        return NextResponse.json({ error: 'Failed to load LSH runs.' }, { status: 500 });
    }
}
