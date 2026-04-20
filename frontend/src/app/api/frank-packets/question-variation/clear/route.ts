import { NextResponse } from 'next/server';

import { clearQuestionVarianceMenu } from '@/lib/legal-workflow-v2-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RequestBody = {
    id?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as RequestBody;
        if (!body.id?.trim()) {
            return NextResponse.json({ error: 'id is required.' }, { status: 400 });
        }
        const item = await clearQuestionVarianceMenu({ id: body.id });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to clear question variation.', error);
        const message = error instanceof Error ? error.message : 'Failed to clear question variation.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
