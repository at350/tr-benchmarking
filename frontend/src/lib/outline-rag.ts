import 'server-only';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

import { getOutlineFilePath, isValidOutlineFileName, readOutlineFileBuffer } from '@/lib/outlines';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_WORD_COUNT = 220;
const CHUNK_WORD_OVERLAP = 50;
const TOP_K = 6;
const PER_OUTLINE_LIMIT = 3;
const MAX_CONTEXT_CHARS = 6500;
const MAX_DENSE_POOL = 30;

type LegacyPdfParser = (buffer: Buffer) => Promise<{ text?: string }>;
type PdfParseClassLike = {
    new (options: { data: Buffer | Uint8Array }): {
        getText: () => Promise<{ text?: string }>;
        destroy: () => Promise<void>;
    };
    setWorker?: (workerSrc?: string) => string;
};
type ParsedPdfModule = {
    default?: LegacyPdfParser;
    PDFParse?: PdfParseClassLike;
};

type OutlineChunk = {
    chunkId: string;
    outlineId: string;
    fileName: string;
    fileHash: string;
    chunkIndex: number;
    text: string;
    tokens: string[];
    termFrequency: Map<string, number>;
    length: number;
    embeddingCacheKey: string;
};

type CachedOutlineDoc = {
    outlineId: string;
    fileName: string;
    cacheKey: string;
    fileHash: string;
    chunks: OutlineChunk[];
};

export type OutlineRetrievalSnippet = {
    outlineId: string;
    fileName: string;
    chunkIndex: number;
    text: string;
    score: number;
    sparseScore: number;
    denseScore: number | null;
};

export type OutlineRetrievalResult = {
    snippets: OutlineRetrievalSnippet[];
    contextBlock: string;
    retrievalMode: 'none' | 'sparse' | 'hybrid';
};

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it',
    'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'or', 'this', 'these',
    'those', 'into', 'their', 'them', 'there', 'which', 'what', 'when', 'where', 'while', 'about',
    'also', 'than', 'then', 'after', 'before', 'can', 'could', 'should', 'would', 'must', 'may',
    'might', 'not', 'no', 'yes', 'if', 'but', 'so', 'such', 'any', 'all', 'each', 'other', 'some',
]);

const outlineDocCache = new Map<string, CachedOutlineDoc>();
const embeddingCache = new Map<string, number[]>();

let openaiEmbeddingClient: OpenAI | null | undefined;
let pdfWorkerConfigured = false;

async function getPdfTextFromBuffer(buffer: Buffer) {
    const pdfParseModule = (await import('pdf-parse')) as ParsedPdfModule;
    if (typeof pdfParseModule.default === 'function') {
        const parsed = await pdfParseModule.default(buffer);
        return typeof parsed.text === 'string' ? parsed.text : '';
    }

    if (typeof pdfParseModule.PDFParse === 'function') {
        if (!pdfWorkerConfigured) {
            const workerCandidates = [
                path.resolve(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'),
                path.resolve(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs'),
                path.resolve(process.cwd(), 'frontend/node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'),
                path.resolve(process.cwd(), 'frontend/node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs'),
                path.resolve(process.cwd(), '../frontend/node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'),
                path.resolve(process.cwd(), '../frontend/node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs'),
            ];
                const workerPath = workerCandidates.find((candidate) => fs.existsSync(candidate));
                if (workerPath) {
                    try {
                        pdfParseModule.PDFParse.setWorker?.(workerPath);
                    } catch (error) {
                        console.error('Failed to configure pdf-parse worker path.', error);
                    }
                }
            pdfWorkerConfigured = true;
        }
        const parser = new pdfParseModule.PDFParse({ data: buffer });
        try {
            const parsed = await parser.getText();
            return typeof parsed.text === 'string' ? parsed.text : '';
        } finally {
            await parser.destroy();
        }
    }

    throw new Error('Failed to load PDF parser.');
}

function tokenize(text: string) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function buildTermFrequency(tokens: string[]) {
    const frequency = new Map<string, number>();
    for (const token of tokens) {
        frequency.set(token, (frequency.get(token) || 0) + 1);
    }
    return frequency;
}

function hashBuffer(buffer: Buffer) {
    return crypto.createHash('sha1').update(buffer).digest('hex');
}

function hashText(text: string) {
    return crypto.createHash('sha1').update(text).digest('hex');
}

function normalizeWhitespace(text: string) {
    return text
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function chunkText(
    text: string,
    outlineId: string,
    fileName: string,
    fileHash: string,
) {
    const words = normalizeWhitespace(text).split(/\s+/).filter(Boolean);
    const chunks: OutlineChunk[] = [];
    if (words.length === 0) {
        return chunks;
    }

    const step = Math.max(20, CHUNK_WORD_COUNT - CHUNK_WORD_OVERLAP);
    for (let start = 0; start < words.length; start += step) {
        const slice = words.slice(start, start + CHUNK_WORD_COUNT);
        if (slice.length < 35) {
            continue;
        }
        const chunkTextValue = slice.join(' ').trim();
        if (!chunkTextValue) {
            continue;
        }
        const tokens = tokenize(chunkTextValue);
        if (tokens.length < 15) {
            continue;
        }
        const chunkIndex = chunks.length;
        chunks.push({
            chunkId: `${outlineId}::${chunkIndex}`,
            outlineId,
            fileName,
            fileHash,
            chunkIndex,
            text: chunkTextValue,
            tokens,
            termFrequency: buildTermFrequency(tokens),
            length: tokens.length,
            embeddingCacheKey: `${EMBEDDING_MODEL}:${fileHash}:${chunkIndex}`,
        });
    }
    return chunks;
}

async function loadOutlineDoc(outlineId: string): Promise<CachedOutlineDoc | null> {
    if (!isValidOutlineFileName(outlineId)) {
        return null;
    }
    const fullPath = getOutlineFilePath(outlineId);
    if (!fullPath) {
        return null;
    }
    const stats = fs.statSync(fullPath);
    const cacheKey = `${stats.size}:${stats.mtimeMs}`;
    const cached = outlineDocCache.get(outlineId);
    if (cached && cached.cacheKey === cacheKey) {
        return cached;
    }

    const buffer = readOutlineFileBuffer(outlineId);
    if (!buffer) {
        return null;
    }

    let text = '';
    try {
        text = await getPdfTextFromBuffer(buffer);
    } catch (error) {
        console.error(`Failed to parse outline PDF "${outlineId}".`, error);
        return null;
    }
    const fileHash = hashBuffer(buffer);
    const chunks = chunkText(text, outlineId, outlineId, fileHash);

    const doc: CachedOutlineDoc = {
        outlineId,
        fileName: outlineId,
        cacheKey,
        fileHash,
        chunks,
    };
    outlineDocCache.set(outlineId, doc);
    return doc;
}

function computeBm25Scores(chunks: OutlineChunk[], queryTokens: string[]) {
    const uniqueQueryTerms = Array.from(new Set(queryTokens));
    if (chunks.length === 0 || uniqueQueryTerms.length === 0) {
        return new Map<string, number>();
    }

    const avgLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length;
    const k1 = 1.2;
    const b = 0.75;
    const scores = new Map<string, number>();
    const docFrequency = new Map<string, number>();

    for (const term of uniqueQueryTerms) {
        let df = 0;
        for (const chunk of chunks) {
            if (chunk.termFrequency.has(term)) {
                df += 1;
            }
        }
        docFrequency.set(term, df);
    }

    for (const chunk of chunks) {
        let score = 0;
        for (const term of uniqueQueryTerms) {
            const tf = chunk.termFrequency.get(term) || 0;
            if (tf <= 0) {
                continue;
            }
            const df = docFrequency.get(term) || 0;
            const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
            const denom = tf + k1 * (1 - b + b * (chunk.length / Math.max(avgLength, 1)));
            score += idf * ((tf * (k1 + 1)) / Math.max(denom, 1e-9));
        }
        scores.set(chunk.chunkId, score);
    }

    return scores;
}

function getEmbeddingClient() {
    if (openaiEmbeddingClient !== undefined) {
        return openaiEmbeddingClient;
    }
    if (!process.env.OPENAI_API_KEY) {
        openaiEmbeddingClient = null;
        return openaiEmbeddingClient;
    }
    openaiEmbeddingClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiEmbeddingClient;
}

async function embedTexts(texts: string[]) {
    const client = getEmbeddingClient();
    if (!client || texts.length === 0) {
        return null;
    }
    try {
        const response = await client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: texts,
        });
        return response.data.map((item) => item.embedding);
    } catch (error) {
        console.error('Outline embedding retrieval failed; falling back to sparse retrieval.', error);
        return null;
    }
}

function cosineSimilarity(a: number[], b: number[]) {
    if (a.length === 0 || a.length !== b.length) {
        return 0;
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA <= 0 || normB <= 0) {
        return 0;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeScores(values: number[]) {
    if (values.length === 0) {
        return [] as number[];
    }
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min) {
        return values.map(() => (max > 0 ? 1 : 0));
    }
    return values.map((value) => (value - min) / (max - min));
}

function buildContextBlock(
    stageLabel: string,
    snippets: OutlineRetrievalSnippet[],
    mode: 'none' | 'sparse' | 'hybrid',
) {
    if (snippets.length === 0) {
        return '';
    }
    const lines: string[] = [
        `Outline RAG context (${stageLabel}, mode=${mode}).`,
        'Use these snippets as reference material. They are excerpts, not full documents.',
        '',
    ];
    for (let i = 0; i < snippets.length; i += 1) {
        const snippet = snippets[i];
        lines.push(
            `[Snippet ${i + 1}] source=${snippet.fileName} chunk=${snippet.chunkIndex + 1} score=${snippet.score.toFixed(4)}`,
            snippet.text,
            '',
        );
    }
    return lines.join('\n').trim();
}

export async function retrieveOutlineContext({
    selectedOutlineIds,
    query,
    stageLabel,
    topK = TOP_K,
    perOutlineLimit = PER_OUTLINE_LIMIT,
    maxContextChars = MAX_CONTEXT_CHARS,
}: {
    selectedOutlineIds: string[];
    query: string;
    stageLabel: string;
    topK?: number;
    perOutlineLimit?: number;
    maxContextChars?: number;
}): Promise<OutlineRetrievalResult> {
    const outlineIds = Array.from(new Set(selectedOutlineIds.filter((id) => isValidOutlineFileName(id))));
    const trimmedQuery = query.trim();
    if (outlineIds.length === 0 || trimmedQuery.length === 0) {
        return { snippets: [], contextBlock: '', retrievalMode: 'none' };
    }

    const docs = (await Promise.all(outlineIds.map((outlineId) => loadOutlineDoc(outlineId))))
        .filter((doc): doc is CachedOutlineDoc => doc !== null);
    const allChunks = docs.flatMap((doc) => doc.chunks);
    if (allChunks.length === 0) {
        return { snippets: [], contextBlock: '', retrievalMode: 'none' };
    }

    const queryTokens = tokenize(trimmedQuery);
    const sparseScores = computeBm25Scores(allChunks, queryTokens);

    const sortedBySparse = [...allChunks].sort(
        (a, b) => (sparseScores.get(b.chunkId) || 0) - (sparseScores.get(a.chunkId) || 0)
    );
    const densePool = sortedBySparse.slice(0, Math.min(MAX_DENSE_POOL, sortedBySparse.length));

    const queryEmbeddingCacheKey = `${EMBEDDING_MODEL}:query:${hashText(trimmedQuery)}`;
    let queryEmbedding = embeddingCache.get(queryEmbeddingCacheKey);
    if (!queryEmbedding) {
        const embedded = await embedTexts([trimmedQuery]);
        if (embedded && embedded[0]) {
            queryEmbedding = embedded[0];
            embeddingCache.set(queryEmbeddingCacheKey, queryEmbedding);
        }
    }

    const denseScores = new Map<string, number>();
    let hasDenseScores = false;

    if (queryEmbedding && densePool.length > 0) {
        const missingTexts: string[] = [];
        const missingKeys: string[] = [];
        for (const chunk of densePool) {
            if (!embeddingCache.has(chunk.embeddingCacheKey)) {
                missingTexts.push(chunk.text);
                missingKeys.push(chunk.embeddingCacheKey);
            }
        }
        if (missingTexts.length > 0) {
            const embedded = await embedTexts(missingTexts);
            if (embedded && embedded.length === missingKeys.length) {
                for (let i = 0; i < missingKeys.length; i += 1) {
                    embeddingCache.set(missingKeys[i], embedded[i]);
                }
            }
        }

        for (const chunk of densePool) {
            const chunkEmbedding = embeddingCache.get(chunk.embeddingCacheKey);
            if (!chunkEmbedding) {
                continue;
            }
            denseScores.set(chunk.chunkId, cosineSimilarity(queryEmbedding, chunkEmbedding));
        }
        hasDenseScores = denseScores.size > 0;
    }

    const sparseValues = allChunks.map((chunk) => sparseScores.get(chunk.chunkId) || 0);
    const sparseNormalized = normalizeScores(sparseValues);
    const sparseByChunk = new Map<string, number>();
    for (let i = 0; i < allChunks.length; i += 1) {
        sparseByChunk.set(allChunks[i].chunkId, sparseNormalized[i]);
    }

    const denseValues = allChunks.map((chunk) => denseScores.get(chunk.chunkId) || 0);
    const denseNormalized = normalizeScores(denseValues);
    const denseByChunk = new Map<string, number>();
    for (let i = 0; i < allChunks.length; i += 1) {
        denseByChunk.set(allChunks[i].chunkId, denseNormalized[i]);
    }

    const ranked = allChunks
        .map((chunk) => {
            const sparse = sparseScores.get(chunk.chunkId) || 0;
            const dense = denseScores.get(chunk.chunkId);
            const sparseNorm = sparseByChunk.get(chunk.chunkId) || 0;
            const denseNorm = denseByChunk.get(chunk.chunkId) || 0;
            const score = hasDenseScores
                ? (0.65 * denseNorm + 0.35 * sparseNorm)
                : sparseNorm;
            return {
                chunk,
                sparseScore: sparse,
                denseScore: dense ?? null,
                score,
            };
        })
        .sort((a, b) => b.score - a.score);

    const perOutlineCounts = new Map<string, number>();
    const snippets: OutlineRetrievalSnippet[] = [];
    let currentChars = 0;
    const safeTopK = Math.max(1, topK);
    const safePerOutlineLimit = Math.max(1, perOutlineLimit);
    const safeMaxChars = Math.max(1000, maxContextChars);

    for (const row of ranked) {
        if (snippets.length >= safeTopK) {
            break;
        }
        const countForOutline = perOutlineCounts.get(row.chunk.outlineId) || 0;
        if (countForOutline >= safePerOutlineLimit) {
            continue;
        }
        if (currentChars + row.chunk.text.length > safeMaxChars && snippets.length > 0) {
            continue;
        }

        snippets.push({
            outlineId: row.chunk.outlineId,
            fileName: row.chunk.fileName,
            chunkIndex: row.chunk.chunkIndex,
            text: row.chunk.text,
            score: row.score,
            sparseScore: row.sparseScore,
            denseScore: row.denseScore,
        });
        perOutlineCounts.set(row.chunk.outlineId, countForOutline + 1);
        currentChars += row.chunk.text.length;
    }

    const retrievalMode: 'none' | 'sparse' | 'hybrid' = snippets.length === 0
        ? 'none'
        : (hasDenseScores ? 'hybrid' : 'sparse');

    return {
        snippets,
        contextBlock: buildContextBlock(stageLabel, snippets, retrievalMode),
        retrievalMode,
    };
}
