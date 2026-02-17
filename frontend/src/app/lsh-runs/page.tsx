'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type LshRunSummary = {
    fileName: string;
    runId: string;
    timestamp: string | null;
    modifiedAt: string;
    method: string;
    totalItems: number;
    numClusters: number;
    largestClusterSize: number;
};

type ModelBreakdownEntry = {
    model: string;
    count: number;
};

type LshClusterSummary = {
    id: string;
    size: number;
    representative: {
        id: string;
        model: string;
        textPreview: string;
    };
    modelBreakdown: ModelBreakdownEntry[];
    membersPreview?: Array<{
        id: string;
        model: string;
        textPreview: string;
    }>;
};

type LshRunDetails = {
    fileName: string;
    runId: string;
    timestamp: string | null;
    modifiedAt: string;
    metadata: Record<string, unknown>;
    totalClusters: number;
    totalMembers: number;
    clusters: LshClusterSummary[];
};

type ClusterMapPoint = {
    x: number;
    y: number;
    model: string;
    clusterId: string;
};

type ClusterMapRegion = {
    clusterId: string;
    centerX: number;
    centerY: number;
    radius: number;
    visibleMembers: number;
    totalMembers: number;
    dominantModel: string;
    note: string;
};

type AxisDomain = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

type ClusterSeed = {
    clusterId: string;
    radius: number;
    visibleMembers: number;
    totalMembers: number;
    dominantModel: string;
    note: string;
    visibleBreakdown: ModelBreakdownEntry[];
};

type ModelStat = {
    model: string;
    count: number;
};

const MAP_WIDTH = 980;
const MAP_HEIGHT = 640;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MODEL_PALETTE = ['#22c55e', '#ef4444', '#94a3b8', '#3b82f6', '#f97316', '#14b8a6', '#eab308', '#a855f7', '#06b6d4', '#f43f5e'];

export default function LshRunsPage() {
    const [runs, setRuns] = useState<LshRunSummary[]>([]);
    const [isLoadingRuns, setIsLoadingRuns] = useState(true);
    const [runsError, setRunsError] = useState<string | null>(null);

    const [selectedRunFile, setSelectedRunFile] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<LshRunDetails | null>(null);
    const [isLoadingSelectedRun, setIsLoadingSelectedRun] = useState(false);
    const [selectedRunError, setSelectedRunError] = useState<string | null>(null);
    const [isStreamConnected, setIsStreamConnected] = useState(false);

    const [clusterQuery, setClusterQuery] = useState('');
    const [minClusterSize, setMinClusterSize] = useState(1);
    const [showNoise, setShowNoise] = useState(false);
    const [showClusterHulls, setShowClusterHulls] = useState(true);
    const [visibleModels, setVisibleModels] = useState<string[]>([]);
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
    const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

    const loadRuns = useCallback(async () => {
        try {
            const response = await fetch('/api/lsh-runs', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to load runs (${response.status}).`);
            }

            const data = (await response.json()) as { runs?: LshRunSummary[] };
            const nextRuns = Array.isArray(data.runs) ? data.runs : [];
            setRuns(nextRuns);
            setRunsError(null);

            setSelectedRunFile((previousRunFile) => {
                if (nextRuns.length === 0) {
                    return null;
                }
                if (previousRunFile && nextRuns.some((run) => run.fileName === previousRunFile)) {
                    return previousRunFile;
                }
                return nextRuns[0].fileName;
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load runs.';
            setRunsError(message);
        } finally {
            setIsLoadingRuns(false);
        }
    }, []);

    const loadRunDetails = useCallback(async (runFile: string) => {
        setIsLoadingSelectedRun(true);
        try {
            const response = await fetch(`/api/lsh-runs/${encodeURIComponent(runFile)}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to load run (${response.status}).`);
            }

            const data = (await response.json()) as { run?: LshRunDetails };
            setSelectedRun(data.run || null);
            setSelectedRunError(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load run details.';
            setSelectedRunError(message);
        } finally {
            setIsLoadingSelectedRun(false);
        }
    }, []);

    useEffect(() => {
        void loadRuns();
    }, [loadRuns]);

    useEffect(() => {
        if (!selectedRunFile) {
            setSelectedRun(null);
            setSelectedRunError(null);
            return;
        }
        void loadRunDetails(selectedRunFile);
    }, [loadRunDetails, selectedRunFile]);

    useEffect(() => {
        const stream = new EventSource('/api/lsh-runs/stream');

        const handleConnected = () => {
            setIsStreamConnected(true);
        };
        const handleDisconnected = () => {
            setIsStreamConnected(false);
        };
        const handleRunsUpdated = () => {
            void loadRuns();
            if (selectedRunFile) {
                void loadRunDetails(selectedRunFile);
            }
        };

        stream.addEventListener('open', handleConnected);
        stream.addEventListener('ready', handleConnected);
        stream.addEventListener('runs_updated', handleRunsUpdated);
        stream.addEventListener('error', handleDisconnected);

        return () => {
            stream.close();
            setIsStreamConnected(false);
        };
    }, [loadRuns, loadRunDetails, selectedRunFile]);

    const activeRunSummary = useMemo(
        () => runs.find((run) => run.fileName === selectedRunFile) || null,
        [runs, selectedRunFile]
    );

    const modelStats = useMemo(() => buildModelStats(selectedRun), [selectedRun]);
    const allModels = useMemo(() => modelStats.map((entry) => entry.model), [modelStats]);
    const modelColorMap = useMemo(() => buildModelColorMap(allModels), [allModels]);

    const maxClusterSize = useMemo(() => {
        if (!selectedRun || selectedRun.clusters.length === 0) {
            return 1;
        }
        return Math.max(1, ...selectedRun.clusters.map((cluster) => cluster.size));
    }, [selectedRun]);

    useEffect(() => {
        setClusterQuery('');
        setMinClusterSize(1);
        setShowNoise(false);
        setShowClusterHulls(true);
        setSelectedClusterId(null);
        setHoveredClusterId(null);
    }, [selectedRun?.fileName]);

    useEffect(() => {
        if (minClusterSize > maxClusterSize) {
            setMinClusterSize(maxClusterSize);
        }
    }, [maxClusterSize, minClusterSize]);

    useEffect(() => {
        setVisibleModels((previous) => {
            if (allModels.length === 0) {
                return [];
            }
            if (previous.length === 0) {
                return allModels;
            }
            const kept = previous.filter((model) => allModels.includes(model));
            return kept.length > 0 ? kept : allModels;
        });
    }, [allModels]);

    const visibleModelSet = useMemo(() => new Set(visibleModels), [visibleModels]);

    const filteredClusters = useMemo(() => {
        if (!selectedRun) {
            return [] as LshClusterSummary[];
        }

        const query = clusterQuery.trim().toLowerCase();
        return selectedRun.clusters.filter((cluster) => {
            if (!showNoise && cluster.id.toLowerCase() === 'noise') {
                return false;
            }
            if (cluster.size < minClusterSize) {
                return false;
            }
            if (query.length > 0) {
                const haystack = `${cluster.id} ${cluster.representative.id} ${cluster.representative.model}`.toLowerCase();
                if (!haystack.includes(query)) {
                    return false;
                }
            }
            return cluster.modelBreakdown.some((entry) => visibleModelSet.has(entry.model));
        });
    }, [clusterQuery, minClusterSize, selectedRun, showNoise, visibleModelSet]);

    useEffect(() => {
        setSelectedClusterId((previous) => {
            if (previous && filteredClusters.some((cluster) => cluster.id === previous)) {
                return previous;
            }
            if (filteredClusters.length === 0) {
                return null;
            }
            return filteredClusters[0].id;
        });
    }, [filteredClusters]);

    const filteredClusterLookup = useMemo(
        () => new Map(filteredClusters.map((cluster) => [cluster.id, cluster])),
        [filteredClusters]
    );

    const mapData = useMemo(
        () => buildClusterMapData(filteredClusters, visibleModelSet),
        [filteredClusters, visibleModelSet]
    );

    const axisDomain = useMemo(
        () => buildAxisDomain(mapData.points, mapData.regions),
        [mapData.points, mapData.regions]
    );

    const xTicks = useMemo(() => buildTicks(axisDomain.minX, axisDomain.maxX, 6), [axisDomain]);
    const yTicks = useMemo(() => buildTicks(axisDomain.minY, axisDomain.maxY, 6), [axisDomain]);

    const hoveredCluster = useMemo(
        () => (hoveredClusterId ? filteredClusterLookup.get(hoveredClusterId) || null : null),
        [filteredClusterLookup, hoveredClusterId]
    );

    const selectedCluster = useMemo(
        () => (selectedClusterId ? filteredClusterLookup.get(selectedClusterId) || null : null),
        [filteredClusterLookup, selectedClusterId]
    );

    const focusCluster = selectedCluster || hoveredCluster;
    const activeClusterId = selectedClusterId || hoveredClusterId;

    const resetFilters = () => {
        setClusterQuery('');
        setMinClusterSize(1);
        setShowNoise(false);
        setShowClusterHulls(true);
        setVisibleModels(allModels);
        setSelectedClusterId(null);
        setHoveredClusterId(null);
    };

    const toggleModel = (model: string) => {
        setVisibleModels((previous) => {
            if (previous.includes(model)) {
                return previous.filter((entry) => entry !== model);
            }
            return [...previous, model];
        });
    };

    const selectOnlyModel = (model: string) => {
        setVisibleModels([model]);
        setSelectedClusterId(null);
        setHoveredClusterId(null);
    };

    return (
        <main className="min-h-screen bg-[radial-gradient(1200px_620px_at_6%_-8%,rgba(59,130,246,0.18),transparent),radial-gradient(1050px_620px_at_100%_0%,rgba(34,197,94,0.14),transparent),#f8fafc] text-slate-900">
            <div className="mx-auto max-w-[1620px] px-5 py-6 sm:px-8 sm:py-8">
                <header className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">LSH Run Atlas</p>
                            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Interactive Cluster Separation Map</h1>
                            <p className="mt-2 text-sm text-slate-600">
                                Filter by model and cluster size, then click a cluster to inspect details without overlapping labels.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isStreamConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {isStreamConnected ? 'Live stream connected' : 'Live stream reconnecting'}
                            </span>
                            <Link
                                href="/"
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                            >
                                Back to benchmark app
                            </Link>
                        </div>
                    </div>
                </header>

                <div className="mt-6 grid grid-cols-12 gap-6">
                    <aside className="col-span-12 xl:col-span-3">
                        <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-600">Available Runs</h2>
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                    {runs.length}
                                </span>
                            </div>

                            {isLoadingRuns && runs.length === 0 ? (
                                <p className="mt-4 text-sm text-slate-500">Loading runs...</p>
                            ) : runsError ? (
                                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{runsError}</p>
                            ) : runs.length === 0 ? (
                                <p className="mt-4 text-sm text-slate-500">No run files found in `lsh/results`.</p>
                            ) : (
                                <div className="mt-4 max-h-[72vh] space-y-2 overflow-y-auto pr-1">
                                    {runs.map((run) => {
                                        const isSelected = run.fileName === selectedRunFile;
                                        return (
                                            <button
                                                key={run.fileName}
                                                type="button"
                                                onClick={() => setSelectedRunFile(run.fileName)}
                                                className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${isSelected ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'}`}
                                            >
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                                    {formatRunTimestamp(run.timestamp)}
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-slate-900">{run.fileName}</p>
                                                <p className="mt-1 text-xs text-slate-600">{run.totalItems} items - {run.numClusters} clusters</p>
                                                <p className="mt-1 text-[11px] text-slate-500">{run.method}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </aside>

                    <section className="col-span-12 xl:col-span-9">
                        {!selectedRunFile ? (
                            <EmptyStateCard message="Select a run to render the cluster map." />
                        ) : isLoadingSelectedRun ? (
                            <EmptyStateCard message="Loading run details..." />
                        ) : selectedRunError ? (
                            <EmptyStateCard message={selectedRunError} isError />
                        ) : !selectedRun ? (
                            <EmptyStateCard message="Run details are unavailable." />
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                                    <MetricCard label="Run" value={activeRunSummary?.runId || selectedRun.runId} />
                                    <MetricCard label="Method" value={formatMetadataValue(selectedRun.metadata.method)} />
                                    <MetricCard label="Items" value={String(selectedRun.totalMembers)} />
                                    <MetricCard label="Clusters" value={String(selectedRun.totalClusters)} />
                                    <MetricCard label="Updated" value={formatDateTime(selectedRun.modifiedAt)} />
                                </div>

                                <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur sm:p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h2 className="text-lg font-bold text-slate-900">Projected Cluster Islands</h2>
                                            <p className="text-sm text-slate-600">
                                                Click a cluster to lock focus. Hover for quick inspection. Use filters to simplify the view.
                                            </p>
                                        </div>
                                        <p className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                            Run timestamp: {formatRunTimestamp(selectedRun.timestamp)}
                                        </p>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                                            <div className="lg:col-span-2">
                                                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Search Cluster / Representative</label>
                                                <input
                                                    type="text"
                                                    value={clusterQuery}
                                                    onChange={(event) => setClusterQuery(event.target.value)}
                                                    placeholder="cluster id, representative id, model"
                                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-blue-200 placeholder:text-slate-400 focus:ring"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Min Cluster Size</label>
                                                <div className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2">
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={maxClusterSize}
                                                        value={minClusterSize}
                                                        onChange={(event) => setMinClusterSize(Number(event.target.value))}
                                                        className="w-full"
                                                    />
                                                    <p className="mt-1 text-xs font-semibold text-slate-700">{minClusterSize} and above</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">View Options</p>
                                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={showNoise}
                                                        onChange={(event) => setShowNoise(event.target.checked)}
                                                        className="h-4 w-4 rounded border-slate-300"
                                                    />
                                                    Show noise cluster
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={showClusterHulls}
                                                        onChange={(event) => setShowClusterHulls(event.target.checked)}
                                                        className="h-4 w-4 rounded border-slate-300"
                                                    />
                                                    Show cluster hulls
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={resetFilters}
                                                    className="rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                                >
                                                    Reset filters
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setVisibleModels(allModels)}
                                                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                                All models
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setVisibleModels([])}
                                                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                                None
                                            </button>

                                            {modelStats.map((entry) => {
                                                const enabled = visibleModels.includes(entry.model);
                                                const color = modelColorMap.get(entry.model) || '#94a3b8';
                                                return (
                                                    <button
                                                        key={entry.model}
                                                        type="button"
                                                        onClick={() => toggleModel(entry.model)}
                                                        onDoubleClick={() => selectOnlyModel(entry.model)}
                                                        title="Double-click to isolate"
                                                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${enabled ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-200 bg-slate-100 text-slate-400'}`}
                                                    >
                                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, opacity: enabled ? 1 : 0.35 }} />
                                                        {entry.model} ({entry.count})
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-12 gap-4">
                                        <div className="col-span-12 xl:col-span-8">
                                            <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                                                <svg
                                                    viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                                                    className="h-auto w-full"
                                                    role="img"
                                                    aria-label="Cluster scatter map"
                                                >
                                                    <rect
                                                        x={0}
                                                        y={0}
                                                        width={MAP_WIDTH}
                                                        height={MAP_HEIGHT}
                                                        fill="#061227"
                                                        onClick={() => setSelectedClusterId(null)}
                                                    />

                                                    {xTicks.map((tick) => {
                                                        const x = toSvgX(tick, axisDomain);
                                                        return (
                                                            <g key={`x-${tick}`}>
                                                                <line x1={x} y1={0} x2={x} y2={MAP_HEIGHT} stroke="#334155" strokeOpacity={0.42} strokeWidth={1} />
                                                                <text x={x} y={MAP_HEIGHT - 9} textAnchor="middle" fontSize="11" fill="#94a3b8">
                                                                    {formatTick(tick)}
                                                                </text>
                                                            </g>
                                                        );
                                                    })}

                                                    {yTicks.map((tick) => {
                                                        const y = toSvgY(tick, axisDomain);
                                                        return (
                                                            <g key={`y-${tick}`}>
                                                                <line x1={0} y1={y} x2={MAP_WIDTH} y2={y} stroke="#334155" strokeOpacity={0.42} strokeWidth={1} />
                                                                <text x={10} y={y - 6} textAnchor="start" fontSize="11" fill="#94a3b8">
                                                                    {formatTick(tick)}
                                                                </text>
                                                            </g>
                                                        );
                                                    })}

                                                    {showClusterHulls && mapData.regions.map((region) => {
                                                        const active = activeClusterId === region.clusterId;
                                                        const muted = Boolean(activeClusterId) && !active;
                                                        const color = modelColorMap.get(region.dominantModel) || '#94a3b8';
                                                        return (
                                                            <circle
                                                                key={`region-${region.clusterId}`}
                                                                cx={toSvgX(region.centerX, axisDomain)}
                                                                cy={toSvgY(region.centerY, axisDomain)}
                                                                r={Math.max((region.radius / (axisDomain.maxX - axisDomain.minX || 1)) * MAP_WIDTH, 8)}
                                                                fill={color}
                                                                fillOpacity={active ? 0.22 : muted ? 0.05 : 0.12}
                                                                stroke={color}
                                                                strokeOpacity={active ? 0.95 : muted ? 0.2 : 0.55}
                                                                strokeWidth={active ? 2.2 : 1.2}
                                                                onMouseEnter={() => setHoveredClusterId(region.clusterId)}
                                                                onMouseLeave={() => setHoveredClusterId((current) => (current === region.clusterId ? null : current))}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setSelectedClusterId(region.clusterId);
                                                                }}
                                                                className="cursor-pointer"
                                                            />
                                                        );
                                                    })}

                                                    {mapData.points.map((point, index) => {
                                                        const active = activeClusterId === point.clusterId;
                                                        const muted = Boolean(activeClusterId) && !active;
                                                        return (
                                                            <circle
                                                                key={`${point.clusterId}-${index}`}
                                                                cx={toSvgX(point.x, axisDomain)}
                                                                cy={toSvgY(point.y, axisDomain)}
                                                                r={active ? 4.8 : 3.4}
                                                                fill={modelColorMap.get(point.model) || '#94a3b8'}
                                                                fillOpacity={muted ? 0.18 : 0.9}
                                                                onMouseEnter={() => setHoveredClusterId(point.clusterId)}
                                                                onMouseLeave={() => setHoveredClusterId((current) => (current === point.clusterId ? null : current))}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setSelectedClusterId(point.clusterId);
                                                                }}
                                                                className="cursor-pointer"
                                                            />
                                                        );
                                                    })}

                                                    <text x={MAP_WIDTH / 2} y={22} textAnchor="middle" fontSize="15" fill="#dbeafe" fontWeight="700">
                                                        {selectedRun.fileName}
                                                    </text>
                                                    <text x={MAP_WIDTH - 16} y={MAP_HEIGHT - 28} textAnchor="end" fontSize="11" fill="#94a3b8">
                                                        Projection X
                                                    </text>
                                                    <text
                                                        transform={`translate(18 ${MAP_HEIGHT / 2}) rotate(-90)`}
                                                        textAnchor="middle"
                                                        fontSize="11"
                                                        fill="#94a3b8"
                                                    >
                                                        Projection Y
                                                    </text>
                                                </svg>

                                                {mapData.points.length === 0 && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 p-4 text-center">
                                                        <p className="max-w-md rounded-lg border border-slate-600 bg-slate-900/90 px-4 py-3 text-sm text-slate-200">
                                                            No points match the current filters. Re-enable models or lower the cluster size threshold.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            <p className="mt-2 text-xs text-slate-500">
                                                Filtered clusters: {filteredClusters.length} / {selectedRun.clusters.length} - Visible points: {mapData.points.length}
                                            </p>
                                        </div>

                                        <aside className="col-span-12 xl:col-span-4">
                                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h3 className="text-sm font-bold text-slate-900">Cluster Inspector</h3>
                                                    {selectedClusterId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedClusterId(null)}
                                                            className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                                                        >
                                                            Clear focus
                                                        </button>
                                                    )}
                                                </div>

                                                {focusCluster ? (
                                                    <div className="mt-3 space-y-3">
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900">
                                                                {focusCluster.id === 'noise' ? 'Noise Cluster' : `Cluster ${focusCluster.id}`}
                                                            </p>
                                                            <p className="mt-0.5 text-xs text-slate-600">{focusCluster.size} members</p>
                                                        </div>

                                                        <p className="text-xs text-slate-700">
                                                            Representative: <span className="font-semibold">{focusCluster.representative.id}</span>
                                                            {' '}({focusCluster.representative.model})
                                                        </p>
                                                        <p className="text-xs text-slate-600">{focusCluster.representative.textPreview || 'No representative preview available.'}</p>

                                                        <div className="space-y-1">
                                                            {focusCluster.modelBreakdown.map((entry) => (
                                                                <div key={`${focusCluster.id}-${entry.model}`} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                                                                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                                                                        <span
                                                                            className="h-2.5 w-2.5 rounded-full"
                                                                            style={{ backgroundColor: modelColorMap.get(entry.model) || '#94a3b8' }}
                                                                        />
                                                                        {entry.model}
                                                                    </span>
                                                                    <span className="text-xs font-semibold text-slate-700">{entry.count}</span>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {focusCluster.membersPreview && focusCluster.membersPreview.length > 0 && (
                                                            <div>
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sample members</p>
                                                                <div className="mt-1.5 space-y-1">
                                                                    {focusCluster.membersPreview.slice(0, 3).map((member) => (
                                                                        <div key={`${focusCluster.id}-${member.id}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                                                                            <p className="text-[11px] font-semibold text-slate-700">{member.id} ({member.model})</p>
                                                                            <p className="mt-0.5 text-[11px] text-slate-600">{member.textPreview}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-sm text-slate-600">Click or hover a cluster to inspect details.</p>
                                                )}

                                                <div className="mt-4 border-t border-slate-200 pt-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Visible cluster list</p>
                                                    <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                                                        {filteredClusters.length === 0 ? (
                                                            <p className="text-xs text-slate-500">No clusters match current filters.</p>
                                                        ) : (
                                                            filteredClusters.map((cluster) => {
                                                                const dominantModel = cluster.modelBreakdown[0]?.model || 'unknown';
                                                                const dominantColor = modelColorMap.get(dominantModel) || '#94a3b8';
                                                                const selected = selectedClusterId === cluster.id;
                                                                const hovered = hoveredClusterId === cluster.id;
                                                                return (
                                                                    <button
                                                                        key={cluster.id}
                                                                        type="button"
                                                                        onClick={() => setSelectedClusterId(cluster.id)}
                                                                        onMouseEnter={() => setHoveredClusterId(cluster.id)}
                                                                        onMouseLeave={() => setHoveredClusterId((current) => (current === cluster.id ? null : current))}
                                                                        className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition ${selected ? 'border-blue-300 bg-blue-50' : hovered ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                                                    >
                                                                        <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                                                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dominantColor }} />
                                                                            {cluster.id === 'noise' ? 'Noise' : `Cluster ${cluster.id}`}
                                                                        </span>
                                                                        <span className="font-semibold text-slate-600">{cluster.size}</span>
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </aside>
                                    </div>
                                </section>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-bold text-slate-900 break-words">{value}</p>
        </div>
    );
}

function EmptyStateCard({ message, isError = false }: { message: string; isError?: boolean }) {
    return (
        <div className={`rounded-2xl border p-5 shadow-sm ${isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white/95 text-slate-600'}`}>
            <p className="text-sm font-medium">{message}</p>
        </div>
    );
}

function buildModelStats(run: LshRunDetails | null): ModelStat[] {
    if (!run) {
        return [];
    }

    const totals = new Map<string, number>();
    for (const cluster of run.clusters) {
        for (const entry of cluster.modelBreakdown) {
            totals.set(entry.model, (totals.get(entry.model) || 0) + entry.count);
        }
    }

    return Array.from(totals.entries())
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.model.localeCompare(b.model);
        });
}

function buildClusterMapData(
    clusters: LshClusterSummary[],
    visibleModels: Set<string>
) {
    if (clusters.length === 0 || visibleModels.size === 0) {
        return { points: [] as ClusterMapPoint[], regions: [] as ClusterMapRegion[] };
    }

    const seeds: ClusterSeed[] = clusters
        .map((cluster) => {
            const visibleBreakdown = cluster.modelBreakdown.filter((entry) => visibleModels.has(entry.model));
            const visibleMembers = visibleBreakdown.reduce((total, entry) => total + entry.count, 0);
            if (visibleMembers === 0) {
                return null;
            }

            const dominantModel = visibleBreakdown[0]?.model || cluster.modelBreakdown[0]?.model || 'unknown';
            const radius = 2.8 + Math.sqrt(visibleMembers) * 1.9;

            return {
                clusterId: cluster.id,
                radius,
                visibleMembers,
                totalMembers: cluster.size,
                dominantModel,
                note: cluster.representative.textPreview,
                visibleBreakdown,
            };
        })
        .filter((seed): seed is ClusterSeed => seed !== null);

    if (seeds.length === 0) {
        return { points: [] as ClusterMapPoint[], regions: [] as ClusterMapRegion[] };
    }

    const seededRegions: ClusterMapRegion[] = seeds.map((seed, index) => {
        const spiralStep = 8 + Math.floor(index / 6) * 7;
        const angle = index * GOLDEN_ANGLE * 0.92;
        return {
            clusterId: seed.clusterId,
            centerX: Math.cos(angle) * spiralStep,
            centerY: Math.sin(angle) * spiralStep * 0.72,
            radius: seed.radius,
            visibleMembers: seed.visibleMembers,
            totalMembers: seed.totalMembers,
            dominantModel: seed.dominantModel,
            note: seed.note,
        };
    });

    const regions = resolveRegionOverlaps(seededRegions);
    const regionByCluster = new Map(regions.map((region) => [region.clusterId, region]));

    const points: ClusterMapPoint[] = [];
    for (const seed of seeds) {
        const region = regionByCluster.get(seed.clusterId);
        if (!region) {
            continue;
        }

        const sequence = expandModelsByCount(seed.visibleBreakdown, seed.visibleMembers);
        sequence.forEach((model, pointIndex) => {
            const randomSeed = hashString(`${seed.clusterId}:${model}:${pointIndex}`);
            const radialPosition = region.radius * Math.sqrt((pointIndex + 1) / sequence.length);
            const theta = pointIndex * GOLDEN_ANGLE + seededFloat(randomSeed, 1) * 0.85;
            const jitterX = (seededFloat(randomSeed, 2) - 0.5) * 0.85;
            const jitterY = (seededFloat(randomSeed, 3) - 0.5) * 0.85;

            points.push({
                x: region.centerX + Math.cos(theta) * radialPosition + jitterX,
                y: region.centerY + Math.sin(theta) * radialPosition + jitterY,
                model,
                clusterId: seed.clusterId,
            });
        });
    }

    return {
        points,
        regions: regions.sort((a, b) => b.visibleMembers - a.visibleMembers),
    };
}

function resolveRegionOverlaps(regions: ClusterMapRegion[]) {
    const adjusted = regions.map((region) => ({ ...region }));

    for (let iteration = 0; iteration < 120; iteration += 1) {
        let moved = false;

        for (let i = 0; i < adjusted.length; i += 1) {
            for (let j = i + 1; j < adjusted.length; j += 1) {
                const left = adjusted[i];
                const right = adjusted[j];

                const dx = right.centerX - left.centerX;
                const dy = right.centerY - left.centerY;
                const distance = Math.hypot(dx, dy) || 0.0001;
                const minimumDistance = left.radius + right.radius + 2.3;

                if (distance < minimumDistance) {
                    const overlap = (minimumDistance - distance) * 0.5;
                    const ux = dx / distance;
                    const uy = dy / distance;
                    left.centerX -= ux * overlap;
                    left.centerY -= uy * overlap;
                    right.centerX += ux * overlap;
                    right.centerY += uy * overlap;
                    moved = true;
                }
            }
        }

        for (const region of adjusted) {
            region.centerX *= 0.995;
            region.centerY *= 0.995;
        }

        if (!moved) {
            break;
        }
    }

    return adjusted;
}

function expandModelsByCount(entries: ModelBreakdownEntry[], fallbackCount: number) {
    const expanded: string[] = [];
    for (const entry of entries) {
        const safeCount = Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
        for (let i = 0; i < safeCount; i += 1) {
            expanded.push(entry.model);
        }
    }
    if (expanded.length === 0 && fallbackCount > 0) {
        expanded.push('unknown');
    }
    return expanded;
}

function buildModelColorMap(models: string[]) {
    const map = new Map<string, string>();
    models.forEach((model, index) => {
        map.set(model, MODEL_PALETTE[index % MODEL_PALETTE.length]);
    });
    return map;
}

function buildAxisDomain(points: ClusterMapPoint[], regions: ClusterMapRegion[]): AxisDomain {
    if (points.length === 0 && regions.length === 0) {
        return { minX: -20, maxX: 20, minY: -20, maxY: 20 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }

    for (const region of regions) {
        minX = Math.min(minX, region.centerX - region.radius);
        maxX = Math.max(maxX, region.centerX + region.radius);
        minY = Math.min(minY, region.centerY - region.radius);
        maxY = Math.max(maxY, region.centerY + region.radius);
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const paddingX = Math.max(6, width * 0.16);
    const paddingY = Math.max(6, height * 0.16);

    return {
        minX: minX - paddingX,
        maxX: maxX + paddingX,
        minY: minY - paddingY,
        maxY: maxY + paddingY,
    };
}

function buildTicks(min: number, max: number, steps: number) {
    const range = max - min;
    if (range <= 0 || steps <= 0) {
        return [min];
    }
    return Array.from({ length: steps + 1 }, (_, index) => min + (range * index) / steps);
}

function toSvgX(value: number, domain: AxisDomain) {
    const ratio = (value - domain.minX) / (domain.maxX - domain.minX || 1);
    return ratio * MAP_WIDTH;
}

function toSvgY(value: number, domain: AxisDomain) {
    const ratio = (value - domain.minY) / (domain.maxY - domain.minY || 1);
    return MAP_HEIGHT - ratio * MAP_HEIGHT;
}

function hashString(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededFloat(seed: number, stream: number) {
    const mixed = Math.sin(seed * 0.013 + stream * 17.933) * 43758.5453;
    return mixed - Math.floor(mixed);
}

function formatRunTimestamp(timestamp: string | null) {
    if (!timestamp) {
        return 'Unknown timestamp';
    }
    return formatDateTime(timestamp);
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

function formatMetadataValue(value: unknown) {
    if (value === null || value === undefined) {
        return 'N/A';
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (typeof value === 'string') {
        return value;
    }
    return JSON.stringify(value);
}

function formatTick(value: number) {
    return value.toFixed(0);
}
