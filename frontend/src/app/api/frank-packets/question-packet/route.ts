import { NextResponse } from 'next/server';

import { generateFrankQuestionPacket } from '@/lib/legal-workflow-server';
import type { FrankAnalysisDomain, FrankCaseCandidate, ReasoningEffort } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QuestionPacketRequest = {
    id?: string;
    legalDomain?: string;
    selectedCase?: FrankCaseCandidate;
    analysisDomains?: FrankAnalysisDomain[];
    benchmarkAnswer?: string;
    model?: string;
    reasoningEffort?: ReasoningEffort;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as QuestionPacketRequest;
        if (!body.legalDomain?.trim() || !body.selectedCase || !Array.isArray(body.analysisDomains) || body.analysisDomains.length === 0 || !body.benchmarkAnswer?.trim()) {
            return NextResponse.json({ error: 'legalDomain, selectedCase, analysisDomains, and benchmarkAnswer are required.' }, { status: 400 });
        }

        const item = await generateFrankQuestionPacket({
            id: body.id,
            legalDomain: body.legalDomain,
            selectedCase: body.selectedCase,
            analysisDomains: body.analysisDomains,
            benchmarkAnswer: body.benchmarkAnswer,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate Frank question packet.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate Frank question packet.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
