import type {
    ConfusionPattern,
    VariationExpectedResultType,
    VariationLane,
    VariationPackageStatus,
    VariationProvisionId,
    VariationReuseLevel,
    VariationRouteStatus,
    VariationStatus,
} from '@/lib/legal-workflow-v2-types';

export const QUESTION_VARIANCE_LABELS: Record<VariationProvisionId, string> = {
    marriage: 'Marriage provision',
    suretyship: 'Suretyship provision',
    one_year: 'One-year provision',
    land: 'Land sale / interest in land provision',
    ucc_2201: 'UCC Article 2 sale-of-goods provision',
    executor: 'Executor provision',
};

export const QUESTION_VARIANCE_ROUTE_STATUS_LABELS: Record<VariationRouteStatus, string> = {
    stable_route: 'Stable route',
    multiple_plausible_routes: 'Multiple plausible routes',
    needs_classification_first: 'Needs classification first',
    not_primarily_sof: 'Not primarily a Statute of Frauds problem',
};

export const QUESTION_VARIANCE_LANE_LABELS: Record<VariationLane, string> = {
    lane_a: 'Lane A',
    lane_b: 'Lane B',
};

export const QUESTION_VARIANCE_REUSE_LABELS: Record<VariationReuseLevel, string> = {
    reuse_as_is: 'Reuse as-is',
    cosmetic_edits_only: 'Cosmetic edits only',
    ambiguity_rewrite_required: 'Ambiguity rewrite required',
    unsafe: 'Unsafe',
};

export const QUESTION_VARIANCE_PACKAGE_STATUS_LABELS: Record<VariationPackageStatus, string> = {
    safe: 'Safe',
    unsafe: 'Unsafe',
    ambiguity_test: 'Ambiguity test',
};

export const QUESTION_VARIANCE_RESULT_TYPE_LABELS: Record<VariationExpectedResultType, string> = {
    same_likely_outcome: 'Same likely outcome',
    same_doctrine_different_fact_salience: 'Same doctrine, different fact salience',
    missing_facts_bounded_uncertainty: 'Missing facts / bounded uncertainty',
    unsafe_to_vary: 'Unsafe to vary',
};

export const QUESTION_VARIANCE_FINAL_STATUS_LABELS: Record<VariationStatus, string> = {
    ready: 'Ready',
    needs_targeted_revision: 'Needs targeted revision',
    unsafe: 'Unsafe',
};

export const QUESTION_VARIANCE_CONFUSION_LABELS: Record<ConfusionPattern, string> = {
    dual_trigger: 'Dual-trigger',
    priority: 'Priority',
    split_transaction: 'Split-transaction',
    needs_classification_first: 'Needs classification first',
};
