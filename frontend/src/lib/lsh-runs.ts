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
    schema?: string;
};

export type LshRunSummary = {
    fileName: string;
    runId: string;
    timestamp: string | null;
    modifiedAt: string;
    method: string;
    schema: string;
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
    schema: string;
    metadata: Record<string, unknown>;
    totalClusters: number;
    totalMembers: number;
    clusters: LshClusterSummary[];
};

export type LshClusterJudgeMember = {
    id: string;
    model: string;
    text: string;
};

export type LshClusterJudgePayload = {
    fileName: string;
    clusterId: string;
    representative: {
        id: string;
        model: string;
        text: string;
    };
    members: LshClusterJudgeMember[];
    modelBreakdown: Array<{
        model: string;
        count: number;
    }>;
};

function resolveResultsDirectories() {
    // Return all existing result directories
    const candidates = [
        path.resolve(process.cwd(), '../lsh/results'),
        path.resolve(process.cwd(), 'lsh/results'),
        path.resolve(process.cwd(), '../lsh-IRAC/results'),
        path.resolve(process.cwd(), 'lsh-IRAC/results'),
    ];

    return candidates.filter(candidate => fs.existsSync(candidate));
}

function resolveRunFileLocation(fileName: string): string | null {
    const directories = resolveResultsDirectories();
    for (const dir of directories) {
        const fullPath = path.join(dir, fileName);
        if (fs.existsSync(fullPath)) {
            return fullPath;
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

function extractRepresentativeText(entry: unknown): string {
    if (!entry || typeof entry !== 'object') return '';
    const obj = entry as Record<string, unknown>;

    if (typeof obj.text === 'string') return obj.text;

    // Check for IRAC schema
    const formatted = [];
    if (typeof obj.issue === 'string' && obj.issue.trim()) formatted.push(`Issue: ${obj.issue.trim()}`);
    if (typeof obj.rule === 'string' && obj.rule.trim()) formatted.push(`Rule: ${obj.rule.trim()}`);
    if (typeof obj.application === 'string' && obj.application.trim()) formatted.push(`Application: ${obj.application.trim()}`);
    if (typeof obj.conclusion === 'string' && obj.conclusion.trim()) formatted.push(`Conclusion: ${obj.conclusion.trim()}`);

    if (formatted.length > 0) {
        return formatted.join('\n\n');
    }

    return '';
}

function toTextPreview(value: unknown) {
    const text = extractRepresentativeText(value).replace(/\s+/g, ' ').trim();
    if (text.length <= MAX_TEXT_PREVIEW_LENGTH) {
        return text;
    }
    return `${text.slice(0, MAX_TEXT_PREVIEW_LENGTH - 3)}...`;
}

function normalizeMembers(value: unknown): RawTextEntry[] {
    return Array.isArray(value) ? (value as RawTextEntry[]) : [];
}

function buildModelBreakdown(members: RawTextEntry[]) {
    const modelBreakdownMap = new Map<string, number>();
    for (const member of members) {
        const model = toSafeString(member.model, 'unknown');
        modelBreakdownMap.set(model, (modelBreakdownMap.get(model) || 0) + 1);
    }

    return Array.from(modelBreakdownMap.entries())
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.model.localeCompare(b.model);
        });
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
    // Legacy support for things not updated to the list approach yet
    const dirs = resolveResultsDirectories();
    return dirs.length > 0 ? dirs[0] : null;
}

export function listLshRunSummaries(): LshRunSummary[] {
    const resultsDirectories = resolveResultsDirectories();

    if (resultsDirectories.length === 0) {
        return [];
    }

    const summaries: LshRunSummary[] = [];

    for (const resultsDirectory of resultsDirectories) {
        const files = fs.readdirSync(resultsDirectory)
            .filter((fileName) => isValidRunFileName(fileName));

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
                    schema: toSafeString(metadata.schema, 'Standard'),
                    totalItems: toSafeNumber(metadata.total_items, inferredTotalItems),
                    numClusters: toSafeNumber(metadata.num_clusters, clusterEntries.length),
                    largestClusterSize: clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0,
                });
            } catch (error) {
                console.error(`Skipping malformed run file: ${fileName}`, error);
            }
        }
    }

    return summaries.sort((a, b) => b.fileName.localeCompare(a.fileName));
}

export function getLshRunDetails(fileName: string): LshRunDetails | null {
    if (!isValidRunFileName(fileName)) {
        return null;
    }

    const fullPath = resolveRunFileLocation(fileName);
    if (!fullPath) {
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
        const modelBreakdown = buildModelBreakdown(members);

        return {
            id,
            size: members.length,
            representative: {
                id: toSafeString(representative.id, 'N/A'),
                model: toSafeString(representative.model, 'unknown'),
                textPreview: toTextPreview(representative), // Pass the whole object for extraction
            },
            modelBreakdown,
            membersPreview: members.slice(0, MAX_MEMBER_PREVIEW_COUNT).map((member) => ({
                id: toSafeString(member.id, 'unknown'),
                model: toSafeString(member.model, 'unknown'),
                textPreview: toTextPreview(member), // Pass the whole object for extraction
            })),
        };
    });

    return {
        fileName,
        runId: fileName.replace(/\.json$/, ''),
        timestamp: parseRunTimestamp(fileName),
        modifiedAt: stats.mtime.toISOString(),
        metadata,
        schema: toSafeString(metadata.schema, 'Standard'),
        totalClusters: clusterSummaries.length,
        totalMembers,
        clusters: clusterSummaries,
    };
}

export function getLshClusterJudgePayload(fileName: string, clusterId: string): LshClusterJudgePayload | null {
    if (!isValidRunFileName(fileName)) {
        return null;
    }

    const fullPath = resolveRunFileLocation(fileName);
    if (!fullPath) {
        return null;
    }

    const run = readRunFile(fullPath);
    const clusters = run.clusters || {};
    const cluster = clusters[clusterId];
    if (!cluster) {
        return null;
    }

    const representative = cluster.representative || {};
    const members = normalizeMembers(cluster.members);
    const normalizedMembers = members.map((member) => ({
        id: toSafeString(member.id, 'unknown'),
        model: toSafeString(member.model, 'unknown'),
        text: extractRepresentativeText(member),
    }));

    return {
        fileName,
        clusterId,
        representative: {
            id: toSafeString(representative.id, 'N/A'),
            model: toSafeString(representative.model, 'unknown'),
            text: extractRepresentativeText(representative),
        },
        members: normalizedMembers,
        modelBreakdown: buildModelBreakdown(members),
    };
}
