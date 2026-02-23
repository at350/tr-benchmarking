import type { ReactNode } from 'react';

type EmptyStateProps = {
    title: string;
    description: string;
    icon?: ReactNode;
};

export function EmptyState({ title, description, icon }: EmptyStateProps) {
    return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center shadow-sm">
            {icon && <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">{icon}</div>}
            <p className="text-base font-semibold text-slate-800">{title}</p>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
    );
}
