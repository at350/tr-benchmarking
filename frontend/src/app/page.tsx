
'use client';

import { useEffect, useState } from 'react';
import { ConfigPanel, ExperimentConfig } from '@/components/ConfigPanel';
import { ResultsDashboard } from '@/components/ResultsDashboard';
import { SquareChevronDown } from 'lucide-react';

export default function Home() {
    const [subjects, setSubjects] = useState<string[]>([]);
    const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);

    const [config, setConfig] = useState<ExperimentConfig>({
        dataset: 'supergpqa',
        provider: 'openai',
        model: 'gpt-4o-mini', // Default to cheaper model
        judgeProvider: 'openai',
        judgeModel: 'gpt-4o-mini',
        judgeReasoningEffort: 'low',
        promptTemplate: 'baseline',
        temperature: 0.2,
        reasoningEffort: 'medium',
        perturbations: {
            adversarialText: false,
            labelNoise: 0
        },
        judgePrompt: '',
        limit: 5,
        subject: 'All',
        difficulty: 'All'
    });

    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);

    // Load initial data to populate filters
    useEffect(() => {
        async function loadData() {
            try {
                setIsLoadingSubjects(true);
                const res = await fetch(`/api/dataset?dataset=${config.dataset}`);
                const json = await res.json();
                if (json.data) {
                    const uniqueSubjects = Array.from(new Set(json.data.map((d: any) => {
                        if (config.dataset === 'prbench') {
                            return d.topic || d.field;
                        }
                        return d.subfield || d.discipline;
                    })))
                        .filter(Boolean)
                        .sort() as string[];
                    setSubjects(uniqueSubjects);
                }
            } catch (e) {
                console.error("Failed to load dataset", e);
            } finally {
                setIsLoadingSubjects(false);
            }
        }
        loadData();
    }, [config.dataset]);

    const runExperiment = async () => {
        setIsRunning(true);
        setResults([]);
        setSummary(null);

        try {
            // 1. Fetch filtered data first
            const dataRes = await fetch(`/api/dataset?dataset=${config.dataset}`);
            const dataJson = await dataRes.json();

            let filtered = dataJson.data || [];

            // Filter logic (Client side for now, could be server side)
            if (config.subject !== 'All') {
                if (config.dataset === 'prbench') {
                    filtered = filtered.filter((q: any) => (q.topic === config.subject) || (q.field === config.subject));
                } else {
                    filtered = filtered.filter((q: any) => (q.subfield === config.subject) || (q.discipline === config.subject));
                }
            }
            if (config.dataset !== 'prbench' && config.difficulty !== 'All') {
                filtered = filtered.filter((q: any) => q.difficulty === config.difficulty);
            }

            // Randomize
            filtered = filtered.sort(() => 0.5 - Math.random());

            // Limit
            const sample = filtered.slice(0, config.limit);

            // 2. Send to experiment API
            const res = await fetch('/api/experiment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questions: sample,
                    ...config
                })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const message = json?.error || `Experiment failed with status ${res.status}`;
                throw new Error(message);
            }
            if (json.error) {
                throw new Error(json.error);
            }
            if (json.results) {
                setResults(json.results);
                setSummary(json.summary);
            } else {
                throw new Error('Experiment returned no results.');
            }
        } catch (e) {
            console.error(e);
            const message = e instanceof Error ? e.message : 'Experiment failed. Check console.';
            alert(message);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col font-sans text-slate-900">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* <div className="bg-blue-600 p-2 rounded-lg text-white">
                            <SquareChevronDown size={18} />
                        </div> */}
                        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
                            BenchmarkDemo <span className="font-light text-gray-400">AI Evaluator</span>
                        </h1>
                    </div>

                    <div className="text-xs font-mono text-gray-400">
                        v0.1.0-sprint1
                    </div>
                </div>
            </header>

            {/* Main Layout */}
            <div className="flex-1 max-w-[1600px] mx-auto w-full p-6 grid grid-cols-12 gap-8">

                {/* Sidebar Configuration */}
                <div className="col-span-12 lg:col-span-3">
                    <ConfigPanel
                        config={config}
                        setConfig={setConfig}
                        onRun={runExperiment}
                        isLoading={isRunning}
                        subjects={subjects}
                    />
                </div>

                {/* Results Area */}
                <div className="col-span-12 lg:col-span-9 flex flex-col gap-6">
                    <ResultsDashboard results={results} summary={summary} />
                </div>
            </div>
        </main>
    );
}
