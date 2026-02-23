import { NextResponse } from 'next/server';

import { getLshResultsDirectory, getLshRunDetails, isValidRunFileName } from '@/lib/lsh-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
    _req: Request,
    context: { params: Promise<{ runFile: string }> }
) {
    try {
        const params = await context.params;
        const runFile = decodeURIComponent(params.runFile || '');

        if (!isValidRunFileName(runFile)) {
            return NextResponse.json({ error: 'Invalid run file name.' }, { status: 400 });
        }

        const resultsDirectory = getLshResultsDirectory();
        if (!resultsDirectory) {
            return NextResponse.json({ error: 'LSH results directory not found.' }, { status: 404 });
        }

        const run = getLshRunDetails(runFile);
        if (!run) {
            return NextResponse.json({ error: 'Run file not found.' }, { status: 404 });
        }

        return NextResponse.json({
            run,
            resultsDirectory,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to load LSH run details.', error);
        return NextResponse.json({ error: 'Failed to load LSH run details.' }, { status: 500 });
    }
}
