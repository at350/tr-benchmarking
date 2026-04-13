import { NextResponse } from 'next/server';

import { draftFrankPacket } from '@/lib/legal-workflow-v2-server';
import type { ArtifactRole } from '@/lib/legal-workflow-v2-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_ROLES = new Set<ArtifactRole>(['anchor_case', 'supporting_authority', 'issue_statement', 'evidence_packet', 'supplemental']);

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const title = String(formData.get('title') || '').trim();
        const files = formData.getAll('files');
        if (files.length === 0) {
            return NextResponse.json({ error: 'At least one uploaded authority file is required.' }, { status: 400 });
        }

        const normalizedFiles = await Promise.all(files.map(async (entry, index) => {
            if (!(entry instanceof File)) {
                throw new Error('Invalid file upload.');
            }
            const roleValue = String(formData.get(`role_${index}`) || 'anchor_case').trim() as ArtifactRole;
            const role = VALID_ROLES.has(roleValue) ? roleValue : 'supplemental';
            return {
                role,
                fileName: entry.name,
                bytes: new Uint8Array(await entry.arrayBuffer()),
            };
        }));

        const item = await draftFrankPacket({
            title,
            files: normalizedFiles,
        });
        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to draft Frank v2 packet.', error);
        const message = error instanceof Error ? error.message : 'Failed to draft Frank packet.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
