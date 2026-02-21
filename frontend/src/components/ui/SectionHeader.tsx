import type { ReactNode } from 'react';

type SectionHeaderProps = {
    title: string;
    description?: string;
    actions?: ReactNode;
};

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</h2>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            {actions}
        </div>
    );
}
