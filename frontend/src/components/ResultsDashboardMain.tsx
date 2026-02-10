
import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Search, BarChart3, List } from 'lucide-react';
import { QuestionDetailModal } from './QuestionDetailModalMain';

type SuperGPQAResult = {
    dataset: 'supergpqa';
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
};

type JudgeResult = {
    overallScore: number | null;
    subscores: Record<string, number>;
    issues: string[];
    summary?: string;
    rawOutput: string;
    parseFailed: boolean;
};

type PrbenchResult = {
    dataset: 'prbench';
    itemId: string;
    field?: string;
    topic?: string;
    finalPrompt: string;
    conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
    modelAnswer: string;
    judge: JudgeResult;
    isPerturbed: boolean;
};

type SuperGPQASummary = {
    dataset: 'supergpqa';
    total: number;
    correct: number;
    accuracy: number;
};

type PrbenchSummary = {
    dataset: 'prbench';
    total: number;
    scoredCount: number;
    meanScore: number;
    meanSubscores?: Record<string, number>;
};

type ResultItem = SuperGPQAResult | PrbenchResult;
type ExperimentSummary = SuperGPQASummary | PrbenchSummary;

interface ResultsDashboardProps {
    results: ResultItem[];
    summary: ExperimentSummary | null;
}

export function ResultsDashboard({ results, summary }: ResultsDashboardProps) {
    const [selectedQuestion, setSelectedQuestion] = useState<ResultItem | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

    if (!summary) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-10 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <BarChart3 size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No results yet</p>
                <p className="text-sm">Run an experiment to see the benchmark data.</p>
            </div>
        );
    }

    const isPrbench = summary.dataset === 'prbench';

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {isPrbench ? (
                    <>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium uppercase">Mean Judge Score</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-4xl font-bold text-indigo-600">
                                    {(summary as PrbenchSummary).scoredCount > 0
                                        ? (summary as PrbenchSummary).meanScore.toFixed(1)
                                        : '--'}
                                </span>
                                <span className="text-xs text-gray-400">/ 100</span>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium uppercase">Total Items</p>
                            <p className="text-3xl font-bold text-gray-800 mt-1">{summary.total}</p>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium uppercase">
                                {Object.keys((summary as PrbenchSummary).meanSubscores || {}).length > 0 ? 'Mean Subscores' : 'Scored Items'}
                            </p>
                            {Object.keys((summary as PrbenchSummary).meanSubscores || {}).length > 0 ? (
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                    {Object.entries((summary as PrbenchSummary).meanSubscores || {}).map(([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                            <span className="truncate">{key}</span>
                                            <span className="font-semibold text-gray-800">{value.toFixed(1)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-3xl font-bold text-gray-800 mt-1">
                                    {(summary as PrbenchSummary).scoredCount}
                                    <span className="text-lg text-gray-400 font-normal">/ {summary.total}</span>
                                </p>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium uppercase">Accuracy</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className={`text-4xl font-bold ${((summary as SuperGPQASummary).accuracy > 0.7) ? 'text-green-600' : ((summary as SuperGPQASummary).accuracy > 0.4) ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {((summary as SuperGPQASummary).accuracy * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium uppercase">Total Questions</p>
                            <p className="text-3xl font-bold text-gray-800 mt-1">{summary.total}</p>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-sm text-gray-500 font-medium uppercase">Correct / Total</p>
                            <p className="text-3xl font-bold text-gray-800 mt-1">
                                {(summary as SuperGPQASummary).correct}
                                <span className="text-lg text-gray-400 font-normal">/ {summary.total}</span>
                            </p>
                        </div>
                    </>
                )}
            </div>

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
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {viewMode === 'table' ? (
                        isPrbench ? (
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm text-xs uppercase text-gray-500 font-bold">
                                    <tr>
                                        <th className="p-4 w-20">Score</th>
                                        <th className="p-4 w-40">Topic</th>
                                        <th className="p-4">Final Prompt</th>
                                        <th className="p-4">Model Answer</th>
                                        <th className="p-4">Judge Notes</th>
                                        <th className="p-4 w-20">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(results as PrbenchResult[]).map((r, i) => (
                                        <tr key={r.itemId || i} className="hover:bg-blue-50/30 transition-colors group align-top">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg font-semibold text-indigo-600">
                                                        {r.judge.overallScore ?? '--'}
                                                    </span>
                                                    {r.judge.parseFailed && (
                                                        <AlertTriangle size={16} className="text-orange-500" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-600 text-xs uppercase tracking-wide">
                                                {r.topic || r.field || 'General'}
                                                {r.isPerturbed && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Adv</span>}
                                            </td>
                                            <td className="p-4 text-gray-700 max-w-[260px]">
                                                <div className="line-clamp-4 whitespace-pre-wrap">{r.finalPrompt}</div>
                                            </td>
                                            <td className="p-4 text-gray-700 max-w-[260px]">
                                                <div className="line-clamp-4 whitespace-pre-wrap">{r.modelAnswer}</div>
                                            </td>
                                            <td className="p-4 text-gray-600 max-w-[260px]">
                                                {r.judge.issues.length > 0 ? (
                                                    <div className="line-clamp-4">{r.judge.issues.join(' • ')}</div>
                                                ) : (
                                                    <span className="text-gray-400">No issues flagged</span>
                                                )}
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
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm text-xs uppercase text-gray-500 font-bold">
                                    <tr>
                                        <th className="p-4 w-16">Status</th>
                                        <th className="p-4">Question ID</th>
                                        <th className="p-4">Model Output</th>
                                        <th className="p-4">Expected</th>
                                        <th className="p-4 w-20">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(results as SuperGPQAResult[]).map((r, i) => (
                                        <tr key={r.questionId || i} className="hover:bg-blue-50/30 transition-colors group">
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
                        )
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400">
                            Chart visualization coming in Sprint 2
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
