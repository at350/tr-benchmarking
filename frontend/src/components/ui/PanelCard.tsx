import Link from 'next/link';
import type { ReactNode } from 'react';

type PanelCardProps = {
    href?: string;
    title: string;
    description: string;
    icon?: ReactNode;
    children?: ReactNode;
    badge?: string;
};

export function PanelCard({ href, title, description, icon, children, badge }: PanelCardProps) {
    const body = (
        <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)]">
            <div className="flex items-start justify-between gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
                    {icon}
                </div>
                {badge && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">{badge}</span>}
            </div>
            <h3 className="mt-4 text-xl font-bold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
            {children && <div className="mt-4">{children}</div>}
        </div>
    );

    if (!href) {
        return body;
    }

    return (
        <Link href={href} className="block h-full">
            {body}
        </Link>
    );
}
