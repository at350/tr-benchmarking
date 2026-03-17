import { NextResponse } from 'next/server';

import {
    getPromptLibraryDirectory,
    isValidPromptLibraryKind,
    listLocalPromptFiles,
    saveLocalPromptFile,
} from '@/lib/local-prompt-files';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SavePromptFileRequest = {
    kind?: string;
    existingId?: string;
    name?: string;
    content?: string;
    sourceFileName?: string;
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') || '';

    if (!isValidPromptLibraryKind(kind)) {
        return NextResponse.json({ error: 'Invalid prompt library kind.' }, { status: 400 });
    }

    try {
        const items = await listLocalPromptFiles(kind);
        return NextResponse.json({
            items,
            directory: getPromptLibraryDirectory(kind),
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to list local prompt files.', error);
        return NextResponse.json({ error: 'Failed to list local prompt files.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SavePromptFileRequest;
        const kind = body.kind || '';

        if (!isValidPromptLibraryKind(kind)) {
            return NextResponse.json({ error: 'Invalid prompt library kind.' }, { status: 400 });
        }
        if (typeof body.content !== 'string' || !body.content.trim()) {
            return NextResponse.json({ error: 'Prompt content is required.' }, { status: 400 });
        }

        const savedItem = await saveLocalPromptFile(kind, {
            existingId: body.existingId,
            name: body.name,
            content: body.content,
            sourceFileName: body.sourceFileName,
        });

        return NextResponse.json({
            item: savedItem,
            directory: getPromptLibraryDirectory(kind),
        });
    } catch (error) {
        console.error('Failed to save local prompt file.', error);
        const message = error instanceof Error ? error.message : 'Failed to save local prompt file.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
