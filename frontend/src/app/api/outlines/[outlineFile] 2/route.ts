import { NextResponse } from 'next/server';

import { getOutlineFilePath, isValidOutlineFileName, readOutlineFileBuffer, resolveOutlinesDirectory } from '@/lib/outlines';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
    _req: Request,
    context: { params: Promise<{ outlineFile: string }> }
) {
    try {
        const params = await context.params;
        const outlineFile = decodeURIComponent(params.outlineFile || '');
        if (!isValidOutlineFileName(outlineFile)) {
            return NextResponse.json({ error: 'Invalid outline file name.' }, { status: 400 });
        }

        const outlinesDirectory = resolveOutlinesDirectory();
        if (!outlinesDirectory) {
            return NextResponse.json({ error: 'Outlines directory not found.' }, { status: 404 });
        }

        const fullPath = getOutlineFilePath(outlineFile);
        if (!fullPath) {
            return NextResponse.json({ error: 'Outline file not found.' }, { status: 404 });
        }

        const data = readOutlineFileBuffer(outlineFile);
        if (!data) {
            return NextResponse.json({ error: 'Outline file could not be read.' }, { status: 500 });
        }

        return new NextResponse(data, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${outlineFile}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Failed to stream outline PDF.', error);
        return NextResponse.json({ error: 'Failed to stream outline PDF.' }, { status: 500 });
    }
}
