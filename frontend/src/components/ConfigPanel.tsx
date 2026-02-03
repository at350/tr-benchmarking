
import React from 'react';

export type ExperimentConfig = {
    model: string;
    promptTemplate: 'baseline' | 'cot';
    temperature: number;
    perturbations: {
        adversarialText: boolean;
        labelNoise: number;
    };
    limit: number;
    subject: string;
    difficulty: string;
};

interface ConfigPanelProps {
    config: ExperimentConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExperimentConfig>>;
    onRun: () => void;
    isLoading: boolean;
    subjects: string[];
}

export function ConfigPanel({ config, setConfig, onRun, isLoading, subjects }: ConfigPanelProps) {
    const handleChange = (field: keyof ExperimentConfig, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handlePerturbationChange = (field: keyof ExperimentConfig['perturbations'], value: any) => {
        setConfig(prev => ({
            ...prev,
            perturbations: {
                ...prev.perturbations,
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
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-5.2">GPT-5.2</option>
                    <option value="gpt-5-mini">GPT-5 Mini</option>
                    <option value="gpt-5-nano">GPT-5 Nano</option>
                    <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                    <option value="o3">o3</option>
                    <option value="o4-mini">o4-mini</option>
                </select>
            </div>

            {/* Prompt Template */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Prompt Template</label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.promptTemplate === 'baseline' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        onClick={() => handleChange('promptTemplate', 'baseline')}
                    >
                        Baseline
                    </button>
                    <button
                        className={`p-2 rounded-lg text-sm font-medium transition-colors ${config.promptTemplate === 'cot' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        onClick={() => handleChange('promptTemplate', 'cot')}
                    >
                        Chain of Thought
                    </button>
                </div>
            </div>

            {/* Temperature */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Temperature: {config.temperature}
                </label>
                <input
                    type="range"
                    min="0" max="1" step="0.1"
                    className="w-full accent-blue-600"
                    value={config.temperature}
                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                />
            </div>

            <hr className="border-gray-100" />

            {/* Perturbations */}
            <div className="space-y-4">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Perturbations</label>

                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Adversarial Text</span>
                    <input
                        type="checkbox"
                        className="w-5 h-5 accent-red-500"
                        checked={config.perturbations.adversarialText}
                        onChange={(e) => handlePerturbationChange('adversarialText', e.target.checked)}
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-sm text-gray-700">Label Noise</span>
                        <span className="text-sm font-bold text-red-500">{config.perturbations.labelNoise}%</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="50" step="10"
                        className="w-full accent-red-500"
                        value={config.perturbations.labelNoise}
                        onChange={(e) => handlePerturbationChange('labelNoise', parseInt(e.target.value))}
                    />
                </div>
            </div>

            <hr className="border-gray-100" />

            {/* Data Selection */}
            <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Dataset Filter</label>

                <select
                    className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                    value={config.subject}
                    onChange={(e) => handleChange('subject', e.target.value)}
                >
                    <option value="All">All Subfields</option>
                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

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

                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Max Questions:</span>
                    <select
                        className="p-1 border rounded bg-white text-sm"
                        value={config.limit}
                        onChange={(e) => handleChange('limit', parseInt(e.target.value))}
                    >
                        <option value="5">5 (Demo)</option>
                        <option value="10">10</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>
            </div>

            <div className="mt-auto">
                <button
                    onClick={onRun}
                    disabled={isLoading}
                    className={`w-full py-3 rounded-lg font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] 
                        ${isLoading ? 'bg-gray-300 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-500/30'}`}
                >
                    {isLoading ? 'Running Experiment...' : 'Run Experiment'}
                </button>
            </div>
        </div>
    );
}
