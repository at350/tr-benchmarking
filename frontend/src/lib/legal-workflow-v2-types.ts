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
export type QuestionVariancePhase = 'routing' | 'menu' | 'package';
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
export type ReverseEngineeringSuitability = 'strong' | 'moderate' | 'weak';
export type VariationProvisionId = 'marriage' | 'suretyship' | 'one_year' | 'land' | 'ucc_2201' | 'executor';
export type VariationRouteStatus = 'stable_route' | 'multiple_plausible_routes' | 'needs_classification_first' | 'not_primarily_sof';
export type VariationLane = 'lane_a' | 'lane_b';
export type VariationLaneCode = 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2';
export type VariationReuseLevel = 'reuse_as_is' | 'cosmetic_edits_only' | 'ambiguity_rewrite_required' | 'unsafe';
export type VariationStatus = 'ready' | 'needs_targeted_revision' | 'unsafe';
export type VariationPackageStatus = 'safe' | 'unsafe' | 'ambiguity_test';
export type VariationExpectedResultType = 'same_likely_outcome' | 'same_doctrine_different_fact_salience' | 'missing_facts_bounded_uncertainty' | 'unsafe_to_vary';
export type ConfusionPattern = 'dual_trigger' | 'priority' | 'split_transaction' | 'needs_classification_first';
export type QuestionSource = 'canonical' | 'question_variance_active_package';

export type QuestionVarianceRoutingResult = {
    inputType: string;
    routeStatus: VariationRouteStatus;
    governingLawCandidate: string;
    primaryProvisionCandidate: VariationProvisionId | null;
    secondaryCandidates: VariationProvisionId[];
    controllingDoctrine: string;
    mainGateOrder: string[];
    variationReadiness: string;
    mainNoSilentChangeFacts: string[];
    confusionPattern: ConfusionPattern | null;
    confusionSetId: string | null;
    menuRule: string | null;
};

export type QuestionVarianceMenuOption = {
    id: string;
    label: string;
    lane: VariationLane;
    laneCode: VariationLaneCode;
    variationType: string;
    whatChanges: string;
    whyItFits: string;
    expectedAnswerReuse: VariationReuseLevel;
    mainRedFlag: string;
    exactSwapOptions: QuestionVarianceExactSwapOption[];
};

export type QuestionVarianceMenu = {
    generatedAt: string;
    resolvedProvisionId: VariationProvisionId | null;
    options: QuestionVarianceMenuOption[];
};

export type QuestionVarianceSwapLogEntry = {
    from: string;
    to: string;
};

export type QuestionVarianceExactSwapOption = {
    id: string;
    label: string;
    from: string;
    to: string;
    whatChanges: string;
};

export type QuestionVariancePackage = {
    id: string;
    selectedOptionId: string;
    lane: VariationLane;
    laneCode: VariationLaneCode;
    variationType: string;
    selectedSwapOptionIds: string[];
    jurisdiction: string;
    controllingDoctrine: string;
    expectedResultType: VariationExpectedResultType;
    variationStatus: VariationPackageStatus;
    answerReuseLevel: VariationReuseLevel;
    variedLegalQuestion: string;
    updatedModelAnswer: string;
    swapLog: QuestionVarianceSwapLogEntry[];
    rubricPatchNotes: string[];
    whyTheAnswerShouldStayTheSameOrChange: string;
    redFlags: string[];
    status: VariationStatus;
    createdAt: string;
};

export type QuestionVarianceState = {
    phase: QuestionVariancePhase;
    routingResult: QuestionVarianceRoutingResult | null;
    menu: QuestionVarianceMenu | null;
    packages: QuestionVariancePackage[];
    activePackageId: string | null;
    warnings: string[];
};

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

export type FrankControllerCardVariationLane = 'none' | 'A' | 'B';
export type FrankControllerCardSelectedLaneCode = 'none' | 'A1' | 'A2' | 'A3' | 'A4' | 'B1' | 'B2';
export type FrankControllerCardWritingStatus = 'present' | 'absent' | 'omitted' | 'disputed';
export type FrankControllerCardRubricPatchScope = 'base rubric only' | 'selected variation only';
export type FrankControllerCardSelectedVariationAnswerPosture = 'same_as_base' | 'localized_edit' | 'ambiguity_rewrite';
export type FrankControllerCardDualRubricMode = 'off' | 'on';
export type FrankControllerCardEvaluationTracks = 'original_only' | 'original_and_selected_variation';

export type FrankControllerCard = {
    selected_pack: FrankSofPackId | '';
    doctrine_family: string;
    jurisdiction_assumption: string;
    benchmark_posture: string;
    current_question_text: string;
    gold_answer: string;
    likely_controlling_doctrine: string;
    correct_trigger_test: string;
    trigger_facts: string[];
    non_triggered_sibling_gates: string[];
    required_gate_order: string[];
    writing_status: FrankControllerCardWritingStatus;
    strongest_counterargument: string;
    allowed_fallbacks: string[];
    fallback_limits: string[];
    omitted_control_fact: string;
    variation_lane: FrankControllerCardVariationLane;
    selected_lane_code: FrankControllerCardSelectedLaneCode;
    variation_menu_options: string[];
    selected_variation_summary: string;
    selected_variation_fact_deltas: string[];
    rubric_patch_scope: FrankControllerCardRubricPatchScope;
    failure_bank: string;
    base_question_text: string;
    base_gold_answer: string;
    selected_variation_question_text: string;
    selected_variation_answer_posture: FrankControllerCardSelectedVariationAnswerPosture;
    dual_rubric_mode: FrankControllerCardDualRubricMode;
    rubric_separation_rule: 'strict';
    evaluation_tracks: FrankControllerCardEvaluationTracks;
};

export type FrankSavedPromptKind =
    | 'routing_intake_generation'
    | 'extraction_mapping_generation'
    | 'benchmark_generation'
    | 'question_generation'
    | 'question_variance_routing_menu_generation'
    | 'question_variance_package_generation'
    | 'rubric_generation';

export type FrankSavedPrompt = {
    id: string;
    kind: FrankSavedPromptKind;
    title: string;
    prompt: string;
    createdAt: string;
};

export type FrankGenerationSettings = {
    model: string;
    reasoningEffort: ReasoningEffort;
};

export type PromptGenerationSettingsByKind = Partial<Record<FrankSavedPromptKind, FrankGenerationSettings>>;

export type FrankPacketV2 = {
    schemaVersion: 2;
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
    controllerCard: FrankControllerCard | null;
    likelyFailureModes: FrankLikelyFailureModes | null;
    benchmarkAnswer: string;
    reverseEngineeredQuestion: string;
    questionVariance: QuestionVarianceState;
    savedPrompts: FrankSavedPrompt[];
    generationSettings: PromptGenerationSettingsByKind;
    benchmarkWarnings: string[];
    questionWarnings: string[];
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type RubricRowKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';
export type RubricModuleId = 'module0' | 'module1' | 'module2' | 'module3' | 'module4';

export type RubricRowGoldenTarget = {
    summary: string;
    goldenContains: string[];
    allowedOmissions: string[];
    contradictionFlags: string[];
    comparisonGuidance: string;
};

export type KarthicRubricRow = {
    key: RubricRowKey;
    moduleId: RubricModuleId;
    title: string;
    description: string;
    weight: number;
    naGuidance: string;
    goldenTarget: RubricRowGoldenTarget;
};

export type KarthicPreClusterRunStatus = Extract<WorkflowStatus, 'draft' | 'completed' | 'failed'>;

export type KarthicRefinementAction = 'added' | 'rewritten' | 'dropped' | 'kept';

export type KarthicRefinementLogEntry = {
    iteration: number;
    action: KarthicRefinementAction;
    rowKey: RubricRowKey;
    rationale: string;
    sourceClusterIds: string[];
};

export type KarthicRefinementStatus = 'not_started' | 'seeded' | 'refined' | 'approved';
export type KarthicRubricTrackId = 'base' | 'selected_variation';
export type KarthicCaseCitationVerificationMode = 'off' | 'on';

export type KarthicRubricTrack = {
    id: KarthicRubricTrackId;
    label: string;
    questionSource: QuestionSource;
    questionVariancePackageId: string | null;
    questionText: string;
    benchmarkAnswer: string;
    seedRows: KarthicRubricRow[];
    rows: KarthicRubricRow[];
    preservationNotes: string[];
    patchNotes: string[];
    deltaSummary: string[];
};

export type KarthicPenaltyRule = {
    code: string;
    label: string;
    points: number;
    enabled: boolean;
    appliesWhen: string;
    notes: string;
};

export type KarthicCapRule = {
    code: string;
    label: string;
    cap: number;
    enabled: boolean;
    appliesWhen: string;
    notes: string;
};

export type KarthicScoringPolicy = {
    sourceFiles: string[];
    caseCitationVerificationMode: KarthicCaseCitationVerificationMode;
    zakReviewPenaltyThreshold: number;
    penalties: KarthicPenaltyRule[];
    caps: KarthicCapRule[];
    notes: string[];
};

export type KarthicPreClusterRunV2 = {
    schemaVersion: 2;
    id: string;
    frankPacketId: string;
    questionText: string;
    status: KarthicPreClusterRunStatus;
    selectedModels: DashaSelectedModel[];
    requestedResponseCount: number;
    validResponseCount: number;
    responses: DashaResponseRecord[];
    clusters: DashaClusterRecord[];
    clusterFailureModes: string[];
    clusteringMethod: string;
    clusteringNotes: string | null;
    errorMessage?: string;
    createdAt: string;
    completedAt: string | null;
};

export type KarthicRubricPackV2 = {
    schemaVersion: 2;
    id: string;
    frankPacketId: string;
    preClusterRunId: string | null;
    selectedPack: FrankSofPackId;
    controllerCard: FrankControllerCard | null;
    activeTrack: KarthicRubricTrackId;
    tracks: {
        base: KarthicRubricTrack;
        selected_variation: KarthicRubricTrack | null;
    };
    questionSource: QuestionSource;
    questionVariancePackageId: string | null;
    questionText: string;
    status: Extract<WorkflowStatus, 'draft' | 'approved'>;
    seedRows: KarthicRubricRow[];
    rows: KarthicRubricRow[];
    scoringPolicy: KarthicScoringPolicy;
    clusterFailureModes: string[];
    refinementLog: KarthicRefinementLogEntry[];
    refinementStatus: KarthicRefinementStatus;
    savedPrompts: FrankSavedPrompt[];
    generationSettings: PromptGenerationSettingsByKind;
    comparisonMethodNote: string;
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type DashaRunMode = 'score_and_cluster' | 'cluster_only';
export type DashaComparisonRole = 'baseline' | 'variant';

export type DashaSelectedModel = {
    provider: ModelProvider;
    model: string;
    reasoningEffort?: ReasoningEffort;
    temperature?: number;
};

export type DashaJudgeSettings = {
    provider: 'openai';
    model: string;
    reasoningEffort: ReasoningEffort;
};

export type DashaCaseMentionStatus = 'none' | 'mentioned';
export type DashaCitationAccuracyStatus =
    | 'not_applicable'
    | 'verified_correct'
    | 'verified_partly_correct'
    | 'hallucinated_or_unverifiable';
export type DashaCaseExistenceSummary = 'no_case' | 'all_verified' | 'mixed' | 'all_unverified';
export type DashaSourceCaseReferenceStatus =
    | 'not_applicable'
    | 'source_case_cited'
    | 'other_case_only'
    | 'source_case_and_other_cases';
export type DashaPanelMajorityStatus = 'majority' | 'no_majority' | 'not_applicable';

export type DashaAppliedPenalty = {
    code: string;
    label: string;
    points: number;
    reason: string;
};

export type DashaAppliedCap = {
    code: string;
    label: string;
    cap: number;
    reason: string;
};

export type DashaCaseCitationAnalysis = {
    caseMentionStatus: DashaCaseMentionStatus;
    extractedCaseMentions: string[];
    verifiedCaseMentions: string[];
    hallucinatedCaseMentions: string[];
    citedCaseCountTotal: number;
    verifiedCaseCount: number;
    hallucinatedCaseCount: number;
    caseExistenceSummary: DashaCaseExistenceSummary;
    citationAccuracyStatus: DashaCitationAccuracyStatus;
    sourceCaseReferenceStatus: DashaSourceCaseReferenceStatus;
    sourceCaseReferenceNote: string;
    caseVerificationReviewFlag: boolean;
    note: string;
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

export type DashaModelClusterContribution = {
    clusterId: string;
    count: number;
    share: number;
    clusterWeightedScore: number | null;
};

export type DashaModelSummary = {
    modelKey: string;
    provider: ModelProvider;
    model: string;
    validCount: number;
    errorCount: number;
    totalResponses: number;
    propagatedWeightedScore: number | null;
    dominantClusterId: string | null;
    dominantClusterShare: number;
    clusterContributions: DashaModelClusterContribution[];
};

export type DashaClusterAnalysis = {
    clusterId: string;
    evaluationTrack: string;
    questionVersion: string;
    rubricType: string;
    clusterSizeTotal: number;
    representedModelCount: number;
    dominantModelName: string | null;
    dominantModelCount: number;
    dominantModelShare: number;
    subtotal: number | null;
    penaltiesApplied: DashaAppliedPenalty[];
    capApplied: DashaAppliedCap | null;
    finalScore: number | null;
    disagreementFlag: boolean;
    zakReviewFlag: boolean;
    trackSummaryNote: string;
    caseCitation: DashaCaseCitationAnalysis;
};

export type DashaTrackSummary = {
    evaluationTrack: string;
    questionVersion: string;
    rubricType: string;
    rankedCentroidList: string[];
    disputedCentroidIds: string[];
    bestCentroidByScore: string | null;
    bestCentroidScore: number | null;
    topCentroidVoteSplit: string;
    panelMajorityStatus: DashaPanelMajorityStatus;
    bestCentroidZakReviewFlag: boolean;
    trackSummary: string;
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

export type DashaWorkflowStage = 'cluster_pending' | 'clustered' | 'judged';

export type DashaRunV2 = {
    schemaVersion: 2;
    id: string;
    rubricPackId: string;
    rubricTrackId: KarthicRubricTrackId;
    runMode: DashaRunMode;
    status: Extract<WorkflowStatus, 'draft' | 'completed' | 'failed'>;
    workflowStage: DashaWorkflowStage;
    inputArtifacts: ArtifactRecord[];
    questionText: string;
    questionSource: QuestionSource;
    questionVariancePackageId: string | null;
    comparisonId: string | null;
    comparisonRole: DashaComparisonRole | null;
    selectedModels: DashaSelectedModel[];
    judgeSettings: DashaJudgeSettings;
    requestedResponseCount?: number;
    validResponseCount?: number;
    responses: DashaResponseRecord[];
    clusters: DashaClusterRecord[];
    clusterAnalyses: DashaClusterAnalysis[];
    rowResults: RubricRowResult[];
    moduleSummaries: ModuleSummary[];
    weightedSummary: WeightedSummary;
    modelSummaries: DashaModelSummary[];
    trackSummary: DashaTrackSummary | null;
    clusteringMethod: string;
    clusteringNotes: string | null;
    errorMessage?: string;
    createdAt: string;
    completedAt: string | null;
};

export type DashaComparisonModuleDelta = {
    moduleId: RubricModuleId;
    label: string;
    baselineScore: number | null;
    variantScore: number | null;
    scoreDelta: number | null;
};

export type DashaComparisonModelDelta = {
    modelKey: string;
    provider: ModelProvider;
    model: string;
    baselineScore: number | null;
    variantScore: number | null;
    scoreDelta: number | null;
    baselineDominantClusterId: string | null;
    variantDominantClusterId: string | null;
    baselineValidCount: number;
    variantValidCount: number;
};

export type DashaComparisonSummary = {
    baselineWeightedScore: number | null;
    variantWeightedScore: number | null;
    weightedScoreDelta: number | null;
    moduleDeltas: DashaComparisonModuleDelta[];
    modelDeltas: DashaComparisonModelDelta[];
};

export type DashaComparisonV2 = {
    schemaVersion: 2;
    id: string;
    status: Extract<WorkflowStatus, 'draft' | 'completed' | 'failed'>;
    frankPacketId: string;
    rubricPackId: string;
    questionVariancePackageId: string;
    variationLabel: string;
    variationType: string;
    baselineQuestionText: string;
    variantQuestionText: string;
    baselineRunId: string;
    variantRunId: string;
    selectedModels: DashaSelectedModel[];
    requestedResponseCount: number;
    summary: DashaComparisonSummary | null;
    errorMessage?: string;
    createdAt: string;
    completedAt: string | null;
};

export type ZakInvocationMode = 'automatic_dasha_non_majority' | 'manual_review';
export type ZakReviewWorkflowStatus = Extract<WorkflowStatus, 'draft' | 'completed' | 'failed'>;
export type ZakPrintablePacketStatus = 'ready' | 'not_ready';
export type ZakScoreLockStatus = 'ready' | 'not_ready';
export type ZakUpstreamRevisionTarget = 'none' | 'Frank' | 'Karthic' | 'Dasha';
export type ZakSmeConfidence = 'high' | 'medium' | 'low' | 'not_provided';
export type ZakSmeSelectedBestCentroid = 'none' | 'tie' | 'no_adequate_centroid' | string;

export type ZakReviewCentroid = {
    centroidId: string;
    centroidText: string;
    dashaRowScoringSummary: Array<{
        rowKey: RubricRowKey;
        rowTitle: string;
        moduleId: RubricModuleId;
        moduleLabel: string;
        weight: number;
        score: number | null;
        applicabilityStatus: 'applicable' | 'not_applicable';
        rationale: string;
        differenceSummary: string;
    }>;
    subtotal: number | null;
    penaltiesApplied: DashaAppliedPenalty[];
    capApplied: DashaAppliedCap | null;
    finalScore: number | null;
    clusterSizeTotal: number;
    modelBreakdown: DashaClusterRecord['modelBreakdown'];
    representedModelCount: number;
    dominantModelName: string | null;
    dominantModelShare: number;
    caseCitation: DashaCaseCitationAnalysis;
    shortKarthicEscalationNote: string;
};

export type ZakScoringSheetEntry = {
    centroidId: string;
    rowKey: RubricRowKey;
    rowLabel: string;
    shortRowPurpose: string;
    scoringReminder: string;
    smeScore: number | null;
    smeNote: string;
};

export type ZakDecisionRecord = {
    smeSelectedBestCentroid: ZakSmeSelectedBestCentroid;
    smeConfidence: ZakSmeConfidence;
    controllingRowsDrivingDecision: string[];
    rubricInstabilityNotes: string;
    upstreamRevisionNeededNotes: string;
};

export type ZakReviewV1 = {
    schemaVersion: 1;
    id: string;
    status: ZakReviewWorkflowStatus;
    invocationMode: ZakInvocationMode;
    dashaRunId: string;
    rubricPackId: string;
    rubricTrackId: KarthicRubricTrackId;
    frankPacketId: string;
    evaluationTrack: string;
    questionVersion: string;
    rubricType: string;
    dualRubricMode: 'on' | 'off';
    selectedLaneCode: FrankControllerCardSelectedLaneCode;
    topCentroidVoteSplit: string;
    disputedCentroidIds: string[];
    packetReviewReady: boolean;
    printablePacketStatus: ZakPrintablePacketStatus;
    printablePacketContentsSummary: string;
    printablePacketCanBeAssembled: boolean;
    activeQuestionText: string;
    activeRubricRows: KarthicRubricRow[];
    disputedCentroids: ZakReviewCentroid[];
    scoringSheet: ZakScoringSheetEntry[];
    decisionRecord: ZakDecisionRecord;
    scoreLockStatus: ZakScoreLockStatus;
    upstreamRevisionTarget: ZakUpstreamRevisionTarget;
    dispositionNote: string;
    exportAvailabilityNote: string;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    errorMessage?: string;
};
