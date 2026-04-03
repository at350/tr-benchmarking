'use server';

import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

import OpenAI from 'openai';

import type {
    ArtifactRecord,
    ArtifactRole,
    DashaClusterRecord,
    DashaResponseRecord,
    DashaRun,
    DashaSelectedModel,
    DomainCentroidEvaluation,
    DomainCentroidDifference,
    DomainResult,
    FrankAnalysisDomain,
    FrankCaseCandidate,
    FrankPacket,
    KarthicCriterion,
    KarthicDomain,
    KarthicGoldenDomainTarget,
    KarthicRubricPack,
    ModelProvider,
    ReasoningEffort,
    RefinementLogEntry,
    SourceExtraction,
    SourceIntake,
    WeightedSummary,
} from '@/lib/legal-workflow-types';

type FrankDraftInput = {
    legalDomain: string;
    domainScope: string;
    sourceFamily: string;
    files: Array<{ role: ArtifactRole; fileName: string; bytes: Uint8Array }>;
};

type SaveFrankInput = {
    id?: string;
    legalDomain: string;
    domainScope: string;
    sourceFamily: string;
    selectedCase?: FrankCaseCandidate | null;
    analysisDomains?: FrankAnalysisDomain[];
    sourceIntake?: SourceIntake;
    sourceExtraction?: SourceExtraction;
    benchmarkAnswer?: string;
    benchmarkQuestion?: string;
    failureModeSeeds?: string[];
    masterIssueStatement?: string;
    sourceArtifacts?: ArtifactRecord[];
    status?: FrankPacket['status'];
};

type SearchFrankCasesInput = {
    legalDomain: string;
};

type DraftFrankAnalysisDomainsInput = {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    desiredCount?: number;
};

type GenerateFrankGoldenResponseInput = {
    id?: string;
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
};

type GenerateFrankQuestionPacketInput = {
    id?: string;
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
    benchmarkAnswer: string;
};

type SaveKarthicInput = {
    id?: string;
    frankPacketId: string;
    domains: KarthicDomain[];
    goldenTargets?: KarthicGoldenDomainTarget[];
    criteria?: KarthicCriterion[];
    refinementLog?: RefinementLogEntry[];
    smeNotes?: string;
    comparisonMethodNote?: string;
    status?: KarthicRubricPack['status'];
};

type DraftKarthicDomainsInput = {
    frankPacketId: string;
};

type GenerateKarthicGoldenTargetsInput = {
    id?: string;
    frankPacketId: string;
    domains: KarthicDomain[];
    smeNotes?: string;
};

type RefineKarthicInput = {
    packId: string;
    contrastiveStrongAnswer?: string;
    contrastiveMediocreAnswer?: string;
    domainIds?: string[];
};

type DashaRunInput = {
    rubricPackId: string;
    files: Array<{ role: ArtifactRole; fileName: string; bytes: Uint8Array }>;
    selectedModels: DashaSelectedModel[];
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const execFileAsync = promisify(execFile);

const DATA_DIRECTORIES = {
    frank: 'frank-packets',
    karthic: 'karthic-rubric-packs',
    dasha: 'dasha-runs',
    artifacts: 'artifacts',
} as const;

export async function listFrankPackets() {
    return await listArtifacts<FrankPacket>(DATA_DIRECTORIES.frank);
}

export async function getFrankPacket(id: string) {
    return await readArtifact<FrankPacket>(DATA_DIRECTORIES.frank, id);
}

export async function draftFrankPacket(input: FrankDraftInput): Promise<FrankPacket> {
    const now = new Date().toISOString();
    const id = `frank_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const sourceArtifacts = await saveUploadedArtifacts(id, input.files);
    const combinedText = sourceArtifacts
        .map((artifact) => `# ${artifact.role}\n${artifact.extractedText}`.trim())
        .join('\n\n')
        .trim();
    const draft = await generateFrankDraft({
        legalDomain: input.legalDomain,
        domainScope: input.domainScope,
        sourceFamily: input.sourceFamily,
        combinedText,
    });

    const packet: FrankPacket = {
        id,
        status: 'draft',
        legalDomain: input.legalDomain.trim(),
        domainScope: input.domainScope.trim(),
        sourceFamily: input.sourceFamily.trim(),
        selectedCase: null,
        analysisDomains: [],
        sourceArtifacts,
        sourceIntake: draft.sourceIntake,
        sourceExtraction: draft.sourceExtraction,
        benchmarkAnswer: draft.benchmarkAnswer,
        benchmarkQuestion: draft.benchmarkQuestion,
        failureModeSeeds: draft.failureModeSeeds,
        masterIssueStatement: draft.masterIssueStatement,
        approvedAt: null,
        createdAt: now,
        updatedAt: now,
    };

    await writeArtifact(DATA_DIRECTORIES.frank, packet.id, packet);
    return packet;
}

export async function saveFrankPacket(input: SaveFrankInput): Promise<FrankPacket> {
    const existing = input.id ? await getFrankPacket(input.id) : null;
    const now = new Date().toISOString();
    const selectedCase = normalizeFrankCaseCandidate(input.selectedCase ?? existing?.selectedCase ?? null);
    const analysisDomains = normalizeFrankAnalysisDomains(input.analysisDomains ?? existing?.analysisDomains ?? []);
    const fallbackSourceIntake = buildFrankSourceIntakeFallback(selectedCase);
    const fallbackSourceExtraction = buildFrankSourceExtractionFallback({
        legalDomain: input.legalDomain,
        selectedCase,
        analysisDomains,
    });
    const benchmarkAnswer = normalizeOptionalString(input.benchmarkAnswer, existing?.benchmarkAnswer ?? '');
    const benchmarkQuestion = normalizeOptionalString(input.benchmarkQuestion, existing?.benchmarkQuestion ?? '');
    const masterIssueStatement = normalizeOptionalString(
        input.masterIssueStatement,
        existing?.masterIssueStatement ?? selectedCase?.relevance ?? `Analyze ${input.legalDomain.trim()} using the selected anchor case.`,
    );

    const packet: FrankPacket = {
        id: existing?.id ?? `frank_${Date.now()}_${randomUUID().slice(0, 8)}`,
        status: input.status ?? existing?.status ?? 'draft',
        legalDomain: input.legalDomain.trim(),
        domainScope: normalizeOptionalString(input.domainScope, existing?.domainScope ?? selectedCase?.title ?? input.legalDomain.trim()),
        sourceFamily: normalizeOptionalString(input.sourceFamily, existing?.sourceFamily ?? 'web_searched_anchor_case'),
        selectedCase,
        analysisDomains,
        sourceArtifacts: input.sourceArtifacts ?? existing?.sourceArtifacts ?? [],
        sourceIntake: input.sourceIntake
            ? normalizeSourceIntake(input.sourceIntake, fallbackSourceIntake)
            : existing?.sourceIntake ?? fallbackSourceIntake,
        sourceExtraction: input.sourceExtraction
            ? normalizeSourceExtraction(input.sourceExtraction, fallbackSourceExtraction)
            : existing?.sourceExtraction ?? fallbackSourceExtraction,
        benchmarkAnswer,
        benchmarkQuestion,
        failureModeSeeds: normalizeStringArray(input.failureModeSeeds ?? existing?.failureModeSeeds ?? []),
        masterIssueStatement,
        approvedAt: input.status === 'approved' ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    if (packet.status === 'approved') {
        if (!packet.selectedCase) {
            throw new Error('Select an anchor case before approving Frank.');
        }
        if (packet.analysisDomains.length === 0) {
            throw new Error('Draft at least one analysis domain before approving Frank.');
        }
        if (!packet.benchmarkAnswer.trim()) {
            throw new Error('Generate the golden response before approving Frank.');
        }
        if (!packet.benchmarkQuestion.trim()) {
            throw new Error('Generate the question packet before approving Frank.');
        }
    }

    await writeArtifact(DATA_DIRECTORIES.frank, packet.id, packet);
    return packet;
}

export async function searchFrankCaseCandidates(input: SearchFrankCasesInput): Promise<FrankCaseCandidate[]> {
    const legalDomain = input.legalDomain.trim();
    if (!legalDomain) {
        throw new Error('legalDomain is required.');
    }

    const fallback = buildFallbackFrankCaseCandidates(legalDomain);
    if (!process.env.OPENAI_API_KEY) {
        return fallback;
    }

    try {
        const response = await openai.responses.create({
            model: 'gpt-5-mini',
            input: [
                `Legal domain: ${legalDomain}`,
                '',
                'Search the open web for 3-5 strong U.S. anchor cases that could ground a benchmarking packet.',
                'Prefer cases that are well-known, teachable, and have a clear holding.',
                'Return concise results only.',
            ].join('\n'),
            tools: [{
                type: 'web_search_preview',
                search_context_size: 'medium',
                user_location: {
                    type: 'approximate',
                    city: 'Chicago',
                    region: 'Illinois',
                    country: 'US',
                },
            }],
            include: ['web_search_call.action.sources'],
            text: {
                verbosity: 'medium',
                format: {
                    type: 'json_schema',
                    name: 'frank_case_search',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            candidates: {
                                type: 'array',
                                minItems: 1,
                                maxItems: 5,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        title: { type: 'string' },
                                        citation: { type: 'string' },
                                        court: { type: 'string' },
                                        year: { type: 'string' },
                                        url: { type: 'string' },
                                        summary: { type: 'string' },
                                        relevance: { type: 'string' },
                                    },
                                    required: ['title', 'citation', 'court', 'year', 'url', 'summary', 'relevance'],
                                },
                            },
                        },
                        required: ['candidates'],
                    },
                },
            },
        });

        const parsed = safeJsonParse<{ candidates?: unknown }>(extractResponsesText(response));
        const candidates = normalizeFrankCaseCandidates(parsed?.candidates).slice(0, 5);
        return candidates.length > 0 ? candidates : fallback;
    } catch {
        return fallback;
    }
}

export async function draftFrankAnalysisDomains(input: DraftFrankAnalysisDomainsInput): Promise<FrankAnalysisDomain[]> {
    const legalDomain = input.legalDomain.trim();
    const selectedCase = normalizeFrankCaseCandidate(input.selectedCase);
    if (!legalDomain || !selectedCase) {
        throw new Error('legalDomain and selectedCase are required.');
    }

    const fallback = buildFallbackFrankAnalysisDomains({
        legalDomain,
        selectedCase,
        desiredCount: input.desiredCount,
    });
    if (!process.env.OPENAI_API_KEY) {
        return fallback;
    }

    try {
        const response = await openai.responses.create({
            model: 'gpt-5-mini',
            input: [
                `Legal domain: ${legalDomain}`,
                `Anchor case: ${selectedCase.title}`,
                `Citation: ${selectedCase.citation}`,
                `Court: ${selectedCase.court}`,
                `Year: ${selectedCase.year}`,
                `Summary: ${selectedCase.summary}`,
                `Why this case matters: ${selectedCase.relevance}`,
                '',
                `Create ${Math.min(Math.max(input.desiredCount ?? 6, 5), 10)} editable analysis domains for a benchmark packet.`,
                'Each domain should be short, human-readable, and distinct.',
                'These are analysis buckets, not rubric rows.',
            ].join('\n'),
            text: {
                verbosity: 'medium',
                format: {
                    type: 'json_schema',
                    name: 'frank_analysis_domains',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            domains: {
                                type: 'array',
                                minItems: 5,
                                maxItems: 10,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: 'string' },
                                        description: { type: 'string' },
                                    },
                                    required: ['name', 'description'],
                                },
                            },
                        },
                        required: ['domains'],
                    },
                },
            },
        });

        const parsed = safeJsonParse<{ domains?: unknown }>(extractResponsesText(response));
        const domains = normalizeFrankAnalysisDomains(parsed?.domains).slice(0, 10);
        return domains.length > 0 ? domains : fallback;
    } catch {
        return fallback;
    }
}

export async function generateFrankGoldenResponse(input: GenerateFrankGoldenResponseInput): Promise<FrankPacket> {
    const legalDomain = input.legalDomain.trim();
    const selectedCase = normalizeFrankCaseCandidate(input.selectedCase);
    const analysisDomains = normalizeFrankAnalysisDomains(input.analysisDomains);
    if (!legalDomain || !selectedCase || analysisDomains.length === 0) {
        throw new Error('legalDomain, selectedCase, and analysisDomains are required.');
    }

    const existing = input.id ? await getFrankPacket(input.id) : null;
    const fallback = buildFallbackFrankGoldenDraft({
        legalDomain,
        selectedCase,
        analysisDomains,
    });

    let draft = fallback;
    if (process.env.OPENAI_API_KEY) {
        try {
            const response = await openai.responses.create({
                model: 'gpt-5-mini',
                input: [
                    `Legal domain: ${legalDomain}`,
                    `Anchor case title: ${selectedCase.title}`,
                    `Citation: ${selectedCase.citation}`,
                    `Court: ${selectedCase.court}`,
                    `Year: ${selectedCase.year}`,
                    `Source URL: ${selectedCase.url}`,
                    `Case summary: ${selectedCase.summary}`,
                    `Why selected: ${selectedCase.relevance}`,
                    '',
                    'Analysis domains:',
                    ...analysisDomains.map((domain, index) => `${index + 1}. ${domain.name}: ${domain.description}`),
                    '',
                    'Create a Frank-stage packet only.',
                    'Generate a golden response organized by the analysis domains.',
                    'If a domain is not meaningfully addressed by the anchor case, say so briefly instead of forcing it.',
                    'Also produce the minimal source-intake and source-extraction metadata needed to save the packet.',
                ].join('\n'),
                tools: [{
                    type: 'web_search_preview',
                    search_context_size: 'medium',
                    user_location: {
                        type: 'approximate',
                        city: 'Chicago',
                        region: 'Illinois',
                        country: 'US',
                    },
                }],
                include: ['web_search_call.action.sources'],
                text: {
                    verbosity: 'medium',
                    format: {
                        type: 'json_schema',
                        name: 'frank_golden_response',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                masterIssueStatement: { type: 'string' },
                                benchmarkAnswer: { type: 'string' },
                                failureModeSeeds: {
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                                sourceIntake: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        sourceQualityRating: { type: 'string' },
                                        benchmarkPosture: {
                                            type: 'string',
                                            enum: [
                                                'narrow_source_grounded_benchmark_only',
                                                'generalizable_only_with_supporting_authority',
                                                'portable_common_law_benchmark',
                                            ],
                                        },
                                        recommendation: { type: 'string' },
                                        jdReviewBurden: {
                                            type: 'array',
                                            items: { type: 'string' },
                                        },
                                        reverseEngineeringSuitability: {
                                            type: 'string',
                                            enum: ['strong', 'moderate', 'weak'],
                                        },
                                    },
                                    required: ['sourceQualityRating', 'benchmarkPosture', 'recommendation', 'jdReviewBurden', 'reverseEngineeringSuitability'],
                                },
                                sourceExtraction: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        legalIssue: { type: 'string' },
                                        blackLetterRule: { type: 'string' },
                                        triggerFacts: {
                                            type: 'array',
                                            items: { type: 'string' },
                                        },
                                        holding: { type: 'string' },
                                        limits: {
                                            type: 'array',
                                            items: { type: 'string' },
                                        },
                                        uncertainty: {
                                            type: 'array',
                                            items: { type: 'string' },
                                        },
                                    },
                                    required: ['legalIssue', 'blackLetterRule', 'triggerFacts', 'holding', 'limits', 'uncertainty'],
                                },
                            },
                            required: ['masterIssueStatement', 'benchmarkAnswer', 'failureModeSeeds', 'sourceIntake', 'sourceExtraction'],
                        },
                    },
                },
            });

            const parsed = safeJsonParse<{
                masterIssueStatement?: unknown;
                benchmarkAnswer?: unknown;
                failureModeSeeds?: unknown;
                sourceIntake?: unknown;
                sourceExtraction?: unknown;
            }>(extractResponsesText(response));

            draft = {
                masterIssueStatement: normalizeNonEmptyString(parsed?.masterIssueStatement, fallback.masterIssueStatement),
                benchmarkAnswer: normalizeNonEmptyString(parsed?.benchmarkAnswer, fallback.benchmarkAnswer),
                failureModeSeeds: normalizeStringArray(parsed?.failureModeSeeds).slice(0, 8),
                sourceIntake: normalizeSourceIntake(parsed?.sourceIntake, fallback.sourceIntake),
                sourceExtraction: normalizeSourceExtraction(parsed?.sourceExtraction, fallback.sourceExtraction),
            };
        } catch {
            draft = fallback;
        }
    }

    return await saveFrankPacket({
        id: existing?.id ?? input.id,
        legalDomain,
        domainScope: selectedCase.title,
        sourceFamily: 'web_searched_anchor_case',
        selectedCase,
        analysisDomains,
        sourceArtifacts: existing?.sourceArtifacts ?? [],
        sourceIntake: draft.sourceIntake,
        sourceExtraction: draft.sourceExtraction,
        benchmarkAnswer: draft.benchmarkAnswer,
        benchmarkQuestion: existing?.benchmarkQuestion ?? '',
        failureModeSeeds: draft.failureModeSeeds,
        masterIssueStatement: draft.masterIssueStatement,
        status: existing?.status ?? 'draft',
    });
}

export async function generateFrankQuestionPacket(input: GenerateFrankQuestionPacketInput): Promise<FrankPacket> {
    const legalDomain = input.legalDomain.trim();
    const selectedCase = normalizeFrankCaseCandidate(input.selectedCase);
    const analysisDomains = normalizeFrankAnalysisDomains(input.analysisDomains);
    const benchmarkAnswer = input.benchmarkAnswer.trim();
    if (!legalDomain || !selectedCase || analysisDomains.length === 0 || !benchmarkAnswer) {
        throw new Error('legalDomain, selectedCase, analysisDomains, and benchmarkAnswer are required.');
    }

    const existing = input.id ? await getFrankPacket(input.id) : null;
    const fallback = buildFallbackFrankQuestionPacket({
        legalDomain,
        selectedCase,
        analysisDomains,
    });

    let benchmarkQuestion = fallback;
    if (process.env.OPENAI_API_KEY) {
        try {
            const response = await openai.responses.create({
                model: 'gpt-5-mini',
                input: [
                    `Legal domain: ${legalDomain}`,
                    `Anchor case: ${selectedCase.title}`,
                    `Citation: ${selectedCase.citation}`,
                    `Summary: ${selectedCase.summary}`,
                    '',
                    'Analysis domains:',
                    ...analysisDomains.map((domain, index) => `${index + 1}. ${domain.name}: ${domain.description}`),
                    '',
                    'Golden response:',
                    benchmarkAnswer.slice(0, 9000),
                    '',
                    'Draft a legal-case-packet benchmark question.',
                    'The question should invite analysis across the listed domains.',
                    'Return the finished question packet text only.',
                ].join('\n'),
                text: {
                    verbosity: 'medium',
                    format: {
                        type: 'json_schema',
                        name: 'frank_question_packet',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                benchmarkQuestion: { type: 'string' },
                            },
                            required: ['benchmarkQuestion'],
                        },
                    },
                },
            });

            const parsed = safeJsonParse<{ benchmarkQuestion?: unknown }>(extractResponsesText(response));
            benchmarkQuestion = normalizeNonEmptyString(parsed?.benchmarkQuestion, fallback);
        } catch {
            benchmarkQuestion = fallback;
        }
    }

    return await saveFrankPacket({
        id: existing?.id ?? input.id,
        legalDomain,
        domainScope: selectedCase.title,
        sourceFamily: existing?.sourceFamily ?? 'web_searched_anchor_case',
        selectedCase,
        analysisDomains,
        benchmarkAnswer,
        benchmarkQuestion,
        status: existing?.status ?? 'draft',
        sourceArtifacts: existing?.sourceArtifacts ?? [],
        sourceIntake: existing?.sourceIntake,
        sourceExtraction: existing?.sourceExtraction,
        failureModeSeeds: existing?.failureModeSeeds ?? [],
        masterIssueStatement: existing?.masterIssueStatement ?? selectedCase.relevance,
    });
}

export async function listKarthicRubricPacks() {
    const items = await listArtifacts<Record<string, unknown>>(DATA_DIRECTORIES.karthic);
    return items
        .map((item) => normalizeKarthicRubricPack(item))
        .filter((item): item is KarthicRubricPack => Boolean(item));
}

export async function getKarthicRubricPack(id: string) {
    const item = await readArtifact<Record<string, unknown>>(DATA_DIRECTORIES.karthic, id);
    return item ? normalizeKarthicRubricPack(item) : null;
}

export async function draftKarthicDomains(input: DraftKarthicDomainsInput): Promise<KarthicDomain[]> {
    const frankPacket = await getFrankPacket(input.frankPacketId);
    if (!frankPacket) {
        throw new Error('Frank packet not found.');
    }
    if (frankPacket.status !== 'approved') {
        throw new Error('Frank packet must be approved before Karthic can start.');
    }

    const fallback = buildFallbackKarthicDomains(frankPacket);
    if (!process.env.OPENAI_API_KEY) {
        return fallback;
    }

    try {
        const response = await openai.responses.create({
            model: 'gpt-5-mini',
            input: [
                `Legal domain: ${frankPacket.legalDomain}`,
                `Anchor case: ${frankPacket.selectedCase?.title ?? frankPacket.domainScope}`,
                `Master issue: ${frankPacket.masterIssueStatement}`,
                '',
                'Frank analysis domains:',
                ...frankPacket.analysisDomains.map((domain, index) => `${index + 1}. ${domain.name}: ${domain.description}`),
                '',
                'Frank golden answer:',
                frankPacket.benchmarkAnswer.slice(0, 7000),
                '',
                'Draft Karthic domains from the Frank packet.',
                'Keep the names human-editable and close to Frank’s domains.',
                'Each domain needs a short description, a default weight, and NA guidance.',
                'Weights should usually stay between 1 and 5.',
            ].join('\n'),
            text: {
                verbosity: 'medium',
                format: {
                    type: 'json_schema',
                    name: 'karthic_domain_draft',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            domains: {
                                type: 'array',
                                minItems: 1,
                                maxItems: 12,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: 'string' },
                                        description: { type: 'string' },
                                        weight: { type: 'number' },
                                        naGuidance: { type: 'string' },
                                    },
                                    required: ['name', 'description', 'weight', 'naGuidance'],
                                },
                            },
                        },
                        required: ['domains'],
                    },
                },
            },
        });

        const parsed = safeJsonParse<{ domains?: unknown }>(extractResponsesText(response));
        const domains = normalizeDomainsFromUnknown(parsed?.domains, frankPacket.analysisDomains);
        return domains.length > 0 ? domains : fallback;
    } catch {
        return fallback;
    }
}

export async function generateKarthicGoldenTargets(input: GenerateKarthicGoldenTargetsInput): Promise<KarthicRubricPack> {
    const frankPacket = await getFrankPacket(input.frankPacketId);
    if (!frankPacket) {
        throw new Error('Frank packet not found.');
    }
    if (frankPacket.status !== 'approved') {
        throw new Error('Frank packet must be approved before Karthic can start.');
    }

    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const domains = normalizeDomains(input.domains);
    if (domains.length === 0) {
        throw new Error('Add at least one Karthic domain before generating golden targets.');
    }

    const fallbackTargets = buildFallbackKarthicGoldenTargets({
        frankPacket,
        domains,
    });
    let goldenTargets = fallbackTargets;
    let comparisonMethodNote = [
        'Each centroid is compared against a structured domain target derived from Frank’s golden answer.',
        'Differences are stored separately as matched points, missing points, extra points, and contradiction flags.',
    ].join(' ');

    if (process.env.OPENAI_API_KEY) {
        try {
            const response = await openai.responses.create({
                model: 'gpt-5-mini',
                input: [
                    `Legal domain: ${frankPacket.legalDomain}`,
                    `Anchor case: ${frankPacket.selectedCase?.title ?? frankPacket.domainScope}`,
                    `Master issue: ${frankPacket.masterIssueStatement}`,
                    `SME notes: ${input.smeNotes?.trim() || 'None provided.'}`,
                    '',
                    'Karthic domains:',
                    ...domains.map((domain, index) => `${index + 1}. ${domain.name} (weight ${domain.weight}): ${domain.description} | NA guidance: ${domain.naGuidance}`),
                    '',
                    'Frank golden answer:',
                    frankPacket.benchmarkAnswer.slice(0, 9000),
                    '',
                    'For each domain, create a structured comparison target extracted from the golden answer.',
                    'Keep the target separate from the answer prose itself.',
                    'Use 2-4 short "golden contains" points per domain.',
                    'Use "allowed omissions" only when the golden answer would reasonably leave something unstated.',
                    'Use contradiction flags for statements that would count against a centroid.',
                    'Return JSON only.',
                ].join('\n'),
                text: {
                    verbosity: 'medium',
                    format: {
                        type: 'json_schema',
                        name: 'karthic_golden_targets',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                comparisonMethodNote: { type: 'string' },
                                goldenTargets: {
                                    type: 'array',
                                    minItems: 1,
                                    maxItems: 12,
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            domainId: { type: 'string' },
                                            summary: { type: 'string' },
                                            goldenContains: {
                                                type: 'array',
                                                minItems: 1,
                                                maxItems: 4,
                                                items: { type: 'string' },
                                            },
                                            allowedOmissions: {
                                                type: 'array',
                                                items: { type: 'string' },
                                            },
                                            contradictionFlags: {
                                                type: 'array',
                                                items: { type: 'string' },
                                            },
                                            comparisonGuidance: { type: 'string' },
                                        },
                                        required: ['domainId', 'summary', 'goldenContains', 'allowedOmissions', 'contradictionFlags', 'comparisonGuidance'],
                                    },
                                },
                            },
                            required: ['comparisonMethodNote', 'goldenTargets'],
                        },
                    },
                },
            });

            const parsed = safeJsonParse<{
                comparisonMethodNote?: unknown;
                goldenTargets?: unknown;
            }>(extractResponsesText(response));
            goldenTargets = normalizeGoldenTargets(parsed?.goldenTargets, domains, fallbackTargets);
            comparisonMethodNote = normalizeNonEmptyString(parsed?.comparisonMethodNote, comparisonMethodNote);
        } catch {
            goldenTargets = fallbackTargets;
        }
    }

    return await saveKarthicRubricPack({
        id: existing?.id ?? input.id,
        frankPacketId: input.frankPacketId,
        domains,
        goldenTargets,
        criteria: buildCriteriaFromGoldenTargets(goldenTargets),
        refinementLog: buildGoldenTargetRefinementLog(goldenTargets),
        smeNotes: input.smeNotes?.trim() ?? existing?.smeNotes ?? '',
        comparisonMethodNote,
        status: existing?.status ?? 'draft',
    });
}

export async function saveKarthicRubricPack(input: SaveKarthicInput): Promise<KarthicRubricPack> {
    const frankPacket = await getFrankPacket(input.frankPacketId);
    if (!frankPacket) {
        throw new Error('Frank packet not found.');
    }
    if (frankPacket.status !== 'approved') {
        throw new Error('Frank packet must be approved before Karthic can start.');
    }

    const existing = input.id ? await getKarthicRubricPack(input.id) : null;
    const now = new Date().toISOString();
    const domains = normalizeDomains(input.domains);
    const fallbackGoldenTargets = existing?.goldenTargets && existing.goldenTargets.length > 0
        ? existing.goldenTargets
        : buildFallbackKarthicGoldenTargets({ frankPacket, domains });
    const goldenTargets = input.goldenTargets && input.goldenTargets.length > 0
        ? normalizeGoldenTargets(input.goldenTargets, domains, fallbackGoldenTargets)
        : fallbackGoldenTargets;
    const criteria = input.criteria && input.criteria.length > 0
        ? normalizeCriteria(input.criteria)
        : goldenTargets.length > 0
            ? buildCriteriaFromGoldenTargets(goldenTargets)
            : buildInitialCriteria(domains);
    const refinementLog = input.refinementLog && input.refinementLog.length > 0
        ? normalizeRefinementLog(input.refinementLog)
        : goldenTargets.length > 0
            ? buildGoldenTargetRefinementLog(goldenTargets)
            : buildSeedRefinementLog(criteria);
    const comparisonMethodNote = normalizeOptionalString(
        input.comparisonMethodNote,
        existing?.comparisonMethodNote ?? 'Compare each centroid against structured golden-answer targets rather than against the raw answer prose alone.',
    );

    const pack: KarthicRubricPack = {
        id: existing?.id ?? `karthic_${Date.now()}_${randomUUID().slice(0, 8)}`,
        frankPacketId: input.frankPacketId,
        status: input.status ?? existing?.status ?? 'draft',
        domains,
        goldenTargets,
        criteria,
        refinementLog,
        smeNotes: input.smeNotes?.trim() ?? existing?.smeNotes ?? '',
        comparisonMethodNote,
        approvedAt: input.status === 'approved' ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    if (pack.status === 'approved') {
        if (pack.domains.length === 0) {
            throw new Error('Add at least one Karthic domain before approval.');
        }
        if (pack.goldenTargets.length === 0) {
            throw new Error('Generate the structured golden targets before approval.');
        }
    }

    await writeArtifact(DATA_DIRECTORIES.karthic, pack.id, pack);
    return pack;
}

export async function refineKarthicRubricPack(input: RefineKarthicInput): Promise<KarthicRubricPack> {
    const pack = await getKarthicRubricPack(input.packId);
    if (!pack) {
        throw new Error('Karthic rubric pack not found.');
    }
    const frankPacket = await getFrankPacket(pack.frankPacketId);
    if (!frankPacket) {
        throw new Error('Linked Frank packet not found.');
    }

    const now = new Date().toISOString();
    const targetDomainIds = new Set((input.domainIds && input.domainIds.length > 0 ? input.domainIds : pack.domains.map((domain) => domain.id)));
    const nextCriteria = [...pack.criteria];
    const nextLog = [...pack.refinementLog];

    for (const domain of pack.domains) {
        if (!targetDomainIds.has(domain.id)) {
            continue;
        }
        const domainCriteria = nextCriteria.filter((criterion) => criterion.domainId === domain.id && criterion.status === 'active');
        const seedCriterion = domainCriteria.find((criterion) => criterion.depth === 0) ?? domainCriteria[0] ?? null;
        const generated = await generateRefinedCriteria({
            domain,
            benchmarkAnswer: frankPacket.benchmarkAnswer,
            strongAnswer: input.contrastiveStrongAnswer?.trim() || frankPacket.benchmarkAnswer,
            mediocreAnswer: input.contrastiveMediocreAnswer?.trim() || frankPacket.failureModeSeeds.join('\n'),
            seedCriterionText: seedCriterion?.text ?? '',
        });

        if (seedCriterion) {
            const criterionIndex = nextCriteria.findIndex((criterion) => criterion.id === seedCriterion.id);
            if (criterionIndex >= 0) {
                nextCriteria[criterionIndex] = {
                    ...nextCriteria[criterionIndex],
                    status: 'redundant',
                };
                nextLog.push({
                    id: `refine_${randomUUID().slice(0, 8)}`,
                    timestamp: now,
                    domainId: domain.id,
                    criterionId: seedCriterion.id,
                    action: 'marked_redundant',
                    note: 'Seed criterion retired after decomposition.',
                });
            }
        }

        for (const text of generated) {
            const criterion: KarthicCriterion = {
                id: `criterion_${randomUUID().slice(0, 8)}`,
                domainId: domain.id,
                text,
                parentId: seedCriterion?.id ?? null,
                depth: seedCriterion ? seedCriterion.depth + 1 : 1,
                status: 'active',
                source: 'refined',
            };
            nextCriteria.push(criterion);
            nextLog.push({
                id: `refine_${randomUUID().slice(0, 8)}`,
                timestamp: now,
                domainId: domain.id,
                criterionId: criterion.id,
                action: 'decomposed',
                note: 'Added contrastive refinement criterion.',
            });
        }
    }

    const refinedPack: KarthicRubricPack = {
        ...pack,
        criteria: nextCriteria,
        refinementLog: nextLog,
        updatedAt: now,
    };
    await writeArtifact(DATA_DIRECTORIES.karthic, refinedPack.id, refinedPack);
    return refinedPack;
}

export async function listDashaRuns() {
    return await listArtifacts<DashaRun>(DATA_DIRECTORIES.dasha);
}

export async function getDashaRun(id: string) {
    return await readArtifact<DashaRun>(DATA_DIRECTORIES.dasha, id);
}

export async function runDashaEvaluation(input: DashaRunInput): Promise<DashaRun> {
    const pack = await getKarthicRubricPack(input.rubricPackId);
    if (!pack) {
        throw new Error('Karthic rubric pack not found.');
    }
    if (pack.status !== 'approved') {
        throw new Error('Karthic rubric pack must be approved before Dasha can start.');
    }

    const id = `dasha_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const inputArtifacts = await saveUploadedArtifacts(id, input.files);
    const questionText = inputArtifacts.map((artifact) => artifact.extractedText).join('\n\n').trim();
    if (!questionText) {
        throw new Error('Question text could not be extracted from the uploaded PDFs.');
    }

    const responses = await generateDashaResponses(questionText, input.selectedModels);
    const validResponses = responses.filter((response) => !response.error && response.responseText.trim().length > 0);
    if (validResponses.length === 0) {
        const failedRun: DashaRun = {
            id,
            rubricPackId: pack.id,
            status: 'failed',
            inputArtifacts,
            questionText,
            selectedModels: input.selectedModels,
            responses,
            clusters: [],
            domainResults: [],
            weightedSummary: {
                applicableWeightTotal: 0,
                weightedScore: null,
                notApplicableDomainIds: [],
            },
            clusteringMethod: 'not_run',
            clusteringNotes: 'No valid responses were available for clustering.',
            errorMessage: 'No model responses were generated successfully.',
            createdAt: now,
            completedAt: now,
        };
        await writeArtifact(DATA_DIRECTORIES.dasha, failedRun.id, failedRun);
        return failedRun;
    }

    const clusteringResult = await clusterResponses(validResponses);
    const clusters = clusteringResult.clusters;
    const domainResults = await evaluateClustersAgainstDomains({
        questionText,
        pack,
        clusters,
        responses: validResponses,
    });
    const weightedSummary = summarizeDomainResults(domainResults);

    const completedRun: DashaRun = {
        id,
        rubricPackId: pack.id,
        status: 'completed',
        inputArtifacts,
        questionText,
        selectedModels: input.selectedModels,
        responses,
        clusters,
        domainResults,
        weightedSummary,
        clusteringMethod: clusteringResult.method,
        clusteringNotes: clusteringResult.notes,
        createdAt: now,
        completedAt: new Date().toISOString(),
    };
    await writeArtifact(DATA_DIRECTORIES.dasha, completedRun.id, completedRun);
    return completedRun;
}

async function generateFrankDraft(input: {
    legalDomain: string;
    domainScope: string;
    sourceFamily: string;
    combinedText: string;
}) {
    const fallback = buildFallbackFrankDraft(input);
    const content = input.combinedText.slice(0, 16000);
    if (!process.env.OPENAI_API_KEY || !content) {
        return fallback;
    }

    const systemPrompt = [
        'You are a Frank-stage legal benchmark drafting assistant.',
        'Only perform source intake, source extraction, benchmark answer drafting, reverse-engineered question drafting, and optional failure-mode seeding.',
        'Do not create final evaluative rubrics, model rankings, or centroid-selection logic.',
        'Return JSON only.',
    ].join(' ');

    const userPrompt = [
        `Legal domain: ${input.legalDomain}`,
        `Domain scope: ${input.domainScope}`,
        `Source family: ${input.sourceFamily}`,
        '',
        'Use a source-grounded common-law drafting posture. Treat portability carefully.',
        'Produce this JSON shape:',
        JSON.stringify({
            sourceIntake: {
                sourceQualityRating: 'string',
                benchmarkPosture: 'narrow_source_grounded_benchmark_only',
                recommendation: 'string',
                jdReviewBurden: ['string'],
                reverseEngineeringSuitability: 'strong',
            },
            sourceExtraction: {
                legalIssue: 'string',
                blackLetterRule: 'string',
                triggerFacts: ['string'],
                holding: 'string',
                limits: ['string'],
                uncertainty: ['string'],
            },
            benchmarkAnswer: 'string',
            benchmarkQuestion: 'string',
            failureModeSeeds: ['string'],
            masterIssueStatement: 'string',
        }),
        '',
        'Preserve stage boundaries: benchmarkAnswer may be clean and evaluator-facing, but do not invent rubric rows.',
        '',
        'Source text:',
        content,
    ].join('\n');

    const parsed = await tryOpenAiJson(systemPrompt, userPrompt);
    if (!parsed) {
        return fallback;
    }

    return {
        sourceIntake: normalizeSourceIntake(parsed.sourceIntake, fallback.sourceIntake),
        sourceExtraction: normalizeSourceExtraction(parsed.sourceExtraction, fallback.sourceExtraction),
        benchmarkAnswer: normalizeNonEmptyString(parsed.benchmarkAnswer, fallback.benchmarkAnswer),
        benchmarkQuestion: normalizeNonEmptyString(parsed.benchmarkQuestion, fallback.benchmarkQuestion),
        failureModeSeeds: normalizeStringArray(parsed.failureModeSeeds).slice(0, 6),
        masterIssueStatement: normalizeNonEmptyString(parsed.masterIssueStatement, fallback.masterIssueStatement),
    };
}

async function generateRefinedCriteria(input: {
    domain: KarthicDomain;
    benchmarkAnswer: string;
    strongAnswer: string;
    mediocreAnswer: string;
    seedCriterionText: string;
}) {
    const fallback = buildFallbackRefinedCriteria(input.domain);
    if (!process.env.OPENAI_API_KEY) {
        return fallback;
    }

    const systemPrompt = [
        'You are a Karthic-stage rubric refinement assistant.',
        'Your job is only to refine one domain into evaluative subcriteria.',
        'Use lightweight decomposition: criteria should separate strong from mediocre answers.',
        'Do not assign weights or invent downstream scoring policy.',
        'Return JSON only.',
    ].join(' ');
    const userPrompt = [
        `Domain name: ${input.domain.name}`,
        `Domain description: ${input.domain.description}`,
        `Existing seed criterion: ${input.seedCriterionText || 'none'}`,
        '',
        'Return JSON of the form {"criteria":["...", "..."]}.',
        'Provide 2-4 concise active criteria that would help distinguish a strong answer from a mediocre one within this domain.',
        'Do not restate the whole benchmark answer.',
        '',
        'Benchmark answer:',
        input.benchmarkAnswer.slice(0, 4000),
        '',
        'Strong answer example:',
        input.strongAnswer.slice(0, 3000),
        '',
        'Mediocre answer example:',
        input.mediocreAnswer.slice(0, 3000),
    ].join('\n');

    const parsed = await tryOpenAiJson(systemPrompt, userPrompt);
    const items = normalizeStringArray(parsed?.criteria).slice(0, 4);
    return items.length > 0 ? items : fallback;
}

async function evaluateClustersAgainstDomains(input: {
    questionText: string;
    pack: KarthicRubricPack;
    clusters: DashaClusterRecord[];
    responses: DashaResponseRecord[];
}) {
    const responseById = new Map(input.responses.map((response) => [response.id, response]));
    const results: DomainResult[] = [];

    for (const domain of input.pack.domains) {
        const goldenTarget = input.pack.goldenTargets.find((target) => target.domainId === domain.id)
            ?? buildFallbackGoldenTargetForDomain(domain);
        const criteria = input.pack.criteria
            .filter((criterion) => criterion.domainId === domain.id && criterion.status === 'active')
            .map((criterion) => criterion.text);
        const centroidEvaluations: DomainCentroidEvaluation[] = [];

        for (const cluster of input.clusters) {
            const representative = responseById.get(cluster.representativeResponseId);
            if (!representative) {
                continue;
            }

            const evaluation = await evaluateDomainAgainstResponse({
                questionText: input.questionText,
                domain,
                goldenTarget,
                criteria,
                responseText: representative.responseText,
            });

            centroidEvaluations.push({
                clusterId: cluster.id,
                applicabilityStatus: evaluation.applicabilityStatus,
                applicabilityExplanation: evaluation.applicabilityExplanation,
                score: evaluation.score,
                confidence: evaluation.confidence,
                rationale: evaluation.rationale,
                difference: evaluation.difference,
            });
        }

        const winning = chooseWinningCentroid(centroidEvaluations, input.clusters);
        results.push({
            domainId: domain.id,
            domainName: domain.name,
            weight: domain.weight,
            applicabilityStatus: winning?.applicabilityStatus ?? 'not_applicable',
            applicabilityExplanation: winning?.applicabilityExplanation ?? domain.naGuidance,
            centroidEvaluations,
            winningCentroidId: winning?.clusterId ?? null,
            winningScore: winning?.score ?? null,
            rationale: winning?.rationale ?? 'No applicable centroid satisfied this domain.',
            winningModelMix: winning
                ? input.clusters.find((cluster) => cluster.id === winning.clusterId)?.modelBreakdown ?? []
                : [],
        });
    }

    return results;
}

async function evaluateDomainAgainstResponse(input: {
    questionText: string;
    domain: KarthicDomain;
    goldenTarget: KarthicGoldenDomainTarget;
    criteria: string[];
    responseText: string;
}): Promise<{
    applicabilityStatus: 'applicable' | 'not_applicable';
    applicabilityExplanation: string;
    score: number | null;
    confidence: number | null;
    rationale: string;
    difference: DomainCentroidDifference;
}> {
    const fallback = heuristicDomainEvaluation(input);
    if (!process.env.OPENAI_API_KEY) {
        return fallback;
    }

    const systemPrompt = [
        'You are a Dasha-stage domain judge.',
        'Evaluate one clustered answer representative against one approved domain only.',
        'Do not compare models globally.',
        'Return JSON only.',
    ].join(' ');
    const userPrompt = [
        `Domain: ${input.domain.name}`,
        `Domain description: ${input.domain.description}`,
        `NA guidance: ${input.domain.naGuidance}`,
        `Golden target summary: ${input.goldenTarget.summary}`,
        `Golden contains: ${input.goldenTarget.goldenContains.join(' | ') || 'None provided'}`,
        `Allowed omissions: ${input.goldenTarget.allowedOmissions.join(' | ') || 'None provided'}`,
        `Contradiction flags: ${input.goldenTarget.contradictionFlags.join(' | ') || 'None provided'}`,
        `Comparison guidance: ${input.goldenTarget.comparisonGuidance}`,
        `Criteria: ${input.criteria.join(' | ') || 'None provided'}`,
        '',
        'Return JSON:',
        JSON.stringify({
            applicabilityStatus: 'applicable',
            applicabilityExplanation: 'string',
            score: 0,
            confidence: 0.5,
            matchedGoldenPoints: ['string'],
            missingGoldenPoints: ['string'],
            extraCentroidPoints: ['string'],
            contradictionPoints: ['string'],
            differenceSummary: 'string',
            rationale: 'string',
        }),
        '',
        'Use score 0-100 only if applicable. If not applicable, use score null.',
        'Matched points should be things the centroid clearly covers from the golden target.',
        'Missing points should be things the golden target contains but the centroid leaves out.',
        'Extra points should be materially additional claims or emphases from the centroid.',
        'Contradiction points should be claims that conflict with the golden target.',
        '',
        'Question:',
        input.questionText.slice(0, 3500),
        '',
        'Representative answer:',
        input.responseText.slice(0, 3500),
    ].join('\n');

    const parsed = await tryOpenAiJson(systemPrompt, userPrompt);
    if (!parsed) {
        return fallback;
    }

    const applicabilityStatus = parsed.applicabilityStatus === 'applicable' ? 'applicable' : 'not_applicable';
    const score = applicabilityStatus === 'applicable'
        ? clampNumber(toNumber(parsed.score, fallback.score ?? 0), 0, 100)
        : null;

    return {
        applicabilityStatus,
        applicabilityExplanation: normalizeNonEmptyString(parsed.applicabilityExplanation, fallback.applicabilityExplanation),
        score,
        confidence: clampNumber(toNumber(parsed.confidence, fallback.confidence ?? 0.5), 0, 1),
        rationale: normalizeNonEmptyString(parsed.rationale, fallback.rationale),
        difference: {
            matchedGoldenPoints: normalizeStringArray(parsed.matchedGoldenPoints),
            missingGoldenPoints: normalizeStringArray(parsed.missingGoldenPoints),
            extraCentroidPoints: normalizeStringArray(parsed.extraCentroidPoints),
            contradictionPoints: normalizeStringArray(parsed.contradictionPoints),
            differenceSummary: normalizeNonEmptyString(parsed.differenceSummary, fallback.difference.differenceSummary),
        },
    };
}

function chooseWinningCentroid(evaluations: DomainCentroidEvaluation[], clusters: DashaClusterRecord[]) {
    const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const applicable = evaluations.filter((evaluation) => evaluation.applicabilityStatus === 'applicable' && typeof evaluation.score === 'number');
    if (applicable.length === 0) {
        return evaluations[0] ?? null;
    }

    return applicable.sort((left, right) => {
        const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
        if (scoreDelta !== 0) {
            return scoreDelta;
        }
        const confidenceDelta = (right.confidence ?? -1) - (left.confidence ?? -1);
        if (confidenceDelta !== 0) {
            return confidenceDelta;
        }
        const sizeDelta = (clusterById.get(right.clusterId)?.size ?? 0) - (clusterById.get(left.clusterId)?.size ?? 0);
        if (sizeDelta !== 0) {
            return sizeDelta;
        }
        return left.clusterId.localeCompare(right.clusterId);
    })[0];
}

function summarizeDomainResults(results: DomainResult[]): WeightedSummary {
    let weightedTotal = 0;
    let applicableWeightTotal = 0;
    const notApplicableDomainIds: string[] = [];

    for (const result of results) {
        if (result.applicabilityStatus !== 'applicable' || typeof result.winningScore !== 'number') {
            notApplicableDomainIds.push(result.domainId);
            continue;
        }
        applicableWeightTotal += result.weight;
        weightedTotal += result.weight * result.winningScore;
    }

    return {
        applicableWeightTotal,
        weightedScore: applicableWeightTotal > 0 ? roundToTwo(weightedTotal / applicableWeightTotal) : null,
        notApplicableDomainIds,
    };
}

async function generateDashaResponses(questionText: string, selectedModels: DashaSelectedModel[]) {
    const responses: DashaResponseRecord[] = [];

    for (const selectedModel of selectedModels) {
        const id = `response_${randomUUID().slice(0, 8)}`;
        const modelKey = `${selectedModel.provider}::${selectedModel.model}`;
        try {
            const responseText = await generateModelResponse({
                provider: selectedModel.provider,
                model: selectedModel.model,
                systemPrompt: 'You are generating a free-form legal answer for benchmark evaluation. Write a concise legal analysis with a clear conclusion.',
                messages: [{
                    role: 'user',
                    content: [
                        'Answer the following legal question in a structured but natural free-form analysis.',
                        'Do not use bullet points.',
                        '',
                        questionText,
                    ].join('\n'),
                }],
                temperature: selectedModel.temperature ?? 0.2,
                reasoningEffort: selectedModel.reasoningEffort ?? 'medium',
            });
            responses.push({
                id,
                modelKey,
                provider: selectedModel.provider,
                model: selectedModel.model,
                responseText: responseText.trim(),
                clusterId: '',
            });
        } catch (error) {
            responses.push({
                id,
                modelKey,
                provider: selectedModel.provider,
                model: selectedModel.model,
                responseText: '',
                clusterId: '',
                error: error instanceof Error ? error.message : 'Model generation failed.',
            });
        }
    }

    return responses;
}

async function clusterResponses(responses: DashaResponseRecord[]) {
    const densityClustered = await clusterResponsesWithDensityPipeline(responses);
    if (densityClustered) {
        return densityClustered;
    }

    return {
        clusters: buildJaccardFallbackClusters(responses),
        method: 'jaccard_fallback',
        notes: 'Fell back to the old Jaccard clustering heuristic because the Python density-clustering environment was unavailable.',
    };
}

async function clusterResponsesWithDensityPipeline(responses: DashaResponseRecord[]) {
    const pythonExecutable = await resolvePythonExecutable();
    if (!pythonExecutable) {
        return null;
    }

    const root = path.basename(process.cwd()) === 'frontend'
        ? path.resolve(process.cwd(), '..')
        : process.cwd();
    const tempDirectory = path.join(root, 'legal-workflow-data', 'tmp');
    const inputPath = path.join(tempDirectory, `karthic_cluster_input_${Date.now()}_${randomUUID().slice(0, 8)}.json`);
    const scriptPath = path.join(root, 'lsh', 'cluster_legal_workflow.py');
    await fs.mkdir(tempDirectory, { recursive: true });
    await fs.writeFile(inputPath, JSON.stringify({
        responses: responses.map((response) => ({
            id: response.id,
            response: response.responseText,
        })),
    }, null, 2), 'utf8');

    try {
        const { stdout } = await execFileAsync(pythonExecutable, [scriptPath, '--input', inputPath], {
            cwd: root,
            maxBuffer: 1024 * 1024 * 8,
        });
        const parsed = safeJsonParse<{
            clusters?: Array<{
                id?: unknown;
                representativeResponseId?: unknown;
                memberResponseIds?: unknown;
            }>;
        }>(stdout);
        if (!parsed?.clusters || !Array.isArray(parsed.clusters) || parsed.clusters.length === 0) {
            return null;
        }

        const responseById = new Map(responses.map((response) => [response.id, response]));
        const clusters = parsed.clusters
            .map((cluster, index) => {
                const memberIds = Array.isArray(cluster.memberResponseIds)
                    ? cluster.memberResponseIds.map((item) => String(item).trim()).filter(Boolean)
                    : [];
                const members = memberIds
                    .map((id) => responseById.get(id))
                    .filter((item): item is DashaResponseRecord => Boolean(item));
                if (members.length === 0) {
                    return null;
                }
                const representativeId = String(cluster.representativeResponseId || members[0].id).trim() || members[0].id;
                const representative = responseById.get(representativeId) ?? members[0];
                const clusterId = String(cluster.id || `cluster_${index + 1}`).trim() || `cluster_${index + 1}`;
                for (const member of members) {
                    member.clusterId = clusterId;
                }
                return {
                    id: clusterId,
                    representativeResponseId: representative.id,
                    representativeText: representative.responseText,
                    memberResponseIds: members.map((member) => member.id),
                    size: members.length,
                    modelBreakdown: summarizeModelBreakdown(members),
                };
            })
            .filter((cluster): cluster is DashaClusterRecord => Boolean(cluster));

        return clusters.length > 0
            ? {
                clusters,
                method: 'density_umap_hdbscan',
                notes: 'Clustered with the repo’s instructor-embedding density pipeline and medoid-style representative selection.',
            }
            : null;
    } catch {
        return null;
    } finally {
        await fs.unlink(inputPath).catch(() => undefined);
    }
}

function buildJaccardFallbackClusters(responses: DashaResponseRecord[]) {
    const assigned = new Set<string>();
    const clusters: DashaClusterRecord[] = [];
    const texts = new Map(responses.map((response) => [response.id, normalizeForSimilarity(response.responseText)]));

    for (const response of responses) {
        if (assigned.has(response.id)) {
            continue;
        }
        const members = [response];
        assigned.add(response.id);
        const baseText = texts.get(response.id) ?? '';

        for (const candidate of responses) {
            if (assigned.has(candidate.id) || candidate.id === response.id) {
                continue;
            }
            const similarity = jaccardSimilarity(baseText, texts.get(candidate.id) ?? '');
            if (similarity >= 0.33) {
                members.push(candidate);
                assigned.add(candidate.id);
            }
        }

        const representative = members
            .map((member) => ({
                member,
                score: averageSimilarity(member.id, members, texts),
            }))
            .sort((left, right) => right.score - left.score || right.member.responseText.length - left.member.responseText.length)[0]?.member ?? members[0];

        const clusterId = `cluster_${clusters.length + 1}`;
        for (const member of members) {
            member.clusterId = clusterId;
        }

        clusters.push({
            id: clusterId,
            representativeResponseId: representative.id,
            representativeText: representative.responseText,
            memberResponseIds: members.map((member) => member.id),
            size: members.length,
            modelBreakdown: summarizeModelBreakdown(members),
        });
    }

    return clusters;
}

function summarizeModelBreakdown(members: DashaResponseRecord[]) {
    const byModel = new Map<string, { modelKey: string; provider: ModelProvider; model: string; count: number }>();
    for (const member of members) {
        const current = byModel.get(member.modelKey);
        if (current) {
            current.count += 1;
            continue;
        }
        byModel.set(member.modelKey, {
            modelKey: member.modelKey,
            provider: member.provider,
            model: member.model,
            count: 1,
        });
    }
    return Array.from(byModel.values()).sort((left, right) => right.count - left.count || left.modelKey.localeCompare(right.modelKey));
}

async function saveUploadedArtifacts(ownerId: string, files: Array<{ role: ArtifactRole; fileName: string; bytes: Uint8Array }>) {
    const artifactDirectory = path.join(await ensureDirectory(DATA_DIRECTORIES.artifacts), ownerId);
    await fs.mkdir(artifactDirectory, { recursive: true });

    const artifacts: ArtifactRecord[] = [];
    for (const file of files) {
        const safeName = sanitizeFileName(file.fileName || `${file.role}.pdf`);
        const artifactId = `artifact_${randomUUID().slice(0, 8)}`;
        const storedPath = path.join(artifactDirectory, `${artifactId}_${safeName}`);
        const extractedTextPath = path.join(artifactDirectory, `${artifactId}.txt`);
        await fs.writeFile(storedPath, file.bytes);
        const extractedText = await extractTextFromUploadedFile(file.bytes, safeName);
        await fs.writeFile(extractedTextPath, extractedText, 'utf8');
        artifacts.push({
            id: artifactId,
            role: file.role,
            fileName: safeName,
            storedPath,
            extractedTextPath,
            extractedText,
            uploadedAt: new Date().toISOString(),
        });
    }

    return artifacts;
}

async function extractTextFromUploadedFile(bytes: Uint8Array, fileName: string) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.pdf') {
        try {
            const { PDFParse } = await import('pdf-parse');
            const parser = new PDFParse({ data: Buffer.from(bytes) });
            const parsed = await parser.getText();
            await parser.destroy().catch(() => undefined);
            return normalizeExtractedText(parsed.text || '');
        } catch {
            return '';
        }
    }

    return normalizeExtractedText(Buffer.from(bytes).toString('utf8'));
}

function buildFallbackFrankCaseCandidates(legalDomain: string): FrankCaseCandidate[] {
    const normalized = legalDomain.toLowerCase();
    if (normalized.includes('contract')) {
        return [
            {
                id: `case_${randomUUID().slice(0, 8)}`,
                title: 'Hamer v. Sidway',
                citation: '124 N.Y. 538 (1891)',
                court: 'New York Court of Appeals',
                year: '1891',
                url: 'https://law.justia.com/cases/new-york/court-of-appeals/1891/124-n-y-538-0.html',
                summary: 'Classic consideration case holding that forbearance of a legal right can count as consideration.',
                relevance: 'Good teaching case when the benchmark needs a clear, foundational contracts rule with a crisp holding.',
            },
            {
                id: `case_${randomUUID().slice(0, 8)}`,
                title: 'Lucy v. Zehmer',
                citation: '196 Va. 493 (1954)',
                court: 'Supreme Court of Virginia',
                year: '1954',
                url: 'https://law.justia.com/cases/virginia/supreme-court/1954/4272-1.html',
                summary: 'Objective theory of assent case about whether outward manifestations formed a real agreement.',
                relevance: 'Useful if the benchmark should focus on contract formation and objective intent.',
            },
            {
                id: `case_${randomUUID().slice(0, 8)}`,
                title: 'Crabtree v. Elizabeth Arden Sales Corp.',
                citation: '305 N.Y. 48 (1953)',
                court: 'New York Court of Appeals',
                year: '1953',
                url: 'https://law.justia.com/cases/new-york/court-of-appeals/1953/305-n-y-48-0.html',
                summary: 'Statute of Frauds case on piecing together multiple signed writings to satisfy the writing requirement.',
                relevance: 'Useful if the benchmark is specifically about the Statute of Frauds and what writings can be combined.',
            },
        ];
    }

    return [
        {
            id: `case_${randomUUID().slice(0, 8)}`,
            title: `${legalDomain} anchor case candidate`,
            citation: 'Citation to be confirmed',
            court: 'Court to be confirmed',
            year: 'Year to be confirmed',
            url: '',
            summary: `A teaching-friendly anchor case for ${legalDomain}.`,
            relevance: `Use this as a placeholder while refining the ${legalDomain} workflow.`,
        },
    ];
}

function buildFallbackFrankAnalysisDomains(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    desiredCount?: number;
}): FrankAnalysisDomain[] {
    const targetCount = Math.min(Math.max(input.desiredCount ?? 6, 5), 10);
    const base = [
        ['Core issue', 'What legal question the case actually resolves.'],
        ['Rule statement', 'The black-letter rule or test the answer should state clearly.'],
        ['Trigger facts', 'The facts that make the rule matter here.'],
        ['Application', 'How the rule should be applied to the facts rather than recited abstractly.'],
        ['Holding and outcome', 'What result follows if the rule is applied correctly.'],
        ['Limits and boundaries', 'Where the case stops and what it does not decide.'],
        ['Counterarguments', 'The strongest pushback or alternative reading.'],
        ['Portability', 'How safely the case can be generalized beyond its own facts or jurisdiction.'],
        ['Remedies or consequences', 'What practical legal consequence follows from the analysis.'],
        ['Open questions', 'What uncertainty remains even after the case is used as the anchor.'],
    ];

    return base.slice(0, targetCount).map(([name, description], index) => ({
        id: `analysis_domain_${index + 1}`,
        name,
        description: description.replace('the case', input.selectedCase.title),
    }));
}

function buildFrankSourceIntakeFallback(selectedCase: FrankCaseCandidate | null): SourceIntake {
    return {
        sourceQualityRating: selectedCase
            ? `Web-found appellate case anchor: ${selectedCase.title}.`
            : 'Web-found legal source anchor requiring validation.',
        benchmarkPosture: 'generalizable_only_with_supporting_authority',
        recommendation: selectedCase
            ? `Use ${selectedCase.title} as the anchor case, but verify continued validity and jurisdictional fit.`
            : 'Use the selected case as a starting point, then validate with JD review.',
        jdReviewBurden: [
            'Confirm precedential weight and current validity.',
            'Confirm the rule is stated at the right level of generality for the benchmark.',
        ],
        reverseEngineeringSuitability: 'moderate',
    };
}

function buildFrankSourceExtractionFallback(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate | null;
    analysisDomains: FrankAnalysisDomain[];
}): SourceExtraction {
    const title = input.selectedCase?.title || 'the selected case';
    return {
        legalIssue: input.selectedCase?.summary || `What legal issue in ${input.legalDomain} is best anchored by ${title}?`,
        blackLetterRule: `State the controlling rule drawn from ${title} narrowly and accurately.`,
        triggerFacts: input.analysisDomains.slice(0, 3).map((domain) => `Facts relevant to ${domain.name.toLowerCase()}.`),
        holding: input.selectedCase?.relevance || `The holding from ${title} should control the benchmark analysis.`,
        limits: [`Do not overgeneralize ${title} beyond its facts, court, and doctrinal setting.`],
        uncertainty: ['Validate citation accuracy, current validity, and how portable the rule should be.'],
    };
}

function buildFallbackFrankGoldenDraft(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
}) {
    const sourceIntake = buildFrankSourceIntakeFallback(input.selectedCase);
    const sourceExtraction = buildFrankSourceExtractionFallback(input);
    return {
        masterIssueStatement: `${input.selectedCase.title} provides the anchor rule for this ${input.legalDomain} benchmark.`,
        benchmarkAnswer: [
            `Anchor case: ${input.selectedCase.title} (${input.selectedCase.citation})`,
            '',
            ...input.analysisDomains.flatMap((domain) => ([
                `${domain.name}:`,
                `${domain.description} The answer should explain how ${input.selectedCase.title} bears on this domain.`,
                '',
            ])),
        ].join('\n').trim(),
        failureModeSeeds: [
            'Names the case but never states the rule clearly.',
            'Recites the rule but does not connect it to the facts.',
            'Overgeneralizes the case beyond its real limits.',
            'Ignores a listed analysis domain without saying why.',
        ],
        sourceIntake,
        sourceExtraction,
    };
}

function buildFallbackFrankQuestionPacket(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
}) {
    return [
        `Use ${input.selectedCase.title} (${input.selectedCase.citation}) as the anchor authority for a ${input.legalDomain} analysis.`,
        '',
        'Draft a legal analysis that addresses the following domains:',
        ...input.analysisDomains.map((domain, index) => `${index + 1}. ${domain.name}: ${domain.description}`),
        '',
        'Explain which domains are clearly triggered, which are only weakly implicated, and which are not meaningfully addressed by the anchor case.',
    ].join('\n');
}

function buildFallbackFrankDraft(input: {
    legalDomain: string;
    domainScope: string;
    sourceFamily: string;
    combinedText: string;
}) {
    const excerpt = firstSentence(input.combinedText) || 'The uploaded source materials require closer legal review.';
    const issue = excerpt.length > 180 ? `${excerpt.slice(0, 177)}...` : excerpt;
    return {
        sourceIntake: {
            sourceQualityRating: 'Moderate; usable with supporting authority',
            benchmarkPosture: 'generalizable_only_with_supporting_authority' as const,
            recommendation: 'Use as a lead source only with JD review and supporting authority.',
            jdReviewBurden: [
                'Confirm the extracted black-letter rule against the uploaded authority.',
                'Confirm whether the source is narrow, portable, or jurisdiction-sensitive.',
            ],
            reverseEngineeringSuitability: 'moderate' as const,
        },
        sourceExtraction: {
            legalIssue: issue,
            blackLetterRule: `The controlling rule should be stated narrowly within ${input.domainScope}.`,
            triggerFacts: splitSentences(input.combinedText).slice(0, 3),
            holding: 'A source-grounded holding should be confirmed by SME review.',
            limits: ['Source portability and doctrinal boundaries require confirmation.'],
            uncertainty: ['Jurisdiction sensitivity and source completeness need review.'],
        },
        benchmarkAnswer: [
            'Jurisdiction assumption:',
            'Treat the uploaded source as controlling until a JD narrows portability.',
            '',
            'Bottom-line outcome:',
            'The benchmark answer should track the source-grounded rule once validated.',
            '',
            'Controlling doctrine:',
            `Frame the answer around ${input.domainScope}.`,
            '',
            'Formation:',
            'Address formation only if the uploaded materials make it genuinely relevant.',
            '',
            'Statute of Frauds Gates:',
            'Analyze the controlling gate before any fallback theory.',
            '',
            'Exceptions/Promissory Estoppel:',
            'Keep fallback doctrines secondary and bounded by the source.',
            '',
            'Defenses/Mistake:',
            'Discuss only if the uploaded materials make them material.',
            '',
            'Strongest counterargument:',
            'The strongest counterargument should remain source-grounded.',
            '',
            'Bounded uncertainty:',
            'Flag any jurisdiction-specific or source-specific uncertainty explicitly.',
        ].join('\n'),
        benchmarkQuestion: 'Is the promise enforceable? Analyze.',
        failureModeSeeds: [
            'Fails to identify the controlling doctrine.',
            'Collapses the main enforceability gate with a fallback theory.',
            'Overstates portability beyond the uploaded source.',
        ],
        masterIssueStatement: issue,
    };
}

function buildFallbackKarthicDomains(frankPacket: FrankPacket): KarthicDomain[] {
    const baseDomains = frankPacket.analysisDomains.length > 0
        ? frankPacket.analysisDomains
        : buildFallbackFrankAnalysisDomains({
            legalDomain: frankPacket.legalDomain,
            selectedCase: frankPacket.selectedCase ?? {
                id: 'fallback_case',
                title: frankPacket.domainScope,
                citation: 'Citation not provided',
                court: 'Court not provided',
                year: 'Year not provided',
                url: '',
                summary: frankPacket.masterIssueStatement,
                relevance: frankPacket.masterIssueStatement,
            },
            desiredCount: 6,
        });

    return baseDomains.map((domain, index) => ({
        id: domain.id || `domain_${index + 1}`,
        name: domain.name,
        description: domain.description,
        weight: 1,
        naGuidance: `Mark ${domain.name} as not applicable only if the question packet does not materially trigger this domain.`,
    }));
}

function buildFallbackKarthicGoldenTargets(input: {
    frankPacket: FrankPacket;
    domains: KarthicDomain[];
}): KarthicGoldenDomainTarget[] {
    return input.domains.map((domain, index) => ({
        id: `golden_target_${index + 1}`,
        domainId: domain.id,
        domainName: domain.name,
        summary: `${input.frankPacket.selectedCase?.title ?? input.frankPacket.domainScope} should anchor the ${domain.name} domain.`,
        goldenContains: [
            `The answer should directly address ${domain.name}.`,
            `The answer should connect ${domain.name} back to the golden answer’s legal reasoning.`,
        ],
        allowedOmissions: [
            `Minor subpoints within ${domain.name} may be omitted if the question packet does not materially trigger them.`,
        ],
        contradictionFlags: [
            `The centroid should not affirm a position that contradicts the golden answer on ${domain.name}.`,
        ],
        comparisonGuidance: `Compare centroid coverage of ${domain.name} against the structured golden target rather than against raw prose overlap alone.`,
    }));
}

function buildFallbackGoldenTargetForDomain(domain: KarthicDomain): KarthicGoldenDomainTarget {
    return {
        id: `golden_target_${domain.id}`,
        domainId: domain.id,
        domainName: domain.name,
        summary: `Assess whether the centroid meaningfully covers ${domain.name}.`,
        goldenContains: [`The centroid should address ${domain.name} in a legally relevant way.`],
        allowedOmissions: [],
        contradictionFlags: [`The centroid should not contradict the expected treatment of ${domain.name}.`],
        comparisonGuidance: `Use ${domain.name} as the comparison lens.`,
    };
}

function buildFallbackRefinedCriteria(domain: KarthicDomain) {
    return [
        `The answer identifies the governing rule or gate relevant to ${domain.name}.`,
        `The answer applies ${domain.name} to the material facts rather than staying abstract.`,
        `The answer keeps ${domain.name} separate from fallback doctrines unless the facts make that crossover necessary.`,
    ];
}

function heuristicDomainEvaluation(input: {
    questionText: string;
    domain: KarthicDomain;
    goldenTarget: KarthicGoldenDomainTarget;
    criteria: string[];
    responseText: string;
}): {
    applicabilityStatus: 'applicable' | 'not_applicable';
    applicabilityExplanation: string;
    score: number | null;
    confidence: number;
    rationale: string;
    difference: DomainCentroidDifference;
} {
    const domainText = normalizeForSimilarity([
        input.domain.name,
        input.domain.description,
        input.goldenTarget.summary,
        ...input.goldenTarget.goldenContains,
        ...input.goldenTarget.contradictionFlags,
        ...input.criteria,
    ].join(' '));
    const responseText = normalizeForSimilarity(input.responseText);
    const overlap = jaccardSimilarity(domainText, responseText);
    const questionOverlap = jaccardSimilarity(normalizeForSimilarity(input.questionText), domainText);
    const applicable = questionOverlap > 0.06 || overlap > 0.05;
    const score = applicable ? Math.round(clampNumber(overlap * 240, 15, 96)) : null;
    const matchedGoldenPoints = input.goldenTarget.goldenContains.filter((point) => {
        const normalizedPoint = normalizeForSimilarity(point);
        return normalizedPoint.length > 0 && jaccardSimilarity(normalizedPoint, responseText) > 0.08;
    });
    const missingGoldenPoints = input.goldenTarget.goldenContains.filter((point) => !matchedGoldenPoints.includes(point));
    const contradictionPoints = input.goldenTarget.contradictionFlags.filter((point) => {
        const normalizedPoint = normalizeForSimilarity(point);
        return normalizedPoint.length > 0 && jaccardSimilarity(normalizedPoint, responseText) > 0.08;
    });

    return {
        applicabilityStatus: applicable ? 'applicable' as const : 'not_applicable' as const,
        applicabilityExplanation: applicable
            ? `The representative answer engages with the ${input.domain.name} domain.`
            : input.domain.naGuidance || `This domain is not clearly triggered by the question or answer.`,
        score,
        confidence: roundToTwo(applicable ? Math.max(overlap, 0.35) : 0.4),
        rationale: applicable
            ? `Score derived from overlap between the representative answer and the domain criteria for ${input.domain.name}.`
            : `Marked not applicable under the stored NA guidance for ${input.domain.name}.`,
        difference: {
            matchedGoldenPoints,
            missingGoldenPoints,
            extraCentroidPoints: [],
            contradictionPoints,
            differenceSummary: applicable
                ? `Matched ${matchedGoldenPoints.length} of ${input.goldenTarget.goldenContains.length} expected points for ${input.domain.name}.`
                : `No meaningful coverage of ${input.domain.name} was detected.`,
        },
    };
}

function buildInitialCriteria(domains: KarthicDomain[]): KarthicCriterion[] {
    return domains.map((domain) => ({
        id: `criterion_${randomUUID().slice(0, 8)}`,
        domainId: domain.id,
        text: `The answer correctly addresses ${domain.name} in a way that is consistent with the approved benchmark answer.`,
        parentId: null,
        depth: 0,
        status: 'active' as const,
        source: 'seed' as const,
    }));
}

function buildCriteriaFromGoldenTargets(targets: KarthicGoldenDomainTarget[]) {
    return targets.flatMap((target) => {
        const points = target.goldenContains.length > 0 ? target.goldenContains : [target.summary];
        return points.map((text) => ({
            id: `criterion_${randomUUID().slice(0, 8)}`,
            domainId: target.domainId,
            text,
            parentId: null,
            depth: 0,
            status: 'active' as const,
            source: 'seed' as const,
        }));
    });
}

function buildSeedRefinementLog(criteria: KarthicCriterion[]) {
    const timestamp = new Date().toISOString();
    return criteria.map((criterion) => ({
        id: `log_${randomUUID().slice(0, 8)}`,
        timestamp,
        domainId: criterion.domainId,
        criterionId: criterion.id,
        action: 'created_seed' as const,
        note: 'Created initial coarse criterion from approved Frank benchmark answer.',
    }));
}

function buildGoldenTargetRefinementLog(targets: KarthicGoldenDomainTarget[]): RefinementLogEntry[] {
    const timestamp = new Date().toISOString();
    return targets.map((target) => ({
        id: `log_${randomUUID().slice(0, 8)}`,
        timestamp,
        domainId: target.domainId,
        criterionId: null,
        action: 'created_seed' as RefinementLogEntry['action'],
        note: 'Generated structured golden target from the approved Frank answer.',
    }));
}

function normalizeFrankCaseCandidates(value: unknown): FrankCaseCandidate[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item, index) => normalizeFrankCaseCandidate(item, index))
        .filter((item): item is FrankCaseCandidate => Boolean(item));
}

function normalizeFrankCaseCandidate(value: unknown, index = 0): FrankCaseCandidate | null {
    if (!isRecord(value)) {
        return null;
    }
    const title = normalizeOptionalString(value.title, '');
    if (!title) {
        return null;
    }
    return {
        id: normalizeOptionalString(value.id, `case_${index + 1}`) || `case_${index + 1}`,
        title,
        citation: normalizeOptionalString(value.citation, 'Citation not provided'),
        court: normalizeOptionalString(value.court, 'Court not provided'),
        year: normalizeOptionalString(value.year, 'Year not provided'),
        url: normalizeOptionalString(value.url, ''),
        summary: normalizeOptionalString(value.summary, 'No summary provided.'),
        relevance: normalizeOptionalString(value.relevance, 'No relevance note provided.'),
    };
}

function normalizeFrankAnalysisDomains(value: unknown): FrankAnalysisDomain[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item, index) => {
            const record = isRecord(item) ? item : {};
            const name = normalizeOptionalString(record.name, '').trim();
            const description = normalizeOptionalString(record.description, '').trim();
            if (!name || !description) {
                return null;
            }
            return {
                id: normalizeOptionalString(record.id, `analysis_domain_${index + 1}`) || `analysis_domain_${index + 1}`,
                name,
                description,
            };
        })
        .filter((item): item is FrankAnalysisDomain => Boolean(item));
}

function normalizeDomains(domains: KarthicDomain[]) {
    return domains.map((domain, index) => ({
        id: domain.id?.trim() || `domain_${index + 1}`,
        name: normalizeNonEmptyString(domain.name, `Domain ${index + 1}`),
        description: normalizeNonEmptyString(domain.description, 'No description provided.'),
        weight: clampNumber(toNumber(domain.weight, 1), 0.01, 100),
        naGuidance: normalizeNonEmptyString(domain.naGuidance, 'This domain is not applicable to the given question.'),
    }));
}

function normalizeDomainsFromUnknown(value: unknown, frankAnalysisDomains: FrankAnalysisDomain[]) {
    if (!Array.isArray(value)) {
        return [];
    }
    return normalizeDomains(value.map((item, index) => {
        const record = isRecord(item) ? item : {};
        const fallbackFrankDomain = frankAnalysisDomains[index] ?? null;
        return {
            id: normalizeOptionalString(record.id, fallbackFrankDomain?.id ?? `domain_${index + 1}`),
            name: normalizeOptionalString(record.name, fallbackFrankDomain?.name ?? ''),
            description: normalizeOptionalString(record.description, fallbackFrankDomain?.description ?? ''),
            weight: toNumber(record.weight, 1),
            naGuidance: normalizeOptionalString(record.naGuidance, `This domain is not applicable to the given question.`),
        };
    }) as KarthicDomain[]);
}

function normalizeCriteria(criteria: KarthicCriterion[]): KarthicCriterion[] {
    return criteria.map((criterion, index) => ({
        id: criterion.id?.trim() || `criterion_${index + 1}`,
        domainId: criterion.domainId,
        text: normalizeNonEmptyString(criterion.text, `Criterion ${index + 1}`),
        parentId: criterion.parentId ?? null,
        depth: Math.max(0, Number.isFinite(criterion.depth) ? criterion.depth : 0),
        status: criterion.status === 'redundant' || criterion.status === 'draft' ? criterion.status : 'active',
        source: criterion.source === 'refined' || criterion.source === 'sme_promoted' ? criterion.source : 'seed',
    }));
}

function normalizeGoldenTargets(
    value: unknown,
    domains: KarthicDomain[],
    fallback: KarthicGoldenDomainTarget[],
) {
    if (!Array.isArray(value)) {
        return fallback;
    }
    const domainById = new Map(domains.map((domain) => [domain.id, domain]));
    const normalized = value
        .map((item, index) => {
            const record = isRecord(item) ? item : {};
            const fallbackTarget = fallback[index] ?? null;
            const domainId = normalizeOptionalString(record.domainId, fallbackTarget?.domainId ?? '');
            const domain = domainById.get(domainId) ?? domains[index] ?? null;
            if (!domain) {
                return null;
            }
            return {
                id: normalizeOptionalString(record.id, fallbackTarget?.id ?? `golden_target_${index + 1}`),
                domainId: domain.id,
                domainName: domain.name,
                summary: normalizeNonEmptyString(record.summary, fallbackTarget?.summary ?? `Structured target for ${domain.name}.`),
                goldenContains: normalizeStringArray(record.goldenContains),
                allowedOmissions: normalizeStringArray(record.allowedOmissions),
                contradictionFlags: normalizeStringArray(record.contradictionFlags),
                comparisonGuidance: normalizeNonEmptyString(
                    record.comparisonGuidance,
                    fallbackTarget?.comparisonGuidance ?? `Compare centroid coverage against the golden target for ${domain.name}.`,
                ),
            };
        })
        .filter((item): item is KarthicGoldenDomainTarget => Boolean(item))
        .map((target, index) => ({
            ...target,
            goldenContains: target.goldenContains.length > 0
                ? target.goldenContains
                : fallback[index]?.goldenContains ?? [`The centroid should address ${target.domainName}.`],
        }));

    return normalized.length > 0 ? normalized : fallback;
}

function normalizeRefinementLog(entries: RefinementLogEntry[]): RefinementLogEntry[] {
    return entries.map((entry, index) => ({
        id: entry.id?.trim() || `log_${index + 1}`,
        timestamp: normalizeOptionalString(entry.timestamp, new Date().toISOString()),
        domainId: normalizeOptionalString(entry.domainId, ''),
        criterionId: entry.criterionId ?? null,
        action: entry.action === 'decomposed'
            || entry.action === 'marked_redundant'
            || entry.action === 'manual_edit'
            ? entry.action
            : 'created_seed' as RefinementLogEntry['action'],
        note: normalizeNonEmptyString(entry.note, 'No note provided.'),
    }));
}

function normalizeKarthicRubricPack(value: unknown): KarthicRubricPack | null {
    if (!isRecord(value)) {
        return null;
    }

    const domains = Array.isArray(value.domains) ? normalizeDomains(value.domains as KarthicDomain[]) : [];
    if (!domains.length) {
        return null;
    }
    const fallbackTargets = buildFallbackKarthicGoldenTargets({
        frankPacket: {
            id: normalizeOptionalString(value.frankPacketId, 'frank_unknown'),
            status: 'approved',
            legalDomain: 'Unknown legal domain',
            domainScope: 'Unknown domain scope',
            sourceFamily: 'unknown',
            selectedCase: null,
            analysisDomains: domains.map((domain) => ({ id: domain.id, name: domain.name, description: domain.description })),
            sourceArtifacts: [],
            sourceIntake: buildFrankSourceIntakeFallback(null),
            sourceExtraction: buildFrankSourceExtractionFallback({
                legalDomain: 'Unknown legal domain',
                selectedCase: null,
                analysisDomains: domains.map((domain) => ({ id: domain.id, name: domain.name, description: domain.description })),
            }),
            benchmarkAnswer: '',
            benchmarkQuestion: '',
            failureModeSeeds: [],
            masterIssueStatement: '',
            approvedAt: null,
            createdAt: normalizeOptionalString(value.createdAt, new Date().toISOString()),
            updatedAt: normalizeOptionalString(value.updatedAt, new Date().toISOString()),
        },
        domains,
    });

    const goldenTargets = normalizeGoldenTargets(value.goldenTargets, domains, fallbackTargets);
    const criteria = Array.isArray(value.criteria) && value.criteria.length > 0
        ? normalizeCriteria(value.criteria as KarthicCriterion[])
        : buildCriteriaFromGoldenTargets(goldenTargets);
    const refinementLog = Array.isArray(value.refinementLog) && value.refinementLog.length > 0
        ? normalizeRefinementLog(value.refinementLog as RefinementLogEntry[])
        : buildGoldenTargetRefinementLog(goldenTargets);

    return {
        id: normalizeNonEmptyString(value.id, `karthic_${randomUUID().slice(0, 8)}`),
        frankPacketId: normalizeNonEmptyString(value.frankPacketId, 'frank_unknown'),
        status: value.status === 'approved' ? 'approved' : 'draft',
        domains,
        goldenTargets,
        criteria,
        refinementLog,
        smeNotes: normalizeOptionalString(value.smeNotes, ''),
        comparisonMethodNote: normalizeOptionalString(
            value.comparisonMethodNote,
            'Compare each centroid against structured golden-answer targets.',
        ),
        approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : null,
        createdAt: normalizeOptionalString(value.createdAt, new Date().toISOString()),
        updatedAt: normalizeOptionalString(value.updatedAt, new Date().toISOString()),
    };
}

function normalizeSourceIntake(value: unknown, fallback: SourceIntake): SourceIntake {
    const record = isRecord(value) ? value : {};
    const reverseEngineeringSuitability = record.reverseEngineeringSuitability === 'strong'
        || record.reverseEngineeringSuitability === 'weak'
        ? record.reverseEngineeringSuitability
        : fallback.reverseEngineeringSuitability;
    const benchmarkPosture = record.benchmarkPosture === 'narrow_source_grounded_benchmark_only'
        || record.benchmarkPosture === 'generalizable_only_with_supporting_authority'
        || record.benchmarkPosture === 'portable_common_law_benchmark'
        ? record.benchmarkPosture
        : fallback.benchmarkPosture;

    return {
        sourceQualityRating: normalizeNonEmptyString(record.sourceQualityRating, fallback.sourceQualityRating),
        benchmarkPosture,
        recommendation: normalizeNonEmptyString(record.recommendation, fallback.recommendation),
        jdReviewBurden: normalizeStringArray(record.jdReviewBurden),
        reverseEngineeringSuitability,
    };
}

function normalizeSourceExtraction(value: unknown, fallback: SourceExtraction): SourceExtraction {
    const record = isRecord(value) ? value : {};
    return {
        legalIssue: normalizeNonEmptyString(record.legalIssue, fallback.legalIssue),
        blackLetterRule: normalizeNonEmptyString(record.blackLetterRule, fallback.blackLetterRule),
        triggerFacts: normalizeStringArray(record.triggerFacts),
        holding: normalizeNonEmptyString(record.holding, fallback.holding),
        limits: normalizeStringArray(record.limits),
        uncertainty: normalizeStringArray(record.uncertainty),
    };
}

function normalizeOptionalString(value: unknown, fallback: string) {
    return typeof value === 'string' ? value.trim() : fallback;
}

async function tryOpenAiJson(systemPrompt: string, userPrompt: string) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            temperature: 0.1,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
        });
        const content = response.choices[0]?.message?.content ?? '';
        return safeJsonParse(content);
    } catch {
        return null;
    }
}

type GenerateModelOptions = {
    provider: ModelProvider;
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort?: ReasoningEffort;
};

async function generateModelResponse({ provider, model, systemPrompt, messages, temperature, reasoningEffort }: GenerateModelOptions) {
    if (provider === 'anthropic') {
        return await generateAnthropicResponse({ model, systemPrompt, messages, temperature });
    }
    if (provider === 'gemini') {
        return await generateGeminiResponse({ model, systemPrompt, messages, temperature, reasoningEffort });
    }

    const isResponsesApi = model === 'gpt-5-mini' || model === 'gpt-5-nano' || model === 'gpt-5.2' || model === 'gpt-5.2-pro' || model === 'gpt-5.2-chat-latest';
    if (isResponsesApi) {
        const request: {
            model: string;
            input: string;
            instructions: string;
            text: { format: { type: 'text' }; verbosity: 'medium' };
            reasoning?: { effort: 'low' | 'medium' | 'high'; summary: 'auto' };
        } = {
            model,
            input: messages.map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`).join('\n'),
            instructions: systemPrompt,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
        };

        const mappedEffort = mapReasoningEffort(reasoningEffort);
        if (mappedEffort) {
            request.reasoning = {
                effort: mappedEffort,
                summary: 'auto',
            };
        }

        const response = await openai.responses.create(request);
        return extractResponsesText(response);
    }

    const response = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
        ],
        temperature,
    });
    return response.choices[0]?.message?.content || '';
}

async function generateAnthropicResponse(input: {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
}) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: input.model,
            max_tokens: 2200,
            temperature: input.temperature,
            system: input.systemPrompt,
            messages: input.messages.map((message) => ({
                role: message.role,
                content: message.content,
            })),
        }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error((json as { error?: { message?: string } })?.error?.message || 'Anthropic request failed.');
    }
    const parts = Array.isArray((json as { content?: Array<{ text?: string }> }).content)
        ? (json as { content: Array<{ text?: string }> }).content
        : [];
    return parts.map((part) => part.text).filter(Boolean).join('');
}

async function generateGeminiResponse(input: {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
    temperature: number;
    reasoningEffort?: ReasoningEffort;
}) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set.');
    }

    const contents = input.messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
    }));
    if (input.systemPrompt.trim()) {
        contents.unshift({
            role: 'user',
            parts: [{ text: `System: ${input.systemPrompt}` }],
        });
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: input.temperature,
                ...(mapGeminiThinkingLevel(input.reasoningEffort)
                    ? { thinkingConfig: { thinkingLevel: mapGeminiThinkingLevel(input.reasoningEffort) } }
                    : {}),
            },
        }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error((json as { error?: { message?: string } })?.error?.message || 'Gemini request failed.');
    }
    const candidate = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
    return (candidate?.content?.parts ?? []).map((part) => part.text).filter(Boolean).join('');
}

function mapReasoningEffort(reasoningEffort?: ReasoningEffort) {
    if (!reasoningEffort || reasoningEffort === 'none') {
        return null;
    }
    return reasoningEffort === 'xhigh' ? 'high' : reasoningEffort;
}

function mapGeminiThinkingLevel(reasoningEffort?: ReasoningEffort) {
    const mapped = mapReasoningEffort(reasoningEffort);
    if (!mapped) {
        return null;
    }
    return mapped === 'high' ? 'high' : mapped;
}

function extractResponsesText(response: unknown) {
    if (!response || typeof response !== 'object') {
        return '';
    }
    const responseRecord = response as {
        output_text?: string;
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    if (typeof responseRecord.output_text === 'string') {
        return responseRecord.output_text;
    }
    for (const block of responseRecord.output ?? []) {
        for (const content of block.content ?? []) {
            if (typeof content.text === 'string') {
                return content.text;
            }
        }
    }
    return '';
}

async function listArtifacts<T>(directoryKey: keyof typeof DATA_DIRECTORIES | string) {
    const directory = await ensureDirectory(directoryKey);
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    const items: T[] = [];

    for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name) !== '.json') {
            continue;
        }
        const record = await safeReadJson<T>(path.join(directory, entry.name));
        if (record) {
            items.push(record);
        }
    }

    return items.sort((left, right) => {
        const leftUpdatedAt = (left as Record<string, unknown>).updatedAt;
        const rightUpdatedAt = (right as Record<string, unknown>).updatedAt;
        return String(rightUpdatedAt ?? '').localeCompare(String(leftUpdatedAt ?? ''));
    });
}

async function readArtifact<T>(directoryKey: keyof typeof DATA_DIRECTORIES | string, id: string) {
    const directory = await ensureDirectory(directoryKey);
    return await safeReadJson<T>(path.join(directory, `${sanitizeFileName(id)}.json`));
}

async function writeArtifact<T>(directoryKey: keyof typeof DATA_DIRECTORIES | string, id: string, value: T) {
    const directory = await ensureDirectory(directoryKey);
    await fs.writeFile(path.join(directory, `${sanitizeFileName(id)}.json`), JSON.stringify(value, null, 2), 'utf8');
}

async function safeReadJson<T>(filePath: string) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

async function ensureDirectory(directoryKey: keyof typeof DATA_DIRECTORIES | string) {
    const root = path.basename(process.cwd()) === 'frontend'
        ? path.resolve(process.cwd(), '../legal-workflow-data')
        : path.resolve(process.cwd(), 'legal-workflow-data');
    const directory = path.join(root, directoryKey in DATA_DIRECTORIES ? DATA_DIRECTORIES[directoryKey as keyof typeof DATA_DIRECTORIES] : directoryKey);
    await fs.mkdir(directory, { recursive: true });
    return directory;
}

async function resolvePythonExecutable() {
    const root = path.basename(process.cwd()) === 'frontend'
        ? path.resolve(process.cwd(), '..')
        : process.cwd();
    const candidates = [
        path.join(root, 'lsh', '.venv', 'bin', 'python3'),
        path.join(root, '.venv', 'bin', 'python3'),
    ];

    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }

    try {
        await execFileAsync('python3', ['--version']);
        return 'python3';
    } catch {
        return null;
    }
}

function normalizeExtractedText(value: string) {
    return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeForSimilarity(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function jaccardSimilarity(left: string, right: string) {
    const leftSet = new Set(left.split(' ').filter(Boolean));
    const rightSet = new Set(right.split(' ').filter(Boolean));
    if (leftSet.size === 0 || rightSet.size === 0) {
        return 0;
    }
    let intersection = 0;
    for (const token of leftSet) {
        if (rightSet.has(token)) {
            intersection += 1;
        }
    }
    const union = new Set([...leftSet, ...rightSet]).size;
    return union > 0 ? intersection / union : 0;
}

function averageSimilarity(responseId: string, members: DashaResponseRecord[], textMap: Map<string, string>) {
    const base = textMap.get(responseId) ?? '';
    const values = members.map((member) => jaccardSimilarity(base, textMap.get(member.id) ?? ''));
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / Math.max(values.length, 1);
}

function normalizeNonEmptyString(value: unknown, fallback: string) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }
    return value
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
}

function splitSentences(value: string) {
    return value
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

function firstSentence(value: string) {
    return splitSentences(value)[0] ?? '';
}

function safeJsonParse<T = Record<string, unknown>>(value: string) {
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function sanitizeFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function toNumber(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function roundToTwo(value: number) {
    return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
