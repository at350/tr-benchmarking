import { ArrowRight, BarChart3, BookOpenText, Database, Orbit, Workflow } from 'lucide-react';

import { AppShell } from '@/components/ui/AppShell';
import { PanelCard } from '@/components/ui/PanelCard';

export default function HomePage() {
    return (
        <AppShell
            eyebrow="Benchmark Workspace"
            title="Legal AI Benchmarking Portal"
            subtitle="Choose a tool: inspect datasets, browse legal outlines, analyze LSH-RUHS clusters, or run full general benchmarking with configurable model evaluations."
            maxWidthClassName="max-w-7xl"
        >
            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                <PanelCard
                    href="/database-view"
                    title="Dataset"
                    description="Explore benchmark questions, filter by topic/difficulty, and inspect the underlying evaluation items before running experiments."
                    icon={<Database className="h-5 w-5" />}
                    badge="Explore"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
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
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
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
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                        Open LSH-RUHS atlas <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>

                <PanelCard
                    href="/legal-workflow"
                    title="Frank-Karthic-Dasha"
                    description="Build stage-bounded legal benchmark artifacts: source-grounded Frank packets, approved Karthic rubrics, and Dasha centroid-first evaluations."
                    icon={<Workflow className="h-5 w-5" />}
                    badge="Pipeline"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                        Open stage-separated workflow <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>

                <PanelCard
                    href="/general-benchmarking"
                    title="General Benchmarking"
                    description="Configure benchmark suites, run model evaluations, probe single questions, and compare saved runs side by side."
                    icon={<BarChart3 className="h-5 w-5" />}
                    badge="Run"
                >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                        Open benchmark runner <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </PanelCard>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Workflow</p>
                <div className="mt-2 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                    <p><span className="font-semibold text-slate-800">1. Dataset:</span> Identify the right legal question mix.</p>
                    <p><span className="font-semibold text-slate-800">2. Workflow:</span> Build stage-separated Frank, Karthic, and Dasha artifacts.</p>
                    <p><span className="font-semibold text-slate-800">3. Compare:</span> Run and inspect evaluations without collapsing stage boundaries.</p>
                </div>
            </section>
        </AppShell>
    );
}
