export type BenchmarkMode = 'main' | 'forced_tests' | 'single_probe' | 'single_probe_multi_model';

export type SavedBenchmarkRun = {
    id: string;
    savedAt: string;
    mode: BenchmarkMode;
    title: string;
    config: Record<string, unknown>;
    summary: Record<string, unknown> | null;
    results: Array<Record<string, unknown>>;
};

export type RunMetric = {
    label: string;
    value: string;
    detailLabel: string;
    detailValue: string;
};

export type ConfigDiffRow = {
    key: string;
    differs: boolean;
    values: Record<string, string>;
};

export type CombinedResultRow = {
    runId: string;
    runTitle: string;
    resultId: string;
    outcome: string;
    details: string;
};

export function extractRunMetric(run: SavedBenchmarkRun): RunMetric {
    const summary = run.summary || {};

    if (typeof summary.accuracy === 'number') {
        const total = typeof summary.total === 'number' ? summary.total : run.results.length;
        const correct = typeof summary.correct === 'number' ? summary.correct : Math.round(summary.accuracy * total);
        return {
            label: 'Accuracy',
            value: `${(summary.accuracy * 100).toFixed(1)}%`,
            detailLabel: 'Correct/Total',
            detailValue: `${correct}/${total}`,
        };
    }

    if (typeof summary.meanScore === 'number') {
        const scored = typeof summary.scoredCount === 'number' ? summary.scoredCount : run.results.length;
        return {
            label: 'Mean Score',
            value: summary.meanScore.toFixed(1),
            detailLabel: 'Scored',
            detailValue: `${scored}`,
        };
    }

    if (typeof summary.correct === 'number' && typeof summary.total === 'number') {
        const accuracy = summary.total > 0 ? summary.correct / summary.total : 0;
        return {
            label: 'Accuracy',
            value: `${(accuracy * 100).toFixed(1)}%`,
            detailLabel: 'Correct/Total',
            detailValue: `${summary.correct}/${summary.total}`,
        };
    }

    return {
        label: 'Results',
        value: `${run.results.length}`,
        detailLabel: 'Mode',
        detailValue: run.mode,
    };
}

export function buildConfigDiffRows(runs: SavedBenchmarkRun[]) {
    const runConfigMaps = runs.map((run) => ({
        runId: run.id,
        values: flattenConfig(run.config),
    }));

    const keys = new Set<string>();
    for (const runMap of runConfigMaps) {
        for (const key of runMap.values.keys()) {
            keys.add(key);
        }
    }

    const rows: ConfigDiffRow[] = Array.from(keys).map((key) => {
        const values: Record<string, string> = {};
        const observed = new Set<string>();

        for (const runMap of runConfigMaps) {
            const value = runMap.values.get(key) || 'N/A';
            values[runMap.runId] = value;
            observed.add(value);
        }

        return {
            key,
            values,
            differs: observed.size > 1,
        };
    });

    return rows.sort((a, b) => {
        if (a.differs !== b.differs) {
            return a.differs ? -1 : 1;
        }
        return a.key.localeCompare(b.key);
    });
}

export function buildCombinedResultRows(runs: SavedBenchmarkRun[], limitPerRun = 5) {
    const rows: CombinedResultRow[] = [];

    for (const run of runs) {
        const sample = run.results.slice(0, limitPerRun);
        for (const item of sample) {
            rows.push({
                runId: run.id,
                runTitle: run.title,
                resultId: getResultId(item),
                outcome: getResultOutcome(item),
                details: getResultDetails(item),
            });
        }
    }

    return rows;
}

function flattenConfig(config: Record<string, unknown>) {
    const result = new Map<string, string>();

    const visit = (value: unknown, path: string, depth: number) => {
        if (depth > 3) {
            result.set(path, safeStringify(value));
            return;
        }

        if (Array.isArray(value)) {
            result.set(path, safeStringify(value));
            return;
        }

        if (isRecord(value)) {
            const entries = Object.entries(value);
            if (entries.length === 0) {
                result.set(path, '{}');
                return;
            }

            for (const [key, child] of entries) {
                const nextPath = path ? `${path}.${key}` : key;
                visit(child, nextPath, depth + 1);
            }
            return;
        }

        result.set(path, formatPrimitive(value));
    };

    visit(config, '', 0);
    if (result.has('')) {
        const rootValue = result.get('') || 'N/A';
        result.delete('');
        result.set('config', rootValue);
    }
    return result;
}

function formatPrimitive(value: unknown) {
    if (value === null || typeof value === 'undefined') {
        return 'N/A';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return safeStringify(value);
}

function safeStringify(value: unknown) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function getResultId(item: Record<string, unknown>) {
    const candidateKeys = ['questionId', 'itemId', 'id'];
    for (const key of candidateKeys) {
        const value = item[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
    }
    return 'result';
}

function getResultOutcome(item: Record<string, unknown>) {
    if (typeof item.isCorrect === 'boolean') {
        return item.isCorrect ? 'Correct' : 'Incorrect';
    }

    const judge = item.judge;
    if (isRecord(judge) && typeof judge.overallScore === 'number') {
        return `Judge ${judge.overallScore}`;
    }

    if (typeof item.parsedChoice === 'string') {
        return `Choice ${item.parsedChoice}`;
    }

    return 'N/A';
}

function getResultDetails(item: Record<string, unknown>) {
    if (typeof item.model === 'string') {
        return item.model;
    }
    if (typeof item.topic === 'string') {
        return item.topic;
    }
    if (typeof item.subfield === 'string') {
        return item.subfield;
    }
    return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
