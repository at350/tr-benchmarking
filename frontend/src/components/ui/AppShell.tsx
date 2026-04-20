'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
    { href: '/', label: 'Home' },
    { href: '/demos', label: 'Demos' },
    { href: '/database-view', label: 'Dataset' },
    { href: '/legal-workflow', label: 'Frank-Karthic-Dasha SoF' },
    { href: '/legal-autoeval-pipeline', label: 'Legal Auto-Eval Pipeline' },
    { href: '/lsh-runs', label: 'LSH-RUHS' },
];

type AppShellProps = {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    children: ReactNode;
    maxWidthClassName?: string;
};

export function AppShell({ title, actions, children, maxWidthClassName = 'max-w-none' }: AppShellProps) {
    const pathname = usePathname();

    return (
        <main className="min-h-screen bg-[radial-gradient(1200px_720px_at_-10%_-8%,rgba(31,116,184,0.16),transparent),radial-gradient(1000px_620px_at_100%_0%,rgba(94,155,204,0.16),transparent),#f7fafc] text-slate-900">
            <div className={`w-full px-2 py-4 sm:px-3 lg:px-4 xl:px-5 ${maxWidthClassName}`}>
                <header className="rounded-2xl border border-slate-200 bg-white/92 p-4 shadow-[0_12px_35px_rgba(15,23,42,0.09)] backdrop-blur sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
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
                                        ? 'border-[var(--accent-300)] bg-[var(--accent-50)] text-[var(--accent-800)]'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </header>

                <div className="mt-4 sm:mt-5">{children}</div>
            </div>
        </main>
    );
}
