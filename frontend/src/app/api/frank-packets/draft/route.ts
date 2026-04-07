import { NextResponse } from 'next/server';

import { draftFrankPacket } from '@/lib/legal-workflow-server';
import type { ArtifactRole } from '@/lib/legal-workflow-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_ROLES = new Set<ArtifactRole>(['anchor_case', 'issue_statement', 'evidence_packet', 'supplemental']);

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const legalDomain = String(formData.get('legalDomain') || '').trim();
        const domainScope = String(formData.get('domainScope') || '').trim();
        const sourceFamily = String(formData.get('sourceFamily') || '').trim();
        const files = formData.getAll('files');

        if (!legalDomain || !domainScope || !sourceFamily) {
            return NextResponse.json({ error: 'legalDomain, domainScope, and sourceFamily are required.' }, { status: 400 });
        }
        if (files.length === 0) {
            return NextResponse.json({ error: 'At least one PDF is required.' }, { status: 400 });
        }

        const normalizedFiles = await Promise.all(files.map(async (entry, index) => {
            if (!(entry instanceof File)) {
                throw new Error('Invalid file upload.');
            }
            const roleValue = String(formData.get(`role_${index}`) || 'supplemental').trim() as ArtifactRole;
            const role = VALID_ROLES.has(roleValue) ? roleValue : 'supplemental';
            return {
                role,
                fileName: entry.name,
                bytes: new Uint8Array(await entry.arrayBuffer()),
            };
        }));

        const item = await draftFrankPacket({
            legalDomain,
            domainScope,
            sourceFamily,
            files: normalizedFiles,
        });

        return NextResponse.json({ item });
    } catch (error) {
        console.error('Failed to draft Frank packet.', error);
        const message = error instanceof Error ? error.message : 'Failed to draft Frank packet.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
