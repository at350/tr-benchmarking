import { NextResponse } from 'next/server';

import { deleteLocalPromptFile, isValidPromptLibraryKind } from '@/lib/local-prompt-files';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DeletePromptFileRequest = {
    kind?: string;
    id?: string;
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as DeletePromptFileRequest;
        const kind = body.kind || '';
        const id = typeof body.id === 'string' ? body.id.trim() : '';

        if (!isValidPromptLibraryKind(kind)) {
            return NextResponse.json({ error: 'Invalid prompt library kind.' }, { status: 400 });
        }
        if (!id) {
            return NextResponse.json({ error: 'Prompt file ID is required.' }, { status: 400 });
        }

        await deleteLocalPromptFile(kind, id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Failed to delete local prompt file.', error);
        const message = error instanceof Error ? error.message : 'Failed to delete local prompt file.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
