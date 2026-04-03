import { NextResponse } from 'next/server';

import { generateKarthicGoldenTargets } from '@/lib/legal-workflow-server';
import type { KarthicDomain } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type GenerateTargetsRequest = {
    id?: string;
    frankPacketId?: string;
    domains?: KarthicDomain[];
    smeNotes?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as GenerateTargetsRequest;
        const frankPacketId = String(body.frankPacketId || '').trim();
        if (!frankPacketId) {
            return NextResponse.json({ error: 'frankPacketId is required.' }, { status: 400 });
        }
        if (!Array.isArray(body.domains) || body.domains.length === 0) {
            return NextResponse.json({ error: 'At least one domain is required.' }, { status: 400 });
        }

        const item = await generateKarthicGoldenTargets({
            id: body.id,
            frankPacketId,
            domains: body.domains,
            smeNotes: body.smeNotes,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate Karthic golden targets.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate Karthic golden targets.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
