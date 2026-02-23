
import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Search, BarChart3, List } from 'lucide-react';
import { QuestionDetailModal } from './QuestionDetailModal';

type ResultItem = {
    model: string;
    questionId: string;
    originalQuestion: string;
    modelOutput: string;
    parsedChoice: string;
    groundTruth: string;
    originalGroundTruth: string;
    isCorrect: boolean;
    isPerturbed: boolean;
    questionText: string;
    choices?: string[];
    subfield?: string;
    benchmarkProfile?: 'legacy' | 'controlled';
    evaluationArm?: 'single' | 'deterministic' | 'stochastic';
    parseMethod?: string;
    isSchemaCompliant?: boolean;
    temperatureUsed?: number;
    temperatureApplied?: boolean;
    apiTransport?: 'responses' | 'chat_completions';
};

type SplitSummary = {
    total: number;
    correct: number;
    accuracy: number;
};

type ModelSummary = {
    total: number;
    correct: number;
    accuracy: number;
    splitSummary?: Record<string, SplitSummary>;
};

type ExperimentSummary = {
    total: number;
    correct: number;
    accuracy: number;
    benchmarkProfile?: 'legacy' | 'controlled';
    splitSummary?: Record<string, SplitSummary>;
    modelSummary?: Record<string, ModelSummary>;
};

type ComparisonRun = {
    results: any[];
    summary: any;
    aggregationByQuestion: Record<string, Record<string, number>> | null;
    runCount: number;
};

interface ResultsDashboardProps {
    results: ResultItem[];
    summary: ExperimentSummary | null;
    aggregationByQuestion?: Record<string, Record<string, number>> | null;
    runCount?: number;
    comparisonRunA?: ComparisonRun | null;
    comparisonRunB?: ComparisonRun | null;
    comparisonLabelA?: string | null;
    comparisonLabelB?: string | null;
    isLoading: boolean;
    loadingStatus: string;
    progressCompleted?: number;
    progressTotal?: number;
}

export function ResultsDashboard({ results, summary, aggregationByQuestion = null, runCount = 0, comparisonRunA = null, comparisonRunB = null, comparisonLabelA = null, comparisonLabelB = null, isLoading, loadingStatus, progressCompleted = 0, progressTotal = 0 }: ResultsDashboardProps) {
    const [selectedQuestion, setSelectedQuestion] = useState<ResultItem | null>(null);
    const showDistribution = (runCount ?? 0) > 1 && aggregationByQuestion && Object.keys(aggregationByQuestion).length > 0;
    const [viewMode, setViewMode] = useState<'table' | 'chart' | 'distribution'>('table');
    const splitEntries = Object.entries(summary?.splitSummary || {});
    const modelEntries = Object.entries(summary?.modelSummary || {});
    const chartModels = useMemo(() => Array.from(new Set(results.map((r) => r.model))), [results]);
    const chartModelColors = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#06b6d4'];
    const subfieldRows = useMemo(() => {
        const perSubfield = new Map<string, Map<string, { total: number; correct: number }>>();

        for (const row of results) {
            const subfield = row.subfield || 'Unknown';
            if (!perSubfield.has(subfield)) {
                perSubfield.set(subfield, new Map<string, { total: number; correct: number }>());
            }
            const modelMap = perSubfield.get(subfield)!;
            if (!modelMap.has(row.model)) {
                modelMap.set(row.model, { total: 0, correct: 0 });
            }
            const modelStats = modelMap.get(row.model)!;
            modelStats.total += 1;
            if (row.isCorrect) {
                modelStats.correct += 1;
            }
        }

        const rows = Array.from(perSubfield.entries()).map(([subfield, modelMap]) => {
            const perModel: Record<string, number | null> = {};
            const accuracyValues: number[] = [];
            for (const model of chartModels) {
                const stats = modelMap.get(model);
                if (!stats || stats.total === 0) {
                    perModel[model] = null;
                    continue;
                }
                const accuracy = (stats.correct / stats.total) * 100;
                perModel[model] = accuracy;
                accuracyValues.push(accuracy);
            }

            const averageAccuracy = accuracyValues.length > 0
                ? accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length
                : 0;

            return { subfield, perModel, averageAccuracy };
        });

        rows.sort((a, b) => a.averageAccuracy - b.averageAccuracy);
        return rows;
    }, [results, chartModels]);

    if (isLoading) {
        const showProgress = progressTotal > 0;
        return (
            <div className="h-full flex flex-col items-center justify-center p-10 border border-blue-100 rounded-xl bg-gradient-to-br from-blue-50/60 to-indigo-50/60">
                <div className="h-12 w-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-xl font-semibold text-gray-800 mt-5">Running Experiment</p>
                <p className="text-sm text-gray-500 mt-2">{loadingStatus}</p>
                {showProgress && (
                    <div className="w-full max-w-sm mt-4 space-y-2">
                        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(100, (progressCompleted / progressTotal) * 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-gray-500 text-center">
                            {progressCompleted} / {progressTotal} questions answered
                        </p>
                    </div>
                )}
                <p className="text-xs text-gray-400 mt-4">You can cancel from the left panel at any time.</p>
            </div>
        );
    }

    const showComparison = comparisonRunA != null && comparisonRunB != null;
    const partialComparison = comparisonRunA != null && comparisonRunB == null;

    if (!summary && !comparisonRunA && !comparisonRunB) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-10 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <BarChart3 size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No results yet</p>
                <p className="text-sm">Run an experiment to see the benchmark data.</p>
            </div>
        );
    }

    if (partialComparison) {
        const labelA = comparisonLabelA ?? 'Config A';
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <h3 className="text-lg font-bold text-gray-800">Comparison cancelled</h3>
                <p className="text-sm text-amber-600">Config B was not completed. Showing Config A only.</p>
                <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 p-5 max-w-md">
                    <p className="text-sm font-semibold uppercase tracking-wider text-blue-700 mb-3">{labelA}</p>
                    <p className="text-3xl font-bold text-gray-800">{(comparisonRunA!.summary.accuracy * 100).toFixed(1)}%</p>
                    <p className="text-sm text-gray-600 mt-1">{comparisonRunA!.summary.correct} / {comparisonRunA!.summary.total} correct</p>
                </div>
            </div>
        );
    }

    if (!summary) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-10 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <BarChart3 size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No results yet</p>
                <p className="text-sm">Run an experiment to see the benchmark data.</p>
            </div>
        );
    }

    const labelA = comparisonLabelA ?? 'Config A';
    const labelB = comparisonLabelB ?? 'Config B';

    if (showComparison) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <h3 className="text-lg font-bold text-gray-800">Comparison</h3>
                <p className="text-sm text-gray-500">Same questions, one factor varied.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 p-5">
                        <p className="text-sm font-semibold uppercase tracking-wider text-blue-700 mb-3">{labelA}</p>
                        <div className="space-y-2">
                            <p className="text-3xl font-bold text-gray-800">{(comparisonRunA.summary.accuracy * 100).toFixed(1)}%</p>
                            <p className="text-sm text-gray-600">{comparisonRunA.summary.correct} / {comparisonRunA.summary.total} correct</p>
                        </div>
                    </div>
                    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-5">
                        <p className="text-sm font-semibold uppercase tracking-wider text-indigo-700 mb-3">{labelB}</p>
                        <div className="space-y-2">
                            <p className="text-3xl font-bold text-gray-800">{(comparisonRunB.summary.accuracy * 100).toFixed(1)}%</p>
                            <p className="text-sm text-gray-600">{comparisonRunB.summary.correct} / {comparisonRunB.summary.total} correct</p>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <p className="text-sm font-semibold text-gray-600 mb-2">{labelA} — Details</p>
                        <p className="text-xs text-gray-500">Total responses: {comparisonRunA.results.length}</p>
                        {comparisonRunA.runCount > 1 && (
                            <p className="text-xs text-gray-500">Runs per question: {comparisonRunA.runCount}</p>
                        )}
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                        <p className="text-sm font-semibold text-gray-600 mb-2">{labelB} — Details</p>
                        <p className="text-xs text-gray-500">Total responses: {comparisonRunB.results.length}</p>
                        {comparisonRunB.runCount > 1 && (
                            <p className="text-xs text-gray-500">Runs per question: {comparisonRunB.runCount}</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium uppercase">Accuracy</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className={`text-4xl font-bold ${summary.accuracy > 0.7 ? 'text-green-600' : summary.accuracy > 0.4 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {(summary.accuracy * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium uppercase">Total Questions</p>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{summary.total}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium uppercase">Correct / Total</p>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{summary.correct} <span className="text-lg text-gray-400 font-normal">/ {summary.total}</span></p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium uppercase">Benchmark Profile</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">
                        {summary.benchmarkProfile === 'controlled' ? 'Controlled' : 'Legacy'}
                    </p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium uppercase">Models</p>
                    <p className="text-3xl font-bold text-gray-800 mt-1">{Math.max(modelEntries.length, 1)}</p>
                </div>
            </div>

            {modelEntries.length > 1 && (
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium uppercase mb-3">Model Comparison</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {modelEntries.map(([model, modelSummary]) => (
                            <div key={model} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                                <p className="text-xs uppercase font-semibold text-gray-500">{model}</p>
                                <p className="text-xl font-bold text-gray-800 mt-1">{(modelSummary.accuracy * 100).toFixed(1)}%</p>
                                <p className="text-sm text-gray-500">{modelSummary.correct} / {modelSummary.total}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {splitEntries.length > 0 && (
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium uppercase mb-3">Determinism Split</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {splitEntries.map(([arm, armSummary]) => (
                            <div key={arm} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                                <p className="text-xs uppercase font-semibold text-gray-500">{arm}</p>
                                <p className="text-xl font-bold text-gray-800 mt-1">{(armSummary.accuracy * 100).toFixed(1)}%</p>
                                <p className="text-sm text-gray-500">{armSummary.correct} / {armSummary.total}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <List size={18} className="text-gray-500" />
                        Detailed Results
                    </h3>
                    <div className="flex bg-gray-200 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('table')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Table
                        </button>
                        <button
                            onClick={() => setViewMode('chart')}
                            className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${viewMode === 'chart' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Subfield Chart
                        </button>
                        {showDistribution && (
                            <button
                                onClick={() => setViewMode('distribution')}
                                className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${viewMode === 'distribution' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Answer distribution
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {viewMode === 'distribution' && aggregationByQuestion ? (
                        <div className="p-6 space-y-6">
                            <h4 className="text-lg font-semibold text-gray-800">Answer choice distribution</h4>
                            <p className="text-sm text-gray-500">Pie chart of how often each answer was selected across {runCount} run{runCount === 1 ? '' : 's'} per question.</p>
                            {(() => {
                                const CORRECT_COLOR = '#22c55e';
                                const WRONG_COLOR = '#ef4444';
                                const DIVIDER_COLOR = '#000000';
                                const DIVIDER_PCT = 1.2;
                                const getChoicesForQuestion = (qId: string) => {
                                    const first = results.find((r) => r.questionId === qId);
                                    const choices = (first as ResultItem & { choices?: string[] })?.choices;
                                    const n = choices?.length ?? 4;
                                    return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
                                };
                                const getCorrectLetter = (qId: string) => {
                                    const first = results.find((r) => r.questionId === qId);
                                    return first?.originalGroundTruth?.trim().toUpperCase() ?? first?.groundTruth?.trim().toUpperCase() ?? null;
                                };
                                const questionIds = Object.keys(aggregationByQuestion).sort();
                                return questionIds.map((qId) => {
                                    const counts = aggregationByQuestion[qId];
                                    const correctLetter = getCorrectLetter(qId);
                                    const choiceLetters = getChoicesForQuestion(qId);
                                    const extraKeys = Object.keys(counts).filter((k) => !choiceLetters.includes(k));
                                    const letters = [...choiceLetters, ...extraKeys].filter((v, i, a) => a.indexOf(v) === i);
                                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                                    const sliceCount = letters.length;
                                    const totalDivider = sliceCount * DIVIDER_PCT;
                                    const scale = total > 0 ? (100 - totalDivider) / 100 : 0;
                                    let cumul = 0;
                                    const parts: string[] = [];
                                    letters.forEach((letter) => {
                                        const count = counts[letter] ?? 0;
                                        const pct = total > 0 ? (count / total) * 100 * scale : 0;
                                        const color = (correctLetter && letter === correctLetter) ? CORRECT_COLOR : WRONG_COLOR;
                                        parts.push(`${color} ${cumul}% ${cumul + pct}%`);
                                        cumul += pct;
                                        parts.push(`${DIVIDER_COLOR} ${cumul}% ${cumul + DIVIDER_PCT}%`);
                                        cumul += DIVIDER_PCT;
                                    });
                                    const gradientStops = parts.join(', ');
                                    return (
                                        <div key={qId} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 flex flex-col sm:flex-row items-center gap-4">
                                            <div className="flex flex-col items-center gap-2 shrink-0">
                                                <div
                                                    className="w-32 h-32 rounded-full border-2 border-white shadow-sm"
                                                    style={{
                                                        background: total > 0 ? `conic-gradient(${gradientStops})` : 'conic-gradient(#e5e7eb 0% 100%)',
                                                    }}
                                                />
                                                <p className="text-xs font-mono text-gray-500 truncate max-w-[8rem]" title={qId}>{qId.substring(0, 10)}...</p>
                                            </div>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                                {letters.map((letter) => {
                                                    const isCorrect = correctLetter && letter === correctLetter;
                                                    return (
                                                        <div key={letter} className="flex items-center gap-1.5">
                                                            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: isCorrect ? CORRECT_COLOR : WRONG_COLOR }} />
                                                            <span className="font-medium text-gray-700">{letter}{isCorrect ? ' (correct)' : ''}</span>
                                                            <span className="text-gray-500">{(counts[letter] ?? 0)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    ) : viewMode === 'table' ? (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm text-xs uppercase text-gray-500 font-bold">
                                <tr>
                                    <th className="p-4 w-16">Status</th>
                                    <th className="p-4">Question ID</th>
                                    <th className="p-4">Model</th>
                                    <th className="p-4">Run</th>
                                    <th className="p-4">Model Output</th>
                                    <th className="p-4">Expected</th>
                                    <th className="p-4 w-20">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {results.map((r, i) => (
                                    <tr key={`${r.questionId}-${r.model}-${r.evaluationArm || 'single'}-${i}`} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="p-4">
                                            {r.isCorrect ?
                                                <CheckCircle2 className="text-green-500" size={20} /> :
                                                <XCircle className="text-red-500" size={20} />
                                            }
                                        </td>
                                        <td className="p-4 font-mono text-gray-500 text-xs truncate max-w-[150px]" title={r.questionId}>
                                            {r.questionId.substring(0, 8)}...
                                            {r.isPerturbed && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Adv</span>}
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                                                {r.model}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700">
                                                {r.evaluationArm || 'single'}
                                            </span>
                                        </td>
                                        <td className="p-4 font-medium">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${r.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {r.parsedChoice}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-600">
                                            {r.groundTruth}
                                            {r.groundTruth !== r.originalGroundTruth &&
                                                <span className="ml-2 text-xs text-orange-500" title="Label Noise Applied">(was {r.originalGroundTruth})</span>
                                            }
                                        </td>
                                        <td className="p-4">
                                            <button
                                                onClick={() => setSelectedQuestion(r)}
                                                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-blue-600 transition-colors"
                                            >
                                                <Search size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-6 space-y-4">
                            <h4 className="text-lg font-semibold text-gray-800">Weakest Legal Areas (Subfield Accuracy)</h4>
                            {subfieldRows.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-400">
                                    No subfield data available in current results.
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-4">
                                        {chartModels.map((model, index) => (
                                            <div key={model} className="flex items-center gap-2 text-xs font-medium text-gray-600">
                                                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: chartModelColors[index % chartModelColors.length] }} />
                                                {model}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400 px-2 ml-[220px]">
                                        <span>0%</span>
                                        <span>20%</span>
                                        <span>40%</span>
                                        <span>60%</span>
                                        <span>80%</span>
                                        <span>100%</span>
                                    </div>
                                    <div className="space-y-5 pb-2">
                                        {subfieldRows.map((row) => (
                                            <div key={row.subfield} className="grid grid-cols-[220px_1fr] gap-4 items-start">
                                                <div className="pt-1 text-sm text-gray-700 text-right">{row.subfield}</div>
                                                <div className="space-y-1">
                                                    {chartModels.map((model, index) => {
                                                        const value = row.perModel[model];
                                                        const width = value === null ? 0 : Math.max(0, Math.min(100, value));
                                                        return (
                                                            <div key={`${row.subfield}-${model}`} className="grid grid-cols-[1fr_52px] gap-2 items-center">
                                                                <div className="h-4 bg-gray-100 rounded-sm overflow-hidden">
                                                                    <div
                                                                        className="h-full rounded-sm"
                                                                        style={{
                                                                            width: `${width}%`,
                                                                            backgroundColor: chartModelColors[index % chartModelColors.length]
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="text-xs text-gray-600 text-right">
                                                                    {value === null ? '--' : `${value.toFixed(1)}%`}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {selectedQuestion && (
                <QuestionDetailModal
                    data={selectedQuestion}
                    onClose={() => setSelectedQuestion(null)}
                />
            )}
        </div>
    );
}
