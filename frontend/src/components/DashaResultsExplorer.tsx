'use client';

import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
    AlertTriangle,
    BarChart3,
    Eye,
    Filter,
    Gauge,
    GitBranch,
    ScanSearch,
    Workflow,
    XCircle,
} from 'lucide-react';

import { EmptyState } from '@/components/ui/EmptyState';
import {
    deriveDashaExplorerData,
    type DashaExplorerCluster,
    type DashaExplorerData,
    type DashaExplorerModule,
    type DashaExplorerRow,
    type DashaExplorerView,
} from '@/lib/dasha-results-explorer';
import { PROVIDER_LABELS } from '@/lib/model-options';
import type { DashaRunV2, RubricModuleId, RubricRowKey } from '@/lib/legal-workflow-v2-types';

type DashaResultsExplorerProps = {
    run: DashaRunV2 | null;
};

const sectionClassName = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_25px_rgba(15,23,42,0.05)]';
const mutedLabelClassName = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

export function DashaResultsExplorer({ run }: DashaResultsExplorerProps) {
    const [activeView, setActiveView] = useState<DashaExplorerView>('compare');
    const [focusedModuleId, setFocusedModuleId] = useState<RubricModuleId | null>(null);
    const [focusedRowKey, setFocusedRowKey] = useState<RubricRowKey | null>(null);

    const data = useMemo(() => (run ? deriveDashaExplorerData(run) : null), [run]);

    const comparisonClusters = useMemo(() => {
        if (!data) {
            return [] as DashaExplorerCluster[];
        }
        return data.primaryComparisonClusterIds
            .map((clusterId) => data.clusters.find((cluster) => cluster.clusterId === clusterId))
            .filter((cluster): cluster is DashaExplorerCluster => Boolean(cluster));
    }, [data]);

    if (!run || !data) {
        return (
            <EmptyState
                title="No Dasha run selected"
                description="Start a Dasha judge run or pick a saved run to compare answer families, score modules, and inspect cluster-level reasoning."
                icon={<BarChart3 className="h-5 w-5" />}
            />
        );
    }

    const visibleRows = applyFocusToRows(data.rows, focusedModuleId, focusedRowKey);
    const visibleModules = applyFocusToModules(data.modules, focusedModuleId, focusedRowKey);

    return (
        <div className="space-y-5">
            {run.status === 'failed' ? (
                <Notice tone="error" icon={<XCircle className="h-4 w-4" />} title="Run failed">
                    {run.errorMessage || 'Dasha stopped before clustering or rubric scoring completed.'}
                </Notice>
            ) : null}
            {run.status === 'draft' ? (
                <Notice tone="info" icon={<Workflow className="h-4 w-4" />} title="Run in progress">
                    {run.clusteringNotes || 'Dasha is still generating responses and clustering this run.'}
                </Notice>
            ) : null}

            <RunOverviewStrip data={data} />
            <ModelParticipationRail data={data} />

            <div className={sectionClassName}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className={mutedLabelClassName}>Explorer</p>
                        <p className="mt-1 text-sm text-slate-600">
                            Stay cluster-first: rows and modules are scored against cluster representatives, with model mix shown inside each cluster.
                        </p>
                    </div>
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                        {([
                            { id: 'compare', label: 'Compare', icon: GitBranch },
                            { id: 'diagnose', label: 'Diagnose', icon: ScanSearch },
                            { id: 'explain', label: 'Explain', icon: Eye },
                        ] as Array<{ id: DashaExplorerView; label: string; icon: typeof GitBranch }>).map((view) => {
                            const Icon = view.icon;
                            return (
                                <button
                                    key={view.id}
                                    type="button"
                                    onClick={() => setActiveView(view.id)}
                                    className={clsx(
                                        'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                                        activeView === view.id
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700',
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {view.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <span className={clsx(mutedLabelClassName, 'inline-flex items-center gap-2 text-slate-600')}>
                        <Filter className="h-3.5 w-3.5" />
                        Focus
                    </span>
                    {focusedModuleId ? <FocusChip label={visibleModules[0]?.label || focusedModuleId} onClear={() => setFocusedModuleId(null)} /> : null}
                    {focusedRowKey ? (
                        <FocusChip
                            label={data.rows.find((row) => row.rowKey === focusedRowKey)?.rowTitle || focusedRowKey}
                            onClear={() => setFocusedRowKey(null)}
                        />
                    ) : null}
                    {!focusedModuleId && !focusedRowKey ? (
                        <span className="text-sm text-slate-500">Click a module or row in Compare to carry that focus into Diagnose and Explain.</span>
                    ) : null}
                    {focusedModuleId || focusedRowKey ? (
                        <button
                            type="button"
                            className="ml-auto text-sm font-semibold text-slate-600 hover:text-slate-900"
                            onClick={() => {
                                setFocusedModuleId(null);
                                setFocusedRowKey(null);
                            }}
                        >
                            Clear focus
                        </button>
                    ) : null}
                </div>
            </div>

            {activeView === 'compare' ? (
                <CompareView
                    data={data}
                    visibleModules={visibleModules}
                    visibleRows={visibleRows}
                    focusedModuleId={focusedModuleId}
                    focusedRowKey={focusedRowKey}
                    onModuleSelect={(moduleId) => {
                        setFocusedModuleId((current) => current === moduleId ? null : moduleId);
                        setFocusedRowKey(null);
                    }}
                    onRowSelect={(rowKey, moduleId) => {
                        setFocusedRowKey((current) => current === rowKey ? null : rowKey);
                        setFocusedModuleId(moduleId);
                    }}
                />
            ) : null}
            {activeView === 'diagnose' ? (
                <DiagnoseView data={data} visibleModules={visibleModules} visibleRows={visibleRows} />
            ) : null}
            {activeView === 'explain' ? (
                <ExplainView data={data} visibleRows={visibleRows} comparisonClusters={comparisonClusters} />
            ) : null}
        </div>
    );
}

function RunOverviewStrip({ data }: { data: DashaExplorerData }) {
    const overallWinner = data.clusters.find((cluster) => cluster.clusterId === data.overallWinningClusterId) ?? null;

    return (
        <section className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.12),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(30,64,175,0.10),_transparent_40%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <div className="grid gap-4 xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                    <p className={mutedLabelClassName}>Run Overview</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{data.summarySentence}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        {data.clusteringNotes || 'No clustering notes were recorded for this run.'}
                    </p>
                    {overallWinner ? (
                        <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/70 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Overall winner</p>
                            <p className="mt-1 text-sm font-semibold text-teal-950">
                                {overallWinner.clusterId} · Weighted {formatScore(overallWinner.weightedScore)} · {overallWinner.size} answers
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {overallWinner.modelBreakdown.map((entry) => (
                                    <span
                                        key={`${overallWinner.clusterId}_overview_${entry.modelKey}`}
                                        className="rounded-full border border-teal-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                                    >
                                        {entry.model} {formatPercentage(entry.count / Math.max(overallWinner.size, 1))} ({entry.count}/{overallWinner.size})
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
                <OverviewMetric label="Weighted score" value={formatScore(data.weightedScore)} tone={data.weightedScore === null ? 'muted' : data.weightedScore >= 92 ? 'teal' : data.weightedScore >= 80 ? 'amber' : 'rose'} />
                <OverviewMetric label="Clusters" value={String(data.clusterCount)} tone="slate" />
                <OverviewMetric label="Valid responses" value={`${data.validResponses}/${data.requestedResponses}`} tone="slate" />
                <OverviewMetric label="Failed models" value={String(data.failedModelCount)} tone={data.failedModelCount > 0 ? 'amber' : 'teal'} />
                <OverviewMetric label="Clustering method" value={humanizeMethod(data.clusteringMethod)} tone="slate" compact />
            </div>
        </section>
    );
}

function ModelParticipationRail({ data }: { data: DashaExplorerData }) {
    return (
        <section className={sectionClassName}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className={mutedLabelClassName}>Model Participation</p>
                    <p className="mt-1 text-sm text-slate-600">
                        Each card shows whether a model concentrated into one answer family or spread across several clusters.
                    </p>
                </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {data.modelParticipations.map((entry) => (
                    <div
                        key={entry.modelKey}
                        className={clsx(
                            'rounded-2xl border p-4',
                            entry.hasNoValidResponses
                                ? 'border-rose-200 bg-rose-50/70'
                                : 'border-slate-200 bg-slate-50/70',
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">{entry.model}</p>
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                    {PROVIDER_LABELS[entry.provider]}
                                </p>
                            </div>
                            <span
                                className={clsx(
                                    'rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]',
                                    entry.hasNoValidResponses
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-white text-slate-700',
                                )}
                            >
                                {entry.spreadLabel}
                            </span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                            <StatChip label="Valid" value={String(entry.validCount)} tone={entry.validCount > 0 ? 'teal' : 'rose'} />
                            <StatChip label="Errors" value={String(entry.errorCount)} tone={entry.errorCount > 0 ? 'amber' : 'slate'} />
                            <StatChip label="Total" value={String(entry.totalResponses)} tone="slate" />
                        </div>
                        <div className="mt-4 space-y-2">
                            <p className={mutedLabelClassName}>Cluster participation</p>
                            {entry.clusterParticipation.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {entry.clusterParticipation.map((cluster) => (
                                        <span key={`${entry.modelKey}_${cluster.clusterId}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                                            {cluster.clusterId} ×{cluster.count} ({Math.round(cluster.share * 100)}%)
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-rose-200 bg-white px-3 py-3 text-sm text-rose-700">
                                    <div className="flex items-center gap-2">
                                        <XCircle className="h-4 w-4" />
                                        No valid responses reached clustering for this model.
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function CompareView(input: {
    data: DashaExplorerData;
    visibleModules: DashaExplorerModule[];
    visibleRows: DashaExplorerRow[];
    focusedModuleId: RubricModuleId | null;
    focusedRowKey: RubricRowKey | null;
    onModuleSelect: (moduleId: RubricModuleId) => void;
    onRowSelect: (rowKey: RubricRowKey, moduleId: RubricModuleId) => void;
}) {
    return (
        <div className="space-y-5">
            <ClusterSummaryGrid data={input.data} />

            {!input.data.hasScoring ? (
                <Notice tone="info" icon={<Gauge className="h-4 w-4" />} title="Rubric scoring skipped">
                    This run was started in <code className="rounded bg-white px-1 py-0.5 text-xs">cluster_only</code> mode. Clusters can still be compared as answer families, but row and module score panels are intentionally unavailable.
                </Notice>
            ) : (
                <>
                    <section className={sectionClassName}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className={mutedLabelClassName}>Module Heatmap</p>
                                <p className="mt-1 text-sm text-slate-600">
                                    Treat modules as the first pass answer to “which domain is strongest?” Each cell shows the module average for one cluster.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full border-separate border-spacing-2 text-left">
                                <thead>
                                    <tr>
                                        <th className="min-w-[260px] px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Module</th>
                                        {input.data.clusters.map((cluster) => (
                                            <th key={cluster.clusterId} className="min-w-[160px] px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                                {cluster.clusterId}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {input.visibleModules.map((module) => (
                                        <tr key={module.moduleId}>
                                            <td className="align-top">
                                                <button
                                                    type="button"
                                                    className={clsx(
                                                        'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                                                        input.focusedModuleId === module.moduleId
                                                            ? 'border-teal-300 bg-teal-50'
                                                            : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                                                    )}
                                                    onClick={() => input.onModuleSelect(module.moduleId)}
                                                >
                                                    <p className="text-sm font-semibold text-slate-900">{module.label}</p>
                                                    <p className="mt-1 text-xs text-slate-500">{module.rowKeys.join(', ')}</p>
                                                </button>
                                            </td>
                                            {module.clusterScores.map((score) => (
                                                <td key={`${module.moduleId}_${score.clusterId}`}>
                                                    <ScoreHeatCell
                                                        score={score.score}
                                                        isWinner={score.isWinner}
                                                        label={score.isWinner ? 'Winner' : 'Cluster'}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className={sectionClassName}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className={mutedLabelClassName}>Row Matrix</p>
                                <p className="mt-1 text-sm text-slate-600">
                                    Compare every cluster on each rubric row, then see the winning cluster and the margin to second place.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                                    <tr>
                                        <th className="px-3 py-3">Row</th>
                                        <th className="px-3 py-3">Weight</th>
                                        {input.data.clusters.map((cluster) => (
                                            <th key={cluster.clusterId} className="px-3 py-3">{cluster.clusterId}</th>
                                        ))}
                                        <th className="px-3 py-3">Winning cluster</th>
                                        <th className="px-3 py-3">Margin</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {input.visibleRows.map((row) => (
                                        <tr
                                            key={row.rowKey}
                                            className={clsx(
                                                'transition-colors',
                                                input.focusedRowKey === row.rowKey ? 'bg-teal-50/70' : 'hover:bg-slate-50/70',
                                            )}
                                        >
                                            <td className="px-3 py-3">
                                                <button
                                                    type="button"
                                                    className="text-left"
                                                    onClick={() => input.onRowSelect(row.rowKey, row.moduleId)}
                                                >
                                                    <p className="font-semibold text-slate-900">{row.rowKey} · {row.rowTitle}</p>
                                                    <p className="mt-1 text-xs text-slate-500">{row.moduleLabel}</p>
                                                </button>
                                            </td>
                                            <td className="px-3 py-3 text-slate-600">{row.weight}</td>
                                            {row.clusterScores.map((score) => (
                                                <td key={`${row.rowKey}_${score.clusterId}`} className="px-3 py-3">
                                                    <div className={clsx(
                                                        'rounded-xl border px-3 py-2',
                                                        score.isWinner ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-700',
                                                    )}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-semibold">{formatScore(score.score)}</span>
                                                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                                                {score.applicabilityStatus === 'applicable' ? 'Applicable' : 'N/A'}
                                                            </span>
                                                        </div>
                                                        {score.isWinner ? (
                                                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">Winner</p>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            ))}
                                            <td className="px-3 py-3">
                                                <WinningClusterBadge row={row} />
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={clsx(
                                                    'rounded-full px-2 py-1 text-xs font-semibold',
                                                    row.margin >= 8 ? 'bg-teal-50 text-teal-700' : row.margin >= 4 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600',
                                                )}>
                                                    {row.margin.toFixed(1)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function DiagnoseView({ data, visibleModules, visibleRows }: { data: DashaExplorerData; visibleModules: DashaExplorerModule[]; visibleRows: DashaExplorerRow[] }) {
    const overallWinner = data.clusters.find((cluster) => cluster.clusterId === data.overallWinningClusterId) ?? data.clusters[0] ?? null;

    if (!data.hasScoring) {
        return (
            <Notice tone="info" icon={<AlertTriangle className="h-4 w-4" />} title="Diagnose view needs row scoring">
                This run can still be read as a cluster map, but diagnose panels are score-driven and remain unavailable because the run skipped rubric evaluation.
            </Notice>
        );
    }

    return (
        <div className="space-y-5">
            <section className={sectionClassName}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className={mutedLabelClassName}>Module Leaderboard</p>
                        <p className="mt-1 text-sm text-slate-600">
                            Inside a single run, “domain” means rubric modules first, then rows inside those modules.
                        </p>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {visibleModules.map((module) => (
                        <div key={module.moduleId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{module.label}</p>
                                    <p className="mt-1 text-xs text-slate-500">Rows {module.rowKeys.join(', ')}</p>
                                </div>
                                <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
                                    Leader: {module.winningClusterId ?? 'N/A'}
                                </span>
                            </div>
                            <div className="mt-4 space-y-2">
                                {module.clusterScores.map((score) => (
                                    <BarLine
                                        key={`${module.moduleId}_${score.clusterId}`}
                                        label={score.clusterId}
                                        value={score.score}
                                        accent={score.isWinner ? 'teal' : 'slate'}
                                        trailing={score.isWinner ? 'Winner' : null}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[1.05fr,0.95fr]">
                <section className={sectionClassName}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className={mutedLabelClassName}>Weighted Penalty</p>
                            <p className="mt-1 text-sm text-slate-600">
                                Higher penalty means the winning cluster left more weighted score on the table for that row.
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 space-y-3">
                        {visibleRows.slice().sort((left, right) => right.weightedPenalty - left.weightedPenalty || right.weight - left.weight).slice(0, 6).map((row) => (
                            <div key={`${row.rowKey}_penalty`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{row.rowKey} · {row.rowTitle}</p>
                                        <p className="mt-1 text-xs text-slate-500">{row.moduleLabel}</p>
                                    </div>
                                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                        Penalty {row.weightedPenalty.toFixed(2)}
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <BarLine label="Winning score" value={row.winningScore} accent={row.winningScore !== null && row.winningScore >= 92 ? 'teal' : 'amber'} trailing={`Weight ${row.weight}`} />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={sectionClassName}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className={mutedLabelClassName}>Module Contribution</p>
                            <p className="mt-1 text-sm text-slate-600">
                                Read the overall winning cluster by module to see where it is strongest and where it softens.
                            </p>
                        </div>
                        {overallWinner ? (
                            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
                                Overall winner: {overallWinner.clusterId}
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-4 space-y-3">
                        {visibleModules.map((module) => {
                            const winnerScore = module.clusterScores.find((score) => score.clusterId === overallWinner?.clusterId)?.score ?? null;
                            return (
                                <BarLine
                                    key={`${module.moduleId}_winner`}
                                    label={module.label}
                                    value={winnerScore}
                                    accent={winnerScore !== null && winnerScore >= 92 ? 'teal' : winnerScore !== null && winnerScore >= 84 ? 'amber' : 'rose'}
                                    trailing={module.winningClusterId === overallWinner?.clusterId ? 'Winning module' : `Leader: ${module.winningClusterId ?? 'N/A'}`}
                                />
                            );
                        })}
                    </div>
                </section>
            </div>

            <section className={sectionClassName}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className={mutedLabelClassName}>Cluster Separation</p>
                        <p className="mt-1 text-sm text-slate-600">
                            These rows best explain why clusters separate. Bigger margins mean the answer families behaved differently there.
                        </p>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {visibleRows.slice().sort((left, right) => right.separation - left.separation || right.weight - left.weight).slice(0, 6).map((row) => (
                        <div key={`${row.rowKey}_separation`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{row.rowKey} · {row.rowTitle}</p>
                                    <p className="mt-1 text-xs text-slate-500">{row.moduleLabel}</p>
                                </div>
                                <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                                    Separation {row.separation.toFixed(1)}
                                </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {row.clusterScores.map((score) => (
                                    <span
                                        key={`${row.rowKey}_${score.clusterId}_delta`}
                                        className={clsx(
                                            'rounded-full border px-2 py-1 text-xs font-semibold',
                                            score.isWinner ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-700',
                                        )}
                                    >
                                        {score.clusterId}: {formatScore(score.score)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={sectionClassName}>
                <p className={mutedLabelClassName}>Glossary</p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                    <GlossaryCard term="Weight" definition="How much a rubric row contributes to the final weighted score when that row is applicable." />
                    <GlossaryCard term="Applicable" definition="The row meaningfully engaged the cluster’s answer, so its score counts instead of being marked N/A." />
                    <GlossaryCard term="Cluster" definition="A family of similar answers grouped together before scoring. Dasha scores the representative, not every raw answer separately." />
                    <GlossaryCard term="Winning cluster" definition="The cluster whose representative earned the top score for that row or module. This is not the same as a universal winning model." />
                </div>
            </section>
        </div>
    );
}

function ExplainView({ data, visibleRows, comparisonClusters }: { data: DashaExplorerData; visibleRows: DashaExplorerRow[]; comparisonClusters: DashaExplorerCluster[] }) {
    const comparisonRows = useMemo(() => {
        if (comparisonClusters.length < 2) {
            return [] as Array<{
                row: DashaExplorerRow;
                leftScore: number | null;
                rightScore: number | null;
                delta: number;
            }>;
        }
        const [leftCluster, rightCluster] = comparisonClusters;
        return visibleRows
            .map((row) => {
                const leftScore = row.clusterScores.find((score) => score.clusterId === leftCluster.clusterId)?.score ?? null;
                const rightScore = row.clusterScores.find((score) => score.clusterId === rightCluster.clusterId)?.score ?? null;
                const delta = leftScore !== null && rightScore !== null ? Math.abs(leftScore - rightScore) : 0;
                return { row, leftScore, rightScore, delta };
            })
            .sort((left, right) => right.delta - left.delta || right.row.weight - left.row.weight || left.row.rowKey.localeCompare(right.row.rowKey))
            .slice(0, 6);
    }, [comparisonClusters, visibleRows]);

    return (
        <div className="space-y-5">
            <section className={sectionClassName}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className={mutedLabelClassName}>Cluster Explanation</p>
                        <p className="mt-1 text-sm text-slate-600">
                            Read each cluster as an answer family: who is inside it, what it is saying, and where it is strongest or weakest.
                        </p>
                    </div>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {data.clusters.map((cluster) => (
                        <details key={cluster.clusterId} className="group rounded-2xl border border-slate-200 bg-slate-50 open:border-teal-300 open:bg-white">
                            <summary className="cursor-pointer list-none px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-base font-semibold text-slate-900">{cluster.clusterId}</p>
                                            {cluster.clusterId === data.overallWinningClusterId ? (
                                                <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
                                                    Overall winner
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {cluster.size} answers · Weighted {formatScore(cluster.weightedScore)} · {cluster.winsCount} row wins
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <TagPill label={cluster.summaryTags.bottomLineOutcome} />
                                        <TagPill label={cluster.summaryTags.reasoningAlignment} />
                                    </div>
                                </div>
                                <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-700">{cluster.representativeText}</p>
                            </summary>
                            <div className="border-t border-slate-200 px-4 py-4">
                                <div className="flex flex-wrap gap-2">
                                    {cluster.modelBreakdown.map((model) => (
                                        <span key={`${cluster.clusterId}_${model.modelKey}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                                            {model.model} {formatPercentage(model.count / Math.max(cluster.size, 1))} ({model.count}/{cluster.size})
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className={mutedLabelClassName}>Strengths</p>
                                        {data.hasScoring ? (
                                            <div className="mt-3 space-y-2">
                                                {cluster.strengths.map((item) => (
                                                    <div key={`${cluster.clusterId}_strength_${item.rowKey}`} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                                                        <p className="text-sm font-semibold text-emerald-900">{item.rowKey} · {item.rowTitle}</p>
                                                        <p className="mt-1 text-xs text-emerald-800">{item.moduleLabel} · {formatScore(item.score)}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-3 text-sm text-slate-500">Rubric scoring was skipped, so strengths are not available for this run.</p>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className={mutedLabelClassName}>Watchouts</p>
                                        {data.hasScoring ? (
                                            <div className="mt-3 space-y-2">
                                                {cluster.watchouts.map((item) => (
                                                    <div key={`${cluster.clusterId}_watchout_${item.rowKey}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                                                        <p className="text-sm font-semibold text-amber-900">{item.rowKey} · {item.rowTitle}</p>
                                                        <p className="mt-1 text-xs text-amber-800">{item.moduleLabel} · {formatScore(item.score)}</p>
                                                        <p className="mt-2 text-sm text-amber-900">{item.focus}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-3 text-sm text-slate-500">Rubric scoring was skipped, so watchouts are not available for this run.</p>
                                        )}
                                    </div>
                                </div>
                                <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
                                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Representative answer</summary>
                                    <pre className="max-h-[420px] overflow-auto border-t border-slate-200 px-4 py-4 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
                                        {cluster.representativeText}
                                    </pre>
                                </details>
                            </div>
                        </details>
                    ))}
                </div>
            </section>

            {comparisonClusters.length >= 2 ? (
                <section className={sectionClassName}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className={mutedLabelClassName}>Side-by-Side Comparison</p>
                            <p className="mt-1 text-sm text-slate-600">
                                Compare the top two clusters directly to see which rows actually drive the gap.
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {comparisonClusters.map((cluster) => (
                            <div key={`${cluster.clusterId}_comparison`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{cluster.clusterId}</p>
                                        <p className="mt-1 text-xs text-slate-500">Weighted {formatScore(cluster.weightedScore)} · {cluster.winsCount} row wins</p>
                                    </div>
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                                        {cluster.summaryTags.reasoningAlignment}
                                    </span>
                                </div>
                                <p className="mt-3 line-clamp-5 text-sm leading-6 text-slate-700">{cluster.representativeText}</p>
                            </div>
                        ))}
                    </div>
                    {data.hasScoring ? (
                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                                    <tr>
                                        <th className="px-3 py-3">Row</th>
                                        <th className="px-3 py-3">{comparisonClusters[0].clusterId}</th>
                                        <th className="px-3 py-3">{comparisonClusters[1].clusterId}</th>
                                        <th className="px-3 py-3">Delta</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {comparisonRows.map((item) => (
                                        <tr key={`${item.row.rowKey}_compare`} className="hover:bg-slate-50/70">
                                            <td className="px-3 py-3">
                                                <p className="font-semibold text-slate-900">{item.row.rowKey} · {item.row.rowTitle}</p>
                                                <p className="mt-1 text-xs text-slate-500">{item.row.moduleLabel}</p>
                                            </td>
                                            <td className="px-3 py-3">{formatScore(item.leftScore)}</td>
                                            <td className="px-3 py-3">{formatScore(item.rightScore)}</td>
                                            <td className="px-3 py-3">
                                                <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                                                    {item.delta.toFixed(1)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <Notice tone="info" icon={<Gauge className="h-4 w-4" />} title="Comparison limited to answer text">
                            This run skipped rubric scoring, so the comparison stays at the answer-family level instead of row-by-row score deltas.
                        </Notice>
                    )}
                </section>
            ) : (
                <section className={sectionClassName}>
                    <p className={mutedLabelClassName}>Single Cluster Run</p>
                    <p className="mt-2 text-sm text-slate-600">
                        This run produced one cluster only, so the Explain view focuses on that cluster’s reasoning profile instead of forcing a side-by-side comparison.
                    </p>
                </section>
            )}
        </div>
    );
}

function ClusterSummaryGrid({ data }: { data: DashaExplorerData }) {
    return (
        <section className={sectionClassName}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className={mutedLabelClassName}>Cluster Families</p>
                    <p className="mt-1 text-sm text-slate-600">
                        Each cluster is a family of similar answers. Read weighted score, row wins, and model mix together.
                    </p>
                </div>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {data.clusters.map((cluster) => (
                    <div
                        key={cluster.clusterId}
                        className={clsx(
                            'rounded-[24px] border p-4',
                            cluster.clusterId === data.overallWinningClusterId
                                ? 'border-teal-300 bg-teal-50/60'
                                : 'border-slate-200 bg-slate-50/60',
                        )}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-base font-semibold text-slate-900">{cluster.clusterId}</p>
                                    {cluster.clusterId === data.overallWinningClusterId ? (
                                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
                                            Overall winner
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm text-slate-600">
                                    Weighted {formatScore(cluster.weightedScore)} · {cluster.size} answers · {cluster.winsCount} row wins
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <TagPill label={cluster.summaryTags.bottomLineOutcome} />
                                <TagPill label={cluster.summaryTags.jurisdictionAssumption} />
                            </div>
                        </div>
                        <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-700">{cluster.representativeText}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {cluster.modelBreakdown.map((model) => (
                                <span key={`${cluster.clusterId}_${model.modelKey}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                                    {model.model} {formatPercentage(model.count / Math.max(cluster.size, 1))} ({model.count}/{cluster.size})
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function OverviewMetric({ label, value, tone, compact = false }: { label: string; value: string; tone: 'teal' | 'amber' | 'rose' | 'slate' | 'muted'; compact?: boolean }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4">
            <p className={mutedLabelClassName}>{label}</p>
            <p
                className={clsx(
                    'mt-3 font-semibold text-slate-900',
                    compact ? 'text-base leading-6' : 'text-3xl',
                    tone === 'teal' && 'text-teal-700',
                    tone === 'amber' && 'text-amber-700',
                    tone === 'rose' && 'text-rose-700',
                    tone === 'muted' && 'text-slate-400',
                )}
            >
                {value}
            </p>
        </div>
    );
}

function FocusChip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
            {label}
            <button type="button" onClick={onClear} className="text-teal-700 hover:text-teal-900">×</button>
        </span>
    );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: 'teal' | 'amber' | 'rose' | 'slate' }) {
    return (
        <div className={clsx(
            'rounded-xl border px-3 py-2',
            tone === 'teal' && 'border-teal-200 bg-teal-50',
            tone === 'amber' && 'border-amber-200 bg-amber-50',
            tone === 'rose' && 'border-rose-200 bg-rose-50',
            tone === 'slate' && 'border-slate-200 bg-white',
        )}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
        </div>
    );
}

function WinningClusterBadge({ row }: { row: DashaExplorerRow }) {
    if (!row.winningClusterId) {
        return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">None</span>;
    }

    return (
        <div className="space-y-2">
            <span className="inline-flex rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
                {row.winningClusterId}
            </span>
            <div className="flex flex-wrap gap-1">
                {row.winningModelMix.slice(0, 2).map((model) => (
                    <span key={`${row.rowKey}_${model.modelKey}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
                        {model.model} ×{model.count}
                    </span>
                ))}
            </div>
        </div>
    );
}

function ScoreHeatCell({ score, isWinner, label }: { score: number | null; isWinner: boolean; label: string }) {
    return (
        <div
            className={clsx(
                'rounded-2xl border px-4 py-4',
                isWinner ? 'border-teal-300' : 'border-slate-200',
            )}
            style={{
                background: score === null
                    ? 'linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)'
                    : `linear-gradient(180deg, ${scoreBackground(score)} 0%, rgba(255,255,255,0.92) 100%)`,
            }}
        >
            <p className="text-sm font-semibold text-slate-900">{formatScore(score)}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            {isWinner ? <p className="mt-1 text-xs font-semibold text-teal-700">Top module cluster</p> : <p className="mt-1 text-xs text-slate-500">Module average</p>}
        </div>
    );
}

function BarLine({ label, value, accent, trailing }: { label: string; value: number | null; accent: 'teal' | 'amber' | 'rose' | 'slate'; trailing?: string | null }) {
    const width = value === null ? 0 : Math.max(0, Math.min(100, value));
    return (
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr),92px] md:items-center">
            <div>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">{label}</span>
                    {trailing ? <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{trailing}</span> : null}
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                        className={clsx(
                            'h-full rounded-full',
                            accent === 'teal' && 'bg-teal-500',
                            accent === 'amber' && 'bg-amber-500',
                            accent === 'rose' && 'bg-rose-500',
                            accent === 'slate' && 'bg-slate-500',
                        )}
                        style={{ width: `${width}%` }}
                    />
                </div>
            </div>
            <div className="text-right text-sm font-semibold text-slate-900">{formatScore(value)}</div>
        </div>
    );
}

function GlossaryCard({ term, definition }: { term: string; definition: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">{term}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{definition}</p>
        </div>
    );
}

function Notice({
    tone,
    title,
    children,
    icon,
}: {
    tone: 'info' | 'error';
    title: string;
    children: ReactNode;
    icon: ReactNode;
}) {
    return (
        <div className={clsx(
            'rounded-2xl border px-4 py-4 text-sm',
            tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-teal-200 bg-teal-50 text-teal-900',
        )}>
            <div className="flex items-start gap-3">
                <div className="mt-0.5">{icon}</div>
                <div>
                    <p className="font-semibold">{title}</p>
                    <div className="mt-1 leading-6">{children}</div>
                </div>
            </div>
        </div>
    );
}

function TagPill({ label }: { label: string }) {
    return (
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            {label}
        </span>
    );
}

function applyFocusToRows(rows: DashaExplorerRow[], focusedModuleId: RubricModuleId | null, focusedRowKey: RubricRowKey | null) {
    if (focusedRowKey) {
        return rows.filter((row) => row.rowKey === focusedRowKey);
    }
    if (focusedModuleId) {
        return rows.filter((row) => row.moduleId === focusedModuleId);
    }
    return rows;
}

function applyFocusToModules(modules: DashaExplorerModule[], focusedModuleId: RubricModuleId | null, focusedRowKey: RubricRowKey | null) {
    if (focusedRowKey) {
        return modules.filter((module) => module.rowKeys.includes(focusedRowKey));
    }
    if (focusedModuleId) {
        return modules.filter((module) => module.moduleId === focusedModuleId);
    }
    return modules;
}

function formatScore(score: number | null) {
    return score === null ? 'N/A' : score.toFixed(1);
}

function formatPercentage(value: number) {
    return `${Math.round(value * 100)}%`;
}

function humanizeMethod(method: string) {
    switch (method) {
        case 'density_umap_hdbscan':
            return 'Density / UMAP / HDBSCAN';
        case 'jaccard_fallback':
            return 'Jaccard fallback';
        case 'pending':
            return 'Pending';
        case 'not_run':
            return 'Not run';
        default:
            return method.replace(/_/g, ' ');
    }
}

function scoreBackground(score: number) {
    if (score >= 92) {
        return 'rgba(45, 212, 191, 0.32)';
    }
    if (score >= 84) {
        return 'rgba(250, 204, 21, 0.24)';
    }
    return 'rgba(251, 146, 60, 0.24)';
}
