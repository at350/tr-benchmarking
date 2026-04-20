'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
    ArrowRight,
    Bot,
    BrainCircuit,
    CheckCircle2,
    ChevronRight,
    FileStack,
    Orbit,
    Scale,
    Target,
    Workflow,
} from 'lucide-react';

import { AppShell } from '@/components/ui/AppShell';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
    batchSummary,
    benchmarkAnswerText,
    capRules,
    dashaSummary,
    frankPromptBundles,
    initialClusterId,
    judgedClusters,
    karthicFields,
    karthicPromptBundles,
    keyFacts,
    modelBatchRows,
    modelLeaderboard,
    overlayRules,
    questionText as defaultQuestionText,
    rubricModules,
    sourceFields,
    workflowStages,
} from '@/lib/demos/frank-karthic-dasha-demo';

type WorkflowStageId = (typeof workflowStages)[number]['id'];

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-[var(--accent-300)] focus:ring-2 focus:ring-[var(--accent-100)]';
const textareaClassName = `${inputClassName} min-h-[220px] resize-y leading-6`;
const panelClassName = 'rounded-3xl border border-slate-200 bg-white/92 p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]';

function formatClusterModelLabel(modelKey: string) {
    const [, providerModel = modelKey] = modelKey.split('::');
    const segments = providerModel.split('/');
    return segments[segments.length - 1] ?? providerModel;
}

function StageButton({
    label,
    title,
    summary,
    active,
    complete,
    onClick,
}: {
    label: string;
    title: string;
    summary: string;
    active: boolean;
    complete: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                'rounded-2xl border p-4 text-left transition-all',
                active
                    ? 'border-[var(--accent-300)] bg-[var(--accent-50)] shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                    <h3 className="mt-1 text-base font-bold text-slate-900">{title}</h3>
                </div>
                <span
                    className={clsx(
                        'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
                        active
                            ? 'border border-[var(--accent-200)] bg-white text-[var(--accent-700)]'
                            : complete
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-600',
                    )}
                >
                    {active ? 'Current' : complete ? 'Complete' : 'Ready'}
                </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{summary}</p>
        </button>
    );
}

function FieldGrid({ fields }: { fields: Array<{ label: string; value: string }> }) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
                <label key={field.label} className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {field.label}
                    </span>
                    <input className={inputClassName} defaultValue={field.value} />
                </label>
            ))}
        </div>
    );
}

function ModuleBar({ value, max }: { value: number; max: number }) {
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    return (
        <div className="rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-gradient-to-r from-[var(--accent-600)] to-[var(--accent-300)]" style={{ width: `${percent}%` }} />
        </div>
    );
}

function FrankView({
    benchmarkAnswer,
    setBenchmarkAnswer,
    questionText,
    setQuestionText,
    onNext,
}: {
    benchmarkAnswer: string;
    setBenchmarkAnswer: (value: string) => void;
    questionText: string;
    setQuestionText: (value: string) => void;
    onNext: () => void;
}) {
    return (
        <div className="space-y-5">
            <section className={panelClassName}>
                <SectionHeader
                    title="Source Intake"
                    description="Frank starts from the source case, routes it into the Pack 10 doctrine family, and locks the core benchmark posture before drafting."
                />
                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                    <div>
                        <FieldGrid fields={sourceFields} />
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Holding-driving facts</p>
                            <ul className="mt-3 space-y-2 text-sm text-slate-700">
                                {keyFacts.map((fact) => (
                                    <li key={fact} className="flex gap-2">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-600)]" />
                                        <span>{fact}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Loaded Prompt Bundles</p>
                        <div className="mt-4 grid gap-4">
                            {frankPromptBundles.map((bundle) => (
                                <div key={bundle.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <h3 className="text-sm font-bold text-slate-900">{bundle.title}</h3>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {bundle.files.map((file) => (
                                            <span
                                                key={file}
                                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                                            >
                                                {file}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className={panelClassName}>
                <SectionHeader
                    title="Frank Outputs"
                    description="The benchmark answer becomes the legal backbone for later clustering and rubric construction, and the reverse-engineered question is what the model pool answers."
                />
                <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                    <label className="block">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Benchmark Answer
                        </span>
                        <textarea
                            className={textareaClassName}
                            value={benchmarkAnswer}
                            onChange={(event) => setBenchmarkAnswer(event.target.value)}
                        />
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Reverse-Engineered Question
                        </span>
                        <textarea
                            className={`${textareaClassName} min-h-[220px]`}
                            value={questionText}
                            onChange={(event) => setQuestionText(event.target.value)}
                        />
                    </label>
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={onNext}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-300)] bg-[var(--accent-50)] px-4 py-2 text-sm font-semibold text-[var(--accent-800)] transition-colors hover:bg-[var(--accent-100)]"
                    >
                        Open Response Batch
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </section>
        </div>
    );
}

function ResponsesView({ onNext }: { onNext: () => void }) {
    return (
        <div className="space-y-5">
            <section className={panelClassName}>
                <SectionHeader
                    title="Batch Status"
                    description="The benchmark question has been run across the full model roster and compressed into representative response families before rubric work begins."
                />
                <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-[var(--accent-200)] bg-[var(--accent-50)]/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-700)]">Execution</p>
                        <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{batchSummary.completionLabel}</p>
                        <p className="mt-3 text-sm leading-6 text-slate-700">{batchSummary.clusteringMethod}</p>
                        <div className="mt-4 rounded-2xl border border-[var(--accent-200)] bg-white p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-700)]">Embedding Instruction</p>
                            <p className="mt-2 text-sm text-slate-700">{batchSummary.embeddingInstruction}</p>
                        </div>
                    </div>

                    <div className="grid auto-rows-fr gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {judgedClusters.map((cluster) => (
                            <div key={cluster.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold leading-6 text-slate-900 break-words">{cluster.label}</p>
                                        <p className="mt-1 text-xs text-slate-500">{cluster.size} responses</p>
                                    </div>
                                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                        {cluster.id.replace('_', ' ')}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-slate-600">{cluster.summary}</p>
                                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                    Top model contributors
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {cluster.modelMix.slice(0, 3).map((model) => (
                                        <span
                                            key={`${cluster.id}_${model.modelKey}`}
                                            className="max-w-full rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium leading-5 text-slate-700 break-all"
                                        >
                                            {formatClusterModelLabel(model.modelKey)}: {model.count} of 20 responses
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className={panelClassName}>
                <SectionHeader
                    title="Model Roster"
                    description="Every model contributes exactly twenty responses, with the cluster spread shown before judging is applied."
                />
                <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                            <tr>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Provider</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Model</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Responses</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Dominant Cluster</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Share</th>
                            </tr>
                        </thead>
                        <tbody>
                            {modelBatchRows.map((row) => (
                                <tr key={row.modelKey}>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-600">{row.providerLabel}</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm font-semibold text-slate-900">{row.modelKey}</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.responsesGenerated} / 20</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.dominantClusterId}</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.dominantClusterShare.toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={onNext}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-300)] bg-[var(--accent-50)] px-4 py-2 text-sm font-semibold text-[var(--accent-800)] transition-colors hover:bg-[var(--accent-100)]"
                    >
                        Open Karthic
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </section>
        </div>
    );
}

function KarthicView({ onNext }: { onNext: () => void }) {
    return (
        <div className="space-y-5">
            <section className={panelClassName}>
                <SectionHeader
                    title="Karthic Handoff"
                    description="Frank outputs, the selected doctrine pack, the failure bank, and the clustered centroids are locked before rubric drafting begins."
                />
                <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div>
                        <FieldGrid fields={karthicFields} />
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Karthic Prompt Bundles</p>
                            <div className="mt-3 grid gap-3">
                                {karthicPromptBundles.map((bundle) => (
                                    <div key={bundle.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <h3 className="text-sm font-bold text-slate-900">{bundle.title}</h3>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {bundle.files.map((file) => (
                                                <span
                                                    key={file}
                                                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                                                >
                                                    {file}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Scoring Overlays</p>
                        <div className="mt-3 grid gap-3">
                            {overlayRules.map((rule) => (
                                <div key={rule.code} className="rounded-2xl border border-slate-200 bg-white p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-semibold text-slate-900">{rule.code}</p>
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                            {rule.points}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-600">{rule.note}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className={panelClassName}>
                <SectionHeader
                    title="Rubric Builder"
                    description="Karthic decomposes the doctrine into four scored modules and thirteen weighted rows, preserving comparability across runs."
                />
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {rubricModules.map((module) => (
                        <div key={module.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{module.title}</h3>
                                    <p className="mt-2 text-sm text-slate-600">{module.summary}</p>
                                </div>
                                <span className="rounded-full border border-[var(--accent-200)] bg-[var(--accent-50)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-700)]">
                                    {module.budget} pts
                                </span>
                            </div>
                            <div className="mt-4 grid gap-3">
                                {module.rows.map((row) => (
                                    <div key={row.key} className="rounded-2xl border border-slate-200 bg-white p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">
                                                    {row.key}. {row.title}
                                                </p>
                                                <p className="mt-1 text-sm text-slate-600">{row.description}</p>
                                            </div>
                                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                                {row.weight}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Caps</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {capRules.map((rule) => (
                            <div key={rule.code} className="rounded-2xl border border-slate-200 bg-white p-3">
                                <p className="text-sm font-semibold text-slate-900">{rule.code}</p>
                                <p className="mt-2 text-sm text-slate-600">{rule.note}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={onNext}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-300)] bg-[var(--accent-50)] px-4 py-2 text-sm font-semibold text-[var(--accent-800)] transition-colors hover:bg-[var(--accent-100)]"
                    >
                        Open Dasha
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </section>
        </div>
    );
}

function DashaView({
    selectedClusterId,
    onSelectCluster,
}: {
    selectedClusterId: string;
    onSelectCluster: (clusterId: string) => void;
}) {
    const selectedCluster = judgedClusters.find((cluster) => cluster.id === selectedClusterId) ?? judgedClusters[0];

    return (
        <div className="space-y-5">
            <section className={panelClassName}>
                <SectionHeader
                    title="Dasha Leaderboard"
                    description="Centroid scores are propagated back to all member responses, then averaged at the model level."
                />
                <div className="mt-4 rounded-2xl border border-[var(--accent-200)] bg-[var(--accent-50)]/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-700)]">Primary cluster</p>
                            <p className="mt-2 text-lg font-bold text-slate-900">
                                {dashaSummary.primaryWinner} · {dashaSummary.primaryWinnerScore.toFixed(1)}
                            </p>
                            <p className="mt-2 text-sm text-slate-700">{dashaSummary.propagationLabel}</p>
                        </div>
                        <div className="rounded-2xl border border-[var(--accent-200)] bg-white px-4 py-3 text-right">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-700)]">Judged clusters</p>
                            <p className="mt-1 text-2xl font-black tracking-tight text-slate-900">{dashaSummary.judgedClusters}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                            <tr>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Rank</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Model</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Provider</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Avg Final Score</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">High-Scoring Share</th>
                                <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Dominant Cluster</th>
                            </tr>
                        </thead>
                        <tbody>
                            {modelLeaderboard.map((row) => (
                                <tr key={row.modelKey}>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm font-semibold text-slate-900">{row.rank}</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm font-semibold text-slate-900">{row.modelKey}</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-600">{row.providerLabel}</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.averageScore.toFixed(1)}</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.highScoringShare.toFixed(1)}%</td>
                                    <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.dominantClusterId}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className={panelClassName}>
                <SectionHeader
                    title="Centroid Judging"
                    description="Dasha scores the representative response for each cluster, then applies that score to the rest of the cluster membership."
                />
                <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                    <div className="grid gap-3">
                        {judgedClusters.map((cluster) => (
                            <button
                                key={cluster.id}
                                type="button"
                                onClick={() => onSelectCluster(cluster.id)}
                                className={clsx(
                                    'rounded-2xl border p-4 text-left transition-all',
                                    cluster.id === selectedCluster.id
                                        ? 'border-[var(--accent-300)] bg-[var(--accent-50)]'
                                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-50',
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{cluster.label}</p>
                                        <p className="mt-1 text-xs text-slate-500">{cluster.size} responses · {cluster.verdict}</p>
                                    </div>
                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                        {cluster.finalScore.toFixed(1)}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-slate-600">{cluster.summary}</p>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{selectedCluster.id}</p>
                                    <h3 className="mt-1 text-xl font-bold text-slate-900">{selectedCluster.label}</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                                        Subtotal {selectedCluster.subtotal.toFixed(1)}
                                    </span>
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                                        Penalties {selectedCluster.penaltyTotal}
                                    </span>
                                    <span className="rounded-full border border-[var(--accent-200)] bg-[var(--accent-50)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-700)]">
                                        Final {selectedCluster.finalScore.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedCluster.representativeText}</p>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Module Scores</p>
                                <div className="mt-4 space-y-4">
                                    {selectedCluster.moduleScores.map((module) => (
                                        <div key={module.id}>
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="text-sm font-semibold text-slate-900">{module.title}</span>
                                                <span className="text-sm text-slate-600">
                                                    {module.score.toFixed(1)} / {module.max}
                                                </span>
                                            </div>
                                            <ModuleBar value={module.score} max={module.max} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Model Mix</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {selectedCluster.modelMix.map((entry) => (
                                        <span
                                            key={`${selectedCluster.id}_${entry.modelKey}`}
                                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                                        >
                                            {entry.modelKey} ({entry.count})
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Strengths</p>
                                        <ul className="mt-2 space-y-2 text-sm text-slate-700">
                                            {selectedCluster.strengths.map((item) => (
                                                <li key={item} className="flex gap-2">
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Watchouts</p>
                                        <ul className="mt-2 space-y-2 text-sm text-slate-700">
                                            {selectedCluster.watchouts.map((item) => (
                                                <li key={item} className="flex gap-2">
                                                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Row-Level Judging</p>
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr>
                                            <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Row</th>
                                            <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Weight</th>
                                            <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Score</th>
                                            <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Contribution</th>
                                            <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Assessment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedCluster.rowEvaluations.map((row) => (
                                            <tr key={`${selectedCluster.id}_${row.key}`}>
                                                <td className="border-b border-slate-100 px-3 py-3 text-sm">
                                                    <div className="font-semibold text-slate-900">{row.key}. {row.title}</div>
                                                </td>
                                                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.weight}</td>
                                                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.score} / 4</td>
                                                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{row.weightedContribution.toFixed(1)}</td>
                                                <td className="border-b border-slate-100 px-3 py-3 text-sm text-slate-600">{row.note}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Penalty Log</p>
                            <div className="mt-3 grid gap-3">
                                {selectedCluster.penalties.length > 0 ? (
                                    selectedCluster.penalties.map((penalty) => (
                                        <div key={`${selectedCluster.id}_${penalty.code}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-semibold text-slate-900">{penalty.code}</p>
                                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                                    -{penalty.points}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-slate-600">{penalty.note}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800">
                                        No overlay penalties applied to this centroid.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default function DemosPage() {
    const [activeStage, setActiveStage] = useState<WorkflowStageId>('frank');
    const [benchmarkAnswer, setBenchmarkAnswer] = useState(benchmarkAnswerText);
    const [questionText, setQuestionText] = useState(defaultQuestionText);
    const [selectedClusterId, setSelectedClusterId] = useState(initialClusterId);

    const activeStageIndex = workflowStages.findIndex((stage) => stage.id === activeStage);
    const activeStageMeta = workflowStages[activeStageIndex] ?? workflowStages[0];

    const nextStageId = workflowStages[(activeStageIndex + 1) % workflowStages.length]?.id ?? 'frank';

    const stageContent = useMemo(() => {
        if (activeStage === 'frank') {
            return (
                <FrankView
                    benchmarkAnswer={benchmarkAnswer}
                    setBenchmarkAnswer={setBenchmarkAnswer}
                    questionText={questionText}
                    setQuestionText={setQuestionText}
                    onNext={() => setActiveStage('responses')}
                />
            );
        }

        if (activeStage === 'responses') {
            return <ResponsesView onNext={() => setActiveStage('karthic')} />;
        }

        if (activeStage === 'karthic') {
            return <KarthicView onNext={() => setActiveStage('dasha')} />;
        }

        return <DashaView selectedClusterId={selectedClusterId} onSelectCluster={setSelectedClusterId} />;
    }, [activeStage, benchmarkAnswer, questionText, selectedClusterId]);

    return (
        <AppShell
            eyebrow="Workflow"
            title="Legal Workflow"
            subtitle="Source-grounded benchmark generation, clustered response analysis, rubric construction, and centroid-first judging for the Anglemire marriage-consideration question."
            maxWidthClassName="max-w-[1600px]"
            actions={
                <>
                    <Link
                        href="/legal-workflow"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                        Open Full Workflow
                    </Link>
                    <Link
                        href="/"
                        className="rounded-xl border border-[var(--accent-300)] bg-[var(--accent-50)] px-3 py-2 text-sm font-semibold text-[var(--accent-800)] transition-colors hover:bg-[var(--accent-100)]"
                    >
                        Back Home
                    </Link>
                </>
            }
        >
            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[28px] border border-slate-200 bg-white/94 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        <span className="rounded-full border border-[var(--accent-200)] bg-[var(--accent-50)] px-2.5 py-1 text-[var(--accent-700)]">Statute of Frauds</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Pack 10</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Marriage consideration</span>
                    </div>

                    <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
                        Frank to Dasha, stage by stage
                    </h2>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                        Move through the workflow in order: source intake and benchmark generation, full model batch and clustering,
                        rubric construction, then centroid-first judging with propagated model rankings.
                    </p>

                    <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Frank</span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Response Batch</span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">Karthic</span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <span className="rounded-full border border-[var(--accent-200)] bg-[var(--accent-50)] px-3 py-1.5 text-[var(--accent-700)]">Dasha</span>
                    </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white/94 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Workflow Posture</p>
                    <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">Source-grounded benchmark generation</p>
                            <p className="mt-1 text-sm text-slate-600">Start with the case record and doctrine pack before any model comparison begins.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">Full-batch response analysis</p>
                            <p className="mt-1 text-sm text-slate-600">Run the question across the model pool, then compress the answer space into representative response families.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">Rubric before judging</p>
                            <p className="mt-1 text-sm text-slate-600">Construct the scoring logic from Frank outputs and cluster differences before opening any rankings.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">Leaderboard only at Dasha</p>
                            <p className="mt-1 text-sm text-slate-600">Final model performance appears only after centroid judging and score propagation are complete.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-6">
                <SectionHeader
                    title="Pipeline Stages"
                    description="Select a stage to inspect the workflow state and move through the pipeline."
                />
                <div className="mt-4 grid gap-4 xl:grid-cols-4">
                    {workflowStages.map((stage, index) => (
                        <StageButton
                            key={stage.id}
                            label={stage.label}
                            title={stage.title}
                            summary={stage.summary}
                            active={stage.id === activeStage}
                            complete={index <= activeStageIndex}
                            onClick={() => setActiveStage(stage.id)}
                        />
                    ))}
                </div>
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="space-y-5">
                    <div className={panelClassName}>
                        <div className="flex items-start gap-3">
                            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--accent-200)] bg-[var(--accent-50)] text-[var(--accent-700)]">
                                {activeStage === 'frank' ? <FileStack className="h-5 w-5" /> : null}
                                {activeStage === 'responses' ? <Orbit className="h-5 w-5" /> : null}
                                {activeStage === 'karthic' ? <BrainCircuit className="h-5 w-5" /> : null}
                                {activeStage === 'dasha' ? <Scale className="h-5 w-5" /> : null}
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current Stage</p>
                                <h3 className="mt-1 text-xl font-bold text-slate-900">{activeStageMeta.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{activeStageMeta.summary}</p>
                            </div>
                        </div>
                    </div>

                    <div className={panelClassName}>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Workflow Status</p>
                        <div className="mt-4 space-y-3">
                            {workflowStages.map((stage, index) => (
                                <div key={stage.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={clsx(
                                            'inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                                            index <= activeStageIndex ? 'bg-[var(--accent-600)] text-white' : 'bg-slate-200 text-slate-600',
                                        )}>
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">{stage.label}</p>
                                            <p className="text-xs text-slate-500">{stage.actionLabel}</p>
                                        </div>
                                    </div>
                                    {index <= activeStageIndex ? (
                                        <CheckCircle2 className="h-4 w-4 text-[var(--accent-600)]" />
                                    ) : (
                                        <Workflow className="h-4 w-4 text-slate-400" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={panelClassName}>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Navigation</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => setActiveStage(workflowStages[(activeStageIndex - 1 + workflowStages.length) % workflowStages.length].id)}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveStage(nextStageId)}
                                className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-300)] bg-[var(--accent-50)] px-4 py-2 text-sm font-semibold text-[var(--accent-800)] transition-colors hover:bg-[var(--accent-100)]"
                            >
                                {activeStageMeta.actionLabel}
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-100 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--accent-400)]/40 bg-[var(--accent-500)]/10 text-[var(--accent-300)]">
                                {activeStage === 'dasha' ? <Bot className="h-5 w-5" /> : <Workflow className="h-5 w-5" />}
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-300)]">Focus</p>
                                <p className="mt-3 text-sm leading-6 text-slate-200">
                                    {activeStage === 'frank' && 'Lock the source-grounded benchmark answer and the neutral legal question before any downstream model evaluation begins.'}
                                    {activeStage === 'responses' && 'Confirm the full 240-response batch, inspect the cluster families, and make sure the reasoning space is compressed cleanly before rubric drafting.'}
                                    {activeStage === 'karthic' && 'Keep the rubric modular, weighted, and legally anchored to the clustered differences rather than generic writing quality.'}
                                    {activeStage === 'dasha' && 'Judge the centroid, propagate the score, and compare model performance at the batch level rather than reading all 240 outputs one by one.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>

                <main className="min-w-0">{stageContent}</main>
            </section>
        </AppShell>
    );
}
