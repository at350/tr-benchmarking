import { NextResponse } from 'next/server';

import { listFrankPackets, saveFrankPacket } from '@/lib/legal-workflow-server';
import type { ArtifactRecord, FrankPacket, SourceExtraction, SourceIntake } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SaveFrankRequest = {
    id?: string;
    legalDomain?: string;
    domainScope?: string;
    sourceFamily?: string;
    sourceIntake?: SourceIntake;
    sourceExtraction?: SourceExtraction;
    benchmarkAnswer?: string;
    benchmarkQuestion?: string;
    failureModeSeeds?: string[];
    masterIssueStatement?: string;
    sourceArtifacts?: ArtifactRecord[];
    status?: FrankPacket['status'];
};

export async function GET() {
    try {
        const items = await listFrankPackets();
        return NextResponse.json({
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list Frank packets.', error);
        return NextResponse.json({ error: 'Failed to list Frank packets.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SaveFrankRequest;
        if (!body.legalDomain || !body.domainScope || !body.sourceFamily || !body.sourceIntake || !body.sourceExtraction || !body.benchmarkAnswer || !body.benchmarkQuestion || !body.masterIssueStatement || !Array.isArray(body.sourceArtifacts)) {
            return NextResponse.json({ error: 'Missing required Frank packet fields.' }, { status: 400 });
        }

        const item = await saveFrankPacket({
            id: body.id,
            legalDomain: body.legalDomain,
            domainScope: body.domainScope,
            sourceFamily: body.sourceFamily,
            sourceIntake: body.sourceIntake,
            sourceExtraction: body.sourceExtraction,
            benchmarkAnswer: body.benchmarkAnswer,
            benchmarkQuestion: body.benchmarkQuestion,
            failureModeSeeds: body.failureModeSeeds ?? [],
            masterIssueStatement: body.masterIssueStatement,
            sourceArtifacts: body.sourceArtifacts,
            status: body.status,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to save Frank packet.', error);
        const message = error instanceof Error ? error.message : 'Failed to save Frank packet.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
