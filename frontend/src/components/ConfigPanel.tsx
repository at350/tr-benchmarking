
import React from 'react';

export type ExperimentConfig = {
    evaluationMode: 'supergpqa_prbench' | 'controlled_eval';
    model: string;
    compareModel: string;
    promptTemplate: 'baseline' | 'cot';
    temperature: number;
    benchmarkProfile: 'legacy' | 'controlled';
    samplingStrategy: 'ordered' | 'stratified';
    controlled: {
        deterministicSplit: boolean;
        stochasticTemperature: number;
    };
    perturbations: {
        adversarialText: boolean;
        labelNoise: number;
    };
    numRuns: number;
    limit: number;
    subject: string;
    selectedSubjects: string[];
    difficulty: string;
    jurisdiction: string;
    numOptions: string;
    questionSelectionMode: 'auto' | 'manual';
    autoSelectionOrder: 'random' | 'ordered';
    sampleSeed: number;
    manualQuestionIds: string;
    comparisonMode: boolean;
    compareFactor: 'model' | 'numRuns' | 'subject' | 'difficulty';
    compareValueA: string;
    compareValueB: string;
};

type SelectionPreview = {
    mode: 'auto' | 'manual';
    filteredCount: number;
    selectedCount: number;
    selectedIds: string[];
    missingIds: string[];
    bucketCounts: Array<{ label: string; count: number }>;
};

export const MODEL_OPTIONS = [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'o3', label: 'o3' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

interface ConfigPanelProps {
    config: ExperimentConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExperimentConfig>>;
    onRun: () => void;
    onCancel: () => void;
    isLoading: boolean;
    subjects: string[];
    jurisdictions: string[];
    numOptionsList: string[];
    selectionPreview: SelectionPreview;
    canRun: boolean;
    runDisabledReason?: string;
}

export function ConfigPanel({ config, setConfig, onRun, onCancel, isLoading, subjects, jurisdictions, numOptionsList, selectionPreview, canRun, runDisabledReason }: ConfigPanelProps) {
    const isControlled = config.benchmarkProfile === 'controlled';
    const isControlledEval = config.evaluationMode === 'controlled_eval';

    const handleChange = <K extends keyof ExperimentConfig>(field: K, value: ExperimentConfig[K]) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handlePerturbationChange = <K extends keyof ExperimentConfig['perturbations']>(
        field: K,
        value: ExperimentConfig['perturbations'][K]
    ) => {
        setConfig(prev => ({
            ...prev,
            perturbations: {
                ...prev.perturbations,
                [field]: value
            }
        }));
    };

    const handleControlledChange = <K extends keyof ExperimentConfig['controlled']>(
        field: K,
        value: ExperimentConfig['controlled'][K]
    ) => {
        setConfig(prev => ({
            ...prev,
            controlled: {
                ...prev.controlled,
                [field]: value
            }
        }));
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-6 h-full">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                Experiment Configuration
            </h2>

            {/* Model Selection */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Model</label>
                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={config.model}
                    onChange={(e) => handleChange('model', e.target.value)}
                >
                    {MODEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Number of runs</label>
                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={config.numRuns}
                    onChange={(e) => handleChange('numRuns', parseInt(e.target.value, 10))}
                >
                    <option value={1}>1</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Benchmark Profile</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-700">
                        {isControlled ? 'Controlled Profile' : 'Legacy Profile'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                        This profile belongs to the forced-tests suite ({config.evaluationMode === 'supergpqa_prbench' ? 'legacy variant' : 'controlled variant'}).
                    </p>
                </div>
            </div>

            {/* Data Selection */}
            <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Dataset Filter</label>

                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Subfields</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 max-h-32 overflow-y-auto">
                    <p className="text-xs text-gray-500 mb-2">Select one or more (none = all)</p>
                    {subjects.map((s) => {
                        const isChecked = config.selectedSubjects.includes(s);
                        return (
                            <label key={s} className="flex items-center gap-2 py-1 hover:bg-gray-100 rounded px-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                        const next = isChecked
                                            ? config.selectedSubjects.filter((x) => x !== s)
                                            : [...config.selectedSubjects, s];
                                        setConfig((prev) => ({ ...prev, selectedSubjects: next }));
                                    }}
                                    className="w-4 h-4 accent-blue-600"
                                />
                                <span className="text-sm text-gray-700">{s}</span>
                            </label>
                        );
                    })}
                    {subjects.length > 0 && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setConfig((prev) => ({ ...prev, selectedSubjects: [] }))}
                                className="text-xs text-gray-500 hover:text-gray-700"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfig((prev) => ({ ...prev, selectedSubjects: [...subjects] }))}
                                className="text-xs text-gray-500 hover:text-gray-700"
                            >
                                Select all
                            </button>
                        </div>
                    )}
                </div>

                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                    value={config.difficulty}
                    onChange={(e) => handleChange('difficulty', e.target.value)}
                >
                    <option value="All">All Difficulties</option>
                    <option value="easy">Easy</option>
                    <option value="middle">Middle</option>
                    <option value="hard">Hard</option>
                </select>

                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Jurisdiction</label>
                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                    value={config.jurisdiction}
                    onChange={(e) => handleChange('jurisdiction', e.target.value)}
                >
                    <option value="All">All Jurisdictions</option>
                    {jurisdictions.map((j) => (
                        <option key={j} value={j}>{j}</option>
                    ))}
                </select>

                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Num of choices</label>
                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                    value={config.numOptions}
                    onChange={(e) => handleChange('numOptions', e.target.value)}
                >
                    <option value="All">All</option>
                    {numOptionsList.map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>

                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Max Questions:</span>
                    <select
                        className="p-1 border rounded bg-white text-sm"
                        value={config.limit}
                            onChange={(e) => handleChange('limit', parseInt(e.target.value))}
                        >
                        <option value="1">1 (Single question)</option>
                        <option value="5">5 (Demo)</option>
                        <option value="10">10</option>
                        <option value="30">30</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Question Selection</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => handleChange('questionSelectionMode', 'auto')}
                            className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.questionSelectionMode === 'auto' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Auto Sample
                        </button>
                        <button
                            type="button"
                            onClick={() => handleChange('questionSelectionMode', 'manual')}
                            className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.questionSelectionMode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            Manual IDs
                        </button>
                    </div>
                </div>

                {config.questionSelectionMode === 'auto' ? (
                    <div className="space-y-2">
                        {(!isControlled || config.samplingStrategy !== 'stratified') && (
                            <>
                                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Auto Order</label>
                                <select
                                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                                    value={config.autoSelectionOrder}
                                    onChange={(e) => handleChange('autoSelectionOrder', e.target.value as ExperimentConfig['autoSelectionOrder'])}
                                >
                                    <option value="ordered">Ordered by ID</option>
                                    <option value="random">Random (Seeded)</option>
                                </select>
                            </>
                        )}
                        {config.autoSelectionOrder === 'random' && (!isControlled || config.samplingStrategy !== 'stratified') && (
                            <div className="space-y-1">
                                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sample Seed</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                                    value={config.sampleSeed}
                                    onChange={(e) => handleChange('sampleSeed', Number(e.target.value) || 0)}
                                />
                            </div>
                        )}
                        {isControlled && config.samplingStrategy === 'stratified' && (
                            <p className="text-xs text-gray-500">Stratified mode is deterministic and ignores random ordering.</p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Question IDs (comma or newline separated)</label>
                        <textarea
                            className="w-full min-h-[88px] p-2 border rounded-lg bg-gray-50 text-sm font-mono"
                            placeholder="e.g. 00f9f2c1-...&#10;2a17c3fd-..."
                            value={config.manualQuestionIds}
                            onChange={(e) => handleChange('manualQuestionIds', e.target.value)}
                        />
                        <p className="text-xs text-gray-500">Manual mode ignores Max Questions and runs exactly the IDs listed below (after filters).</p>
                    </div>
                )}

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Selection Preview</p>
                    <p className="text-sm text-gray-700">Filtered pool: <span className="font-semibold">{selectionPreview.filteredCount}</span></p>
                    <p className="text-sm text-gray-700">Selected for run: <span className="font-semibold">{selectionPreview.selectedCount}</span></p>
                    {selectionPreview.missingIds.length > 0 && (
                        <p className="text-xs text-red-600">Missing IDs: {selectionPreview.missingIds.slice(0, 6).join(', ')}{selectionPreview.missingIds.length > 6 ? '...' : ''}</p>
                    )}
                    {selectionPreview.bucketCounts.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Subfield mix</p>
                            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                                {selectionPreview.bucketCounts.slice(0, 8).map((item) => (
                                    <div key={item.label} className="flex items-center justify-between text-xs text-gray-600">
                                        <span className="truncate pr-2">{item.label}</span>
                                        <span className="font-semibold">{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {selectionPreview.selectedIds.length > 0 && (
                        <p className="text-xs text-gray-600">
                            IDs: <span className="font-mono">{selectionPreview.selectedIds.slice(0, 4).join(', ')}{selectionPreview.selectedIds.length > 4 ? ', ...' : ''}</span>
                        </p>
                    )}
                </div>
            </div>

            {/* Comparison */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="comparisonMode"
                        className="w-4 h-4 accent-blue-600"
                        checked={config.comparisonMode}
                        onChange={(e) => handleChange('comparisonMode', e.target.checked)}
                    />
                    <label htmlFor="comparisonMode" className="text-sm font-semibold text-gray-700">Compare two configurations</label>
                </div>
                {config.comparisonMode && (
                    <>
                        <p className="text-xs text-gray-500">One factor varied. Model/Num runs use the same questions; Subject/Difficulty compare different question sets.</p>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Vary factor</label>
                        <select
                            className="w-full p-2 border rounded-lg bg-white text-sm"
                            value={config.compareFactor}
                            onChange={(e) => handleChange('compareFactor', e.target.value as ExperimentConfig['compareFactor'])}
                        >
                            <option value="model">Model</option>
                            <option value="numRuns">Number of runs</option>
                            <option value="subject">Subject (subdomain)</option>
                            <option value="difficulty">Difficulty</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Config A</label>
                                {config.compareFactor === 'model' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueA} onChange={(e) => handleChange('compareValueA', e.target.value)}>
                                        {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                )}
                                {config.compareFactor === 'numRuns' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueA} onChange={(e) => handleChange('compareValueA', e.target.value)}>
                                        {[1, 3, 5, 10, 20, 25, 50, 100].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                                    </select>
                                )}
                                {config.compareFactor === 'subject' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueA} onChange={(e) => handleChange('compareValueA', e.target.value)}>
                                        <option value="All">All</option>
                                        {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                )}
                                {config.compareFactor === 'difficulty' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueA} onChange={(e) => handleChange('compareValueA', e.target.value)}>
                                        <option value="All">All</option>
                                        <option value="easy">Easy</option>
                                        <option value="middle">Middle</option>
                                        <option value="hard">Hard</option>
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Config B</label>
                                {config.compareFactor === 'model' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueB} onChange={(e) => handleChange('compareValueB', e.target.value)}>
                                        {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                )}
                                {config.compareFactor === 'numRuns' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueB} onChange={(e) => handleChange('compareValueB', e.target.value)}>
                                        {[1, 3, 5, 10, 20, 25, 50, 100].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                                    </select>
                                )}
                                {config.compareFactor === 'subject' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueB} onChange={(e) => handleChange('compareValueB', e.target.value)}>
                                        <option value="All">All</option>
                                        {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                )}
                                {config.compareFactor === 'difficulty' && (
                                    <select className="w-full p-2 border rounded-lg bg-white text-sm" value={config.compareValueB} onChange={(e) => handleChange('compareValueB', e.target.value)}>
                                        <option value="All">All</option>
                                        <option value="easy">Easy</option>
                                        <option value="middle">Middle</option>
                                        <option value="hard">Hard</option>
                                    </select>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="mt-auto">
                {isLoading ? (
                    <div className="space-y-2">
                        <button
                            disabled
                            className="w-full py-3 rounded-lg font-bold text-lg bg-gray-300 text-gray-700 cursor-not-allowed"
                        >
                            Running Experiment...
                        </button>
                        <button
                            onClick={onCancel}
                            className="w-full py-3 rounded-lg font-semibold text-base border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                        >
                            Cancel Experiment
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <button
                            onClick={onRun}
                            disabled={!canRun}
                            className={`w-full py-3 rounded-lg font-bold text-lg shadow-lg transition-all ${canRun ? 'transform hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-500/30' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                        >
                            Run Experiment
                        </button>
                        {!canRun && runDisabledReason && (
                            <p className="text-xs text-red-600">{runDisabledReason}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
