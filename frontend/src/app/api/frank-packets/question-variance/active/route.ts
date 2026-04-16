import { NextResponse } from 'next/server';

import { setActiveQuestionVariancePackage } from '@/lib/legal-workflow-v2-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    id?: string;
    packageId?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.id?.trim() || !body.packageId?.trim()) {
            return NextResponse.json({ error: 'id and packageId are required.' }, { status: 400 });
        }
        const item = await setActiveQuestionVariancePackage({
            id: body.id,
            packageId: body.packageId,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to set active QuestionVariance package.', error);
        const message = error instanceof Error ? error.message : 'Failed to set active QuestionVariance package.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
