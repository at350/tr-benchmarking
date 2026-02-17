import 'server-only';

import fs from 'fs';
import path from 'path';

const RUN_FILE_NAME_PATTERN = /^run_\d{8}_\d{6}\.json$/;
const MAX_TEXT_PREVIEW_LENGTH = 240;
const MAX_MEMBER_PREVIEW_COUNT = 8;

type RawTextEntry = {
    id?: unknown;
    model?: unknown;
    text?: unknown;
};

type RawCluster = {
    representative?: RawTextEntry;
    members?: unknown;
};

type RawRunFile = {
    metadata?: Record<string, unknown>;
    clusters?: Record<string, RawCluster>;
};

export type LshRunSummary = {
    fileName: string;
    runId: string;
    timestamp: string | null;
    modifiedAt: string;
    method: string;
    totalItems: number;
    numClusters: number;
    largestClusterSize: number;
};

export type LshClusterSummary = {
    id: string;
    size: number;
    representative: {
        id: string;
        model: string;
        textPreview: string;
    };
    modelBreakdown: Array<{
        model: string;
        count: number;
    }>;
    membersPreview: Array<{
        id: string;
        model: string;
        textPreview: string;
    }>;
};

export type LshRunDetails = {
    fileName: string;
    runId: string;
    timestamp: string | null;
    modifiedAt: string;
    metadata: Record<string, unknown>;
    totalClusters: number;
    totalMembers: number;
    clusters: LshClusterSummary[];
};

function resolveResultsDirectory() {
    const candidates = [
        path.resolve(process.cwd(), '../lsh/results'),
        path.resolve(process.cwd(), 'lsh/results'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function parseRunTimestamp(fileName: string) {
    const match = /^run_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json$/.exec(fileName);
    if (!match) {
        return null;
    }

    const [, year, month, day, hour, minute, second] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function readRunFile(filePath: string): RawRunFile {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as RawRunFile;
    return parsed;
}

function toSafeString(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function toSafeNumber(value: unknown, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toTextPreview(value: unknown) {
    const text = toSafeString(value, '').replace(/\s+/g, ' ').trim();
    if (text.length <= MAX_TEXT_PREVIEW_LENGTH) {
        return text;
    }
    return `${text.slice(0, MAX_TEXT_PREVIEW_LENGTH - 3)}...`;
}

function normalizeMembers(value: unknown): RawTextEntry[] {
    return Array.isArray(value) ? (value as RawTextEntry[]) : [];
}

function sortClusterEntries(entries: Array<{ id: string; size: number }>) {
    return entries.sort((a, b) => {
        if (b.size !== a.size) {
            return b.size - a.size;
        }
        return a.id.localeCompare(b.id);
    });
}

export function isValidRunFileName(fileName: string) {
    return RUN_FILE_NAME_PATTERN.test(fileName);
}

export function getLshResultsDirectory() {
    return resolveResultsDirectory();
}

export function listLshRunSummaries(): LshRunSummary[] {
    const resultsDirectory = resolveResultsDirectory();
    if (!resultsDirectory) {
        return [];
    }

    const files = fs.readdirSync(resultsDirectory)
        .filter((fileName) => isValidRunFileName(fileName))
        .sort((a, b) => b.localeCompare(a));

    const summaries: LshRunSummary[] = [];

    for (const fileName of files) {
        const fullPath = path.join(resultsDirectory, fileName);

        try {
            const stats = fs.statSync(fullPath);
            const run = readRunFile(fullPath);
            const clusters = run.clusters || {};
            const clusterEntries = Object.entries(clusters);
            const clusterSizes = clusterEntries.map(([, cluster]) => normalizeMembers(cluster.members).length);
            const inferredTotalItems = clusterSizes.reduce((total, size) => total + size, 0);
            const metadata = run.metadata || {};

            summaries.push({
                fileName,
                runId: fileName.replace(/\.json$/, ''),
                timestamp: parseRunTimestamp(fileName),
                modifiedAt: stats.mtime.toISOString(),
                method: toSafeString(metadata.method, 'unknown'),
                totalItems: toSafeNumber(metadata.total_items, inferredTotalItems),
                numClusters: toSafeNumber(metadata.num_clusters, clusterEntries.length),
                largestClusterSize: clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0,
            });
        } catch (error) {
            console.error(`Skipping malformed run file: ${fileName}`, error);
        }
    }

    return summaries;
}

export function getLshRunDetails(fileName: string): LshRunDetails | null {
    if (!isValidRunFileName(fileName)) {
        return null;
    }

    const resultsDirectory = resolveResultsDirectory();
    if (!resultsDirectory) {
        return null;
    }

    const fullPath = path.join(resultsDirectory, fileName);
    if (!fs.existsSync(fullPath)) {
        return null;
    }

    const stats = fs.statSync(fullPath);
    const run = readRunFile(fullPath);
    const metadata = run.metadata || {};
    const clusters = run.clusters || {};

    const sortedClusterKeys = sortClusterEntries(
        Object.entries(clusters).map(([clusterId, cluster]) => ({
            id: clusterId,
            size: normalizeMembers(cluster.members).length,
        }))
    );

    let totalMembers = 0;

    const clusterSummaries: LshClusterSummary[] = sortedClusterKeys.map(({ id }) => {
        const cluster = clusters[id];
        const representative = cluster?.representative || {};
        const members = normalizeMembers(cluster?.members);
        totalMembers += members.length;

        const modelBreakdownMap = new Map<string, number>();
        for (const member of members) {
            const model = toSafeString(member.model, 'unknown');
            modelBreakdownMap.set(model, (modelBreakdownMap.get(model) || 0) + 1);
        }

        const modelBreakdown = Array.from(modelBreakdownMap.entries())
            .map(([model, count]) => ({ model, count }))
            .sort((a, b) => {
                if (b.count !== a.count) {
                    return b.count - a.count;
                }
                return a.model.localeCompare(b.model);
            });

        return {
            id,
            size: members.length,
            representative: {
                id: toSafeString(representative.id, 'N/A'),
                model: toSafeString(representative.model, 'unknown'),
                textPreview: toTextPreview(representative.text),
            },
            modelBreakdown,
            membersPreview: members.slice(0, MAX_MEMBER_PREVIEW_COUNT).map((member) => ({
                id: toSafeString(member.id, 'unknown'),
                model: toSafeString(member.model, 'unknown'),
                textPreview: toTextPreview(member.text),
            })),
        };
    });

    return {
        fileName,
        runId: fileName.replace(/\.json$/, ''),
        timestamp: parseRunTimestamp(fileName),
        modifiedAt: stats.mtime.toISOString(),
        metadata,
        totalClusters: clusterSummaries.length,
        totalMembers,
        clusters: clusterSummaries,
    };
}
