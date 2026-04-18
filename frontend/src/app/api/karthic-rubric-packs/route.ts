import { NextResponse } from 'next/server';

import { listKarthicRubricPacks, saveKarthicRubricPack } from '@/lib/legal-workflow-v2-server';
import type { KarthicRubricPackV2 } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const items = await listKarthicRubricPacks();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list Karthic v2 rubric packs.', error);
        return NextResponse.json({ error: 'Failed to list Karthic rubric packs.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Partial<KarthicRubricPackV2>;
        if (!body.frankPacketId?.trim()) {
            return NextResponse.json({ error: 'frankPacketId is required.' }, { status: 400 });
        }
        const item = await saveKarthicRubricPack(body as Partial<KarthicRubricPackV2> & { frankPacketId: string });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to save Karthic v2 rubric pack.', error);
        const message = error instanceof Error ? error.message : 'Failed to save Karthic rubric pack.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
