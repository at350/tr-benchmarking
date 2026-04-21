import { LegalWorkflowPageClient } from '@/app/legal-workflow/page';

export default function LegalAutoEvalPipelinePage() {
    return (
        <LegalWorkflowPageClient
            eyebrow="Legal AutoEval"
            title="Legal Auto-Eval Pipeline"
            titleClassName="text-[#f9a62b]"
            subtitle="A grouped Frank / Karthic / Dasha / Zak workflow for packet construction, rubric prefills, evaluation runs, and escalation."
        />
    );
}
