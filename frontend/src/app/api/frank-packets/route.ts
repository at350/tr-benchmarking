import { NextResponse } from 'next/server';

import { deleteFrankPacket, listFrankPackets, saveFrankPacket } from '@/lib/legal-workflow-v2-server';
import type { FrankPacketV2 } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DeleteFrankRequest = {
    id?: string;
    cascade?: boolean;
};

export async function GET() {
    try {
        const items = await listFrankPackets();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list Frank v2 packets.', error);
        return NextResponse.json({ error: 'Failed to list Frank packets.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Partial<FrankPacketV2>;
        const item = await saveFrankPacket(body);
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to save Frank v2 packet.', error);
        const message = error instanceof Error ? error.message : 'Failed to save Frank packet.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const body = (await req.json()) as DeleteFrankRequest;
        if (!body.id?.trim()) {
            return NextResponse.json({ error: 'id is required.' }, { status: 400 });
        }
        await deleteFrankPacket(body.id, { cascade: body.cascade === true });
        return NextResponse.json({
            ok: true,
            id: body.id,
            deletedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to delete Frank v2 packet.', error);
        const message = error instanceof Error ? error.message : 'Failed to delete Frank packet.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
