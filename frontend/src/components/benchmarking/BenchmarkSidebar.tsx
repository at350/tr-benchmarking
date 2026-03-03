'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export type BenchmarkMode = 'main' | 'forced_tests' | 'single_probe' | 'single_probe_multi_model' | 'single_probe_multi_model_rubric_judge';

type BenchmarkSidebarProps = {
    collapsed: boolean;
    onToggle: () => void;
    mode: BenchmarkMode;
    onModeChange: (mode: BenchmarkMode) => void;
};

const BENCHMARK_OPTIONS: Array<{
    mode: BenchmarkMode;
    title: string;
    description: string;
}> = [
    {
        mode: 'main',
        title: 'Dataset Benchmark (Main)',
        description: 'Run SuperGPQA or PRBench with provider, model, and perturbation controls.',
    },
    {
        mode: 'forced_tests',
        title: 'General Benchmarking (Forced)',
        description: 'Run legacy or controlled forced-test profiles with model comparison.',
    },
    {
        mode: 'single_probe',
        title: 'Single Question Probe',
        description: 'Benchmark one editable question with optional custom prompt templates.',
    },
    {
        mode: 'single_probe_multi_model',
        title: 'Single Question Multi-Model A/B',
        description: 'Run multiple models on one question in two arms: without prompt and with custom prompt.',
    },
    {
        mode: 'single_probe_multi_model_rubric_judge',
        title: 'Rubric-First Multi-Model Judge',
        description: 'Run all models with one generation prompt, then grade with selectable judge rubrics and significance metrics.',
    },
];

export function BenchmarkSidebar({ collapsed, onToggle, mode, onModeChange }: BenchmarkSidebarProps) {
    return (
        <aside className={`rounded-2xl border border-slate-200 bg-white/95 shadow-sm transition-all ${collapsed ? 'w-full lg:w-[88px]' : 'w-full lg:w-[310px]'}`}>
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
                {!collapsed && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Benchmarks</p>}
                <button
                    type="button"
                    onClick={onToggle}
                    className="rounded-md border border-slate-300 bg-slate-50 p-1 text-slate-700 hover:bg-slate-100"
                    aria-label={collapsed ? 'Expand benchmark sidebar' : 'Collapse benchmark sidebar'}
                >
                    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>
            </div>

            <div className="space-y-2 p-3">
                {BENCHMARK_OPTIONS.map((option) => {
                    const isActive = option.mode === mode;
                    return (
                        <button
                            key={option.mode}
                            type="button"
                            onClick={() => onModeChange(option.mode)}
                            className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${isActive
                                ? 'border-teal-300 bg-teal-50 text-teal-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            <p className="text-sm font-semibold">
                                {collapsed ? shortMode(option.mode) : option.title}
                            </p>
                            {!collapsed && <p className="mt-1 text-xs text-slate-600">{option.description}</p>}
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

function shortMode(mode: BenchmarkMode) {
    if (mode === 'main') {
        return 'Main';
    }
    if (mode === 'forced_tests') {
        return 'Forced';
    }
    if (mode === 'single_probe_multi_model') {
        return 'Multi';
    }
    if (mode === 'single_probe_multi_model_rubric_judge') {
        return 'Rubric';
    }
    return 'Single';
}
