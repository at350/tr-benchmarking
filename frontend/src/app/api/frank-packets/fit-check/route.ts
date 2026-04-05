import { NextResponse } from 'next/server';

import { runFrankCaseDomainFitCheck } from '@/lib/legal-workflow-server';
import type { FrankAnalysisDomain, FrankCaseCandidate } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type FitCheckRequest = {
    id?: string;
    legalDomain?: string;
    selectedCase?: FrankCaseCandidate;
    analysisDomains?: FrankAnalysisDomain[];
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as FitCheckRequest;
        if (!body.legalDomain?.trim() || !body.selectedCase || !Array.isArray(body.analysisDomains) || body.analysisDomains.length === 0) {
            return NextResponse.json({ error: 'legalDomain, selectedCase, and analysisDomains are required.' }, { status: 400 });
        }

        const item = await runFrankCaseDomainFitCheck({
            id: body.id,
            legalDomain: body.legalDomain,
            selectedCase: body.selectedCase,
            analysisDomains: body.analysisDomains,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to run Frank case-domain fit check.', error);
        const message = error instanceof Error ? error.message : 'Failed to run Frank case-domain fit check.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
