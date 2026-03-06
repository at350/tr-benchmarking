export const LSH_JUDGE_OUTPUT_JSON_SCHEMA = [
    '{',
    '  "outcomes": {',
    '    "bottomLineOutcome": "...",',
    '    "outcomeCorrectness": "...",',
    '    "reasoningAlignment": "...",',
    '    "jurisdictionAssumption": "..."',
    '  },',
    '  "rowScores": { "A": 0, "B": 0, "C": 0, "D": 0, "E": 0, "F": 0, "G": 0, "H": 0, "I": 0, "J": 0, "K": 0, "L": 0, "M": 0 },',
    '  "penaltiesApplied": ["controlling_doctrine_omitted"],',
    '  "cap": "none",',
    '  "summary": "...",',
    '  "strengths": ["..."],',
    '  "weaknesses": ["..."],',
    '  "improvementSuggestions": ["..."]',
    '}',
].join('\n');

export const LSH_JUDGE_OUTPUT_RULES = [
    '- rowScores must be integers from 0 to 4.',
    '- penaltiesApplied must use only allowed penalty keys.',
    '- cap must be one of: none, cap_60, cap_70.',
];

export function buildLshJudgeOutputInstructions(summaryTarget: string) {
    return [
        'Return JSON in this exact shape:',
        LSH_JUDGE_OUTPUT_JSON_SCHEMA,
        '',
        'Rules:',
        ...LSH_JUDGE_OUTPUT_RULES,
        `- summary must be concise and specific to ${summaryTarget}.`,
    ].join('\n');
}
