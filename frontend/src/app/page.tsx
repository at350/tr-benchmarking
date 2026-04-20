import { ArrowRight, BookOpenText, Database, FileStack, Orbit, ScrollText, Workflow } from 'lucide-react';

import { AppShell } from '@/components/ui/AppShell';
import { PanelCard } from '@/components/ui/PanelCard';

export default function HomePage() {
    return (
        <AppShell
            eyebrow="Benchmark Workspace"
            title="Legal AI Benchmarking Portal"
            subtitle="Choose a tool: inspect datasets, browse legal outlines, analyze LSH-RUHS clusters, or work through the full FKD and Frank-only Legal Auto-Eval pipelines."
            maxWidthClassName="max-w-7xl"
        >
            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <PanelCard
                    href="/demos"
                    title="Demos"
                    description="Open streamlined workflow views for the full Frank-Karthic-Dasha pipeline, with benchmark intake, clustered model responses, rubric construction, and judged leaderboard outputs."
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
                    description="Explore benchmark questions, filter by topic/difficulty, and inspect the underlying evaluation items before running experiments."
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
                    description="View available legal outlines as PDFs and use them as retrieval references in rubric-first generation and judging workflows."
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
                    description="Inspect cluster runs, judge cluster quality, and compare grading outputs from previously generated LSH result files."
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
                    description="Build stage-bounded legal benchmark artifacts: source-grounded Frank packets, approved Karthic rubrics, and Dasha centroid-first evaluations."
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
                    description="Use the Frank-only workflow to build packet intake, extraction, benchmark answers, and reverse-engineered questions without the downstream rubric and judging stages yet."
                    icon={<ScrollText className="h-5 w-5" />}
                    badge="Pipeline"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-700)]">
                        Open Frank-only workflow <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Workflow</p>
                <div className="mt-2 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                    <p><span className="font-semibold text-slate-800">1. Dataset:</span> Identify the right legal question mix.</p>
                    <p><span className="font-semibold text-slate-800">2. Workflow:</span> Build Frank packets in Legal AutoEval or continue through the full FKD pipeline.</p>
                    <p><span className="font-semibold text-slate-800">3. Review:</span> Inspect clustered outputs and judged runs without collapsing stage boundaries.</p>
                </div>
            </section>
        </AppShell>
    );
}
