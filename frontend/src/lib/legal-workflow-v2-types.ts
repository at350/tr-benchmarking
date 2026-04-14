export type WorkflowStatus = 'draft' | 'approved' | 'completed' | 'failed';

export type ModelProvider = 'openai' | 'anthropic' | 'gemini';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export type ArtifactRole =
    | 'anchor_case'
    | 'supporting_authority'
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

export type FrankSofPackId = 'pack10' | 'pack20' | 'pack30' | 'pack40';
export type RoutingConfidence = 'strong' | 'moderate' | 'weak';
export type FrankPhase = 'source' | 'routing_intake' | 'extraction_mapping' | 'benchmark' | 'question';
export type IntakeRating =
    | 'Strong lead source'
    | 'Moderate; usable with supporting authority'
    | 'Weak; support/contrast source only'
    | 'Not a strong gold-source candidate without additional authority';
export type IntakeStrength = 'Strong' | 'Moderate' | 'Weak';
export type BenchmarkPosture =
    | 'narrow_source_grounded_benchmark_only'
    | 'generalizable_only_with_supporting_authority'
    | 'portable_benchmark_under_stated_assumptions';

export type FrankSourceIntakeChecklist = {
    candidateSource: string;
    sourceTypeAuthorityLevel: string;
    targetDoctrineFamilyLikelyPack: string;
    cleanLegalIssue: string;
    blackLetterRuleExtractable: IntakeStrength;
    triggerFactsIdentifiable: IntakeStrength;
    holdingUsableForBenchmarkDrafting: IntakeStrength;
    limitsBoundariesIdentifiable: IntakeStrength;
    proceduralNoiseLevel: IntakeStrength;
    jurisdictionSensitivitySplitRisk: IntakeStrength;
    benchmarkAnswerSuitability: IntakeStrength;
    reverseEngineeringSuitabilityLabel: IntakeStrength;
    benchmarkPosture: BenchmarkPosture;
    failureModeYield: IntakeStrength;
    jdReviewBurden: string[];
    finalIntakeRating: IntakeRating;
    recommendation: string;
};

export type FrankSourceExtractionSheet = {
    selectedDoctrinePack: FrankSofPackId;
    candidateSource: string;
    sourceTypeAuthorityLevel: string;
    jurisdictionForum: string;
    proceduralPosture: string;
    cleanLegalIssue: string;
    blackLetterRule: string;
    triggerFacts: string[];
    holdingOrBestSupportedAnswerPath: string;
    whyThatResultFollows: string;
    limitsBoundaries: string[];
    sourceDoesNotDecide: string[];
    jurisdictionSensitivitySplitRisk: string[];
    benchmarkUseConfidence: string;
    jdReviewNeeded: string[];
};

export type FrankGoldPacketMapping = {
    doctrineFamily: string;
    controllingTrigger: string;
    requiredGateOrder: string[];
    whatMakesDoctrineApply: string[];
    whatDoesNotSatisfyIt: string[];
    independentCompetingBarriers: string[];
    possibleSubstitutesExceptions: string[];
    limitsOnSubstitutesExceptions: string[];
    likelyJurisdictionSensitivePoints: string[];
    likelyModelMistakes: string[];
    candidateFactPatternIngredients: string[];
    reverseEngineeringSuitability: string;
    benchmarkPosture: 'pack_specific_benchmark_only' | 'generalizable_only_with_supporting_authority' | 'portable_benchmark_within_selected_pack';
};

export type FrankLikelyFailureModes = {
    FM1: string;
    FM2: string;
    FM3: string;
    FM4: string;
    FM5: string;
};

export type FrankSavedPromptKind =
    | 'routing_intake_generation'
    | 'extraction_mapping_generation'
    | 'benchmark_generation'
    | 'question_generation'
    | 'rubric_generation';

export type FrankSavedPrompt = {
    id: string;
    kind: FrankSavedPromptKind;
    title: string;
    prompt: string;
    createdAt: string;
};

export type KarthicPrefillStatus = 'Fixed' | 'Fixed but jurisdiction-sensitive' | 'Needs human confirmation';
export type KarthicVariationLane = 'A' | 'B';
export type KarthicOutputShell = 'core_cross_pack_v1' | 'legacy_father_son_v1' | 'custom';
export type KarthicPacketReadiness = 'Ready' | 'Needs work' | 'Blocked';

export type KarthicHandoffAuditStatus = {
    selected_pack: KarthicPrefillStatus;
    doctrine_family: KarthicPrefillStatus;
    jurisdiction_assumption: KarthicPrefillStatus;
    benchmark_posture: KarthicPrefillStatus;
    likely_controlling_doctrine: KarthicPrefillStatus;
    required_gate_order: KarthicPrefillStatus;
    output_shell: KarthicPrefillStatus;
    strongest_expected_counterargument: KarthicPrefillStatus;
    gold_answer_ref: KarthicPrefillStatus;
    doctrine_guide_or_pack_ref: KarthicPrefillStatus;
    failure_bank_ref: KarthicPrefillStatus;
    variation_lane: KarthicPrefillStatus;
    human_weight_overrides: KarthicPrefillStatus;
    packet_readiness: KarthicPrefillStatus;
};

export type KarthicHandoff = {
    packet_id: string;
    date_created: string;
    created_by: string;
    source_authority: string;
    source_type: string;
    selected_pack: string;
    doctrine_family: string;
    benchmark_posture: string;
    variation_lane: KarthicVariationLane;
    source_grounded_vs_generalized: string;
    jurisdiction_assumption: string;
    likely_controlling_doctrine: string;
    required_gate_order: string;
    strongest_expected_counterargument: string;
    key_jurisdiction_sensitive_points: string[];
    output_shell: KarthicOutputShell;
    custom_output_shell_text: string;
    gold_answer_ref: string;
    doctrine_guide_or_pack_ref: string;
    failure_bank_ref: string;
    clustered_centroids_or_archetypes_ref: string;
    human_weight_overrides: string;
    failure_bank_status: string;
    cluster_confidence_or_escalation_flag: string;
    packet_readiness: KarthicPacketReadiness;
    missing_or_uncertain_items: string[];
    zak_review_needed_before_lock: 'Yes' | 'No';
    prefill_audit_status: KarthicHandoffAuditStatus;
};

export type FrankPacketV2 = {
    schemaVersion: 2 | 3;
    id: string;
    status: Extract<WorkflowStatus, 'draft' | 'approved'>;
    phase: FrankPhase;
    legalDomain: 'Statute of Frauds';
    sourceFamily: 'uploaded_authority';
    title: string;
    selectedPack: FrankSofPackId | null;
    routingReason: string;
    secondaryIssues: string[];
    routingConfidence: RoutingConfidence | null;
    sourceArtifacts: ArtifactRecord[];
    intakeChecklist: FrankSourceIntakeChecklist | null;
    sourceExtractionSheet: FrankSourceExtractionSheet | null;
    goldPacketMapping: FrankGoldPacketMapping | null;
    likelyFailureModes: FrankLikelyFailureModes | null;
    benchmarkAnswer: string;
    reverseEngineeredQuestion: string;
    karthicHandoff: KarthicHandoff;
    savedPrompts: FrankSavedPrompt[];
    benchmarkWarnings: string[];
    questionWarnings: string[];
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type RubricRowKey = string;
export type RubricModuleId = 'module0' | 'module1' | 'module2' | 'module3' | 'module4';
export type RubricRowSource = 'anchor' | 'emergent';
export type RubricRowRole = 'controlling' | 'secondary' | 'fallback' | 'cross_cutting';

export type RubricRowGoldenTarget = {
    summary: string;
    goldenContains: string[];
    allowedOmissions: string[];
    contradictionFlags: string[];
    comparisonGuidance: string;
};

export type RubricRowScoreAnchors = {
    '0': string;
    '1': string;
    '2': string;
    '3': string;
    '4': string;
};

export type KarthicRubricRow = {
    key: RubricRowKey;
    moduleId: RubricModuleId;
    rowSource: RubricRowSource;
    role: RubricRowRole;
    title: string;
    description: string;
    weight: number;
    lockedWeight: number;
    include: boolean;
    naGuidance: string;
    failureMode: string;
    scoreAnchors: RubricRowScoreAnchors;
    goldenTarget: RubricRowGoldenTarget;
};

export type KarthicModuleBudget = {
    moduleId: Exclude<RubricModuleId, 'module0'>;
    label: string;
    defaultBudget: number;
    overrideBudget: number | null;
    finalBudget: number;
    rationale: string;
};

export type KarthicFailureLabelMapEntry = {
    rowKey: RubricRowKey;
    label: string;
    notes: string;
};

export type KarthicDecompositionLogEntry = {
    rowKey: RubricRowKey;
    action: 'created' | 'split' | 'merged' | 'pruned' | 'retained';
    note: string;
};

export type KarthicRubricPackV2 = {
    schemaVersion: 2 | 3;
    id: string;
    frankPacketId: string;
    selectedPack: FrankSofPackId;
    questionText: string;
    status: Extract<WorkflowStatus, 'draft' | 'approved'>;
    prefillAudit: KarthicHandoff;
    moduleBudgets: KarthicModuleBudget[];
    anchorRows: KarthicRubricRow[];
    emergentRows: KarthicRubricRow[];
    rows: KarthicRubricRow[];
    failureLabelMap: KarthicFailureLabelMapEntry[];
    decompositionLog: KarthicDecompositionLogEntry[];
    variationPatchNotes: string[];
    escalationNotes: string[];
    savedPrompts: FrankSavedPrompt[];
    comparisonMethodNote: string;
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type DashaRunMode = 'score_and_cluster' | 'cluster_only';

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

export type RubricRowDifference = {
    matchedGoldenPoints: string[];
    missingGoldenPoints: string[];
    extraCentroidPoints: string[];
    contradictionPoints: string[];
    differenceSummary: string;
};

export type RubricRowCentroidEvaluation = {
    clusterId: string;
    applicabilityStatus: 'applicable' | 'not_applicable';
    applicabilityExplanation: string;
    score: number | null;
    confidence: number | null;
    rationale: string;
    difference: RubricRowDifference;
    metadataTags: {
        bottomLineOutcome: string;
        outcomeCorrectness: string;
        reasoningAlignment: string;
        jurisdictionAssumption: string;
    };
};

export type RubricRowResult = {
    rowKey: RubricRowKey;
    moduleId: RubricModuleId;
    rowTitle: string;
    weight: number;
    applicabilityStatus: 'applicable' | 'not_applicable';
    applicabilityExplanation: string;
    centroidEvaluations: RubricRowCentroidEvaluation[];
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

export type ModuleSummary = {
    moduleId: RubricModuleId;
    label: string;
    averageScore: number | null;
    applicableRowCount: number;
    winningRowKeys: RubricRowKey[];
};

export type WeightedSummary = {
    applicableWeightTotal: number;
    weightedScore: number | null;
    notApplicableRowKeys: RubricRowKey[];
};

export type DashaPenaltyApplication = {
    code: string;
    points: number;
    reason: string;
};

export type DashaCapStatus = {
    code: string | null;
    applied: boolean;
    capValue: number | null;
    note: string;
};

export type DashaClusterRowScore = {
    rowKey: RubricRowKey;
    moduleId: RubricModuleId;
    rowTitle: string;
    weight: number;
    rowSource: RubricRowSource;
    role: RubricRowRole;
    applicabilityStatus: 'applicable' | 'not_applicable';
    applicabilityExplanation: string;
    score: 0 | 1 | 2 | 3 | 4 | null;
    weightedContribution: number;
    confidence: number | null;
    rationale: string;
    difference: RubricRowDifference;
    metadataTags: {
        bottomLineOutcome: string;
        outcomeCorrectness: string;
        reasoningAlignment: string;
        jurisdictionAssumption: string;
    };
};

export type DashaClusterScorecard = {
    clusterId: string;
    size: number;
    modelBreakdown: DashaClusterRecord['modelBreakdown'];
    rowScores: DashaClusterRowScore[];
    moduleSummaries: ModuleSummary[];
    subtotal: number;
    penaltiesApplied: DashaPenaltyApplication[];
    capStatus: DashaCapStatus;
    postPenaltyScore: number;
    finalScore: number;
    zakReviewFlag: boolean;
    averageConfidence: number | null;
    rank: number | null;
};

export type DashaRunV2 = {
    schemaVersion: 2 | 3;
    id: string;
    rubricPackId: string;
    runMode: DashaRunMode;
    status: Extract<WorkflowStatus, 'draft' | 'completed' | 'failed'>;
    inputArtifacts: ArtifactRecord[];
    questionText: string;
    selectedModels: DashaSelectedModel[];
    requestedResponseCount?: number;
    validResponseCount?: number;
    responses: DashaResponseRecord[];
    clusters: DashaClusterRecord[];
    rowResults: RubricRowResult[];
    moduleSummaries: ModuleSummary[];
    weightedSummary: WeightedSummary;
    clusterScorecards: DashaClusterScorecard[];
    primaryClusterId: string | null;
    clusteringMethod: string;
    clusteringNotes: string | null;
    errorMessage?: string;
    createdAt: string;
    completedAt: string | null;
};

export type FrankGenerationSettings = {
    model: string;
    reasoningEffort: ReasoningEffort;
};
