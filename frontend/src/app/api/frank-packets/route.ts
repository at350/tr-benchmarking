import { NextResponse } from 'next/server';

import { deleteFrankPacket, listFrankPackets, saveFrankPacket } from '@/lib/legal-workflow-server';
import type {
    ArtifactRecord,
    FrankAnalysisDomain,
    FrankCaseDomainFitCheck,
    FrankCaseCandidate,
    FrankPacket,
    SourceExtraction,
    SourceIntake,
} from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SaveFrankRequest = {
    id?: string;
    legalDomain?: string;
    domainScope?: string;
    sourceFamily?: string;
    selectedCase?: FrankCaseCandidate | null;
    analysisDomains?: FrankAnalysisDomain[];
    fitCheck?: FrankCaseDomainFitCheck;
    sourceIntake?: SourceIntake;
    sourceExtraction?: SourceExtraction;
    benchmarkAnswer?: string;
    benchmarkQuestion?: string;
    goldenWarnings?: string[];
    questionWarnings?: string[];
    failureModeSeeds?: string[];
    masterIssueStatement?: string;
    sourceArtifacts?: ArtifactRecord[];
    status?: FrankPacket['status'];
};

type DeleteFrankRequest = {
    id?: string;
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
        if (!body.legalDomain) {
            return NextResponse.json({ error: 'legalDomain is required.' }, { status: 400 });
        }

        const item = await saveFrankPacket({
            id: body.id,
            legalDomain: body.legalDomain,
            domainScope: body.domainScope ?? body.selectedCase?.title ?? body.legalDomain,
            sourceFamily: body.sourceFamily ?? 'web_searched_anchor_case',
            selectedCase: body.selectedCase,
            analysisDomains: body.analysisDomains,
            fitCheck: body.fitCheck,
            sourceIntake: body.sourceIntake,
            sourceExtraction: body.sourceExtraction,
            benchmarkAnswer: body.benchmarkAnswer,
            benchmarkQuestion: body.benchmarkQuestion,
            goldenWarnings: body.goldenWarnings,
            questionWarnings: body.questionWarnings,
            failureModeSeeds: body.failureModeSeeds ?? [],
            masterIssueStatement: body.masterIssueStatement,
            sourceArtifacts: body.sourceArtifacts ?? [],
            status: body.status,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to save Frank packet.', error);
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

        await deleteFrankPacket(body.id);
        return NextResponse.json({
            ok: true,
            id: body.id,
            deletedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to delete Frank packet.', error);
        const message = error instanceof Error ? error.message : 'Failed to delete Frank packet.';
        const status = message === 'Frank packet not found.' ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
