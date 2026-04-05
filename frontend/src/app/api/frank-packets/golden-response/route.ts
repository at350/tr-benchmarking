import { NextResponse } from 'next/server';

import { generateFrankGoldenResponse } from '@/lib/legal-workflow-server';
import type { FrankAnalysisDomain, FrankCaseCandidate, ReasoningEffort, SourceExtraction, SourceIntake } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type GoldenResponseRequest = {
    id?: string;
    legalDomain?: string;
    selectedCase?: FrankCaseCandidate;
    analysisDomains?: FrankAnalysisDomain[];
    model?: string;
    reasoningEffort?: ReasoningEffort;
    refinementFeedback?: string[];
    currentDraft?: {
        masterIssueStatement?: string;
        benchmarkAnswer?: string;
        failureModeSeeds?: string[];
        sourceIntake?: SourceIntake;
        sourceExtraction?: SourceExtraction;
    };
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as GoldenResponseRequest;
        if (!body.legalDomain?.trim() || !body.selectedCase || !Array.isArray(body.analysisDomains) || body.analysisDomains.length === 0) {
            return NextResponse.json({ error: 'legalDomain, selectedCase, and analysisDomains are required.' }, { status: 400 });
        }

        const item = await generateFrankGoldenResponse({
            id: body.id,
            legalDomain: body.legalDomain,
            selectedCase: body.selectedCase,
            analysisDomains: body.analysisDomains,
            model: body.model,
            reasoningEffort: body.reasoningEffort,
            refinementFeedback: body.refinementFeedback,
            currentDraft: body.currentDraft,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to generate Frank golden response.', error);
        const message = error instanceof Error ? error.message : 'Failed to generate Frank golden response.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
