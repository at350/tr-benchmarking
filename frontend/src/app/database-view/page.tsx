'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Database, Search, X } from 'lucide-react';
import { AppShell } from '@/components/ui/AppShell';

type SuperGPQAQuestion = {
    id: string;
    question: string;
    choices: string[];
    answer: string;
    answer_letter: string;
    discipline?: string;
    subfield?: string;
    difficulty?: string;
};

const PAGE_SIZE = 20;

export default function DatabaseViewPage() {
    const [rows, setRows] = useState<SuperGPQAQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [subfieldFilter, setSubfieldFilter] = useState('all');
    const [difficultyFilter, setDifficultyFilter] = useState('all');
    const [answerFilter, setAnswerFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        async function loadRows() {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch('/api/dataset?dataset=supergpqa');
                const payload = (await response.json()) as { data?: SuperGPQAQuestion[]; error?: string };

                if (!response.ok || !payload.data) {
                    setError(payload.error || 'Failed to load dataset.');
                    setRows([]);
                    return;
                }

                setRows(payload.data);
                if (payload.data.length > 0) {
                    setSelectedId(payload.data[0].id);
                }
            } catch (caughtError) {
                console.error(caughtError);
                setError('Could not load SuperGPQA dataset.');
                setRows([]);
            } finally {
                setIsLoading(false);
            }
        }

        loadRows();
    }, []);

    const subfieldOptions = useMemo(
        () => ['all', ...Array.from(new Set(rows.map((item) => item.subfield || 'Unknown'))).sort()],
        [rows],
    );
    const difficultyOptions = useMemo(
        () => ['all', ...Array.from(new Set(rows.map((item) => item.difficulty || 'Unknown'))).sort()],
        [rows],
    );
    const answerOptions = useMemo(
        () => ['all', ...Array.from(new Set(rows.map((item) => item.answer_letter || 'Unknown'))).sort()],
        [rows],
    );

    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return rows.filter((item) => {
            const matchesSubfield = subfieldFilter === 'all' || (item.subfield || 'Unknown') === subfieldFilter;
            const matchesDifficulty = difficultyFilter === 'all' || (item.difficulty || 'Unknown') === difficultyFilter;
            const matchesAnswer = answerFilter === 'all' || (item.answer_letter || 'Unknown') === answerFilter;

            if (!matchesSubfield || !matchesDifficulty || !matchesAnswer) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            const haystack = [
                item.id,
                item.question,
                item.answer,
                item.answer_letter,
                item.subfield,
                item.discipline,
                item.difficulty,
                item.choices.join(' '),
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(normalizedQuery);
        });
    }, [rows, query, subfieldFilter, difficultyFilter, answerFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

    useEffect(() => {
        setPage(1);
    }, [query, subfieldFilter, difficultyFilter, answerFilter]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const pagedRows = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filteredRows.slice(start, start + PAGE_SIZE);
    }, [filteredRows, page]);

    useEffect(() => {
        if (pagedRows.length === 0) {
            return;
        }

        const selectedOnPage = pagedRows.some((item) => item.id === selectedId);
        if (!selectedOnPage) {
            setSelectedId(pagedRows[0].id);
        }
    }, [pagedRows, selectedId]);

    useEffect(() => {
        if (filteredRows.length === 0) {
            setSelectedId(null);
            return;
        }

        const selectedStillVisible = filteredRows.some((item) => item.id === selectedId);
        if (!selectedStillVisible) {
            setSelectedId(filteredRows[0].id);
        }
    }, [filteredRows, selectedId]);

    const selectedQuestion = useMemo(
        () => filteredRows.find((item) => item.id === selectedId) || null,
        [filteredRows, selectedId],
    );

    const clearFilters = () => {
        setQuery('');
        setSubfieldFilter('all');
        setDifficultyFilter('all');
        setAnswerFilter('all');
    };

    return (
        <AppShell
            eyebrow="Dataset"
            title="SuperGPQA Database Explorer"
            subtitle="Search every law question, filter by subfield and difficulty, and inspect full answer choices in one place."
            maxWidthClassName="max-w-7xl"
        >
            <div>
                <header className="mb-6 rounded-2xl border border-emerald-200/80 bg-white/90 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Dataset Explorer</p>
                            <h1 className="mt-1 text-3xl font-semibold leading-tight [font-family:Rockwell,\'Palatino Linotype\',serif]">
                                SuperGPQA Database View
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm text-slate-600">
                                Search every law question, filter by topic and difficulty, then inspect full choices and answers in one place.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link
                                href="/general-benchmarking"
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                                Open Benchmark Runner
                            </Link>
                            <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                                <Database className="h-4 w-4" />
                                {rows.length} Questions
                            </span>
                        </div>
                    </div>
                </header>

                <section className="mb-6 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm sm:p-5">
                    <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                        <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search by question text, option text, answer, ID..."
                                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </label>

                        <FilterSelect
                            label="Subfield"
                            value={subfieldFilter}
                            onChange={setSubfieldFilter}
                            options={subfieldOptions}
                        />
                        <FilterSelect
                            label="Difficulty"
                            value={difficultyFilter}
                            onChange={setDifficultyFilter}
                            options={difficultyOptions}
                        />
                        <FilterSelect
                            label="Answer"
                            value={answerFilter}
                            onChange={setAnswerFilter}
                            options={answerOptions}
                        />

                        <button
                            type="button"
                            onClick={clearFilters}
                            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                            Reset
                        </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                        <StatusChip label="Visible" value={filteredRows.length} />
                        <StatusChip label="Page" value={`${page}/${totalPages}`} />
                        <StatusChip label="Rows/Page" value={PAGE_SIZE} />
                    </div>
                </section>

                {error && (
                    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        {error}
                    </section>
                )}

                <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                            Search Results
                        </div>

                        {isLoading ? (
                            <div className="space-y-3 p-4">
                                {Array.from({ length: 4 }).map((_, idx) => (
                                    <div
                                        key={`loading-${idx}`}
                                        className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
                                    />
                                ))}
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="p-6 text-sm text-slate-500">No questions match the current filters.</div>
                        ) : (
                            <>
                                <div className="hidden overflow-x-auto md:block">
                                    <table className="min-w-full text-left">
                                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                            <tr>
                                                <th className="px-4 py-3">ID</th>
                                                <th className="px-4 py-3">Question</th>
                                                <th className="px-4 py-3">Subfield</th>
                                                <th className="px-4 py-3">Difficulty</th>
                                                <th className="px-4 py-3">Ans</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <AnimatePresence initial={false}>
                                                {pagedRows.map((item) => {
                                                    const active = selectedId === item.id;
                                                    return (
                                                        <motion.tr
                                                            key={item.id}
                                                            layout
                                                            initial={{ opacity: 0, y: 8 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -8 }}
                                                            transition={{ duration: 0.2 }}
                                                            onClick={() => setSelectedId(item.id)}
                                                            className={`cursor-pointer border-t border-slate-100 text-sm ${active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                                                        >
                                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.id.slice(0, 8)}</td>
                                                            <td className="max-w-xl truncate px-4 py-3 text-slate-700">{item.question}</td>
                                                            <td className="px-4 py-3 text-slate-600">{item.subfield || 'Unknown'}</td>
                                                            <td className="px-4 py-3 capitalize text-slate-600">{item.difficulty || 'Unknown'}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                                                                    {item.answer_letter || '?'}
                                                                </span>
                                                            </td>
                                                        </motion.tr>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-3 p-4 md:hidden">
                                    <AnimatePresence initial={false}>
                                        {pagedRows.map((item) => {
                                            const active = selectedId === item.id;
                                            return (
                                                <motion.button
                                                    key={item.id}
                                                    layout
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -8 }}
                                                    transition={{ duration: 0.2 }}
                                                    type="button"
                                                    onClick={() => setSelectedId(item.id)}
                                                    className={`w-full rounded-xl border p-3 text-left ${
                                                        active
                                                            ? 'border-emerald-300 bg-emerald-50'
                                                            : 'border-slate-200 bg-white'
                                                    }`}
                                                >
                                                    <p className="text-xs font-mono text-slate-500">{item.id}</p>
                                                    <p className="mt-1 line-clamp-3 text-sm text-slate-800">{item.question}</p>
                                                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                                                        <span>{item.subfield || 'Unknown'}</span>
                                                        <span className="capitalize">{item.difficulty || 'Unknown'}</span>
                                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                                                            {item.answer_letter || '?'}
                                                        </span>
                                                    </div>
                                                </motion.button>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>

                                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                        disabled={page === 1}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <ChevronLeft className="h-4 w-4" /> Prev
                                    </button>
                                    <p className="text-xs font-medium text-slate-500">
                                        Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                        disabled={page === totalPages}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Next <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </>
                        )}
                    </section>

                    <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Question Detail</p>
                        {selectedQuestion ? (
                            <div className="mt-3 space-y-4">
                                <div>
                                    <p className="text-xs font-mono text-slate-500">{selectedQuestion.id}</p>
                                    <h2 className="mt-2 text-base leading-relaxed text-slate-900">{selectedQuestion.question}</h2>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <DetailTag label="Discipline" value={selectedQuestion.discipline || 'Unknown'} />
                                    <DetailTag label="Subfield" value={selectedQuestion.subfield || 'Unknown'} />
                                    <DetailTag label="Difficulty" value={selectedQuestion.difficulty || 'Unknown'} />
                                    <DetailTag label="Answer" value={selectedQuestion.answer_letter || '?'} />
                                </div>

                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Choices</p>
                                    <ul className="mt-2 space-y-2">
                                        {selectedQuestion.choices.map((choice, index) => {
                                            const letter = String.fromCharCode(65 + index);
                                            const correct = selectedQuestion.answer_letter === letter;
                                            return (
                                                <li
                                                    key={`${selectedQuestion.id}-${letter}`}
                                                    className={`rounded-lg border p-2.5 text-sm ${
                                                        correct
                                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                                            : 'border-slate-200 bg-slate-50 text-slate-700'
                                                    }`}
                                                >
                                                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px] font-bold">
                                                        {letter}
                                                    </span>
                                                    {normalizeChoice(choice)}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>

                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Ground Truth Answer</p>
                                    <p className="mt-1 text-sm text-emerald-900">{selectedQuestion.answer}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-slate-500">Select a question from the results panel.</p>
                        )}
                    </section>
                </div>
            </div>
        </AppShell>
    );
}

function FilterSelect(props: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    const { label, value, options, onChange } = props;

    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            >
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    );
}

function StatusChip(props: { label: string; value: string | number }) {
    return (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {props.label}: {props.value}
        </span>
    );
}

function DetailTag(props: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{props.label}</p>
            <p className="mt-0.5 text-xs text-slate-700">{props.value}</p>
        </div>
    );
}

function normalizeChoice(rawChoice: string): string {
    const trimmed = rawChoice.trim();
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
