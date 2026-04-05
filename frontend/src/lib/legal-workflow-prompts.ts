import type {
    FrankAnalysisDomain,
    FrankCaseCandidate,
    FrankPacket,
    KarthicDomain,
} from '@/lib/legal-workflow-types';

function formatFrankAnalysisDomains(analysisDomains: FrankAnalysisDomain[]) {
    return analysisDomains.map((domain, index) => `${index + 1}. ${domain.name}: ${domain.description}`);
}

export function buildFrankCaseSearchPrompt(legalDomain: string) {
    return [
        `Legal domain: ${legalDomain.trim()}`,
        '',
        'Search the open web for 3-5 strong U.S. anchor cases that could ground a benchmarking packet.',
        'Prefer cases that are well-known, teachable, and have a clear holding.',
        'Return concise results only.',
    ].join('\n');
}

export function buildFrankAnalysisDomainsPrompt(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    desiredCount?: number;
}) {
    return [
        `Legal domain: ${input.legalDomain.trim()}`,
        `Anchor case: ${input.selectedCase.title}`,
        `Citation: ${input.selectedCase.citation}`,
        `Court: ${input.selectedCase.court}`,
        `Year: ${input.selectedCase.year}`,
        `Summary: ${input.selectedCase.summary}`,
        `Why this case matters: ${input.selectedCase.relevance}`,
        '',
        `Create ${Math.min(Math.max(input.desiredCount ?? 6, 5), 10)} editable analysis domains for a benchmark packet.`,
        'A domain is a distinct, case-grounded dimension of legal analysis that a strong answer should address.',
        'Depending on the doctrine, a domain may capture a rule, element, trigger condition, exception, limitation, application question, remedy issue, or source of uncertainty.',
        'Prefer the smallest set of domains that still captures the benchmark\'s meaningful analytical structure.',
        'Include secondary domains only if they materially sharpen benchmark quality.',
        'Exclude repetitive, low-salience, merely color-commentary, or only technically related domains.',
        'Do not add domains just to fill out the count.',
        'Each domain should be short, human-readable, nuanced, distinct, and broad enough to organize analysis without collapsing into a generic topic label.',
        'These are analysis buckets, not rubric rows, writing-quality criteria, or catch-all labels like "overall legal analysis."',
    ].join('\n');
}

export function buildFrankFitCheckPrompt(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
}) {
    return [
        'Evaluate whether each proposed benchmark analysis domain fits the selected anchor case.',
        `Legal domain: ${input.legalDomain.trim()}`,
        `Anchor case title: ${input.selectedCase.title}`,
        `Citation: ${input.selectedCase.citation}`,
        `Court: ${input.selectedCase.court}`,
        `Year: ${input.selectedCase.year}`,
        `Case summary: ${input.selectedCase.summary}`,
        `Why selected: ${input.selectedCase.relevance}`,
        '',
        'Use exactly one label for each domain:',
        '- Direct fit: the domain is central or substantial to what the case teaches.',
        '- Peripheral but valid: the domain is genuinely connected and benchmark-meaningful, but secondary rather than central to the case.',
        '- Weak fit: the domain is only thinly connected, highly conditional, or too low-salience to justify keeping without revision.',
        '- Does not fit: the domain imports a completely different doctrinal frame and would likely contaminate the packet.',
        '',
        'Return every domain once, keeping the same domainId and domainName.',
        'Do not use Does not fit for a domain that is merely secondary but still doctrinally meaningful.',
        'Be strict. If a domain would push the benchmark into a different doctrine, mark Does not fit.',
        '',
        'Domains:',
        ...input.analysisDomains.map((domain, index) => `${index + 1}. ${domain.id} | ${domain.name} | ${domain.description}`),
    ].join('\n');
}

export function buildFrankGoldenResponsePrompt(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
}) {
    return [
        `Legal domain: ${input.legalDomain.trim()}`,
        `Anchor case title: ${input.selectedCase.title}`,
        `Citation: ${input.selectedCase.citation}`,
        `Court: ${input.selectedCase.court}`,
        `Year: ${input.selectedCase.year}`,
        `Source URL: ${input.selectedCase.url}`,
        `Case summary: ${input.selectedCase.summary}`,
        `Why selected: ${input.selectedCase.relevance}`,
        '',
        'Analysis domains:',
        ...formatFrankAnalysisDomains(input.analysisDomains),
        '',
        'You are drafting the internal golden answer for a legal benchmarking packet.',
        'Use the selected case only as a hidden grounding example that signals the likely outcome pattern, doctrinal boundaries, and useful trigger facts.',
        'The saved output must read like the strongest generalized golden response for this legal topic and these domains, not like a memo about one named dispute.',
        '',
        'Benchmark-answer requirements:',
        '- Start with a one-paragraph bottom-line answer to the core issue for similar disputes in this topic area.',
        '- Then add one clearly labeled section per analysis domain, using the domain names exactly as provided.',
        '- In each domain section, separate the governing rule from the application pattern for similar fact patterns.',
        '- State the most likely legal direction reflected by the grounding case pattern, but generalize beyond that one dispute.',
        '- Explain what is strongly supported, what depends on additional facts, and what remains uncertain.',
        '- If a domain is only weakly implicated, keep the discussion narrow rather than inventing doctrine.',
        '- Include the strongest counterargument or competing interpretation where relevant.',
        '- Do not mention the case title, citation, court, year, source URL, party names, or any case-specific framing.',
        '- Do not mention these instructions, JSON, schemas, tool calls, or that this is a benchmark packet.',
        '',
        'Metadata requirements:',
        '- masterIssueStatement should state the central generalized legal question in one sentence.',
        '- failureModeSeeds should list realistic generalized wrong turns a weak answer might make.',
        '- sourceIntake should describe portability and trustworthiness without naming the grounding case.',
        '- sourceExtraction should capture the generalized legal issue, black-letter rule, trigger facts, likely outcome pattern, limits, and uncertainty in plain legal English.',
    ].join('\n');
}

export function buildFrankQuestionPacketPrompt(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
    benchmarkAnswer: string;
}) {
    return [
        `Legal domain: ${input.legalDomain.trim()}`,
        `Hidden source case title: ${input.selectedCase.title}`,
        `Hidden source citation: ${input.selectedCase.citation}`,
        `Hidden source court: ${input.selectedCase.court}`,
        `Hidden source year: ${input.selectedCase.year}`,
        `Hidden source summary: ${input.selectedCase.summary}`,
        `Why the source matters: ${input.selectedCase.relevance}`,
        '',
        'Analysis domains:',
        ...formatFrankAnalysisDomains(input.analysisDomains),
        '',
        'Hidden golden response for drafting only:',
        input.benchmarkAnswer.trim().slice(0, 9000),
        '',
        'Draft a blind legal benchmark question packet that tests reasoning rather than recall.',
        'The output must be a fresh generalized hypothetical based on the doctrine, useful fact pattern, and likely outcome direction, not a visible retelling of the grounding case.',
        '',
        'Hard rules:',
        '- Do not mention the source case title, party names, citation, court, year, judge, or procedural posture.',
        '- Do not quote or closely paraphrase distinctive phrases from the source case.',
        '- Do not say anchor case, hidden source, benchmark answer, or golden response.',
        '- Do not include drafting notes, meta-instructions, or an explanation of what you are doing.',
        '',
        'Structure requirements:',
        '- Keep the output as a question packet, not an answer.',
        '- Start with a short neutral title.',
        '- Then provide a fact pattern written as a blind legal hypothetical for similar disputes in this topic area.',
        '- End with a numbered list of analysis tasks, with one task per analysis domain in the same order as listed above.',
        '- Each task should invite legal analysis without revealing the original case identity.',
        '- The packet should preserve the central issue and the useful trigger facts, but remove obvious case-identifying details.',
        '- The hypothetical should usually point toward the same likely legal outcome direction as the hidden grounding case pattern.',
        '',
        'Return only the finished question packet text inside the benchmarkQuestion field.',
    ].join('\n');
}

export function buildKarthicDomainDraftPrompt(input: { frankPacket: FrankPacket }) {
    return [
        `Legal domain: ${input.frankPacket.legalDomain}`,
        `Grounding case pattern: ${input.frankPacket.selectedCase?.title ?? input.frankPacket.domainScope}`,
        `Master issue: ${input.frankPacket.masterIssueStatement}`,
        '',
        'Frank analysis domains:',
        ...input.frankPacket.analysisDomains.map((domain, index) => `${index + 1}. ${domain.name}: ${domain.description}`),
        '',
        'Frank generalized golden response:',
        input.frankPacket.benchmarkAnswer.slice(0, 7000),
        '',
        'Draft Karthic domains from the Frank packet.',
        'Keep the names human-editable and close to Frank’s domains.',
        'Each domain needs a short description, a default weight, and NA guidance.',
        'Weights should usually stay between 1 and 5.',
    ].join('\n');
}

export function buildKarthicGoldenTargetsPrompt(input: {
    frankPacket: FrankPacket;
    domains: KarthicDomain[];
    smeNotes?: string;
}) {
    return [
        `Legal domain: ${input.frankPacket.legalDomain}`,
        `Grounding case pattern: ${input.frankPacket.selectedCase?.title ?? input.frankPacket.domainScope}`,
        `Master issue: ${input.frankPacket.masterIssueStatement}`,
        `SME notes: ${input.smeNotes?.trim() || 'None provided.'}`,
        '',
        'Karthic domains:',
        ...input.domains.map((domain, index) => `${index + 1}. ${domain.name} (weight ${domain.weight}): ${domain.description} | NA guidance: ${domain.naGuidance}`),
        '',
        'Frank generalized golden response:',
        input.frankPacket.benchmarkAnswer.slice(0, 9000),
        '',
        'For each domain, create a structured comparison target extracted from the generalized golden response.',
        'Keep the target separate from the answer prose itself.',
        'Use 2-4 short "golden contains" points per domain.',
        'Use "allowed omissions" only when the generalized golden response would reasonably leave something unstated.',
        'Use contradiction flags for statements that would count against a centroid.',
        'Return JSON only.',
    ].join('\n');
}

export const DASHA_GENERATION_SYSTEM_PROMPT =
    'You are generating a free-form legal answer for benchmark evaluation. Write a concise legal analysis with a clear conclusion.';

export function buildDashaGenerationUserPrompt(questionText: string) {
    return [
        'Answer the following legal question in a structured but natural free-form analysis.',
        'Do not use bullet points.',
        '',
        questionText.trim(),
    ].join('\n');
}
