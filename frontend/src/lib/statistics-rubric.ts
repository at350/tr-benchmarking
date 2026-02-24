export type RubricScoreObservation = {
    rubricId: string;
    rubricName: string;
    modelKey: string;
    modelLabel: string;
    questionId: string;
    score: number;
};

export type PairwiseRubricComparison = {
    rubricId: string;
    rubricName: string;
    modelAKey: string;
    modelALabel: string;
    modelBKey: string;
    modelBLabel: string;
    n: number;
    meanDiff: number;
    effectSizeDz: number;
    ciLow: number;
    ciHigh: number;
    pValue: number;
    pValueAdjusted: number;
    significant: boolean;
    winner: string;
};

export type RubricPairwiseResult = {
    rubricId: string;
    rubricName: string;
    comparisons: PairwiseRubricComparison[];
};

type HolmItem = {
    index: number;
    pValue: number;
};

export function estimateRequiredSampleSizePaired(alpha: number, power: number, effectSizeDz: number) {
    const safeAlpha = clamp(alpha, 1e-6, 0.2);
    const safePower = clamp(power, 0.5, 0.999);
    const safeEffect = Math.max(effectSizeDz, 1e-6);
    const zAlpha = normalInv(1 - safeAlpha / 2);
    const zPower = normalInv(safePower);
    const n = ((zAlpha + zPower) / safeEffect) ** 2;
    return Math.max(2, Math.ceil(n));
}

export function computeRubricPairwiseComparisons(
    observations: RubricScoreObservation[],
    options: {
        alpha: number;
        permutations: number;
        bootstrapSamples: number;
        seed: number;
    },
): RubricPairwiseResult[] {
    const byRubric = new Map<string, RubricScoreObservation[]>();
    for (const row of observations) {
        const key = `${row.rubricId}::${row.rubricName}`;
        if (!byRubric.has(key)) {
            byRubric.set(key, []);
        }
        byRubric.get(key)?.push(row);
    }

    const result: RubricPairwiseResult[] = [];
    for (const [rubricKey, rows] of byRubric.entries()) {
        const [rubricId, rubricName] = rubricKey.split('::');
        const modelMap = new Map<string, {
            modelKey: string;
            modelLabel: string;
            byQuestion: Map<string, number>;
        }>();

        for (const row of rows) {
            if (!modelMap.has(row.modelKey)) {
                modelMap.set(row.modelKey, {
                    modelKey: row.modelKey,
                    modelLabel: row.modelLabel,
                    byQuestion: new Map<string, number>(),
                });
            }
            modelMap.get(row.modelKey)?.byQuestion.set(row.questionId, row.score);
        }

        const models = Array.from(modelMap.values()).sort((a, b) => a.modelLabel.localeCompare(b.modelLabel));
        const comparisons: PairwiseRubricComparison[] = [];

        for (let i = 0; i < models.length; i += 1) {
            for (let j = i + 1; j < models.length; j += 1) {
                const a = models[i];
                const b = models[j];
                const diffs: number[] = [];
                for (const [questionId, scoreA] of a.byQuestion.entries()) {
                    const scoreB = b.byQuestion.get(questionId);
                    if (typeof scoreB === 'number') {
                        diffs.push(scoreA - scoreB);
                    }
                }

                if (diffs.length === 0) {
                    comparisons.push({
                        rubricId,
                        rubricName,
                        modelAKey: a.modelKey,
                        modelALabel: a.modelLabel,
                        modelBKey: b.modelKey,
                        modelBLabel: b.modelLabel,
                        n: 0,
                        meanDiff: 0,
                        effectSizeDz: 0,
                        ciLow: 0,
                        ciHigh: 0,
                        pValue: 1,
                        pValueAdjusted: 1,
                        significant: false,
                        winner: 'Tie',
                    });
                    continue;
                }

                const meanDiff = mean(diffs);
                const effectSizeDz = computeDz(diffs);
                const pValue = permutationSignFlipPValue(diffs, options.permutations, options.seed + i * 131 + j * 197);
                const ci = bootstrapMeanDifferenceCI(diffs, options.bootstrapSamples, options.seed + i * 227 + j * 313);

                comparisons.push({
                    rubricId,
                    rubricName,
                    modelAKey: a.modelKey,
                    modelALabel: a.modelLabel,
                    modelBKey: b.modelKey,
                    modelBLabel: b.modelLabel,
                    n: diffs.length,
                    meanDiff,
                    effectSizeDz,
                    ciLow: ci.low,
                    ciHigh: ci.high,
                    pValue,
                    pValueAdjusted: pValue,
                    significant: false,
                    winner: 'Tie',
                });
            }
        }

        const adjusted = holmBonferroniAdjust(comparisons.map((item, index) => ({ index, pValue: item.pValue })));
        for (const entry of adjusted) {
            const row = comparisons[entry.index];
            row.pValueAdjusted = entry.adjustedPValue;
            row.significant = entry.adjustedPValue <= options.alpha && row.n > 1;
            row.winner = row.significant
                ? (row.meanDiff > 0 ? row.modelALabel : row.modelBLabel)
                : 'Tie';
        }

        result.push({
            rubricId,
            rubricName,
            comparisons,
        });
    }

    return result.sort((a, b) => a.rubricName.localeCompare(b.rubricName));
}

function holmBonferroniAdjust(items: HolmItem[]) {
    if (items.length === 0) {
        return [] as Array<HolmItem & { adjustedPValue: number }>;
    }

    const m = items.length;
    const sorted = [...items].sort((a, b) => a.pValue - b.pValue);
    const adjustedSorted: Array<HolmItem & { adjustedPValue: number }> = [];

    let runningMax = 0;
    for (let i = 0; i < sorted.length; i += 1) {
        const item = sorted[i];
        const scaled = clamp(item.pValue * (m - i), 0, 1);
        runningMax = Math.max(runningMax, scaled);
        adjustedSorted.push({ ...item, adjustedPValue: runningMax });
    }

    return adjustedSorted.sort((a, b) => a.index - b.index);
}

function permutationSignFlipPValue(diffs: number[], permutations: number, seed: number) {
    const n = diffs.length;
    if (n === 0) {
        return 1;
    }
    const observed = Math.abs(mean(diffs));
    const rng = createRng(seed);
    const total = Math.max(100, Math.floor(permutations));
    let extremeCount = 0;

    for (let i = 0; i < total; i += 1) {
        let sum = 0;
        for (let j = 0; j < n; j += 1) {
            const sign = rng() < 0.5 ? -1 : 1;
            sum += sign * diffs[j];
        }
        const permMean = Math.abs(sum / n);
        if (permMean >= observed - 1e-12) {
            extremeCount += 1;
        }
    }

    return (extremeCount + 1) / (total + 1);
}

function bootstrapMeanDifferenceCI(diffs: number[], samples: number, seed: number) {
    const n = diffs.length;
    if (n === 0) {
        return { low: 0, high: 0 };
    }
    const total = Math.max(200, Math.floor(samples));
    const rng = createRng(seed);
    const means = new Array<number>(total);

    for (let i = 0; i < total; i += 1) {
        let sum = 0;
        for (let j = 0; j < n; j += 1) {
            const idx = Math.floor(rng() * n);
            sum += diffs[idx];
        }
        means[i] = sum / n;
    }

    means.sort((a, b) => a - b);
    const lowIndex = Math.max(0, Math.floor(0.025 * total));
    const highIndex = Math.min(total - 1, Math.ceil(0.975 * total) - 1);
    return {
        low: means[lowIndex],
        high: means[highIndex],
    };
}

function computeDz(diffs: number[]) {
    if (diffs.length <= 1) {
        return 0;
    }
    const avg = mean(diffs);
    const sd = sampleStandardDeviation(diffs);
    if (sd <= 1e-12) {
        return 0;
    }
    return avg / sd;
}

function mean(values: number[]) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[]) {
    if (values.length <= 1) {
        return 0;
    }
    const avg = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function normalInv(p: number) {
    const clamped = clamp(p, 1e-12, 1 - 1e-12);

    const a1 = -39.6968302866538;
    const a2 = 220.946098424521;
    const a3 = -275.928510446969;
    const a4 = 138.357751867269;
    const a5 = -30.6647980661472;
    const a6 = 2.50662827745924;

    const b1 = -54.4760987982241;
    const b2 = 161.585836858041;
    const b3 = -155.698979859887;
    const b4 = 66.8013118877197;
    const b5 = -13.2806815528857;

    const c1 = -0.00778489400243029;
    const c2 = -0.322396458041136;
    const c3 = -2.40075827716184;
    const c4 = -2.54973253934373;
    const c5 = 4.37466414146497;
    const c6 = 2.93816398269878;

    const d1 = 0.00778469570904146;
    const d2 = 0.32246712907004;
    const d3 = 2.445134137143;
    const d4 = 3.75440866190742;

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    if (clamped < pLow) {
        const q = Math.sqrt(-2 * Math.log(clamped));
        return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6)
            / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    }

    if (clamped <= pHigh) {
        const q = clamped - 0.5;
        const r = q * q;
        return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q
            / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
    }

    const q = Math.sqrt(-2 * Math.log(1 - clamped));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6)
        / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
}

function createRng(seed: number) {
    let state = normalizeSeed(seed);
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function normalizeSeed(seed: number) {
    if (!Number.isFinite(seed)) {
        return 1;
    }
    const normalized = Math.abs(Math.floor(seed)) >>> 0;
    return normalized === 0 ? 1 : normalized;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}
