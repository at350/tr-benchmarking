'use client';

import { buildCombinedResultRows, buildConfigDiffRows, extractRunMetric, SavedBenchmarkRun } from '@/lib/run-comparison';

type SavedRunComparisonPanelProps = {
    savedRuns: SavedBenchmarkRun[];
    selectedRunIds: string[];
    comparisonRunIds: string[];
    statusMessage: string | null;
    onToggleRun: (runId: string) => void;
    onSelectAll: () => void;
    onClearSelection: () => void;
    onDeleteSelected: () => void;
    onClearAll: () => void;
    onCompareSelected: () => void;
    onHideComparison: () => void;
};

export function SavedRunComparisonPanel({
    savedRuns,
    selectedRunIds,
    comparisonRunIds,
    statusMessage,
    onToggleRun,
    onSelectAll,
    onClearSelection,
    onDeleteSelected,
    onClearAll,
    onCompareSelected,
    onHideComparison,
}: SavedRunComparisonPanelProps) {
    const allSelected = savedRuns.length > 0 && savedRuns.length === selectedRunIds.length;
    const comparedRuns = savedRuns.filter((run) => comparisonRunIds.includes(run.id));
    const configRows = buildConfigDiffRows(comparedRuns);
    const combinedRows = buildCombinedResultRows(comparedRuns);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Saved Runs</h3>
                    <p className="mt-1 text-xs text-slate-500">Save completed runs and compare metrics/configs/results side by side.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {savedRuns.length} saved
                </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={allSelected ? onClearSelection : onSelectAll}
                    disabled={savedRuns.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {allSelected ? 'Clear Selection' : 'Select All'}
                </button>
                <button
                    type="button"
                    onClick={onCompareSelected}
                    disabled={selectedRunIds.length === 0}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Compare Selected ({selectedRunIds.length})
                </button>
                <button
                    type="button"
                    onClick={onDeleteSelected}
                    disabled={selectedRunIds.length === 0}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Delete Selected
                </button>
                <button
                    type="button"
                    onClick={onClearAll}
                    disabled={savedRuns.length === 0}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Clear All
                </button>
            </div>

            {statusMessage && <p className="mt-2 text-xs text-emerald-700">{statusMessage}</p>}

            {savedRuns.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No saved runs yet.</p>
            ) : (
                <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {savedRuns.map((run) => {
                        const metric = extractRunMetric(run);
                        const selected = selectedRunIds.includes(run.id);
                        return (
                            <label
                                key={run.id}
                                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${selected ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => onToggleRun(run.id)}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-800">{run.title}</span>
                                    <span className="block text-xs text-slate-500">{run.mode} - {new Date(run.savedAt).toLocaleString()}</span>
                                    <span className="mt-1 block text-xs text-slate-700">{metric.label}: <strong>{metric.value}</strong> - {metric.detailLabel}: {metric.detailValue}</span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}

            {comparedRuns.length > 0 && (
                <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Comparison ({comparedRuns.length})</p>
                        <button
                            type="button"
                            onClick={onHideComparison}
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                        >
                            Hide
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs">
                            <thead className="text-slate-500">
                                <tr>
                                    <th className="px-2 py-1">Run</th>
                                    <th className="px-2 py-1">Primary Metric</th>
                                    <th className="px-2 py-1">Detail</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {comparedRuns.map((run) => {
                                    const metric = extractRunMetric(run);
                                    return (
                                        <tr key={`summary-${run.id}`}>
                                            <td className="px-2 py-1.5 font-semibold text-slate-800">{run.title}</td>
                                            <td className="px-2 py-1.5 text-slate-700">{metric.label}: {metric.value}</td>
                                            <td className="px-2 py-1.5 text-slate-700">{metric.detailLabel}: {metric.detailValue}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Config Diff</p>
                        <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white">
                            <table className="min-w-full text-left text-[11px]">
                                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                                    <tr>
                                        <th className="px-2 py-1.5">Setting</th>
                                        {comparedRuns.map((run) => (
                                            <th key={`config-head-${run.id}`} className="px-2 py-1.5">{run.title}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {configRows.map((row) => (
                                        <tr key={row.key} className={row.differs ? 'bg-amber-50/45' : ''}>
                                            <td className="px-2 py-1.5 font-mono text-slate-700">{row.key}</td>
                                            {comparedRuns.map((run) => (
                                                <td key={`${row.key}-${run.id}`} className="px-2 py-1.5 text-slate-700">{row.values[run.id] || 'N/A'}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Combined Result Sample</p>
                        {combinedRows.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-500">No result rows available.</p>
                        ) : (
                            <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full text-left text-[11px]">
                                    <thead className="sticky top-0 bg-slate-100 text-slate-600">
                                        <tr>
                                            <th className="px-2 py-1.5">Run</th>
                                            <th className="px-2 py-1.5">Result ID</th>
                                            <th className="px-2 py-1.5">Outcome</th>
                                            <th className="px-2 py-1.5">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {combinedRows.map((row, index) => (
                                            <tr key={`${row.runId}-${row.resultId}-${index}`}>
                                                <td className="px-2 py-1.5 text-slate-700">{row.runTitle}</td>
                                                <td className="px-2 py-1.5 font-mono text-slate-700">{row.resultId}</td>
                                                <td className="px-2 py-1.5 text-slate-700">{row.outcome}</td>
                                                <td className="px-2 py-1.5 text-slate-700">{row.details || 'N/A'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
