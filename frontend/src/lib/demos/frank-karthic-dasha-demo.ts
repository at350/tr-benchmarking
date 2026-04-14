type WorkflowStageId = 'frank' | 'responses' | 'karthic' | 'dasha';
type RubricModuleId = 'module1' | 'module2' | 'module3' | 'module4';
type RubricRowKey = 'A' | 'K' | 'J' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'L' | 'M';

export type WorkflowStage = {
    id: WorkflowStageId;
    label: string;
    title: string;
    summary: string;
    actionLabel: string;
};

export type WorkflowField = {
    label: string;
    value: string;
};

export type PromptBundle = {
    title: string;
    files: string[];
};

export type RubricRowDefinition = {
    key: RubricRowKey;
    moduleId: RubricModuleId;
    title: string;
    weight: number;
    description: string;
};

export type RubricModuleDefinition = {
    id: RubricModuleId;
    title: string;
    budget: number;
    summary: string;
    rows: RubricRowDefinition[];
};

export type ModelBatchRow = {
    modelKey: string;
    providerLabel: string;
    responsesGenerated: number;
    dominantClusterId: string;
    dominantClusterShare: number;
};

export type ClusterPenalty = {
    code: string;
    points: number;
    note: string;
};

export type ClusterModelMix = {
    modelKey: string;
    count: number;
};

export type ClusterRowEvaluation = {
    key: RubricRowKey;
    title: string;
    weight: number;
    score: 0 | 1 | 2 | 3 | 4;
    weightedContribution: number;
    note: string;
};

export type ClusterModuleScore = {
    id: RubricModuleId;
    title: string;
    score: number;
    max: number;
};

export type JudgedCluster = {
    id: string;
    label: string;
    summary: string;
    verdict: string;
    representativeText: string;
    modelMix: ClusterModelMix[];
    size: number;
    subtotal: number;
    penaltyTotal: number;
    finalScore: number;
    penalties: ClusterPenalty[];
    moduleScores: ClusterModuleScore[];
    rowEvaluations: ClusterRowEvaluation[];
    strengths: string[];
    watchouts: string[];
};

export type LeaderboardRow = {
    rank: number;
    modelKey: string;
    providerLabel: string;
    averageScore: number;
    highScoringShare: number;
    dominantClusterId: string;
};

export const workflowStages: WorkflowStage[] = [
    {
        id: 'frank',
        label: 'Frank',
        title: 'Benchmark Generation',
        summary: 'Source intake, benchmark answer generation, and reverse-engineered question drafting.',
        actionLabel: 'Open Response Batch',
    },
    {
        id: 'responses',
        label: 'Responses',
        title: 'Model Batch + Clustering',
        summary: 'Run the benchmark question across the model pool, then compress the outputs into representative response families.',
        actionLabel: 'Open Karthic',
    },
    {
        id: 'karthic',
        label: 'Karthic',
        title: 'Rubric Construction',
        summary: 'Turn Frank outputs plus the clustered centroids into a weighted modular rubric with overlays and caps.',
        actionLabel: 'Open Dasha',
    },
    {
        id: 'dasha',
        label: 'Dasha',
        title: 'Centroid Judging + Leaderboard',
        summary: 'Judge the representative clusters, propagate each score to its member responses, and rank model performance.',
        actionLabel: 'Review Frank',
    },
];

export const sourceFields: WorkflowField[] = [
    { label: 'Case Title', value: "Anglemire v. Policemen's Benevolent Association of Chicago" },
    { label: 'Citation', value: '301 Ill. App. 277, 22 N.E.2d 713 (Ill. App. Ct. 1939)' },
    { label: 'Selected Pack', value: 'Pack 10 - Common-law oral promises' },
    { label: 'Routing Confidence', value: 'Strong' },
    { label: 'Jurisdiction', value: 'Illinois common law / Illinois Statute of Frauds' },
    { label: 'Controlling Doctrine', value: 'Marriage-consideration Statute of Frauds' },
];

export const frankPromptBundles: PromptBundle[] = [
    {
        title: 'Core Workflow',
        files: [
            '00_MAIN_GPT_INSTRUCTIONS.txt',
            '01_CORE_WORKFLOW_TEMPLATE.txt',
            '02_CORE_SOURCE_INTAKE_CHECKLIST.txt',
            '03_CORE_OUTPUT_SHAPE_AND_PROMPT_STRUCTURE.txt',
            '04_CORE_QUESTION_WRITING_CHECKLIST.txt',
            '05_SOF_ROUTING_MATRIX.txt',
            '06_CORE_SELF_AUDIT.txt',
        ],
    },
    {
        title: 'Pack 10 Materials',
        files: [
            '10_DOCTRINE_PACK_ORAL_PROMISE.txt',
            '11_FAILURE_BANK_ORAL_PROMISE.txt',
            '12_WORKED_SOURCE_EXAMPLE_ORAL_PROMISE.txt',
            '13_CLEAN_BENCHMARK_EXAMPLE_ORAL_PROMISE.txt',
        ],
    },
];

export const karthicPromptBundles: PromptBundle[] = [
    {
        title: 'Karthic Scaffold',
        files: [
            '07_SHARED_MODULE_SKELETON.txt',
            '08_Karthic_Rubric_Build_Spec_v1.md',
            '09_Cross_Pack_Scoring_Overlays_Caps_Penalties_v1.md',
            '10_Karthic_PreFill_Instructions.rtf',
        ],
    },
];

export const benchmarkAnswerText = `Jurisdiction assumption:

Illinois common law / Illinois Statute of Frauds.

Bottom-line outcome:

The oral promise is not enforceable against the later beneficiary change. Because the promise was made in consideration of marriage and was not in writing, the Statute of Frauds bars enforcement, and the later marriage does not take the agreement out of the statute.

Controlling doctrine:

Common-law Statute of Frauds for agreements made upon consideration of marriage.

Transaction / formation characterization:

This is an executory oral promise by the insured to name the plaintiff as beneficiary if she married him. The marriage was the bargained-for consideration, not just background context. The plaintiff's reliance and later marriage do not change the basic characterization of the promise as an oral marriage-consideration agreement.

Writing requirement and trigger:

The controlling writing requirement is a signed writing for an agreement made upon consideration of marriage. That category is triggered here because the alleged promise was expressly conditioned on marriage. No qualifying signed writing is shown.

Compliance / substitute / exception analysis:

There is no direct compliance because there is no writing. The later marriage does not count as part performance for this category, and the insured's later designation of the plaintiff as beneficiary does not cure the original oral defect. On these facts, that later conduct is treated as voluntary and not as legal consideration that validates the earlier promise.

Other defenses or competing doctrines:

The association's bylaws independently allowed the insured to change beneficiaries by affidavit when the certificate could not be surrendered, and he followed that procedure before death. That separate contractual mechanism supports the later beneficiary change. The plaintiff's estoppel theory is weak because it depends on enforcing the oral marriage-conditioned promise that the statute renders void.

Strongest counterargument:

The plaintiff can argue that the insured actually carried out the promise after the marriage by naming her beneficiary, so he should be estopped from later changing the designation. That argument is strongest on fairness, but it does not overcome the statute's writing requirement for a promise made in consideration of marriage.`;

export const questionText = `In Illinois, a man told his fiancee that if she married him, he would name her as the beneficiary of his life insurance policy. She agreed, they married, and he later executed the beneficiary change naming her. After a dispute, he changed the beneficiary again without surrendering the certificate, using the insurer's affidavit procedure permitted by the policy's bylaws. The fiancee claims the original promise is enforceable and the later change should not count. Is the agreement enforceable? Analyze.`;

export const keyFacts = [
    'Before marriage, the insured promised that if Amanda married him, he would make her the beneficiary.',
    'After the marriage, he did execute a beneficiary change naming her.',
    'Later, he used the association affidavit procedure to change beneficiaries again.',
    'The dispute turns on whether marriage plus the earlier designation can overcome the missing writing.',
];

const rubricRows: RubricRowDefinition[] = [
    {
        key: 'A',
        moduleId: 'module1',
        title: 'Issue spotting + prioritization',
        weight: 15,
        description: 'Identify the dispositive issue early and prioritize the controlling path before secondary issues.',
    },
    {
        key: 'K',
        moduleId: 'module1',
        title: 'Barrier stacking + exception mapping',
        weight: 8,
        description: 'Keep independent legal barriers separate and map each exception only to the barrier it can actually address.',
    },
    {
        key: 'J',
        moduleId: 'module1',
        title: 'Clear bottom line + structured reasoning',
        weight: 5,
        description: 'Give a clear conclusion, tie it to the controller, and keep uncertainty bounded and specific.',
    },
    {
        key: 'B',
        moduleId: 'module2',
        title: 'Transaction / formation characterization',
        weight: 11,
        description: 'Characterize the promise structure correctly for the selected pack.',
    },
    {
        key: 'C',
        moduleId: 'module2',
        title: 'Controlling doctrine gate identification + correct trigger',
        weight: 15,
        description: 'Identify the controlling Statute of Frauds gate first and state the correct trigger test.',
    },
    {
        key: 'D',
        moduleId: 'module2',
        title: 'Secondary gate or major subissue #1',
        weight: 5,
        description: 'Handle the first pack-specific secondary gate only when it is genuinely triggered.',
    },
    {
        key: 'E',
        moduleId: 'module2',
        title: 'Secondary gate or major subissue #2 / doctrinal nuance',
        weight: 9,
        description: 'Handle the second doctrinal nuance without displacing the main controller.',
    },
    {
        key: 'F',
        moduleId: 'module3',
        title: 'Exceptions / workarounds + limits',
        weight: 7,
        description: 'Analyze fallback doctrines only after the main gates, with their limits stated precisely.',
    },
    {
        key: 'G',
        moduleId: 'module3',
        title: 'Reliance / estoppel / causation rigor',
        weight: 7,
        description: 'Test reliance-based theories element by element instead of assuming them.',
    },
    {
        key: 'H',
        moduleId: 'module3',
        title: 'Defenses / conditions / competing doctrines',
        weight: 5,
        description: 'Keep defenses and competing doctrines secondary and accurately framed.',
    },
    {
        key: 'I',
        moduleId: 'module4',
        title: 'Factual fidelity + internal consistency',
        weight: 5,
        description: 'Stay faithful to the facts, avoid inventions, and remain internally consistent.',
    },
    {
        key: 'L',
        moduleId: 'module4',
        title: 'Scope calibration / claim discipline',
        weight: 4,
        description: 'Avoid false universals, keep jurisdictional uncertainty bounded, and stay within the benchmark posture.',
    },
    {
        key: 'M',
        moduleId: 'module4',
        title: 'Relevance discipline / prompt adherence',
        weight: 4,
        description: 'Stay on the target enforceability path and follow the requested answer shape.',
    },
];

const moduleMeta: Array<{ id: RubricModuleId; title: string; budget: number; summary: string }> = [
    {
        id: 'module1',
        title: 'Module 1 - Structural gatekeeping',
        budget: 28,
        summary: 'Controls path discipline, issue priority, and exception placement.',
    },
    {
        id: 'module2',
        title: 'Module 2 - Primary doctrine gates',
        budget: 40,
        summary: 'Carries the main legal weight for the marriage-consideration analysis.',
    },
    {
        id: 'module3',
        title: 'Module 3 - Fallback doctrines and defenses',
        budget: 19,
        summary: 'Keeps estoppel, part performance, and competing doctrines secondary and precise.',
    },
    {
        id: 'module4',
        title: 'Module 4 - Cross-cutting answer discipline',
        budget: 13,
        summary: 'Scores factual fidelity, internal consistency, and prompt discipline without turning style into substance.',
    },
];

export const rubricModules: RubricModuleDefinition[] = moduleMeta.map((module) => ({
    ...module,
    rows: rubricRows.filter((row) => row.moduleId === module.id),
}));

export const karthicFields: WorkflowField[] = [
    { label: 'Likely Controlling Doctrine', value: 'Executory oral promise made upon consideration of marriage' },
    { label: 'Required Gate Order', value: 'Marriage consideration -> writing -> exceptions -> bylaws / later designation -> bottom line' },
    { label: 'Strongest Expected Counterargument', value: 'The later beneficiary designation after marriage should estop a second change.' },
    { label: 'Variation Lane', value: 'Lane A' },
    { label: 'Output Shell', value: 'Core cross-pack v1' },
    { label: 'Centroid Reference', value: '6 representative response families from the Anglemire batch' },
];

export const overlayRules = [
    { code: 'P_ControllingDoctrineOmitted', points: -15, note: 'Use when the answer never identifies the marriage-consideration gate.' },
    { code: 'P_WrongPackDriver', points: -15, note: 'Use when the answer is materially driven by the wrong doctrine family.' },
    { code: 'P_MaterialRuleMisstatement', points: -10, note: 'Use when the rule statement is wrong in a way that could flip the result.' },
    { code: 'P_ExceptionBleedOver', points: -10, note: 'Use when one doctrine is treated as a universal cure for an independent barrier.' },
];

export const capRules = [
    { code: 'CAP_60_ControllingDoctrineOmitted', note: 'Apply when the answer misses the dispositive doctrine or controlling gate.' },
    { code: 'CAP_60_WrongPackDriver', note: 'Apply when the answer is fundamentally routed through the wrong pack.' },
    { code: 'CAP_70_NoClearConclusion', note: 'Apply when the answer never reaches a usable bottom line.' },
];

const modelKeys = [
    'openai::gpt-4o',
    'openai::gpt-5.4',
    'openai::gpt-5.4-mini',
    'openai::gpt-4.1-nano',
    'replicate::anthropic/claude-4-sonnet',
    'replicate::anthropic/claude-3.5-haiku',
    'replicate::google/gemini-3-pro',
    'replicate::google/gemini-3-flash',
    'replicate::deepseek-ai/deepseek-v3',
    'replicate::moonshotai/kimi-k2-thinking',
    'replicate::meta/llama-4-maverick-instruct',
    'replicate::meta/llama-4-scout-instruct',
] as const;

const providerLabelForKey = (modelKey: string) => {
    const [provider] = modelKey.split('::');
    if (provider === 'openai') {
        return 'OpenAI';
    }
    return 'Replicate';
};

const noteForScore = (score: number) => {
    if (score === 4) {
        return 'Tracks the benchmark cleanly and without material drift.';
    }
    if (score === 3) {
        return 'Mostly correct, but leaves a noticeable doctrinal gap.';
    }
    if (score === 2) {
        return 'Touches the issue but mishandles a key legal step.';
    }
    if (score === 1) {
        return 'Mentions the issue without a usable treatment.';
    }
    return 'Misses or contradicts the benchmark on this row.';
};

const roundToOne = (value: number) => Math.round(value * 10) / 10;

const clusterProfiles: Array<{
    id: string;
    label: string;
    summary: string;
    verdict: string;
    representativeText: string;
    rowScores: Record<RubricRowKey, 0 | 1 | 2 | 3 | 4>;
    penalties: ClusterPenalty[];
    modelCounts: Record<string, number>;
}> = [
    {
        id: 'cluster_1',
        label: 'Controller-first / statute controls',
        summary: 'Identifies the marriage-consideration Statute of Frauds, keeps equity secondary, and lands on non-enforceability.',
        verdict: 'Strong benchmark alignment',
        representativeText: `No. The oral promise is the sort of executory promise made in consideration of marriage that Illinois places inside the Statute of Frauds, so the absence of a signed writing is the central problem. The later marriage does not count as part performance for this category, and the earlier designation naming the fiancee beneficiary does not retroactively validate the original oral bargain.

The insurer's affidavit procedure matters, but only after the controlling gate is handled. Once the insured used the bylaws to execute a later beneficiary change, that later compliant designation is the operative document unless it can be shown to be invalid under the governing procedures. Estoppel is the strongest counterargument, but on these facts it remains too weak to override the same writing requirement that the claimant is trying to escape.`,
        rowScores: { A: 4, K: 4, J: 4, B: 4, C: 4, D: 3, E: 4, F: 4, G: 2, H: 4, I: 4, L: 4, M: 4 },
        penalties: [],
        modelCounts: {
            'openai::gpt-4o': 10,
            'openai::gpt-5.4': 14,
            'openai::gpt-5.4-mini': 8,
            'openai::gpt-4.1-nano': 3,
            'replicate::anthropic/claude-4-sonnet': 12,
            'replicate::anthropic/claude-3.5-haiku': 5,
            'replicate::google/gemini-3-pro': 9,
            'replicate::google/gemini-3-flash': 4,
            'replicate::deepseek-ai/deepseek-v3': 7,
            'replicate::moonshotai/kimi-k2-thinking': 8,
            'replicate::meta/llama-4-maverick-instruct': 4,
            'replicate::meta/llama-4-scout-instruct': 2,
        },
    },
    {
        id: 'cluster_2',
        label: 'Controller correct / bylaw-heavy',
        summary: 'Gets the controlling doctrine right, but leans too hard on the beneficiary-change procedure instead of keeping it secondary.',
        verdict: 'Correct result with secondary-path drift',
        representativeText: `Probably not enforceable. Illinois usually requires a writing for a promise made in consideration of marriage, and that is the cleanest answer here. The claimant's best point is that the insured did initially carry out the promise by naming her beneficiary, but the stronger response is still that the association's later affidavit process produced the operative designation.

This response family reaches the right outcome, but it tends to make the insurer's internal procedure do more work than the statute itself. The correct framing is that the later procedure confirms the result after the writing issue is resolved, not that the procedure replaces the marriage-consideration analysis.`,
        rowScores: { A: 4, K: 3, J: 4, B: 4, C: 4, D: 3, E: 4, F: 3, G: 2, H: 4, I: 4, L: 4, M: 4 },
        penalties: [
            { code: 'P_ExceptionBleedOver', points: 3, note: 'The bylaw mechanism is treated as too close to a universal cure instead of a secondary confirmation.' },
        ],
        modelCounts: {
            'openai::gpt-4o': 5,
            'openai::gpt-5.4': 4,
            'openai::gpt-5.4-mini': 4,
            'openai::gpt-4.1-nano': 4,
            'replicate::anthropic/claude-4-sonnet': 5,
            'replicate::anthropic/claude-3.5-haiku': 5,
            'replicate::google/gemini-3-pro': 5,
            'replicate::google/gemini-3-flash': 4,
            'replicate::deepseek-ai/deepseek-v3': 4,
            'replicate::moonshotai/kimi-k2-thinking': 5,
            'replicate::meta/llama-4-maverick-instruct': 4,
            'replicate::meta/llama-4-scout-instruct': 3,
        },
    },
    {
        id: 'cluster_3',
        label: 'Estoppel-heavy / still recoverable',
        summary: 'Keeps the answer in the right neighborhood, but lets estoppel and fairness arguments move too far forward in the analysis.',
        verdict: 'Correct-ish path, wrong weighting',
        representativeText: `The promise is likely unenforceable because Illinois treats oral promises made in consideration of marriage as subject to the Statute of Frauds, but the equities favor the fiancee because the insured initially followed through by naming her beneficiary after the marriage. A court might therefore hesitate to let him reverse course after she relied on both the promise and the change in designation.

This family usually reaches the formal no-enforcement answer, but it makes that answer unstable by over-crediting estoppel. The benchmark treats estoppel as a constrained fallback, not as a nearly co-equal path with the controlling writing requirement.`,
        rowScores: { A: 3, K: 3, J: 3, B: 4, C: 3, D: 3, E: 3, F: 2, G: 4, H: 4, I: 4, L: 3, M: 4 },
        penalties: [
            { code: 'P_ExceptionBleedOver', points: 5, note: 'Estoppel is allowed to overtake the main gate instead of remaining a fallback theory.' },
            { code: 'P_ExcessiveHedging', points: 3, note: 'The answer keeps the conclusion too soft even after stating the governing Illinois rule.' },
        ],
        modelCounts: {
            'openai::gpt-4o': 3,
            'openai::gpt-5.4': 1,
            'openai::gpt-5.4-mini': 5,
            'openai::gpt-4.1-nano': 4,
            'replicate::anthropic/claude-4-sonnet': 2,
            'replicate::anthropic/claude-3.5-haiku': 4,
            'replicate::google/gemini-3-pro': 3,
            'replicate::google/gemini-3-flash': 4,
            'replicate::deepseek-ai/deepseek-v3': 5,
            'replicate::moonshotai/kimi-k2-thinking': 4,
            'replicate::meta/llama-4-maverick-instruct': 5,
            'replicate::meta/llama-4-scout-instruct': 4,
        },
    },
    {
        id: 'cluster_4',
        label: 'Marriage-as-part-performance',
        summary: 'Treats the marriage itself as enough part performance to push the oral promise over the line.',
        verdict: 'Incorrect legal conclusion',
        representativeText: `Yes, because the fiancee married in reliance on the promise and the insured initially named her beneficiary after the wedding, which together amount to sufficient performance of the bargain. Once the marriage occurred and the insured acted on the promise, the oral agreement should no longer be treated as merely executory.

This response family usually has decent structure, but it collapses the controlling Illinois rule by turning the marriage itself into the very exception the case rejects. It therefore looks organized while still missing the decisive doctrinal barrier.`,
        rowScores: { A: 3, K: 2, J: 3, B: 3, C: 2, D: 3, E: 2, F: 2, G: 2, H: 3, I: 4, L: 3, M: 4 },
        penalties: [
            { code: 'P_MaterialRuleMisstatement', points: 3, note: 'Marriage is treated as part performance for a category where the benchmark rejects that move.' },
        ],
        modelCounts: {
            'openai::gpt-4o': 1,
            'openai::gpt-5.4': 1,
            'openai::gpt-5.4-mini': 2,
            'openai::gpt-4.1-nano': 4,
            'replicate::anthropic/claude-4-sonnet': 1,
            'replicate::anthropic/claude-3.5-haiku': 3,
            'replicate::google/gemini-3-pro': 2,
            'replicate::google/gemini-3-flash': 4,
            'replicate::deepseek-ai/deepseek-v3': 2,
            'replicate::moonshotai/kimi-k2-thinking': 2,
            'replicate::meta/llama-4-maverick-instruct': 4,
            'replicate::meta/llama-4-scout-instruct': 4,
        },
    },
    {
        id: 'cluster_5',
        label: 'Later designation cures the defect',
        summary: 'Treats the earlier beneficiary change as automatically converting the oral promise into an executed and irrevocable obligation.',
        verdict: 'Incorrect cure theory',
        representativeText: `The promise becomes enforceable once the insured actually names the fiancee beneficiary after the marriage. At that point the original oral bargain has been executed, so the later affidavit change should not be allowed to defeat the rights created by the earlier designation.

This family notices a real fact pattern feature, but it uses that feature in the wrong legal direction. The benchmark treats the later designation as a distinct formal act governed by the bylaws, not as a retroactive cure for the missing writing that attached to the original marriage-conditioned promise.`,
        rowScores: { A: 3, K: 2, J: 2, B: 3, C: 2, D: 2, E: 1, F: 2, G: 1, H: 3, I: 4, L: 2, M: 3 },
        penalties: [
            { code: 'P_InventedComplianceFact', points: 6, note: 'The later beneficiary change is treated as if it satisfied the original marriage-consideration writing requirement.' },
            { code: 'P_ExceptionBleedOver', points: 5, note: 'A later formal act is turned into a cure-all for the earlier oral defect.' },
        ],
        modelCounts: {
            'openai::gpt-4o': 1,
            'openai::gpt-5.4-mini': 1,
            'openai::gpt-4.1-nano': 3,
            'replicate::anthropic/claude-3.5-haiku': 2,
            'replicate::google/gemini-3-pro': 1,
            'replicate::google/gemini-3-flash': 3,
            'replicate::deepseek-ai/deepseek-v3': 1,
            'replicate::moonshotai/kimi-k2-thinking': 1,
            'replicate::meta/llama-4-maverick-instruct': 2,
            'replicate::meta/llama-4-scout-instruct': 4,
        },
    },
    {
        id: 'cluster_6',
        label: 'Generic contract analysis / wrong controller',
        summary: 'Answers as if this were an ordinary offer-acceptance problem and misses the Pack 10 controller.',
        verdict: 'Wrong pack driver',
        representativeText: `Yes, because the father made an offer, the fiancee accepted by marrying, and consideration exists on both sides. Since the parties completed performance within the stated period, there is no real Statute of Frauds problem and the later dispute should be resolved under ordinary contract principles.

This family looks polished but routes the problem through the wrong legal frame. It misses the marriage-consideration trigger, understates the Illinois writing rule, and collapses the benchmark into generic contract doctrine.`,
        rowScores: { A: 2, K: 1, J: 2, B: 2, C: 1, D: 1, E: 1, F: 1, G: 1, H: 2, I: 3, L: 2, M: 3 },
        penalties: [
            { code: 'P_WrongPackDriver', points: 5, note: 'The answer is materially driven by generic contract analysis instead of the marriage-consideration pack.' },
            { code: 'P_ControllingDoctrineOmitted', points: 3, note: 'The dispositive Statute of Frauds gate is never stated in a controlling way.' },
        ],
        modelCounts: {
            'openai::gpt-4.1-nano': 2,
            'replicate::anthropic/claude-3.5-haiku': 1,
            'replicate::google/gemini-3-flash': 1,
            'replicate::deepseek-ai/deepseek-v3': 1,
            'replicate::meta/llama-4-maverick-instruct': 1,
            'replicate::meta/llama-4-scout-instruct': 3,
        },
    },
];

const moduleBudgets = rubricModules.reduce<Record<RubricModuleId, number>>((acc, module) => {
    acc[module.id] = module.budget;
    return acc;
}, {
    module1: 0,
    module2: 0,
    module3: 0,
    module4: 0,
});

const contributionForRow = (row: RubricRowDefinition, score: number) => roundToOne((row.weight * score) / 4);

const judgedClustersInternal = clusterProfiles.map((profile) => {
    const rowEvaluations = rubricRows.map((row) => {
        const score = profile.rowScores[row.key];
        return {
            key: row.key,
            title: row.title,
            weight: row.weight,
            score,
            weightedContribution: contributionForRow(row, score),
            note: noteForScore(score),
        } satisfies ClusterRowEvaluation;
    });

    const subtotal = roundToOne(rowEvaluations.reduce((sum, row) => sum + row.weightedContribution, 0));
    const penaltyTotal = profile.penalties.reduce((sum, penalty) => sum + penalty.points, 0);
    const finalScore = roundToOne(Math.max(subtotal - penaltyTotal, 0));
    const size = Object.values(profile.modelCounts).reduce((sum, count) => sum + count, 0);

    const moduleScores = moduleMeta.map((module) => {
        const score = roundToOne(
            rowEvaluations
                .filter((row) => rubricRows.find((definition) => definition.key === row.key)?.moduleId === module.id)
                .reduce((sum, row) => sum + row.weightedContribution, 0),
        );
        return {
            id: module.id,
            title: module.title,
            score,
            max: moduleBudgets[module.id],
        } satisfies ClusterModuleScore;
    });

    const sortedRows = rowEvaluations
        .slice()
        .sort((left, right) => right.score - left.score || right.weight - left.weight || left.key.localeCompare(right.key));

    const strengths = sortedRows
        .filter((row) => row.score >= 3)
        .slice(0, 3)
        .map((row) => `${row.title}: ${row.note}`);

    const watchouts = sortedRows
        .slice()
        .sort((left, right) => left.score - right.score || right.weight - left.weight || left.key.localeCompare(right.key))
        .slice(0, 3)
        .map((row) => `${row.title}: ${row.note}`);

    const modelMix = modelKeys
        .map((modelKey) => ({ modelKey, count: profile.modelCounts[modelKey] ?? 0 }))
        .filter((entry) => entry.count > 0)
        .sort((left, right) => right.count - left.count || left.modelKey.localeCompare(right.modelKey));

    return {
        id: profile.id,
        label: profile.label,
        summary: profile.summary,
        verdict: profile.verdict,
        representativeText: profile.representativeText,
        modelMix,
        size,
        subtotal,
        penaltyTotal,
        finalScore,
        penalties: profile.penalties,
        moduleScores,
        rowEvaluations,
        strengths,
        watchouts,
    } satisfies JudgedCluster;
});

export const judgedClusters: JudgedCluster[] = judgedClustersInternal
    .slice()
    .sort((left, right) => right.finalScore - left.finalScore || right.size - left.size || left.id.localeCompare(right.id));

const highScoringClusterIds = new Set(judgedClusters.filter((cluster) => cluster.finalScore >= 80).map((cluster) => cluster.id));

export const modelLeaderboard: LeaderboardRow[] = modelKeys
    .map((modelKey) => {
        const clusterContributions = judgedClusters
            .map((cluster) => {
                const count = cluster.modelMix.find((entry) => entry.modelKey === modelKey)?.count ?? 0;
                return { clusterId: cluster.id, count, score: cluster.finalScore };
            })
            .filter((entry) => entry.count > 0);

        const totalResponses = clusterContributions.reduce((sum, entry) => sum + entry.count, 0);
        const weightedScore = roundToOne(
            clusterContributions.reduce((sum, entry) => sum + entry.count * entry.score, 0) / Math.max(totalResponses, 1),
        );
        const dominantCluster = clusterContributions
            .slice()
            .sort((left, right) => right.count - left.count || left.clusterId.localeCompare(right.clusterId))[0];
        const highScoringShare = roundToOne(
            (clusterContributions
                .filter((entry) => highScoringClusterIds.has(entry.clusterId))
                .reduce((sum, entry) => sum + entry.count, 0) /
                Math.max(totalResponses, 1)) *
                100,
        );

        return {
            rank: 0,
            modelKey,
            providerLabel: providerLabelForKey(modelKey),
            averageScore: weightedScore,
            highScoringShare,
            dominantClusterId: dominantCluster?.clusterId ?? judgedClusters[0]?.id ?? 'cluster_1',
        } satisfies LeaderboardRow;
    })
    .sort((left, right) => right.averageScore - left.averageScore || right.highScoringShare - left.highScoringShare || left.modelKey.localeCompare(right.modelKey))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

export const modelBatchRows: ModelBatchRow[] = modelKeys.map((modelKey) => {
    const clusterContributions = judgedClusters
        .map((cluster) => {
            const count = cluster.modelMix.find((entry) => entry.modelKey === modelKey)?.count ?? 0;
            return { clusterId: cluster.id, count };
        })
        .filter((entry) => entry.count > 0);

    const dominantCluster = clusterContributions
        .slice()
        .sort((left, right) => right.count - left.count || left.clusterId.localeCompare(right.clusterId))[0];
    const totalResponses = clusterContributions.reduce((sum, entry) => sum + entry.count, 0);

    return {
        modelKey,
        providerLabel: providerLabelForKey(modelKey),
        responsesGenerated: totalResponses,
        dominantClusterId: dominantCluster?.clusterId ?? judgedClusters[0]?.id ?? 'cluster_1',
        dominantClusterShare: roundToOne(((dominantCluster?.count ?? 0) / Math.max(totalResponses, 1)) * 100),
    };
});

export const totalResponses = judgedClusters.reduce((sum, cluster) => sum + cluster.size, 0);

export const topMetrics = [
    { label: 'Question', value: 'Anglemire', detail: 'Marriage-consideration Statute of Frauds benchmark.' },
    { label: 'Responses', value: String(totalResponses), detail: 'Twelve models with twenty outputs each.' },
    { label: 'Clusters', value: String(judgedClusters.length), detail: 'Representative response families extracted for centroid judging.' },
    {
        label: 'Leader',
        value: modelLeaderboard[0]?.modelKey.split('::')[1] ?? 'N/A',
        detail: `${modelLeaderboard[0]?.averageScore.toFixed(1) ?? '0.0'} average final score after Dasha propagation.`,
    },
];

export const batchSummary = {
    embeddingInstruction: 'Represent the legal conclusion and reasoning of this text:',
    clusteringMethod: 'Instruction-tuned embeddings -> UMAP -> HDBSCAN',
    completionLabel: `${totalResponses} / ${modelKeys.length * 20} responses generated`,
};

export const dashaSummary = {
    judgedClusters: judgedClusters.length,
    primaryWinner: judgedClusters[0]?.label ?? '',
    primaryWinnerScore: judgedClusters[0]?.finalScore ?? 0,
    propagationLabel: 'Each centroid score is applied to every response in its cluster before the model leaderboard is recalculated.',
};

export const initialClusterId = judgedClusters[0]?.id ?? 'cluster_1';
