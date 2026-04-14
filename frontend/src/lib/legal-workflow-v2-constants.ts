import type { FrankSofPackId, RubricModuleId, RubricRowKey, RubricRowRole } from '@/lib/legal-workflow-v2-types';

export const FRANK_V2_BENCHMARK_HEADINGS = [
    'Jurisdiction assumption:',
    'Bottom-line outcome:',
    'Controlling doctrine:',
    'Transaction / formation characterization:',
    'Writing requirement and trigger:',
    'Compliance / substitute / exception analysis:',
    'Other defenses or competing doctrines:',
    'Strongest counterargument:',
] as const;

export const FRANK_V2_BENCHMARK_HEADING_ALIASES: Record<(typeof FRANK_V2_BENCHMARK_HEADINGS)[number], readonly string[]> = {
    'Jurisdiction assumption:': ['Jurisdiction assumption:'],
    'Bottom-line outcome:': ['Bottom-line outcome:'],
    'Controlling doctrine:': ['Controlling doctrine:'],
    'Transaction / formation characterization:': ['Transaction / formation characterization:'],
    'Writing requirement and trigger:': [
        'Writing requirement and trigger:',
        'Statute of Frauds trigger and writing requirement:',
    ],
    'Compliance / substitute / exception analysis:': [
        'Compliance / substitute / exception analysis:',
        'Compliance / substitutes / exceptions:',
    ],
    'Other defenses or competing doctrines:': ['Other defenses or competing doctrines:'],
    'Strongest counterargument:': ['Strongest counterargument:'],
} as const;

export const RUBRIC_MODULE_LABELS: Record<RubricModuleId, string> = {
    module0: 'Module 0 — Metadata Tags',
    module1: 'Module 1 — Structural Gatekeeping',
    module2: 'Module 2 — Primary Doctrine Gates',
    module3: 'Module 3 — Fallback Doctrines and Defenses',
    module4: 'Module 4 — Cross-Cutting Answer Discipline',
};

export const RUBRIC_ROW_SPECS: Array<{
    key: RubricRowKey;
    moduleId: RubricModuleId;
    role: RubricRowRole;
    title: string;
    defaultWeight: number;
    defaultDescription: string;
}> = [
    {
        key: 'A',
        moduleId: 'module1',
        role: 'secondary',
        title: 'Issue spotting + prioritization',
        defaultWeight: 15,
        defaultDescription: 'Whether the answer identifies the dispositive issue early and prioritizes the controlling path before secondary issues.',
    },
    {
        key: 'K',
        moduleId: 'module1',
        role: 'secondary',
        title: 'Barrier stacking + exception mapping',
        defaultWeight: 8,
        defaultDescription: 'Whether the answer keeps independent legal barriers separate and maps each exception only to the barrier it can actually address.',
    },
    {
        key: 'J',
        moduleId: 'module1',
        role: 'secondary',
        title: 'Clear bottom line + structured reasoning',
        defaultWeight: 5,
        defaultDescription: 'Whether the answer gives a clear conclusion, ties it to the controlling doctrine, and keeps uncertainty bounded and specific.',
    },
    {
        key: 'B',
        moduleId: 'module2',
        role: 'secondary',
        title: 'Transaction / formation characterization',
        defaultWeight: 11,
        defaultDescription: 'Whether the answer correctly characterizes the transaction or promise structure relevant to the selected pack.',
    },
    {
        key: 'C',
        moduleId: 'module2',
        role: 'controlling',
        title: 'Controlling doctrine gate identification + correct trigger',
        defaultWeight: 15,
        defaultDescription: 'Whether the answer identifies the controlling Statute of Frauds gate first and states the correct trigger test.',
    },
    {
        key: 'D',
        moduleId: 'module2',
        role: 'secondary',
        title: 'Secondary gate or major subissue #1',
        defaultWeight: 5,
        defaultDescription: 'Whether the answer correctly handles the first pack-specific secondary gate or subissue when it is genuinely triggered.',
    },
    {
        key: 'E',
        moduleId: 'module2',
        role: 'secondary',
        title: 'Secondary gate or major subissue #2 / doctrinal nuance',
        defaultWeight: 9,
        defaultDescription: 'Whether the answer correctly handles a second pack-specific nuance without displacing the main controller.',
    },
    {
        key: 'F',
        moduleId: 'module3',
        role: 'fallback',
        title: 'Exceptions / workarounds + limits',
        defaultWeight: 7,
        defaultDescription: 'Whether fallback doctrines and exceptions are analyzed only after the main gates and with their limits stated precisely.',
    },
    {
        key: 'G',
        moduleId: 'module3',
        role: 'fallback',
        title: 'Reliance / estoppel / causation rigor or closest fallback analogue',
        defaultWeight: 7,
        defaultDescription: 'Whether reliance-based or conduct-dependent fallback theories are analyzed element-by-element rather than assumed.',
    },
    {
        key: 'H',
        moduleId: 'module3',
        role: 'fallback',
        title: 'Defenses / conditions / competing doctrines',
        defaultWeight: 5,
        defaultDescription: 'Whether defenses and competing doctrines are kept secondary and accurately framed.',
    },
    {
        key: 'I',
        moduleId: 'module4',
        role: 'cross_cutting',
        title: 'Factual fidelity + internal consistency',
        defaultWeight: 5,
        defaultDescription: 'Whether the answer stays faithful to the facts, avoids inventions, and remains internally consistent.',
    },
    {
        key: 'L',
        moduleId: 'module4',
        role: 'cross_cutting',
        title: 'Scope calibration / claim discipline',
        defaultWeight: 4,
        defaultDescription: 'Whether the answer avoids false universals, keeps jurisdictional uncertainty bounded, and stays within the benchmark posture.',
    },
    {
        key: 'M',
        moduleId: 'module4',
        role: 'cross_cutting',
        title: 'Relevance discipline / prompt adherence',
        defaultWeight: 4,
        defaultDescription: 'Whether the answer stays on the target enforceability path and follows the requested answer shape.',
    },
];

export const KARTHIC_MODULE_DEFAULT_BUDGETS: Record<Exclude<RubricModuleId, 'module0'>, number> = {
    module1: 28,
    module2: 40,
    module3: 19,
    module4: 13,
};

export const FRANK_V2_PACK_LABELS: Record<FrankSofPackId, string> = {
    pack10: 'Pack 10 — Common-Law Oral Promises',
    pack20: 'Pack 20 — Land Contracts',
    pack30: 'Pack 30 — Executor or Administrator Personal Promise',
    pack40: 'Pack 40 — Sale of Goods under UCC § 2-201',
};
