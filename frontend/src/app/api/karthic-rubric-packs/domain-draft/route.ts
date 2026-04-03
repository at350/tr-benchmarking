import { NextResponse } from 'next/server';

import { draftKarthicDomains } from '@/lib/legal-workflow-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DraftDomainsRequest = {
    frankPacketId?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as DraftDomainsRequest;
        const frankPacketId = String(body.frankPacketId || '').trim();
        if (!frankPacketId) {
            return NextResponse.json({ error: 'frankPacketId is required.' }, { status: 400 });
        }

        const domains = await draftKarthicDomains({ frankPacketId });
        return NextResponse.json({ domains });
    } catch (error) {
        console.error('Failed to draft Karthic domains.', error);
        const message = error instanceof Error ? error.message : 'Failed to draft Karthic domains.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
