import { NextResponse } from 'next/server';

import { draftFrankAnalysisDomains } from '@/lib/legal-workflow-server';
import type { FrankCaseCandidate } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DraftDomainsRequest = {
    legalDomain?: string;
    selectedCase?: FrankCaseCandidate;
    desiredCount?: number;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as DraftDomainsRequest;
        if (!body.legalDomain?.trim() || !body.selectedCase) {
            return NextResponse.json({ error: 'legalDomain and selectedCase are required.' }, { status: 400 });
        }

        const domains = await draftFrankAnalysisDomains({
            legalDomain: body.legalDomain,
            selectedCase: body.selectedCase,
            desiredCount: body.desiredCount,
        });

        return NextResponse.json({ domains });
    } catch (error) {
        console.error('Failed to draft Frank analysis domains.', error);
        const message = error instanceof Error ? error.message : 'Failed to draft Frank analysis domains.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
