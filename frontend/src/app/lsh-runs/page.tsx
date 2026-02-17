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

type LshClusterSummary = {
    id: string;
    size: number;
    representative: {
        id: string;
        model: string;
        textPreview: string;
    };
    modelBreakdown: Array<{
        model: string;
        count: number;
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
    size: number;
    dominantModel: string;
    note: string;
};

type AxisDomain = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

const MAP_WIDTH = 940;
const MAP_HEIGHT = 620;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MODEL_PALETTE = ['#22c55e', '#ef4444', '#94a3b8', '#3b82f6', '#f97316', '#14b8a6', '#eab308', '#c084fc', '#06b6d4', '#ec4899'];

export default function LshRunsPage() {
    const [runs, setRuns] = useState<LshRunSummary[]>([]);
    const [isLoadingRuns, setIsLoadingRuns] = useState(true);
    const [runsError, setRunsError] = useState<string | null>(null);

    const [selectedRunFile, setSelectedRunFile] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<LshRunDetails | null>(null);
    const [isLoadingSelectedRun, setIsLoadingSelectedRun] = useState(false);
    const [selectedRunError, setSelectedRunError] = useState<string | null>(null);
    const [isStreamConnected, setIsStreamConnected] = useState(false);

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

    const mapData = useMemo(() => buildClusterMapData(selectedRun), [selectedRun]);
    const modelColorMap = useMemo(() => buildModelColorMap(mapData.models), [mapData.models]);
    const axisDomain = useMemo(() => buildAxisDomain(mapData.points, mapData.regions), [mapData.points, mapData.regions]);
    const modelTotals = useMemo(() => buildModelTotals(selectedRun), [selectedRun]);
    const activeRunSummary = useMemo(
        () => runs.find((run) => run.fileName === selectedRunFile) || null,
        [runs, selectedRunFile]
    );

    const xTicks = useMemo(() => buildTicks(axisDomain.minX, axisDomain.maxX, 6), [axisDomain.maxX, axisDomain.minX]);
    const yTicks = useMemo(() => buildTicks(axisDomain.minY, axisDomain.maxY, 6), [axisDomain.maxY, axisDomain.minY]);
    const callouts = useMemo(() => buildCallouts(mapData.regions, axisDomain), [axisDomain, mapData.regions]);

    return (
        <main className="min-h-screen bg-[radial-gradient(1200px_600px_at_5%_-5%,rgba(59,130,246,0.2),transparent),radial-gradient(1000px_550px_at_95%_0%,rgba(34,197,94,0.18),transparent),#f8fafc] text-slate-900">
            <div className="mx-auto max-w-[1560px] px-5 py-6 sm:px-8 sm:py-8">
                <header className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">LSH Run Atlas</p>
                            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Cluster Separation Map</h1>
                            <p className="mt-2 text-sm text-slate-600">
                                Visual layout of each run&apos;s cluster islands with representative summaries and model color separation.
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
                                                Synthetic 2D layout for cluster separation and model overlap.
                                            </p>
                                        </div>
                                        <p className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                            Run timestamp: {formatRunTimestamp(selectedRun.timestamp)}
                                        </p>
                                    </div>

                                    <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                                        <svg
                                            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                                            className="h-auto w-full"
                                            role="img"
                                            aria-label="Cluster scatter map"
                                        >
                                            <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="#0b1221" />

                                            {xTicks.map((tick) => {
                                                const x = toSvgX(tick, axisDomain);
                                                return (
                                                    <g key={`x-${tick}`}>
                                                        <line x1={x} y1={0} x2={x} y2={MAP_HEIGHT} stroke="#334155" strokeOpacity={0.45} strokeWidth={1} />
                                                        <text x={x} y={MAP_HEIGHT - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">
                                                            {formatTick(tick)}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            {yTicks.map((tick) => {
                                                const y = toSvgY(tick, axisDomain);
                                                return (
                                                    <g key={`y-${tick}`}>
                                                        <line x1={0} y1={y} x2={MAP_WIDTH} y2={y} stroke="#334155" strokeOpacity={0.45} strokeWidth={1} />
                                                        <text x={10} y={y - 6} textAnchor="start" fontSize="11" fill="#94a3b8">
                                                            {formatTick(tick)}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            {mapData.regions.map((region) => {
                                                const color = modelColorMap.get(region.dominantModel) || '#94a3b8';
                                                return (
                                                    <circle
                                                        key={`region-${region.clusterId}`}
                                                        cx={toSvgX(region.centerX, axisDomain)}
                                                        cy={toSvgY(region.centerY, axisDomain)}
                                                        r={Math.max((region.radius / (axisDomain.maxX - axisDomain.minX)) * MAP_WIDTH, 8)}
                                                        fill={color}
                                                        fillOpacity={0.12}
                                                        stroke={color}
                                                        strokeOpacity={0.5}
                                                        strokeWidth={1}
                                                    />
                                                );
                                            })}

                                            {mapData.points.map((point, index) => (
                                                <circle
                                                    key={`${point.clusterId}-${index}`}
                                                    cx={toSvgX(point.x, axisDomain)}
                                                    cy={toSvgY(point.y, axisDomain)}
                                                    r={3.6}
                                                    fill={modelColorMap.get(point.model) || '#94a3b8'}
                                                    fillOpacity={0.85}
                                                />
                                            ))}

                                            <text x={MAP_WIDTH / 2} y={22} textAnchor="middle" fontSize="15" fill="#e2e8f0" fontWeight="700">
                                                {selectedRun.fileName}
                                            </text>
                                            <text x={MAP_WIDTH - 16} y={MAP_HEIGHT - 30} textAnchor="end" fontSize="11" fill="#94a3b8">
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

                                        <div className="pointer-events-none absolute inset-0 hidden lg:block">
                                            {callouts.map((callout) => {
                                                const color = modelColorMap.get(callout.dominantModel) || '#94a3b8';
                                                return (
                                                    <div
                                                        key={`callout-${callout.clusterId}`}
                                                        className="absolute rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm"
                                                        style={{
                                                            left: `${callout.left}px`,
                                                            top: `${callout.top}px`,
                                                            width: `${callout.width}px`,
                                                        }}
                                                    >
                                                        <div className="mb-2 border-l-4 pl-2" style={{ borderLeftColor: color }}>
                                                            <p className="text-sm font-bold text-slate-900">
                                                                {callout.clusterId === 'noise' ? 'Noise Cloud' : `Cluster ${callout.clusterId} Island`}
                                                            </p>
                                                            <p className="text-[11px] font-semibold text-slate-500">{callout.size} members</p>
                                                        </div>
                                                        <p className="text-xs text-slate-600">{callout.note || 'No representative summary available.'}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {Array.from(modelTotals.entries()).map(([model, count]) => (
                                            <span
                                                key={model}
                                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                            >
                                                <span
                                                    className="h-2.5 w-2.5 rounded-full"
                                                    style={{ backgroundColor: modelColorMap.get(model) || '#94a3b8' }}
                                                />
                                                {model} ({count})
                                            </span>
                                        ))}
                                    </div>
                                </section>

                                <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    {selectedRun.clusters.slice(0, 6).map((cluster) => {
                                        const dominantColor = modelColorMap.get(cluster.modelBreakdown[0]?.model || 'unknown') || '#94a3b8';
                                        return (
                                            <article key={cluster.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h3 className="text-sm font-bold text-slate-900">
                                                        {cluster.id === 'noise' ? 'Noise Cluster' : `Cluster ${cluster.id}`}
                                                    </h3>
                                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                                        {cluster.size} members
                                                    </span>
                                                </div>
                                                <div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: dominantColor, opacity: 0.75 }} />
                                                <p className="mt-3 text-xs text-slate-700">
                                                    Representative: <span className="font-semibold">{cluster.representative.id}</span> ({cluster.representative.model})
                                                </p>
                                                <p className="mt-1 text-xs text-slate-600">{cluster.representative.textPreview || 'No representative preview available.'}</p>
                                                <p className="mt-2 text-xs text-slate-600">
                                                    Model mix: {cluster.modelBreakdown.map((entry) => `${entry.model} (${entry.count})`).join(', ')}
                                                </p>
                                            </article>
                                        );
                                    })}
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

function buildClusterMapData(run: LshRunDetails | null) {
    if (!run) {
        return { points: [] as ClusterMapPoint[], regions: [] as ClusterMapRegion[], models: [] as string[] };
    }

    const points: ClusterMapPoint[] = [];
    const regions: ClusterMapRegion[] = [];
    const modelSet = new Set<string>();
    const clusterCount = Math.max(run.clusters.length, 1);

    run.clusters.forEach((cluster, clusterIndex) => {
        const ring = 16 + Math.floor(clusterIndex / 7) * 15;
        const angle = (clusterIndex / clusterCount) * Math.PI * 2 + (Math.floor(clusterIndex / 7) * 0.25);
        const centerX = Math.cos(angle) * ring;
        const centerY = Math.sin(angle) * (ring * 0.76);
        const radius = 3.2 + Math.sqrt(Math.max(cluster.size, 1)) * 1.8;
        const dominantModel = cluster.modelBreakdown[0]?.model || 'unknown';
        const modelSequence = expandModelsByCount(cluster.modelBreakdown, cluster.size);
        const note = cluster.representative.textPreview;

        regions.push({
            clusterId: cluster.id,
            centerX,
            centerY,
            radius,
            size: cluster.size,
            dominantModel,
            note,
        });

        if (modelSequence.length === 0) {
            modelSequence.push(dominantModel);
        }

        modelSequence.forEach((model, pointIndex) => {
            modelSet.add(model);
            const seed = hashString(`${cluster.id}:${model}:${pointIndex}`);
            const localRadius = radius * Math.sqrt((pointIndex + 1) / modelSequence.length);
            const theta = pointIndex * GOLDEN_ANGLE + seededFloat(seed, 1) * 0.7;
            const jitterX = (seededFloat(seed, 2) - 0.5) * 1.2;
            const jitterY = (seededFloat(seed, 3) - 0.5) * 1.2;

            points.push({
                x: centerX + Math.cos(theta) * localRadius + jitterX,
                y: centerY + Math.sin(theta) * localRadius + jitterY,
                model,
                clusterId: cluster.id,
            });
        });
    });

    return {
        points,
        regions: regions.sort((a, b) => b.size - a.size),
        models: Array.from(modelSet).sort(),
    };
}

function expandModelsByCount(
    entries: Array<{ model: string; count: number }>,
    fallbackCount: number
) {
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

function buildModelTotals(run: LshRunDetails | null) {
    const totals = new Map<string, number>();
    if (!run) {
        return totals;
    }
    for (const cluster of run.clusters) {
        for (const entry of cluster.modelBreakdown) {
            totals.set(entry.model, (totals.get(entry.model) || 0) + entry.count);
        }
    }
    return new Map(Array.from(totals.entries()).sort((a, b) => a[0].localeCompare(b[0])));
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

function buildCallouts(regions: ClusterMapRegion[], domain: AxisDomain) {
    const cards = regions.slice(0, 3).map((region, index) => {
        const anchorX = toSvgX(region.centerX, domain);
        const anchorY = toSvgY(region.centerY, domain);
        const width = 246;
        const height = 118;
        const horizontalOffset = index === 1 ? -290 : 18;
        const verticalOffset = index === 0 ? -95 : index === 1 ? 20 : -10;

        return {
            ...region,
            width,
            left: clamp(anchorX + horizontalOffset, 10, MAP_WIDTH - width - 10),
            top: clamp(anchorY + verticalOffset, 10, MAP_HEIGHT - height - 10),
        };
    });

    return cards;
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

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
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
