import { LegalWorkflowPageClient } from '@/app/legal-workflow/page';

export default function LegalAutoEvalPipelinePage() {
    return (
        <LegalWorkflowPageClient
            eyebrow="Legal AutoEval"
            title="Legal Auto-Eval Pipeline"
            subtitle="A grouped Frank / Karthic / Dasha / Zak workflow for packet construction, rubric prefills, evaluation runs, and escalation."
        />
    );
}
