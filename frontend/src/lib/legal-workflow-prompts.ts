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

export function buildFrankUploadedCasePrompt(input: {
    legalDomain: string;
    sourceFamily: string;
    fileNames: string[];
    sourceText: string;
}) {
    return [
        `Legal domain: ${input.legalDomain.trim()}`,
        `Source family: ${input.sourceFamily.trim()}`,
        `Uploaded files: ${input.fileNames.join(', ') || 'Unknown PDF upload'}`,
        '',
        'You are identifying a single anchor case from uploaded source materials.',
        'Decide whether the uploaded text is usable as an anchor case for the stated legal domain.',
        'If usable, extract the case metadata and write a concise summary plus a short note explaining why the case matters for benchmarking.',
        'If not usable, set isUsable to false and explain the failure clearly in reason.',
        'Return JSON only.',
        '',
        'Source text:',
        input.sourceText,
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
        '- Important: AVOID ALL MENTIONS of the case title, citation, court, year, source URL, party names, or any case-specific framing.',
        '- Do NOT mention these instructions, JSON, schemas, tool calls, or that this is a benchmark packet.',
        '',
        'Metadata requirements:',
        '- masterIssueStatement should state the central generalized legal question in one sentence.',
        '- failureModeSeeds should list realistic generalized wrong turns a weak answer might make.',
        '- sourceIntake should describe portability and trustworthiness without naming the grounding case.',
        '- sourceExtraction should capture the generalized legal issue, black-letter rule, trigger facts, likely outcome pattern, limits, and uncertainty in plain legal English.',
    ].join('\n');
}

export function buildFrankGoldenRefinementPrompt(input: {
    legalDomain: string;
    selectedCase: FrankCaseCandidate;
    analysisDomains: FrankAnalysisDomain[];
    currentDraft: {
        masterIssueStatement: string;
        benchmarkAnswer: string;
        failureModeSeeds: string[];
        sourceIntake: FrankPacket['sourceIntake'];
        sourceExtraction: FrankPacket['sourceExtraction'];
    };
    feedback: string[];
}) {
    return [
        buildFrankGoldenResponsePrompt({
            legalDomain: input.legalDomain,
            selectedCase: input.selectedCase,
            analysisDomains: input.analysisDomains,
        }),
        '',
        'You are revising an existing generalized golden response draft.',
        'Preserve the same legal topic, overall likely outcome direction, and domain structure unless the feedback requires a narrower or more generalized phrasing choice.',
        'Fix the issues called out in the feedback while keeping the output doctrinally serious and generalized.',
        '',
        'Feedback to address:',
        ...input.feedback.map((item, index) => `${index + 1}. ${item}`),
        '',
        'Current draft to revise:',
        `masterIssueStatement: ${input.currentDraft.masterIssueStatement}`,
        '',
        'benchmarkAnswer:',
        input.currentDraft.benchmarkAnswer.trim().slice(0, 9000),
        '',
        `failureModeSeeds: ${input.currentDraft.failureModeSeeds.join(' | ') || 'None provided.'}`,
        `sourceQualityRating: ${input.currentDraft.sourceIntake.sourceQualityRating}`,
        `benchmarkPosture: ${input.currentDraft.sourceIntake.benchmarkPosture}`,
        `recommendation: ${input.currentDraft.sourceIntake.recommendation}`,
        `jdReviewBurden: ${input.currentDraft.sourceIntake.jdReviewBurden.join(' | ') || 'None provided.'}`,
        `reverseEngineeringSuitability: ${input.currentDraft.sourceIntake.reverseEngineeringSuitability}`,
        `legalIssue: ${input.currentDraft.sourceExtraction.legalIssue}`,
        `blackLetterRule: ${input.currentDraft.sourceExtraction.blackLetterRule}`,
        `triggerFacts: ${input.currentDraft.sourceExtraction.triggerFacts.join(' | ') || 'None provided.'}`,
        `holding: ${input.currentDraft.sourceExtraction.holding}`,
        `limits: ${input.currentDraft.sourceExtraction.limits.join(' | ') || 'None provided.'}`,
        `uncertainty: ${input.currentDraft.sourceExtraction.uncertainty.join(' | ') || 'None provided.'}`,
        '',
        'Revise the draft directly. Do not explain the changes. Return the full replacement output in the same JSON fields as before.',
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
        'Draft a blind exam-style legal hypothetical that tests reasoning rather than recall.',
        'The output must be a fresh generalized hypothetical based on the doctrine, useful fact pattern, and likely outcome direction, not a visible retelling of the grounding case.',
        'Write the packet so that a later model would naturally respond with a concise structured legal memo that ends in a clear bottom-line conclusion.',
        '',
        'Hard rules:',
        '- Do not mention the source case title, party names, citation, court, year, judge, or procedural posture.',
        '- Do not quote or closely paraphrase distinctive phrases from the source case.',
        '- Do not say anchor case, hidden source, benchmark answer, or golden response.',
        '- Do not include drafting notes, meta-instructions, or an explanation of what you are doing.',
        '- Do not ask for classroom tools, alternate hypos, witness lists, pleadings strategy, or other extra deliverables beyond the listed tasks.',
        '',
        'Output format:',
        '- Keep the output as a question packet, not an answer.',
        '- Use exactly these sections in order: Title, Facts, Tasks, Answer Format.',
        '- Title: one short neutral title only.',
        '- Facts: one clean fact pattern written as a blind legal hypothetical for similar disputes in this topic area.',
        '- Tasks: one numbered task per analysis domain, in the same order as listed above, using each domain name directly.',
        '- Answer Format: one short instruction telling the responder to write a structured legal memo organized by the numbered tasks and ending with a clear bottom-line conclusion.',
        '',
        'Writing requirements for the packet:',
        '- The fact pattern should preserve the central issue and the useful trigger facts, but remove obvious case-identifying details.',
        '- The hypothetical should usually point toward the same likely legal outcome direction as the hidden grounding case pattern.',
        '- Each numbered task should sound like a natural legal question, not a machine checklist.',
        '- Keep the packet focused on core doctrinal analysis only unless a listed domain itself requires something more practical.',
        '- Do not ask the responder to cite the hidden source case or do external research.',
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
        'You are drafting Karthic domains for evaluation, not redoing Frank.',
        '',
        'Purpose of this step:',
        '- Convert Frank’s benchmark structure into evaluator-facing domains that Dasha can later use for comparison.',
        '- Preserve doctrinal transparency.',
        '- Avoid unnecessary complexity, unnecessary domain churn, and generic rubric language.',
        '- Make each domain legible to a human reviewer and operational for later scoring.',
        '',
        'Authoritative inputs and precedence:',
        '- Start from Frank’s analysis domains as the base structure.',
        '- Use the generalized golden response as a secondary source to refine emphasis, clarify boundaries, and detect if a Frank domain is too broad, too overlapping, or too minor to stand alone.',
        '- Do not let the golden response silently replace Frank’s benchmark design.',
        '- If Frank’s domains and the golden response point in slightly different directions, prefer keeping Frank’s substantive structure unless there is a clear evaluation reason to merge, split, or sharpen a domain.',
        '',
        'What you should produce:',
        '- One evaluator-facing Karthic domain per meaningful evaluation dimension.',
        '- Each domain must include:',
        '  - name: short, specific, human-editable',
        '  - description: 1-3 sentences explaining exactly what this domain covers for evaluation',
        '  - weight: a relative importance value from 1 to 5',
        '  - naGuidance: a narrow instruction explaining when this domain should be marked not applicable',
        '',
        'Core drafting rules:',
        '- Stay close to Frank’s domain count.',
        '- Merge domains only if they substantially overlap and would create redundant scoring.',
        '- Split a domain only if Frank bundled multiple independently scoreable ideas that should be evaluated separately.',
        '- Prefer the smallest set of domains that still preserves the benchmark’s meaningful analytical structure.',
        '- Do not create domains for writing style, formatting, tone, polish, or generic "overall analysis."',
        '- Do not create catch-all domains.',
        '- Do not add a domain just because the golden response mentioned a topic once.',
        '- Do not preserve a domain as its own category if it is only a minor subpoint that can be absorbed into another domain without loss of evaluation clarity.',
        '',
        'Domain-quality requirements:',
        '- Each domain must be doctrinally meaningful, distinct, and usable for later comparison.',
        '- Each description must clearly mark the domain’s boundary so it does not blur into neighboring domains.',
        '- Names should be concrete, not vague labels like "Legal Analysis," "Application," or "Reasoning."',
        '- Descriptions should explain what the evaluator is looking for, not restate the name in different words.',
        '- If two proposed domains would often be scored together for the same reason, they are probably not distinct enough.',
        '',
        'Weighting rules:',
        '- Assign weights conservatively.',
        '- Weight 5 is only for a central issue that strongly affects whether an answer is substantively right or wrong.',
        '- Weight 4 is for an important issue that materially changes answer quality.',
        '- Weight 3 is for a normal meaningful domain.',
        '- Weight 2 is for a secondary but still real domain.',
        '- Weight 1 is for a minor domain that is worth preserving but should not dominate scoring.',
        '- Do not inflate weights just because a topic is interesting or appears multiple times.',
        '- Similar-importance domains should receive similar weights.',
        '',
        'NA-guidance rules:',
        '- NA guidance must be narrow and concrete.',
        '- A domain is not applicable only when the question packet does not materially trigger that issue.',
        '- Do not use NA guidance to excuse weak coverage of a relevant issue.',
        '- Do not write generic NA guidance like "mark N/A if not discussed."',
        '- Good NA guidance should help a reviewer distinguish "irrelevant to this question" from "relevant but poorly answered."',
        '',
        'Transformation discipline:',
        '- Keep names reasonably close to Frank where possible, but improve clarity if needed.',
        '- If you merge, split, or materially rename a domain, do so only because it improves evaluation rigor.',
        '- Avoid cosmetic rewrites that do not change evaluation quality.',
        '- Avoid introducing new doctrine not supported by Frank’s domains or the generalized golden response.',
        '',
        'Return standard:',
        '- Return only the final Karthic domains.',
        '- Do not explain your reasoning.',
        '- Return JSON only.',
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
        ...input.domains.map((domain, index) => `${index + 1}. ${domain.id} | ${domain.name} (weight ${domain.weight}): ${domain.description} | NA guidance: ${domain.naGuidance}`),
        '',
        'Frank generalized golden response:',
        input.frankPacket.benchmarkAnswer,
        '',
        'You are creating structured comparison targets for evaluation.',
        '',
        'Purpose of this step:',
        '- Convert the generalized golden response into domain-specific comparison targets.',
        '- Make each domain usable for later answer comparison.',
        '- Preserve traceability to the existing Karthic domains and the generalized golden response.',
        '- Avoid inventing new doctrine, new domains, or benchmark expectations that are not supported by the inputs.',
        '',
        'What this step is and is not:',
        '- This step does not redesign the domains.',
        '- This step does not rewrite the golden response.',
        '- This step does not create a free-floating rubric from general legal knowledge.',
        '- This step does extract, organize, and sharpen the benchmark expectations already reflected in the domains and the generalized golden response.',
        '',
        'Authoritative inputs and precedence:',
        '- The Karthic domains define the evaluation buckets and domain boundaries.',
        '- The Frank generalized golden response is the main source for what the benchmark actually expects within each domain.',
        '- SME notes are secondary guidance and may sharpen emphasis or clarify ambiguity, but should not override the domains or introduce unsupported doctrine.',
        '- If the domain description and the golden response are in slight tension, keep the target grounded in both and avoid overcorrecting from either one alone.',
        '',
        'Output requirements:',
        '- Return one structured golden target for each Karthic domain.',
        '- Keep the same exact domainId for that domain as shown in the Karthic domains list above.',
        '- Each target must include:',
        '  - domainId',
        '  - summary',
        '  - goldenContains',
        '  - allowedOmissions',
        '  - contradictionFlags',
        '  - comparisonGuidance',
        '- Also return a short comparisonMethodNote for the pack as a whole.',
        '',
        'Field meaning:',
        '- summary: a short description of what the evaluator is looking for in this domain',
        '- goldenContains: the main affirmative points a strong answer should contain for this domain',
        '- allowedOmissions: details that may be absent without counting against the answer, when omission would still be consistent with the generalized golden response',
        '- contradictionFlags: statements that would count against the answer because they materially conflict with the expected treatment of the domain',
        '- comparisonGuidance: a short practical instruction for how to compare an answer against this domain target',
        '',
        'Grounding rules:',
        '- Stay tightly anchored to the generalized golden response and the Karthic domain definition.',
        '- You may make light clarifying inferences only when they are strongly implied by the generalized golden response.',
        '- Do not add benchmark expectations based only on general legal knowledge.',
        '- Do not smuggle in new sub-issues that are not meaningfully supported by the domain and the generalized golden response.',
        '- Do not restate the entire golden response inside every domain.',
        '',
        'Golden-contains rules:',
        '- Include the smallest set of affirmative points needed to capture what matters in the domain.',
        '- Usually use 2-4 short points, but fewer is acceptable for a genuinely narrow domain.',
        '- Each point should be concrete enough that a later evaluator could tell whether an answer covered it.',
        '- Prefer distinct benchmark expectations, not repetitive rephrasings of the same idea.',
        '- Do not include background facts, throat-clearing, or generic statements like "addresses the issue thoughtfully."',
        '',
        'Allowed-omissions rules:',
        '- Use allowed omissions moderately, not by default.',
        '- Only include an allowed omission when the generalized golden response reasonably leaves a detail unstated, optional, conditional, or non-central within this domain.',
        '- Do not use allowed omissions to excuse missing core domain content.',
        '- Do not list a point as both a required goldenContains point and an allowed omission.',
        '- If nothing is reasonably omittable within the domain, return an empty array.',
        '',
        'Contradiction-flag rules:',
        '- Use high precision.',
        '- Include only statements that would genuinely count against the answer, not mere incompleteness, lesser nuance, or different wording.',
        '- Contradiction flags should identify materially wrong, reversed, or misleading treatment of the domain.',
        '- Do not use contradiction flags for points that are simply absent.',
        '- Do not overpopulate this field with every possible mistake; include the few clearest answer-undermining errors.',
        '',
        'Comparison-guidance rules:',
        '- Write a short instruction that tells the evaluator what to compare in practice.',
        '- Focus on substantive comparison, not prose similarity.',
        '- Make clear what should count as a match, a miss, or a contradiction within the domain.',
        '- Keep it operational and concise.',
        '',
        'Comparison-method-note rules:',
        '- Write one short note explaining how evaluators should compare answers against these structured targets overall.',
        '- Emphasize domain-by-domain substantive comparison against the structured targets, not raw prose overlap with the golden response.',
        '- Keep it concrete and brief.',
        '',
        'Quality bar:',
        '- Targets must be specific enough for consistent evaluation.',
        '- Targets must stay distinct across domains.',
        '- Summary, goldenContains, contradictionFlags, and comparisonGuidance should all reflect the same domain boundary.',
        '- Avoid vague filler, generic rubric language, and legal generalities that do not help comparison.',
        '',
        'Return standard:',
        '- Return JSON only.',
        '- Do not explain your reasoning.',
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
