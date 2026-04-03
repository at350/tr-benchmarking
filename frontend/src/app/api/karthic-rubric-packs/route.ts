import { NextResponse } from 'next/server';

import { listKarthicRubricPacks, saveKarthicRubricPack } from '@/lib/legal-workflow-server';
import type {
    KarthicCriterion,
    KarthicDomain,
    KarthicGoldenDomainTarget,
    KarthicRubricPack,
    RefinementLogEntry,
} from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SaveKarthicRequest = {
    id?: string;
    frankPacketId?: string;
    domains?: KarthicDomain[];
    goldenTargets?: KarthicGoldenDomainTarget[];
    criteria?: KarthicCriterion[];
    refinementLog?: RefinementLogEntry[];
    smeNotes?: string;
    comparisonMethodNote?: string;
    status?: KarthicRubricPack['status'];
};

export async function GET() {
    try {
        const items = await listKarthicRubricPacks();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list Karthic rubric packs.', error);
        return NextResponse.json({ error: 'Failed to list Karthic rubric packs.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SaveKarthicRequest;
        if (!body.frankPacketId || !Array.isArray(body.domains) || body.domains.length === 0) {
            return NextResponse.json({ error: 'frankPacketId and at least one domain are required.' }, { status: 400 });
        }

        const item = await saveKarthicRubricPack({
            id: body.id,
            frankPacketId: body.frankPacketId,
            domains: body.domains,
            goldenTargets: body.goldenTargets,
            criteria: body.criteria,
            refinementLog: body.refinementLog,
            smeNotes: body.smeNotes,
            comparisonMethodNote: body.comparisonMethodNote,
            status: body.status,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to save Karthic rubric pack.', error);
        const message = error instanceof Error ? error.message : 'Failed to save Karthic rubric pack.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
