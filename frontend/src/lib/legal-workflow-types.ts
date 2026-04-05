export type WorkflowStatus = 'draft' | 'approved' | 'completed' | 'failed';

export type ArtifactRole =
    | 'anchor_case'
    | 'issue_statement'
    | 'evidence_packet'
    | 'supplemental'
    | 'question_packet';

export type ArtifactRecord = {
    id: string;
    role: ArtifactRole;
    fileName: string;
    storedPath: string;
    extractedTextPath: string;
    extractedText: string;
    uploadedAt: string;
};

export type FrankCaseCandidate = {
    id: string;
    title: string;
    citation: string;
    court: string;
    year: string;
    url: string;
    summary: string;
    relevance: string;
};

export type FrankAnalysisDomain = {
    id: string;
    name: string;
    description: string;
};

export type BenchmarkPosture =
    | 'narrow_source_grounded_benchmark_only'
    | 'generalizable_only_with_supporting_authority'
    | 'portable_common_law_benchmark';

export type SourceIntake = {
    sourceQualityRating: string;
    benchmarkPosture: BenchmarkPosture;
    recommendation: string;
    jdReviewBurden: string[];
    reverseEngineeringSuitability: 'strong' | 'moderate' | 'weak';
};

export type SourceExtraction = {
    legalIssue: string;
    blackLetterRule: string;
    triggerFacts: string[];
    holding: string;
    limits: string[];
    uncertainty: string[];
};

export type FrankPacket = {
    id: string;
    status: Extract<WorkflowStatus, 'draft' | 'approved'>;
    legalDomain: string;
    domainScope: string;
    sourceFamily: string;
    selectedCase: FrankCaseCandidate | null;
    analysisDomains: FrankAnalysisDomain[];
    sourceArtifacts: ArtifactRecord[];
    sourceIntake: SourceIntake;
    sourceExtraction: SourceExtraction;
    benchmarkAnswer: string;
    benchmarkQuestion: string;
    failureModeSeeds: string[];
    masterIssueStatement: string;
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type KarthicDomain = {
    id: string;
    name: string;
    description: string;
    weight: number;
    naGuidance: string;
};

export type CriterionStatus = 'active' | 'redundant' | 'draft';

export type KarthicCriterion = {
    id: string;
    domainId: string;
    text: string;
    parentId: string | null;
    depth: number;
    status: CriterionStatus;
    source: 'seed' | 'refined' | 'sme_promoted';
};

export type RefinementLogEntry = {
    id: string;
    timestamp: string;
    domainId: string;
    criterionId: string | null;
    action: 'created_seed' | 'decomposed' | 'marked_redundant' | 'manual_edit';
    note: string;
};

export type KarthicGoldenDomainTarget = {
    id: string;
    domainId: string;
    domainName: string;
    summary: string;
    goldenContains: string[];
    allowedOmissions: string[];
    contradictionFlags: string[];
    comparisonGuidance: string;
};

export type KarthicRubricPack = {
    id: string;
    frankPacketId: string;
    status: Extract<WorkflowStatus, 'draft' | 'approved'>;
    domains: KarthicDomain[];
    goldenTargets: KarthicGoldenDomainTarget[];
    criteria: KarthicCriterion[];
    refinementLog: RefinementLogEntry[];
    smeNotes: string;
    comparisonMethodNote: string;
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ModelProvider = 'openai' | 'replicate';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export type DashaSelectedModel = {
    provider: ModelProvider;
    model: string;
    reasoningEffort?: ReasoningEffort;
    temperature?: number;
};

export type DashaResponseRecord = {
    id: string;
    modelKey: string;
    provider: ModelProvider;
    model: string;
    sampleIndex?: number;
    responseText: string;
    clusterId: string;
    error?: string;
};

export type DashaClusterRecord = {
    id: string;
    sourceClusterId?: string;
    representativeResponseId: string;
    representativeText: string;
    memberResponseIds: string[];
    size: number;
    modelBreakdown: Array<{
        modelKey: string;
        provider: ModelProvider;
        model: string;
        count: number;
    }>;
};

export type DomainCentroidDifference = {
    matchedGoldenPoints: string[];
    missingGoldenPoints: string[];
    extraCentroidPoints: string[];
    contradictionPoints: string[];
    differenceSummary: string;
};

export type DomainCentroidEvaluation = {
    clusterId: string;
    applicabilityStatus: 'applicable' | 'not_applicable';
    applicabilityExplanation: string;
    score: number | null;
    confidence: number | null;
    rationale: string;
    difference: DomainCentroidDifference;
};

export type DomainResult = {
    domainId: string;
    domainName: string;
    weight: number;
    applicabilityStatus: 'applicable' | 'not_applicable';
    applicabilityExplanation: string;
    centroidEvaluations: DomainCentroidEvaluation[];
    winningCentroidId: string | null;
    winningScore: number | null;
    rationale: string;
    winningModelMix: Array<{
        modelKey: string;
        provider: ModelProvider;
        model: string;
        count: number;
    }>;
};

export type WeightedSummary = {
    applicableWeightTotal: number;
    weightedScore: number | null;
    notApplicableDomainIds: string[];
};

export type DashaRun = {
    id: string;
    rubricPackId: string;
    status: Extract<WorkflowStatus, 'draft' | 'completed' | 'failed'>;
    inputArtifacts: ArtifactRecord[];
    questionText: string;
    selectedModels: DashaSelectedModel[];
    requestedResponseCount?: number;
    validResponseCount?: number;
    responses: DashaResponseRecord[];
    clusters: DashaClusterRecord[];
    domainResults: DomainResult[];
    weightedSummary: WeightedSummary;
    clusteringMethod: string;
    clusteringNotes: string | null;
    errorMessage?: string;
    createdAt: string;
    completedAt: string | null;
};
