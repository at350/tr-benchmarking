'use client';

import type { ReactNode } from 'react';
import { BarChart3, GitCompareArrows, XCircle } from 'lucide-react';

import { EmptyState } from '@/components/ui/EmptyState';
import type { DashaComparisonV2, DashaRunV2 } from '@/lib/legal-workflow-v2-types';

type DashaComparisonResultsProps = {
    comparison: DashaComparisonV2 | null;
    baselineRun: DashaRunV2 | null;
    variantRun: DashaRunV2 | null;
    onOpenRun: (runId: string) => void;
};

const panelClassName = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.05)]';

export function DashaComparisonResults({
    comparison,
    baselineRun,
    variantRun,
    onOpenRun,
}: DashaComparisonResultsProps) {
    if (!comparison) {
        return (
            <EmptyState
                title="No Lane A comparison selected"
                description="Start a paired comparison or select a saved one to inspect baseline-vs-variant score deltas."
                icon={<GitCompareArrows className="h-5 w-5" />}
            />
        );
    }

    return (
        <div className="min-w-0 space-y-5">
            {comparison.status === 'failed' ? (
                <Notice tone="error" title="Comparison failed">
                    {comparison.errorMessage || 'The paired comparison stopped before both child runs completed.'}
                </Notice>
            ) : null}
            {comparison.status === 'draft' ? (
                <Notice tone="info" title="Comparison in progress">
                    Dasha is running the canonical baseline first and the Lane A variant second.
                </Notice>
            ) : null}

            <section className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(31,116,184,0.12),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(94,155,204,0.14),_transparent_40%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <div className="grid gap-4 xl:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
                    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Lane A comparison</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{comparison.variationLabel}</p>
                        <p className="mt-1 text-sm text-slate-600">{comparison.variationType}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
                                onClick={() => onOpenRun(comparison.baselineRunId)}
                            >
                                Open baseline run
                            </button>
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
                                onClick={() => onOpenRun(comparison.variantRunId)}
                            >
                                Open variant run
                            </button>
                        </div>
                    </div>
                    <MetricCard label="Baseline" value={formatScore(comparison.summary?.baselineWeightedScore ?? null)} />
                    <MetricCard label="Variant" value={formatScore(comparison.summary?.variantWeightedScore ?? null)} />
                    <MetricCard
                        label="Delta"
                        value={formatDelta(comparison.summary?.weightedScoreDelta ?? null)}
                        tone={toneForDelta(comparison.summary?.weightedScoreDelta ?? null)}
                    />
                </div>
            </section>

            <section className={panelClassName}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Underlying runs</p>
                        <p className="mt-1 text-sm text-slate-600">Both child runs remain inspectable through the existing Dasha explorer.</p>
                    </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <RunCard title="Canonical baseline" run={baselineRun} fallbackId={comparison.baselineRunId} onOpenRun={onOpenRun} />
                    <RunCard title="Lane A variant" run={variantRun} fallbackId={comparison.variantRunId} onOpenRun={onOpenRun} />
                </div>
            </section>

            <section className={panelClassName}>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Module deltas</p>
                    <p className="mt-1 text-sm text-slate-600">Each row shows the module average for the baseline run versus the varied-question run.</p>
                </div>
                {comparison.summary?.moduleDeltas.length ? (
                    <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                    <th className="px-3 py-2 font-semibold">Module</th>
                                    <th className="px-3 py-2 font-semibold">Baseline</th>
                                    <th className="px-3 py-2 font-semibold">Variant</th>
                                    <th className="px-3 py-2 font-semibold">Delta</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparison.summary.moduleDeltas.map((entry) => (
                                    <tr key={entry.moduleId} className="border-b border-slate-100 last:border-0">
                                        <td className="px-3 py-3 font-medium text-slate-900">{entry.label}</td>
                                        <td className="px-3 py-3 text-slate-700">{formatScore(entry.baselineScore)}</td>
                                        <td className="px-3 py-3 text-slate-700">{formatScore(entry.variantScore)}</td>
                                        <td className={`px-3 py-3 font-semibold ${deltaClassName(entry.scoreDelta)}`}>{formatDelta(entry.scoreDelta)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyMiniState text="Module deltas will appear after both child runs finish scoring." />
                )}
            </section>

            <section className={panelClassName}>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Per-model deltas</p>
                    <p className="mt-1 text-sm text-slate-600">The score delta is based on propagated cluster scores inside each completed run, not direct cluster matching across runs.</p>
                </div>
                {comparison.summary?.modelDeltas.length ? (
                    <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                    <th className="px-3 py-2 font-semibold">Model</th>
                                    <th className="px-3 py-2 font-semibold">Baseline</th>
                                    <th className="px-3 py-2 font-semibold">Variant</th>
                                    <th className="px-3 py-2 font-semibold">Delta</th>
                                    <th className="px-3 py-2 font-semibold">Dominant cluster shift</th>
                                    <th className="px-3 py-2 font-semibold">Valid answers</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparison.summary.modelDeltas.map((entry) => (
                                    <tr key={entry.modelKey} className="border-b border-slate-100 last:border-0">
                                        <td className="px-3 py-3">
                                            <p className="font-medium text-slate-900">{entry.model}</p>
                                            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{entry.provider}</p>
                                        </td>
                                        <td className="px-3 py-3 text-slate-700">{formatScore(entry.baselineScore)}</td>
                                        <td className="px-3 py-3 text-slate-700">{formatScore(entry.variantScore)}</td>
                                        <td className={`px-3 py-3 font-semibold ${deltaClassName(entry.scoreDelta)}`}>{formatDelta(entry.scoreDelta)}</td>
                                        <td className="px-3 py-3 text-slate-700">
                                            {entry.baselineDominantClusterId || 'N/A'} → {entry.variantDominantClusterId || 'N/A'}
                                        </td>
                                        <td className="px-3 py-3 text-slate-700">
                                            {entry.baselineValidCount} → {entry.variantValidCount}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyMiniState text="Per-model deltas will appear after both child runs finish scoring." />
                )}
            </section>
        </div>
    );
}

function RunCard({
    title,
    run,
    fallbackId,
    onOpenRun,
}: {
    title: string;
    run: DashaRunV2 | null;
    fallbackId: string;
    onOpenRun: (runId: string) => void;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{run?.id ?? fallbackId}</p>
            <p className="mt-1 text-sm text-slate-600">
                Status: {run?.status ?? 'Loading'} · Weighted {formatScore(run?.weightedSummary.weightedScore ?? null)}
            </p>
            <button
                type="button"
                className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
                onClick={() => onOpenRun(run?.id ?? fallbackId)}
            >
                Open run details
            </button>
        </div>
    );
}

function Notice({ tone, title, children }: { tone: 'info' | 'error'; title: string; children: ReactNode }) {
    return (
        <div className={tone === 'error' ? 'rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900' : 'rounded-2xl border border-[var(--accent-200)] bg-[var(--accent-50)] p-4 text-[var(--accent-900)]'}>
            <div className="flex items-start gap-3">
                {tone === 'error' ? <XCircle className="mt-0.5 h-4 w-4" /> : <BarChart3 className="mt-0.5 h-4 w-4" />}
                <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm">{children}</p>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'teal' | 'rose' | 'amber' }) {
    const toneClassName = tone === 'teal'
        ? 'border-[var(--accent-200)] bg-[var(--accent-50)]/80 text-[var(--accent-950)]'
        : tone === 'rose'
            ? 'border-rose-200 bg-rose-50/80 text-rose-950'
            : tone === 'amber'
                ? 'border-amber-200 bg-amber-50/80 text-amber-950'
                : 'border-slate-200 bg-white/90 text-slate-950';
    return (
        <div className={`rounded-2xl border p-4 ${toneClassName}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
        </div>
    );
}

function EmptyMiniState({ text }: { text: string }) {
    return (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {text}
        </div>
    );
}

function formatScore(value: number | null) {
    return typeof value === 'number' ? value.toFixed(2) : 'N/A';
}

function formatDelta(value: number | null) {
    if (typeof value !== 'number') {
        return 'N/A';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function toneForDelta(value: number | null) {
    if (typeof value !== 'number') {
        return 'slate' as const;
    }
    if (value > 0) {
        return 'teal' as const;
    }
    if (value < 0) {
        return 'rose' as const;
    }
    return 'amber' as const;
}

function deltaClassName(value: number | null) {
    if (typeof value !== 'number') {
        return 'text-slate-500';
    }
    if (value > 0) {
        return 'text-[var(--accent-700)]';
    }
    if (value < 0) {
        return 'text-rose-700';
    }
    return 'text-amber-700';
}
