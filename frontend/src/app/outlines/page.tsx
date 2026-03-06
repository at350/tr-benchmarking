'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';

import { AppShell } from '@/components/ui/AppShell';

type OutlineFile = {
    id: string;
    fileName: string;
    title: string;
    sizeBytes: number;
    modifiedAt: string;
    viewUrl: string;
};

export default function OutlinesPage() {
    const [outlines, setOutlines] = useState<OutlineFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadOutlines() {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch('/api/outlines', { cache: 'no-store' });
                const payload = (await response.json()) as { outlines?: OutlineFile[]; error?: string };
                if (!response.ok || !Array.isArray(payload.outlines)) {
                    setError(payload.error || 'Failed to load outlines.');
                    setOutlines([]);
                    return;
                }
                setOutlines(payload.outlines);
            } catch (caughtError) {
                console.error(caughtError);
                setError('Could not load outlines.');
                setOutlines([]);
            } finally {
                setIsLoading(false);
            }
        }

        loadOutlines();
    }, []);

    return (
        <AppShell
            eyebrow="Outlines"
            title="Legal Outlines Library"
            subtitle="Browse and preview PDF outlines available for rubric-first generation and judge referencing."
            maxWidthClassName="max-w-7xl"
        >
            <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                        {isLoading ? 'Loading outlines...' : `${outlines.length} outline${outlines.length === 1 ? '' : 's'} available`}
                    </p>
                    <Link
                        href="/general-benchmarking"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                        Open Benchmark Runner
                    </Link>
                </div>
                {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            </section>

            {!isLoading && !error && outlines.length === 0 && (
                <section className="mt-5 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
                    <p className="text-sm text-slate-600">No PDF outlines were found in the outlines directory.</p>
                </section>
            )}

            {!isLoading && !error && outlines.length > 0 && (
                <section className="mt-5 grid gap-5">
                    {outlines.map((outline) => (
                        <article key={outline.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
                                        <FileText className="h-4 w-4" />
                                        Outline PDF
                                    </p>
                                    <h2 className="mt-1 truncate text-lg font-bold text-slate-900">{outline.title}</h2>
                                    <p className="mt-0.5 text-xs text-slate-500">{outline.fileName}</p>
                                </div>
                                <div className="flex gap-2">
                                    <a
                                        href={outline.viewUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                    >
                                        Open
                                    </a>
                                    <a
                                        href={outline.viewUrl}
                                        download={outline.fileName}
                                        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                                    >
                                        Download
                                    </a>
                                </div>
                            </div>
                            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                <object data={outline.viewUrl} type="application/pdf" className="h-[640px] w-full">
                                    <div className="p-4 text-sm text-slate-600">
                                        PDF preview is unavailable in this browser.{' '}
                                        <a href={outline.viewUrl} target="_blank" rel="noreferrer" className="font-semibold text-teal-700 underline">
                                            Open the PDF
                                        </a>
                                        .
                                    </div>
                                </object>
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </AppShell>
    );
}
