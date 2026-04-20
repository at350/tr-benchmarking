import { ArrowRight, BookOpenText, Database, FileStack, Orbit, ScrollText, Workflow } from 'lucide-react';

import { AppShell } from '@/components/ui/AppShell';
import { PanelCard } from '@/components/ui/PanelCard';

export default function HomePage() {
    return (
        <AppShell
            eyebrow="Benchmark Workspace"
            title="Legal AI Benchmarking Portal"
            subtitle="Choose a tool: inspect datasets, browse legal outlines, analyze LSH-RUHS clusters, or work through the full FKD and Frank-only Legal Auto-Eval pipelines."
            maxWidthClassName="max-w-none"
        >
            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <PanelCard
                    href="/demos"
                    title="Demos"
                    icon={<FileStack className="h-5 w-5" />}
                    badge="Workflow"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-700)]">
                        Open workflow view <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>

                <PanelCard
                    href="/database-view"
                    title="Dataset"
                    icon={<Database className="h-5 w-5" />}
                    badge="Explore"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-700)]">
                        Open dataset explorer <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>

                <PanelCard
                    href="/outlines"
                    title="Outlines"
                    icon={<BookOpenText className="h-5 w-5" />}
                    badge="Reference"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-700)]">
                        Open outlines library <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>

                <PanelCard
                    href="/lsh-runs"
                    title="LSH-RUHS"
                    icon={<Orbit className="h-5 w-5" />}
                    badge="Analyze"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-700)]">
                        Open LSH-RUHS atlas <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>

                <PanelCard
                    href="/legal-workflow"
                    title="Frank-Karthic-Dasha SoF"
                    icon={<Workflow className="h-5 w-5" />}
                    badge="Pipeline"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-700)]">
                        Open stage-separated workflow <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>

                <PanelCard
                    href="/legal-autoeval-pipeline"
                    title="Legal Auto-Eval Pipeline"
                    icon={<ScrollText className="h-5 w-5" />}
                    badge="Pipeline"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-700)]">
                        Open Frank-only workflow <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>
            </section>

        </AppShell>
    );
}
