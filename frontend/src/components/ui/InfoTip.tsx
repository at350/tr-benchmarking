'use client';

import { Info } from 'lucide-react';

type InfoTipProps = {
    label: string;
};

export function InfoTip({ label }: InfoTipProps) {
    return (
        <details className="group relative inline-block align-middle">
            <summary className="list-none cursor-pointer rounded-full border border-slate-300 bg-white p-1 text-slate-500 transition-colors hover:border-teal-300 hover:text-teal-700">
                <Info className="h-3.5 w-3.5" />
            </summary>
            <div className="absolute left-0 top-7 z-30 w-72 rounded-lg border border-slate-200 bg-white p-2 text-xs leading-relaxed text-slate-700 shadow-xl">
                {label}
            </div>
        </details>
    );
}
