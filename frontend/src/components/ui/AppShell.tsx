'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
    { href: '/', label: 'Home' },
    { href: '/database-view', label: 'Dataset' },
    { href: '/lsh-runs', label: 'LSH-RUHS' },
    { href: '/general-benchmarking', label: 'General Benchmarking' },
];

type AppShellProps = {
    eyebrow?: string;
    title: string;
    subtitle: string;
    actions?: ReactNode;
    children: ReactNode;
    maxWidthClassName?: string;
};

export function AppShell({ eyebrow, title, subtitle, actions, children, maxWidthClassName = 'max-w-[1500px]' }: AppShellProps) {
    const pathname = usePathname();

    return (
        <main className="min-h-screen bg-[radial-gradient(1200px_720px_at_-10%_-8%,rgba(20,184,166,0.16),transparent),radial-gradient(1000px_620px_at_100%_0%,rgba(37,99,235,0.12),transparent),#f7fafc] text-slate-900">
            <div className={`mx-auto px-4 py-6 sm:px-6 lg:px-8 ${maxWidthClassName}`}>
                <header className="rounded-2xl border border-slate-200 bg-white/92 p-5 shadow-[0_12px_35px_rgba(15,23,42,0.09)] backdrop-blur">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>}
                            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
                            <p className="mt-2 max-w-3xl text-sm text-slate-600">{subtitle}</p>
                        </div>
                        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                    </div>

                    <nav className="mt-5 flex flex-wrap gap-2">
                        {NAV_ITEMS.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${active
                                        ? 'border-teal-300 bg-teal-50 text-teal-800'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </header>

                <div className="mt-6">{children}</div>
            </div>
        </main>
    );
}
