import { NextResponse } from 'next/server';

import { searchFrankCaseCandidates } from '@/lib/legal-workflow-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchRequest = {
    legalDomain?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SearchRequest;
        if (!body.legalDomain?.trim()) {
            return NextResponse.json({ error: 'legalDomain is required.' }, { status: 400 });
        }

        const candidates = await searchFrankCaseCandidates({
            legalDomain: body.legalDomain,
        });

        return NextResponse.json({ candidates });
    } catch (error) {
        console.error('Failed to search Frank cases.', error);
        const message = error instanceof Error ? error.message : 'Failed to search Frank cases.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
