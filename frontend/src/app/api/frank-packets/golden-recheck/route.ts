import { NextResponse } from 'next/server';

import { recheckFrankGoldenDraft } from '@/lib/legal-workflow-server';
import type { FrankAnalysisDomain, FrankCaseCandidate, SourceExtraction, SourceIntake } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type GoldenRecheckRequest = {
    id?: string;
    legalDomain?: string;
    selectedCase?: FrankCaseCandidate;
    analysisDomains?: FrankAnalysisDomain[];
    currentDraft?: {
        masterIssueStatement?: string;
        benchmarkAnswer?: string;
        failureModeSeeds?: string[];
        sourceIntake?: SourceIntake;
        sourceExtraction?: SourceExtraction;
    };
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as GoldenRecheckRequest;
        if (!body.legalDomain?.trim() || !body.selectedCase || !Array.isArray(body.analysisDomains) || body.analysisDomains.length === 0 || !body.currentDraft) {
            return NextResponse.json({ error: 'legalDomain, selectedCase, analysisDomains, and currentDraft are required.' }, { status: 400 });
        }

        const item = await recheckFrankGoldenDraft({
            id: body.id,
            legalDomain: body.legalDomain,
            selectedCase: body.selectedCase,
            analysisDomains: body.analysisDomains,
            currentDraft: body.currentDraft,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to re-check Frank golden response.', error);
        const message = error instanceof Error ? error.message : 'Failed to re-check Frank golden response.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
