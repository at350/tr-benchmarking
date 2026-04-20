import { LegalWorkflowPageClient } from '@/app/legal-workflow/page';

export default function LegalAutoEvalPipelinePage() {
    return (
        <LegalWorkflowPageClient
            pageMode="frank_only"
            eyebrow="Legal AutoEval"
            title="Legal AutoEval Pipeline"
            subtitle="Frank-only workflow for source-grounded packet construction, benchmark drafting, and reverse-engineered question setup."
        />
    );
}
