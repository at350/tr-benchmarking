
import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type QuestionDetailModalProps = {
    data: any;
    onClose: () => void;
};

export function QuestionDetailModal({ data, onClose }: QuestionDetailModalProps) {
    if (!data) return null;
    const isPrbench = data.dataset === 'prbench';

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                >
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-lg text-gray-800">Question Analysis</h3>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-6">
                        {isPrbench ? (
                            <>
                                <div className="p-4 rounded-lg flex items-start gap-3 bg-indigo-50 text-indigo-900 border border-indigo-100">
                                    <div className="mt-0.5 font-bold text-lg">
                                        Judge Score: {data.judge?.overallScore ?? '--'} / 100
                                    </div>
                                    <div className="ml-auto text-sm text-right text-indigo-700">
                                        <div>{data.topic || data.field || 'General'}</div>
                                    </div>
                                </div>

                                {data.isPerturbed && (
                                    <div className="p-3 bg-orange-50 text-orange-800 rounded-lg text-sm border border-orange-100 flex items-center gap-2">
                                        <AlertTriangle size={16} />
                                        <strong>Adversarial Perturbation Applied:</strong> The final user prompt was modified for robustness testing.
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Conversation</h4>
                                    <div className="space-y-3">
                                        {data.conversation?.map((message: any, index: number) => (
                                            <div
                                                key={index}
                                                className={`p-3 rounded-lg border text-sm whitespace-pre-wrap ${message.role === 'assistant' ? 'bg-slate-50 border-slate-200' : 'bg-white border-gray-200'}`}
                                            >
                                                <div className="text-xs font-semibold uppercase text-gray-400 mb-1">
                                                    {message.role === 'assistant' ? 'Assistant' : 'User'}
                                                </div>
                                                <div className="text-gray-700">{message.content}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Model Answer</h4>
                                    <div className="bg-slate-900 text-slate-50 p-4 rounded-lg font-mono text-xs whitespace-pre-wrap shadow-inner overflow-x-auto">
                                        {data.modelAnswer}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Judge Output</h4>
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Overall Score</span>
                                            <span className="font-semibold text-gray-800">{data.judge?.overallScore ?? '--'}</span>
                                        </div>
                                        {data.judge?.summary && (
                                            <div className="text-gray-700">{data.judge.summary}</div>
                                        )}
                                        <div className="text-gray-600">
                                            Issues: {data.judge?.issues?.length ? data.judge.issues.join(' • ') : 'None'}
                                        </div>
                                        {data.judge?.subscores && Object.keys(data.judge.subscores).length > 0 && (
                                            <div className="space-y-1 text-xs text-gray-500">
                                                {Object.entries(data.judge.subscores as Record<string, number>).map(([key, value]) => (
                                                    <div key={key} className="flex justify-between">
                                                        <span>{key}</span>
                                                        <span className="font-semibold text-gray-700">{value.toFixed(1)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {data.judge?.parseFailed && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wider">Judge Raw Output (Parse Failed)</h4>
                                        <div className="bg-slate-900 text-slate-50 p-4 rounded-lg font-mono text-xs whitespace-pre-wrap shadow-inner overflow-x-auto">
                                            {data.judge?.rawOutput}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className={`p-4 rounded-lg flex items-start gap-3 ${data.isCorrect ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                                    <div className="mt-0.5 font-bold text-lg">
                                        {data.isCorrect ? 'Correct Answer' : 'Incorrect Answer'}
                                    </div>
                                    <div className="ml-auto text-sm text-right">
                                        <div>Model Picked: <strong>{data.parsedChoice}</strong></div>
                                        <div>Correct: <strong>{data.groundTruth}</strong></div>
                                    </div>
                                </div>

                                {data.isPerturbed && (
                                    <div className="p-3 bg-orange-50 text-orange-800 rounded-lg text-sm border border-orange-100 flex items-center gap-2">
                                        <AlertTriangle size={16} />
                                        <strong>Adversarial Perturbation Applied:</strong> The input text was modified to test robustness.
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Input Prompt</h4>
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 font-mono text-sm whitespace-pre-wrap text-gray-700">
                                        {data.questionText}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Answer Choices</h4>
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm space-y-1">
                                        {data.choices && data.choices.map((choice: string, i: number) => (
                                            <div key={i} className={`flex gap-2 ${String.fromCharCode(65 + i) === data.groundTruth ? 'font-bold text-green-700' : 'text-gray-700'}`}>
                                                <span className="w-6 shrink-0">{String.fromCharCode(65 + i)}.</span>
                                                <span>{choice}</span>
                                                {String.fromCharCode(65 + i) === data.groundTruth && <span className="ml-2 text-xs bg-green-100 text-green-800 px-1 rounded">Correct</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Model Raw Output</h4>
                                    <div className="bg-slate-900 text-slate-50 p-4 rounded-lg font-mono text-xs whitespace-pre-wrap shadow-inner overflow-x-auto">
                                        {data.modelOutput}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
