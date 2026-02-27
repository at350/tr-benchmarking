'use client';

type RubricJudgeProbeResultsProps = {
    summary: Record<string, unknown>;
    results: Record<string, unknown>[];
};

type NormalizedJudgeResult = {
    rubricId: string;
    rubricName: string;
    overallScore: number | null;
    parseFailed: boolean;
    strengths: string[];
    weaknesses: string[];
    issues: string[];
    summary: string;
    rawJudgeOutput: string;
};

type AttemptRow = {
    modelLabel: string;
    modelKey: string;
    generationPromptArm: string;
    generationPromptName: string;
    questionId: string;
    repeatIndex: number;
    parsedChoice: string;
    groundTruth: string;
    isCorrect: boolean;
    generationParseStatus: string;
    generationSchemaValid: boolean;
    generationDegraded: boolean;
    generationRawOutput: string;
    judgeResults: NormalizedJudgeResult[];
};

export function RubricJudgeProbeResults({ summary, results }: RubricJudgeProbeResultsProps) {
    const rows = normalizeRows(results);
    const heatmapRows = Array.isArray(summary.modelRubricMeans) ? summary.modelRubricMeans : [];
    const rubricLeaderboards = Array.isArray(summary.rubricLeaderboards) ? summary.rubricLeaderboards : [];
    const pairwiseByRubric = Array.isArray(summary.pairwiseByRubric) ? summary.pairwiseByRubric : [];
    const strengths = Array.isArray(summary.topStrengths) ? summary.topStrengths : [];
    const weaknesses = Array.isArray(summary.topWeaknesses) ? summary.topWeaknesses : [];
    const requiredN = summary.requiredObservationCount ?? summary.requiredQuestionCount;
    const actualN = summary.actualObservationCount ?? summary.actualQuestionCount;
    const generationPromptCount = summary.generationPromptCount ?? 1;

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-7">
                <MetricCard label="Models" value={toIntString(summary.modelCount)} />
                <MetricCard label="Prompt Variants" value={toIntString(generationPromptCount)} />
                <MetricCard label="Questions" value={toIntString(summary.questionCount)} />
                <MetricCard label="Runs / Question" value={toIntString(summary.runsPerQuestion)} />
                <MetricCard label="Total Calls" value={toIntString(summary.totalCalls)} />
                <MetricCard label="Gen JSON Compliance" value={toPercent(summary.generationJsonComplianceRate)} />
                <MetricCard label="Judge JSON Compliance" value={toPercent(summary.judgeJsonComplianceRate)} />
            </div>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Statistical Validation</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${summaryStatEnabled(summary) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                        {summaryStatEnabled(summary) ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
                    <StatText label="Required N" value={toIntString(requiredN)} />
                    <StatText label="Actual N" value={toIntString(actualN)} />
                    <StatText label="Underpowered" value={toBoolString(summary.underpowered)} />
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Model x Rubric Mean Score Heatmap</p>
                {heatmapRows.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No rubric/model score data yet.</p>
                ) : (
                    <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
                        <table className="min-w-full text-left text-xs">
                            <thead className="sticky top-0 bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-2 py-1.5">Rubric</th>
                                    <th className="px-2 py-1.5">Model</th>
                                    <th className="px-2 py-1.5">Mean Score</th>
                                    <th className="px-2 py-1.5">N</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {heatmapRows.map((entry, index) => {
                                    const row = isRecord(entry) ? entry : {};
                                    const meanScore = toNumber(row.meanScore);
                                    const shade = meanScore === null
                                        ? ''
                                        : (meanScore >= 80 ? 'bg-emerald-50' : meanScore >= 60 ? 'bg-amber-50' : 'bg-rose-50');
                                    return (
                                        <tr key={`${String(row.rubricId)}-${String(row.modelKey)}-${index}`} className={shade}>
                                            <td className="px-2 py-1.5 text-slate-700">{toText(row.rubricName)}</td>
                                            <td className="px-2 py-1.5 text-slate-700">{toText(row.modelLabel)}</td>
                                            <td className="px-2 py-1.5 font-semibold text-slate-800">{meanScore === null ? 'N/A' : meanScore.toFixed(1)}</td>
                                            <td className="px-2 py-1.5 text-slate-700">{toIntString(row.n)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Per-Rubric Leaderboards (Mean ± 95% CI)</p>
                {rubricLeaderboards.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No rubric leaderboard data available.</p>
                ) : (
                    <div className="mt-2 space-y-3">
                        {rubricLeaderboards.map((bucket, index) => {
                            const group = isRecord(bucket) ? bucket : {};
                            const rows = Array.isArray(group.rows) ? group.rows : [];
                            return (
                                <div key={`leaderboard-${index}`} className="rounded-lg border border-slate-200 bg-white p-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{toText(group.rubricName)}</p>
                                    {rows.length === 0 ? (
                                        <p className="mt-1 text-xs text-slate-500">No rows.</p>
                                    ) : (
                                        <div className="mt-2 overflow-auto rounded border border-slate-200">
                                            <table className="min-w-full text-left text-xs">
                                                <thead className="bg-slate-100 text-slate-600">
                                                    <tr>
                                                        <th className="px-2 py-1.5">Rank</th>
                                                        <th className="px-2 py-1.5">Model</th>
                                                        <th className="px-2 py-1.5">Mean Score</th>
                                                        <th className="px-2 py-1.5">95% CI</th>
                                                        <th className="px-2 py-1.5">N</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200">
                                                    {rows.map((entry, entryIndex) => {
                                                        const row = isRecord(entry) ? entry : {};
                                                        return (
                                                            <tr key={`leaderboard-row-${index}-${entryIndex}`}>
                                                                <td className="px-2 py-1.5 text-slate-700">{entryIndex + 1}</td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toText(row.modelLabel)}</td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toNumberFixed(row.meanScore)}</td>
                                                                <td className="px-2 py-1.5 text-slate-700">[{toNumberFixed(row.ciLow)}, {toNumberFixed(row.ciHigh)}]</td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toIntString(row.n)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Pairwise Significance By Rubric</p>
                {pairwiseByRubric.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No significance comparisons available.</p>
                ) : (
                    <div className="mt-2 space-y-3">
                        {pairwiseByRubric.map((group, groupIndex) => {
                            const bucket = isRecord(group) ? group : {};
                            const comparisons = Array.isArray(bucket.comparisons) ? bucket.comparisons : [];
                            return (
                                <div key={`pairwise-${groupIndex}`} className="rounded-lg border border-slate-200 bg-white p-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{toText(bucket.rubricName)}</p>
                                    {comparisons.length === 0 ? (
                                        <p className="mt-1 text-xs text-slate-500">No pairwise rows.</p>
                                    ) : (
                                        <div className="mt-2 overflow-auto rounded border border-slate-200">
                                            <table className="min-w-full text-left text-xs">
                                                <thead className="bg-slate-100 text-slate-600">
                                                    <tr>
                                                        <th className="px-2 py-1.5">Pair</th>
                                                        <th className="px-2 py-1.5">N</th>
                                                        <th className="px-2 py-1.5">Mean Diff</th>
                                                        <th className="px-2 py-1.5">CI (95%)</th>
                                                        <th className="px-2 py-1.5">dz</th>
                                                        <th className="px-2 py-1.5">p</th>
                                                        <th className="px-2 py-1.5">p_adj</th>
                                                        <th className="px-2 py-1.5">Winner</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200">
                                                    {comparisons.map((entry, entryIndex) => {
                                                        const row = isRecord(entry) ? entry : {};
                                                        const significant = Boolean(row.significant);
                                                        return (
                                                            <tr key={`pair-${groupIndex}-${entryIndex}`} className={significant ? 'bg-emerald-50/60' : ''}>
                                                                <td className="px-2 py-1.5 text-slate-700">
                                                                    {toText(row.modelALabel)} vs {toText(row.modelBLabel)}
                                                                </td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toIntString(row.n)}</td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toSignedNumber(row.meanDiff)}</td>
                                                                <td className="px-2 py-1.5 text-slate-700">[{toNumberFixed(row.ciLow)}, {toNumberFixed(row.ciHigh)}]</td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toNumberFixed(row.effectSizeDz)}</td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toNumberFixed(row.pValue)}</td>
                                                                <td className="px-2 py-1.5 text-slate-700">{toNumberFixed(row.pValueAdjusted)}</td>
                                                                <td className={`px-2 py-1.5 font-semibold ${significant ? 'text-emerald-700' : 'text-slate-700'}`}>{toText(row.winner)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Strengths / Weaknesses Frequency</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-slate-200 bg-white p-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Top Strengths</p>
                        {strengths.length === 0 ? (
                            <p className="mt-1 text-xs text-slate-500">No strengths detected.</p>
                        ) : (
                            <ul className="mt-1 space-y-1 text-xs text-slate-700">
                                {strengths.map((entry, index) => {
                                    const row = isRecord(entry) ? entry : {};
                                    return <li key={`strength-${index}`}>{toText(row.label)} ({toIntString(row.count)})</li>;
                                })}
                            </ul>
                        )}
                    </div>
                    <div className="rounded border border-slate-200 bg-white p-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Top Weaknesses</p>
                        {weaknesses.length === 0 ? (
                            <p className="mt-1 text-xs text-slate-500">No weaknesses detected.</p>
                        ) : (
                            <ul className="mt-1 space-y-1 text-xs text-slate-700">
                                {weaknesses.map((entry, index) => {
                                    const row = isRecord(entry) ? entry : {};
                                    return <li key={`weakness-${index}`}>{toText(row.label)} ({toIntString(row.count)})</li>;
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Attempt-Level Results</p>
                {rows.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No attempt rows available.</p>
                ) : (
                    <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
                        <table className="min-w-full text-left text-xs">
                            <thead className="sticky top-0 bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-2 py-1.5">Model</th>
                                    <th className="px-2 py-1.5">Prompt</th>
                                    <th className="px-2 py-1.5">Question</th>
                                    <th className="px-2 py-1.5">Run</th>
                                    <th className="px-2 py-1.5">Choice</th>
                                    <th className="px-2 py-1.5">Truth</th>
                                    <th className="px-2 py-1.5">Correct</th>
                                    <th className="px-2 py-1.5">Gen Parse</th>
                                    <th className="px-2 py-1.5">Judge Scores</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {rows.map((row, index) => (
                                    <tr key={`${row.modelKey}-${row.questionId}-${row.repeatIndex}-${index}`}>
                                        <td className="px-2 py-1.5 text-slate-700">{row.modelLabel}</td>
                                        <td className="px-2 py-1.5 text-slate-700">
                                            {row.generationPromptArm}{row.generationPromptName ? ` (${row.generationPromptName})` : ''}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-slate-700">{row.questionId}</td>
                                        <td className="px-2 py-1.5 text-slate-700">{row.repeatIndex}</td>
                                        <td className="px-2 py-1.5 text-slate-700">{row.parsedChoice}</td>
                                        <td className="px-2 py-1.5 text-slate-700">{row.groundTruth}</td>
                                        <td className={`px-2 py-1.5 font-semibold ${row.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>{row.isCorrect ? 'Yes' : 'No'}</td>
                                        <td className="px-2 py-1.5 text-slate-700">{row.generationParseStatus}</td>
                                        <td className="px-2 py-1.5 text-slate-700">
                                            {row.judgeResults.map((judge) => `${judge.rubricName}: ${judge.overallScore === null ? 'N/A' : judge.overallScore.toFixed(1)}`).join(' | ')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Raw Outputs</p>
                <div className="mt-2 max-h-72 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
                    {rows.map((row, index) => (
                        <details key={`raw-${row.modelKey}-${row.questionId}-${row.repeatIndex}-${index}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                                {row.modelLabel} - {row.generationPromptArm}{row.generationPromptName ? ` (${row.generationPromptName})` : ''} - {row.questionId} - run {row.repeatIndex} - {row.parsedChoice}/{row.groundTruth}
                            </summary>
                            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Generation Output</p>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                                {row.generationRawOutput}
                            </pre>
                            {row.judgeResults.map((judge) => (
                                <div key={`${judge.rubricId}-${judge.rubricName}`} className="mt-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{judge.rubricName}</p>
                                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                                        {judge.rawJudgeOutput}
                                    </pre>
                                </div>
                            ))}
                        </details>
                    ))}
                </div>
            </section>
        </div>
    );
}

function normalizeRows(results: Record<string, unknown>[]): AttemptRow[] {
    return results
        .filter((row) => isRecord(row))
        .map((row) => {
            const judgeResults = Array.isArray(row.judgeResults)
                ? row.judgeResults
                    .filter((entry) => isRecord(entry))
                    .map((entry) => ({
                        rubricId: toText(entry.rubricId),
                        rubricName: toText(entry.rubricName),
                        overallScore: toNumber(entry.overallScore),
                        parseFailed: Boolean(entry.parseFailed),
                        strengths: Array.isArray(entry.strengths) ? entry.strengths.map((item) => String(item)) : [],
                        weaknesses: Array.isArray(entry.weaknesses) ? entry.weaknesses.map((item) => String(item)) : [],
                        issues: Array.isArray(entry.issues) ? entry.issues.map((item) => String(item)) : [],
                        summary: toText(entry.summary),
                        rawJudgeOutput: toText(entry.rawJudgeOutput),
                    }))
                : [];

            return {
                modelLabel: toText(row.modelLabel),
                modelKey: toText(row.modelArmKey) || toText(row.modelKey),
                generationPromptArm: toText(row.generationPromptArm) || 'Prompt A',
                generationPromptName: toText(row.generationPromptName),
                questionId: toText(row.questionId),
                repeatIndex: toInt(row.repeatIndex),
                parsedChoice: toText(row.parsedChoice),
                groundTruth: toText(row.groundTruth),
                isCorrect: Boolean(row.isCorrect),
                generationParseStatus: toText(row.generationParseStatus),
                generationSchemaValid: Boolean(row.generationSchemaValid),
                generationDegraded: Boolean(row.generationDegraded),
                generationRawOutput: toText(row.generationRawOutput),
                judgeResults,
            };
        });
}

function summaryStatEnabled(summary: Record<string, unknown>) {
    return Boolean(summary.statValidationEnabled);
}

function toBoolString(value: unknown) {
    return Boolean(value) ? 'Yes' : 'No';
}

function toText(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function toNumber(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function toInt(value: unknown) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return 1;
    }
    return Math.max(1, Math.round(n));
}

function toIntString(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : '0';
}

function toNumberFixed(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(3) : 'N/A';
}

function toSignedNumber(value: unknown) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return 'N/A';
    }
    return `${n >= 0 ? '+' : ''}${n.toFixed(3)}`;
}

function toPercent(value: unknown) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return '0.0%';
    }
    return `${(n * 100).toFixed(1)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{value}</p>
        </div>
    );
}

function StatText({ label, value }: { label: string; value: string }) {
    return (
        <p><span className="font-semibold">{label}:</span> {value}</p>
    );
}
