'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, FlaskConical, Network, Scale, ScrollText } from 'lucide-react';

import { AppShell } from '@/components/ui/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_LABELS, type ModelProvider } from '@/lib/model-options';
import type {
    ArtifactRole,
    DashaRun,
    DashaSelectedModel,
    FrankAnalysisDomain,
    FrankCaseCandidate,
    FrankPacket,
    KarthicCriterion,
    KarthicDomain,
    KarthicGoldenDomainTarget,
    KarthicRubricPack,
    ReasoningEffort,
} from '@/lib/legal-workflow-types';

type WorkflowTab = 'frank' | 'karthic' | 'dasha';
type FrankWizardStep = 'domain' | 'case' | 'domains' | 'golden' | 'question';
type KarthicWizardStep = 'packet' | 'domains' | 'targets' | 'approve';
type DashaWizardStep = 'rubric' | 'question' | 'models' | 'run';

type DashaClusterMapPoint = {
    x: number;
    y: number;
    model: string;
    clusterId: string;
    memberId?: string;
    isCentroid?: boolean;
};

type DashaClusterMapRegion = {
    clusterId: string;
    centerX: number;
    centerY: number;
    radius: number;
    visibleMembers: number;
    totalMembers: number;
    dominantModel: string;
    note: string;
};

type DashaAxisDomain = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

type UploadRow = {
    role: ArtifactRole;
    file: File;
};

type FrankEditorState = {
    id?: string;
    legalDomain: string;
    domainScope: string;
    sourceFamily: string;
    masterIssueStatement: string;
    benchmarkAnswer: string;
    benchmarkQuestion: string;
    failureModeSeedsText: string;
    sourceQualityRating: string;
    benchmarkPosture: FrankPacket['sourceIntake']['benchmarkPosture'];
    recommendation: string;
    reverseEngineeringSuitability: FrankPacket['sourceIntake']['reverseEngineeringSuitability'];
    jdReviewBurdenText: string;
    legalIssue: string;
    blackLetterRule: string;
    triggerFactsText: string;
    holding: string;
    limitsText: string;
    uncertaintyText: string;
    selectedCase: FrankCaseCandidate | null;
    caseCandidates: FrankCaseCandidate[];
    analysisDomains: FrankAnalysisDomain[];
    sourceArtifacts: FrankPacket['sourceArtifacts'];
};

type KarthicEditorState = {
    id?: string;
    frankPacketId: string;
    status: KarthicRubricPack['status'];
    domains: KarthicDomain[];
    goldenTargets: KarthicGoldenDomainTarget[];
    criteria: KarthicCriterion[];
    refinementLog: KarthicRubricPack['refinementLog'];
    smeNotes: string;
    comparisonMethodNote: string;
};

type DashaFormState = {
    rubricPackId: string;
    selectedModelKeys: string[];
};

const DEFAULT_FRANK_STATE: FrankEditorState = {
    legalDomain: 'Contracts',
    domainScope: 'Statute of Frauds within contract law',
    sourceFamily: 'SoF common-law source packet',
    masterIssueStatement: '',
    benchmarkAnswer: '',
    benchmarkQuestion: '',
    failureModeSeedsText: '',
    sourceQualityRating: '',
    benchmarkPosture: 'generalizable_only_with_supporting_authority',
    recommendation: '',
    reverseEngineeringSuitability: 'moderate',
    jdReviewBurdenText: '',
    legalIssue: '',
    blackLetterRule: '',
    triggerFactsText: '',
    holding: '',
    limitsText: '',
    uncertaintyText: '',
    selectedCase: null,
    caseCandidates: [],
    analysisDomains: [],
    sourceArtifacts: [],
};

const DEFAULT_MODEL_KEYS = [
    'openai::gpt-5.4',
    'anthropic::claude-opus-4-6',
    'gemini::gemini-3.1-pro-preview',
];

const DASHA_MAP_WIDTH = 980;
const DASHA_MAP_HEIGHT = 640;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MODEL_PALETTE = ['#22c55e', '#ef4444', '#94a3b8', '#3b82f6', '#f97316', '#14b8a6', '#eab308', '#a855f7', '#06b6d4', '#f43f5e'];

const DASHA_ROLES: ArtifactRole[] = ['question_packet', 'issue_statement', 'evidence_packet', 'supplemental'];

const DEFAULT_KARTHIC_STATE: KarthicEditorState = {
    frankPacketId: '',
    status: 'draft',
    domains: [],
    goldenTargets: [],
    criteria: [],
    refinementLog: [],
    smeNotes: '',
    comparisonMethodNote: '',
};

export default function LegalWorkflowPage() {
    const [activeTab, setActiveTab] = useState<WorkflowTab>('frank');
    const [frankPackets, setFrankPackets] = useState<FrankPacket[]>([]);
    const [karthicPacks, setKarthicPacks] = useState<KarthicRubricPack[]>([]);
    const [dashaRuns, setDashaRuns] = useState<DashaRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [frankEditor, setFrankEditor] = useState<FrankEditorState>(DEFAULT_FRANK_STATE);
    const [frankStep, setFrankStep] = useState<FrankWizardStep>('domain');
    const [frankSearchingCases, setFrankSearchingCases] = useState(false);
    const [frankDraftingDomains, setFrankDraftingDomains] = useState(false);
    const [frankGeneratingGolden, setFrankGeneratingGolden] = useState(false);
    const [frankGeneratingQuestion, setFrankGeneratingQuestion] = useState(false);

    const [karthicEditor, setKarthicEditor] = useState<KarthicEditorState>(DEFAULT_KARTHIC_STATE);
    const [karthicStep, setKarthicStep] = useState<KarthicWizardStep>('packet');
    const [karthicDraftingDomains, setKarthicDraftingDomains] = useState(false);
    const [karthicGeneratingTargets, setKarthicGeneratingTargets] = useState(false);
    const [dashaUploads, setDashaUploads] = useState<UploadRow[]>([]);
    const [dashaStep, setDashaStep] = useState<DashaWizardStep>('rubric');
    const [dashaForm, setDashaForm] = useState<DashaFormState>({
        rubricPackId: '',
        selectedModelKeys: DEFAULT_MODEL_KEYS,
    });
    const [dashaRunning, setDashaRunning] = useState(false);
    const [selectedDashaRunId, setSelectedDashaRunId] = useState<string | null>(null);
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
    const [showClusterView, setShowClusterView] = useState(true);

    const approvedFrankPackets = useMemo(
        () => frankPackets.filter((item) => item.status === 'approved'),
        [frankPackets],
    );
    const approvedKarthicPacks = useMemo(
        () => karthicPacks.filter((item) => item.status === 'approved'),
        [karthicPacks],
    );
    const selectedDashaPack = useMemo(
        () => approvedKarthicPacks.find((item) => item.id === dashaForm.rubricPackId) ?? null,
        [approvedKarthicPacks, dashaForm.rubricPackId],
    );
    const selectedDashaFrankPacket = useMemo(
        () => frankPackets.find((item) => item.id === selectedDashaPack?.frankPacketId) ?? null,
        [frankPackets, selectedDashaPack],
    );
    const selectedDashaRun = useMemo(
        () => dashaRuns.find((item) => item.id === selectedDashaRunId) ?? dashaRuns[0] ?? null,
        [dashaRuns, selectedDashaRunId],
    );

    useEffect(() => {
        void loadAll();
    }, []);

    useEffect(() => {
        if (dashaRuns.length === 0) {
            if (selectedDashaRunId !== null) {
                setSelectedDashaRunId(null);
            }
            if (selectedClusterId !== null) {
                setSelectedClusterId(null);
            }
            return;
        }
        if (selectedDashaRunId && dashaRuns.some((item) => item.id === selectedDashaRunId)) {
            return;
        }
        const nextRun = dashaRuns[0];
        setSelectedDashaRunId(nextRun.id);
        setSelectedClusterId(pickDefaultClusterId(nextRun));
    }, [dashaRuns, selectedClusterId, selectedDashaRunId]);

    useEffect(() => {
        if (!selectedDashaRun) {
            if (selectedClusterId !== null) {
                setSelectedClusterId(null);
            }
            return;
        }
        if (selectedDashaRun.clusters.length === 0) {
            if (selectedClusterId !== null) {
                setSelectedClusterId(null);
            }
            return;
        }
        if (selectedClusterId !== null && selectedDashaRun.clusters.some((cluster) => cluster.id === selectedClusterId)) {
            return;
        }
        setSelectedClusterId(pickDefaultClusterId(selectedDashaRun));
    }, [selectedClusterId, selectedDashaRun]);

    useEffect(() => {
        if (!selectedDashaRunId || selectedDashaRun?.status !== 'draft') {
            return;
        }

        let cancelled = false;

        const pollRun = async () => {
            try {
                const response = await fetch(`/api/dasha-runs/${selectedDashaRunId}`, { cache: 'no-store' });
                const json = await response.json();
                if (!response.ok) {
                    throw new Error(json.error || 'Failed to load Dasha run.');
                }
                if (cancelled) {
                    return;
                }
                const item = json.item as DashaRun;
                setDashaRuns((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
                if (item.status === 'completed') {
                    setStatusMessage('Dasha evaluation completed.');
                    setErrorMessage(null);
                } else if (item.status === 'failed') {
                    setStatusMessage(null);
                    setErrorMessage(item.errorMessage || 'Dasha evaluation failed.');
                }
            } catch (error) {
                if (cancelled) {
                    return;
                }
                setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh Dasha run.');
            }
        };

        void pollRun();
        const intervalId = window.setInterval(() => {
            void pollRun();
        }, 4000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [selectedDashaRun?.status, selectedDashaRunId]);

    async function loadAll() {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            const [frankRes, karthicRes, dashaRes] = await Promise.all([
                fetch('/api/frank-packets', { cache: 'no-store' }),
                fetch('/api/karthic-rubric-packs', { cache: 'no-store' }),
                fetch('/api/dasha-runs', { cache: 'no-store' }),
            ]);
            const [frankJson, karthicJson, dashaJson] = await Promise.all([
                frankRes.json(),
                karthicRes.json(),
                dashaRes.json(),
            ]);
            setFrankPackets(sortByUpdated(Array.isArray(frankJson.items) ? frankJson.items : []));
            setKarthicPacks(sortByUpdated(Array.isArray(karthicJson.items) ? karthicJson.items : []));
            setDashaRuns(sortByUpdated(Array.isArray(dashaJson.items) ? dashaJson.items : []));
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to load workflow data.');
        } finally {
            setIsLoading(false);
        }
    }

    function applyFrankPacket(packet: FrankPacket) {
        const nextState: FrankEditorState = {
            id: packet.id,
            legalDomain: packet.legalDomain,
            domainScope: packet.domainScope,
            sourceFamily: packet.sourceFamily,
            masterIssueStatement: packet.masterIssueStatement,
            benchmarkAnswer: packet.benchmarkAnswer,
            benchmarkQuestion: packet.benchmarkQuestion,
            failureModeSeedsText: packet.failureModeSeeds.join('\n'),
            sourceQualityRating: packet.sourceIntake.sourceQualityRating,
            benchmarkPosture: packet.sourceIntake.benchmarkPosture,
            recommendation: packet.sourceIntake.recommendation,
            reverseEngineeringSuitability: packet.sourceIntake.reverseEngineeringSuitability,
            jdReviewBurdenText: packet.sourceIntake.jdReviewBurden.join('\n'),
            legalIssue: packet.sourceExtraction.legalIssue,
            blackLetterRule: packet.sourceExtraction.blackLetterRule,
            triggerFactsText: packet.sourceExtraction.triggerFacts.join('\n'),
            holding: packet.sourceExtraction.holding,
            limitsText: packet.sourceExtraction.limits.join('\n'),
            uncertaintyText: packet.sourceExtraction.uncertainty.join('\n'),
            selectedCase: packet.selectedCase ?? null,
            caseCandidates: packet.selectedCase ? [packet.selectedCase] : [],
            analysisDomains: packet.analysisDomains ?? [],
            sourceArtifacts: packet.sourceArtifacts ?? [],
        };
        setFrankEditor(nextState);
        setFrankStep(inferFrankStep(nextState));
    }

    function applyKarthicPack(pack: KarthicRubricPack) {
        const nextState: KarthicEditorState = {
            id: pack.id,
            frankPacketId: pack.frankPacketId,
            status: pack.status,
            domains: pack.domains,
            goldenTargets: pack.goldenTargets ?? [],
            criteria: pack.criteria,
            refinementLog: pack.refinementLog,
            smeNotes: pack.smeNotes,
            comparisonMethodNote: pack.comparisonMethodNote ?? '',
        };
        setKarthicEditor(nextState);
        setKarthicStep(inferKarthicStep(nextState));
    }

    async function searchFrankCases() {
        if (!frankEditor.legalDomain.trim()) {
            setErrorMessage('Enter a legal domain first.');
            return;
        }
        setFrankSearchingCases(true);
        setErrorMessage(null);
        setStatusMessage('Searching online for anchor cases...');
        try {
            const response = await fetch('/api/frank-packets/case-search', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    legalDomain: frankEditor.legalDomain,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to search for cases.');
            }
            const candidates = Array.isArray(json.candidates) ? json.candidates as FrankCaseCandidate[] : [];
            setFrankEditor((current) => ({
                ...current,
                caseCandidates: candidates,
                selectedCase: candidates[0] ?? current.selectedCase,
                domainScope: (candidates[0] ?? current.selectedCase)?.title ?? current.domainScope,
                sourceFamily: 'web_searched_anchor_case',
            }));
            setStatusMessage('Case search complete. Pick the anchor case you want Frank to use.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to search for cases.');
            setStatusMessage(null);
        } finally {
            setFrankSearchingCases(false);
        }
    }

    async function draftFrankDomains() {
        if (!frankEditor.selectedCase) {
            setErrorMessage('Pick an anchor case first.');
            return;
        }
        setFrankDraftingDomains(true);
        setErrorMessage(null);
        setStatusMessage('Drafting editable analysis domains...');
        try {
            const response = await fetch('/api/frank-packets/analysis-domains', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    legalDomain: frankEditor.legalDomain,
                    selectedCase: frankEditor.selectedCase,
                    desiredCount: 6,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to draft analysis domains.');
            }
            const domains = Array.isArray(json.domains) ? json.domains as FrankAnalysisDomain[] : [];
            setFrankEditor((current) => ({ ...current, analysisDomains: domains }));
            setStatusMessage('Analysis domains drafted. Edit them before generating the golden response.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to draft analysis domains.');
            setStatusMessage(null);
        } finally {
            setFrankDraftingDomains(false);
        }
    }

    async function generateFrankGoldenResponse() {
        if (!frankEditor.selectedCase) {
            setErrorMessage('Pick an anchor case first.');
            return;
        }
        if (!isValidFrankDomainCount(frankEditor.analysisDomains)) {
            setErrorMessage('Frank needs 5-10 analysis domains before generating the golden response.');
            return;
        }
        setFrankGeneratingGolden(true);
        setErrorMessage(null);
        setStatusMessage('Generating and saving Frank’s golden response locally...');
        try {
            const response = await fetch('/api/frank-packets/golden-response', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: frankEditor.id,
                    legalDomain: frankEditor.legalDomain,
                    selectedCase: frankEditor.selectedCase,
                    analysisDomains: frankEditor.analysisDomains,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to generate the golden response.');
            }
            const item = json.item as FrankPacket;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage(`Golden response saved locally as ${item.id}.`);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate the golden response.');
            setStatusMessage(null);
        } finally {
            setFrankGeneratingGolden(false);
        }
    }

    async function generateFrankQuestionPacket() {
        if (!frankEditor.selectedCase) {
            setErrorMessage('Pick an anchor case first.');
            return;
        }
        if (!frankEditor.benchmarkAnswer.trim()) {
            setErrorMessage('Generate the golden response first.');
            return;
        }
        setFrankGeneratingQuestion(true);
        setErrorMessage(null);
        setStatusMessage('Generating and saving the legal-case-packet question...');
        try {
            const response = await fetch('/api/frank-packets/question-packet', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: frankEditor.id,
                    legalDomain: frankEditor.legalDomain,
                    selectedCase: frankEditor.selectedCase,
                    analysisDomains: frankEditor.analysisDomains,
                    benchmarkAnswer: frankEditor.benchmarkAnswer,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to generate the question packet.');
            }
            const item = json.item as FrankPacket;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage('Question packet generated and saved locally.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate the question packet.');
            setStatusMessage(null);
        } finally {
            setFrankGeneratingQuestion(false);
        }
    }

    async function saveFrank(status: FrankPacket['status']) {
        setErrorMessage(null);
        setStatusMessage(status === 'approved' ? 'Approving Frank packet...' : 'Saving Frank packet...');
        try {
            const response = await fetch('/api/frank-packets', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: frankEditor.id,
                    legalDomain: frankEditor.legalDomain,
                    domainScope: frankEditor.selectedCase?.title ?? frankEditor.domainScope,
                    sourceFamily: frankEditor.sourceFamily || 'web_searched_anchor_case',
                    selectedCase: frankEditor.selectedCase,
                    analysisDomains: frankEditor.analysisDomains,
                    sourceArtifacts: frankEditor.sourceArtifacts,
                    sourceIntake: {
                        sourceQualityRating: frankEditor.sourceQualityRating,
                        benchmarkPosture: frankEditor.benchmarkPosture,
                        recommendation: frankEditor.recommendation,
                        jdReviewBurden: splitTextarea(frankEditor.jdReviewBurdenText),
                        reverseEngineeringSuitability: frankEditor.reverseEngineeringSuitability,
                    },
                    sourceExtraction: {
                        legalIssue: frankEditor.legalIssue,
                        blackLetterRule: frankEditor.blackLetterRule,
                        triggerFacts: splitTextarea(frankEditor.triggerFactsText),
                        holding: frankEditor.holding,
                        limits: splitTextarea(frankEditor.limitsText),
                        uncertainty: splitTextarea(frankEditor.uncertaintyText),
                    },
                    benchmarkAnswer: frankEditor.benchmarkAnswer,
                    benchmarkQuestion: frankEditor.benchmarkQuestion,
                    failureModeSeeds: splitTextarea(frankEditor.failureModeSeedsText),
                    masterIssueStatement: frankEditor.masterIssueStatement,
                    status,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to save Frank packet.');
            }
            const item = json.item as FrankPacket;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage(status === 'approved' ? 'Frank packet approved for Karthic.' : 'Frank packet saved.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to save Frank packet.');
            setStatusMessage(null);
        }
    }

    async function draftKarthicDomains() {
        if (!karthicEditor.frankPacketId) {
            setErrorMessage('Pick an approved Frank packet first.');
            return;
        }
        setKarthicDraftingDomains(true);
        setErrorMessage(null);
        setStatusMessage('Drafting editable Karthic domains from the approved Frank packet...');
        try {
            const response = await fetch('/api/karthic-rubric-packs/domain-draft', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    frankPacketId: karthicEditor.frankPacketId,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to draft Karthic domains.');
            }
            const domains = Array.isArray(json.domains) ? json.domains as KarthicDomain[] : [];
            setKarthicEditor((current) => ({
                ...current,
                domains,
                goldenTargets: [],
                criteria: [],
                refinementLog: [],
            }));
            setStatusMessage('Karthic domains drafted. Edit the names, weights, and NA guidance before generating golden targets.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to draft Karthic domains.');
            setStatusMessage(null);
        } finally {
            setKarthicDraftingDomains(false);
        }
    }

    async function generateKarthicTargets() {
        if (!karthicEditor.frankPacketId) {
            setErrorMessage('Pick an approved Frank packet first.');
            return;
        }
        if (!hasEditableKarthicDomains(karthicEditor.domains)) {
            setErrorMessage('Add at least one complete Karthic domain before generating golden targets.');
            return;
        }
        setKarthicGeneratingTargets(true);
        setErrorMessage(null);
        setStatusMessage('Generating structured golden targets from Frank’s golden answer...');
        try {
            const response = await fetch('/api/karthic-rubric-packs/golden-targets', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: karthicEditor.id,
                    frankPacketId: karthicEditor.frankPacketId,
                    domains: karthicEditor.domains,
                    smeNotes: karthicEditor.smeNotes,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to generate Karthic golden targets.');
            }
            const item = json.item as KarthicRubricPack;
            applyKarthicPack(item);
            setKarthicPacks((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage(`Golden targets saved locally as ${item.id}.`);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to generate Karthic golden targets.');
            setStatusMessage(null);
        } finally {
            setKarthicGeneratingTargets(false);
        }
    }

    async function saveKarthic(status: KarthicRubricPack['status']) {
        setErrorMessage(null);
        setStatusMessage(status === 'approved' ? 'Approving Karthic rubric pack...' : 'Saving Karthic rubric pack...');
        try {
            const response = await fetch('/api/karthic-rubric-packs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: karthicEditor.id,
                    frankPacketId: karthicEditor.frankPacketId,
                    domains: karthicEditor.domains,
                    goldenTargets: karthicEditor.goldenTargets,
                    criteria: karthicEditor.criteria,
                    refinementLog: karthicEditor.refinementLog,
                    smeNotes: karthicEditor.smeNotes,
                    comparisonMethodNote: karthicEditor.comparisonMethodNote,
                    status,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to save Karthic rubric pack.');
            }
            const item = json.item as KarthicRubricPack;
            applyKarthicPack(item);
            setKarthicPacks((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage(status === 'approved' ? 'Karthic rubric pack approved for Dasha.' : 'Karthic rubric pack saved.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to save Karthic rubric pack.');
            setStatusMessage(null);
        }
    }

    async function runDasha() {
        if (!selectedDashaFrankPacket?.benchmarkQuestion.trim()) {
            setErrorMessage('The linked Frank packet does not have a saved question packet yet.');
            return;
        }
        setDashaRunning(true);
        setErrorMessage(null);
        setStatusMessage('Running Dasha evaluation using Frank’s canonical question packet: model generation, clustering, and per-domain centroid scoring...');
        try {
            const formData = new FormData();
            formData.set('rubricPackId', dashaForm.rubricPackId);
            formData.set('selectedModels', JSON.stringify(buildSelectedModels(dashaForm.selectedModelKeys)));
            dashaUploads.forEach((upload, index) => {
                formData.append('files', upload.file);
                formData.set(`role_${index}`, upload.role);
            });
            const response = await fetch('/api/dasha-runs', {
                method: 'POST',
                body: formData,
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to run Dasha.');
            }
            const item = json.item as DashaRun;
            setSelectedDashaRunId(item.id);
            setSelectedClusterId(null);
            setDashaRuns((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setDashaStep('run');
            if (item.status === 'draft') {
                setStatusMessage('Dasha evaluation started. Polling for completion...');
            } else if (item.status === 'completed') {
                setStatusMessage('Dasha evaluation completed.');
            } else {
                setStatusMessage('Dasha evaluation finished with failures.');
            }
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to run Dasha.');
            setStatusMessage(null);
        } finally {
            setDashaRunning(false);
        }
    }

    const frankReady = Boolean(
        frankEditor.selectedCase
        && isValidFrankDomainCount(frankEditor.analysisDomains)
        && frankEditor.benchmarkAnswer.trim()
        && frankEditor.benchmarkQuestion.trim(),
    );
    const frankDomainCountValid = isValidFrankDomainCount(frankEditor.analysisDomains);
    const karthicDomainCountValid = hasEditableKarthicDomains(karthicEditor.domains);
    const karthicTargetsReady = hasKarthicGoldenTargets(karthicEditor.goldenTargets, karthicEditor.domains);
    const karthicPackReady = Boolean(
        karthicEditor.frankPacketId
        && karthicDomainCountValid
        && karthicTargetsReady,
    );
    const dashaRubricReady = Boolean(dashaForm.rubricPackId);
    const dashaQuestionReady = Boolean(selectedDashaFrankPacket?.benchmarkQuestion.trim());
    const dashaModelsReady = dashaForm.selectedModelKeys.length > 0;
    const dashaRunReady = dashaRubricReady && dashaQuestionReady && dashaModelsReady;
    const karthicReady = approvedFrankPackets.length > 0;
    const dashaReady = approvedKarthicPacks.length > 0;

    return (
        <AppShell
            eyebrow="Stage-Separated Workflow"
            title="Frank → Karthic → Dasha"
            subtitle="Draft source-grounded Frank packets, turn approved packets into Karthic rubric packs, then run Dasha centroid-first evaluations without stage leakage."
            maxWidthClassName="max-w-[1600px]"
        >
            <section className="grid gap-4 lg:grid-cols-3">
                <StageCard
                    title="Frank"
                    description="Source intake, extraction, benchmark answer, and reverse-engineered question only."
                    icon={<ScrollText className="h-5 w-5" />}
                    active={activeTab === 'frank'}
                    onClick={() => setActiveTab('frank')}
                />
                <StageCard
                    title="Karthic"
                    description="Approved Frank packet intake, editable domain weighting, and structured golden-target drafting only."
                    icon={<Scale className="h-5 w-5" />}
                    active={activeTab === 'karthic'}
                    onClick={() => setActiveTab('karthic')}
                />
                <StageCard
                    title="Dasha"
                    description="Free-form answer generation, density clustering, and centroid-vs-golden difference measurement only."
                    icon={<Network className="h-5 w-5" />}
                    active={activeTab === 'dasha'}
                    onClick={() => setActiveTab('dasha')}
                />
            </section>

            {(statusMessage || errorMessage) && (
                <section className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${errorMessage ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {errorMessage || statusMessage}
                </section>
            )}

            {isLoading ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-sm text-slate-600 shadow-sm">
                    Loading workflow state...
                </div>
            ) : null}

            {!isLoading && activeTab === 'frank' && (
                <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <SectionHeader
                                title="Frank Wizard"
                                description="One step at a time: pick a legal domain, search for an anchor case, edit the analysis domains, generate the golden response, then generate the question packet."
                                actions={frankReady ? <ApprovalBadge approved={frankPackets.find((item) => item.id === frankEditor.id)?.status === 'approved'} /> : null}
                            />
                            <FrankStepRail
                                step={frankStep}
                                legalDomainSet={Boolean(frankEditor.legalDomain.trim())}
                                caseSelected={Boolean(frankEditor.selectedCase)}
                                domainsReady={frankDomainCountValid}
                                goldenReady={Boolean(frankEditor.benchmarkAnswer.trim())}
                                questionReady={Boolean(frankEditor.benchmarkQuestion.trim())}
                                onChange={setFrankStep}
                            />

                            {frankStep === 'domain' && (
                                <div className="mt-6 space-y-4">
                                    <LabeledInput
                                        label="Legal Domain Of Analysis"
                                        value={frankEditor.legalDomain}
                                        onChange={(value) => setFrankEditor((current) => ({ ...current, legalDomain: value }))}
                                    />
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('case')}
                                            disabled={!frankEditor.legalDomain.trim()}
                                            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            Continue to Case Search
                                        </button>
                                    </div>
                                </div>
                            )}

                            {frankStep === 'case' && (
                                <div className="mt-6 space-y-4">
                                    <FrankSummaryRow label="Legal Domain" value={frankEditor.legalDomain || 'Not set yet'} />
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 2 · Anchor Case Search</p>
                                        <p className="mt-1 text-sm text-slate-500">Frank searches online for a teaching-friendly case instead of asking you to upload a packet first.</p>
                                        <button
                                            type="button"
                                            onClick={() => void searchFrankCases()}
                                            disabled={frankSearchingCases || !frankEditor.legalDomain.trim()}
                                            className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            {frankSearchingCases ? 'Searching...' : 'Search Online For Anchor Cases'}
                                        </button>
                                    </div>

                                    {frankEditor.caseCandidates.length > 0 ? (
                                        <div className="space-y-3">
                                            {frankEditor.caseCandidates.map((candidate) => (
                                                <button
                                                    key={candidate.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setFrankEditor((current) => ({
                                                            ...current,
                                                            selectedCase: candidate,
                                                            domainScope: candidate.title,
                                                            sourceFamily: 'web_searched_anchor_case',
                                                        }));
                                                    }}
                                                    className={`w-full rounded-2xl border p-4 text-left ${frankEditor.selectedCase?.id === candidate.id ? 'border-teal-300 bg-teal-50/60' : 'border-slate-200 bg-white hover:border-teal-200'}`}
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">{candidate.title}</p>
                                                            <p className="mt-1 text-xs text-slate-500">{candidate.citation} · {candidate.court} · {candidate.year}</p>
                                                        </div>
                                                        {candidate.url ? (
                                                            <a
                                                                href={candidate.url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(event) => event.stopPropagation()}
                                                                className="text-xs font-semibold text-teal-700 underline-offset-4 hover:underline"
                                                            >
                                                                Open source
                                                            </a>
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-3 text-sm text-slate-600">{candidate.summary}</p>
                                                    <p className="mt-2 text-xs text-slate-500">{candidate.relevance}</p>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500">No case picked yet.</p>
                                    )}

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('domain')}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('domains')}
                                            disabled={!frankEditor.selectedCase}
                                            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            Continue to Analysis Domains
                                        </button>
                                    </div>
                                </div>
                            )}

                            {frankStep === 'domains' && (
                                <div className="mt-6 space-y-4">
                                    <FrankSummaryRow label="Anchor Case" value={frankEditor.selectedCase ? `${frankEditor.selectedCase.title} · ${frankEditor.selectedCase.citation}` : 'No case selected yet'} />
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 3 · Analysis Domains</p>
                                                <p className="mt-1 text-sm text-slate-500">Draft 5-10 human-editable analysis buckets. You can rename, rewrite, add, or delete them before Frank writes the golden response.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void draftFrankDomains()}
                                                disabled={!frankEditor.selectedCase || frankDraftingDomains}
                                                className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                            >
                                                {frankDraftingDomains ? 'Drafting...' : 'Draft Analysis Domains'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                                        <span>{frankEditor.analysisDomains.length} domains selected. Aim for 5-10.</span>
                                        <button
                                            type="button"
                                            onClick={() => setFrankEditor((current) => ({
                                                ...current,
                                                analysisDomains: [
                                                    ...current.analysisDomains,
                                                    { id: `analysis_domain_${current.analysisDomains.length + 1}`, name: '', description: '' },
                                                ],
                                            }))}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                        >
                                            Add Domain
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {frankEditor.analysisDomains.length === 0 ? (
                                            <p className="text-sm text-slate-500">No domains yet. Draft them first, then edit as needed.</p>
                                        ) : frankEditor.analysisDomains.map((domain, index) => (
                                            <div key={domain.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Domain {index + 1}</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFrankEditor((current) => ({
                                                            ...current,
                                                            analysisDomains: current.analysisDomains.filter((_, domainIndex) => domainIndex !== index),
                                                        }))}
                                                        className="text-xs font-semibold text-rose-600"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                    <LabeledInput
                                                        label="Domain Name"
                                                        value={domain.name}
                                                        onChange={(value) => setFrankEditor((current) => ({
                                                            ...current,
                                                            analysisDomains: current.analysisDomains.map((item, domainIndex) => domainIndex === index ? { ...item, name: value } : item),
                                                        }))}
                                                    />
                                                    <LabeledTextarea
                                                        label="Brief Description"
                                                        value={domain.description}
                                                        onChange={(value) => setFrankEditor((current) => ({
                                                            ...current,
                                                            analysisDomains: current.analysisDomains.map((item, domainIndex) => domainIndex === index ? { ...item, description: value } : item),
                                                        }))}
                                                        rows={3}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {!frankDomainCountValid ? (
                                        <p className="text-sm text-amber-700">Frank needs between 5 and 10 filled-in domains before moving on.</p>
                                    ) : null}

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('case')}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('golden')}
                                            disabled={!frankDomainCountValid}
                                            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            Continue to Golden Response
                                        </button>
                                    </div>
                                </div>
                            )}

                            {frankStep === 'golden' && (
                                <div className="mt-6 space-y-4">
                                    <FrankSummaryRow label="Anchor Case" value={frankEditor.selectedCase ? `${frankEditor.selectedCase.title} · ${frankEditor.selectedCase.citation}` : 'No case selected yet'} />
                                    <FrankSummaryRow label="Analysis Domains" value={`${frankEditor.analysisDomains.length} domain(s)`} />
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 4 · Golden Response</p>
                                        <p className="mt-1 text-sm text-slate-500">Frank now writes the benchmark answer across your chosen domains. Some domains can be marked as not really addressed by the case.</p>
                                        <button
                                            type="button"
                                            onClick={() => void generateFrankGoldenResponse()}
                                            disabled={frankGeneratingGolden || !frankDomainCountValid}
                                            className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            {frankGeneratingGolden ? 'Generating...' : 'Generate And Save Golden Response'}
                                        </button>
                                    </div>
                                    <LabeledTextarea
                                        label="Master Issue Statement"
                                        value={frankEditor.masterIssueStatement}
                                        onChange={(value) => setFrankEditor((current) => ({ ...current, masterIssueStatement: value }))}
                                        rows={4}
                                    />
                                    <LabeledTextarea
                                        label="Frank Golden Response"
                                        value={frankEditor.benchmarkAnswer}
                                        onChange={(value) => setFrankEditor((current) => ({ ...current, benchmarkAnswer: value }))}
                                        rows={16}
                                        hint={frankEditor.id ? `Saved locally as ${frankEditor.id}.` : 'Frank saves this locally as soon as it is generated.'}
                                    />
                                    <LabeledTextarea
                                        label="Failure-Mode Seeds"
                                        value={frankEditor.failureModeSeedsText}
                                        onChange={(value) => setFrankEditor((current) => ({ ...current, failureModeSeedsText: value }))}
                                        rows={4}
                                        hint="Optional weak-answer notes that can help later refinement."
                                    />
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('domains')}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('question')}
                                            disabled={!frankEditor.benchmarkAnswer.trim()}
                                            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            Continue to Question Packet
                                        </button>
                                    </div>
                                </div>
                            )}

                            {frankStep === 'question' && (
                                <div className="mt-6 space-y-4">
                                    <FrankSummaryRow label="Anchor Case" value={frankEditor.selectedCase ? `${frankEditor.selectedCase.title} · ${frankEditor.selectedCase.citation}` : 'No case selected yet'} />
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 5 · Question Packet</p>
                                        <p className="mt-1 text-sm text-slate-500">After the golden response is locked in, Frank drafts the legal-case-packet question that should elicit analysis across those same domains.</p>
                                        <button
                                            type="button"
                                            onClick={() => void generateFrankQuestionPacket()}
                                            disabled={frankGeneratingQuestion || !frankEditor.benchmarkAnswer.trim() || !frankDomainCountValid}
                                            className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            {frankGeneratingQuestion ? 'Generating...' : 'Generate And Save Question Packet'}
                                        </button>
                                    </div>
                                    <LabeledTextarea
                                        label="Question Packet"
                                        value={frankEditor.benchmarkQuestion}
                                        onChange={(value) => setFrankEditor((current) => ({ ...current, benchmarkQuestion: value }))}
                                        rows={14}
                                        hint="This stays editable after generation."
                                    />
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFrankStep('golden')}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveFrank('draft')}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                        >
                                            Save Draft
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveFrank('approved')}
                                            disabled={!frankReady}
                                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                                        >
                                            Approve for Karthic
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <ArtifactListCard title="Frank Packets" items={frankPackets} onSelect={(id) => {
                            const item = frankPackets.find((packet) => packet.id === id);
                            if (item) {
                                applyFrankPacket(item);
                            }
                        }} />
                    </div>
                </section>
            )}

            {!isLoading && activeTab === 'karthic' && (
                <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <SectionHeader
                                title="Karthic Wizard"
                                description="One step at a time: pick an approved Frank packet, draft weighted domains, generate structured golden targets, then approve for Dasha."
                                actions={karthicPackReady ? <ApprovalBadge approved={karthicEditor.status === 'approved'} /> : null}
                            />
                            <KarthicStepRail
                                step={karthicStep}
                                packetReady={Boolean(karthicEditor.frankPacketId)}
                                domainsReady={karthicDomainCountValid}
                                targetsReady={karthicTargetsReady}
                                approveReady={karthicPackReady}
                                onChange={setKarthicStep}
                            />
                            {!karthicReady ? (
                                <div className="mt-4">
                                    <EmptyState
                                        title="No Approved Frank Packet"
                                        description="Approve a Frank packet first. Karthic only starts from approved Frank outputs."
                                        icon={<Scale className="h-5 w-5" />}
                                    />
                                </div>
                            ) : (
                                <>
                                    {karthicStep === 'packet' && (
                                        <div className="mt-6 space-y-4">
                                            <LabeledSelect
                                                label="Approved Frank Packet"
                                                value={karthicEditor.frankPacketId}
                                                onChange={(value) => {
                                                    const packet = approvedFrankPackets.find((item) => item.id === value);
                                                    setKarthicEditor({
                                                        ...DEFAULT_KARTHIC_STATE,
                                                        frankPacketId: value,
                                                        smeNotes: karthicEditor.smeNotes,
                                                        status: 'draft',
                                                        domains: packet
                                                            ? packet.analysisDomains.map((domain, index) => ({
                                                                id: domain.id,
                                                                name: domain.name,
                                                                description: domain.description,
                                                                weight: 1,
                                                                naGuidance: `Mark ${domain.name} as not applicable only if the question packet does not materially trigger this domain.`,
                                                            }))
                                                            : [],
                                                    });
                                                }}
                                                options={[
                                                    { value: '', label: 'Select an approved Frank packet' },
                                                    ...approvedFrankPackets.map((packet) => ({
                                                        value: packet.id,
                                                        label: `${packet.legalDomain} · ${packet.domainScope}`,
                                                    })),
                                                ]}
                                            />
                                            <LabeledTextarea
                                                label="SME Notes"
                                                value={karthicEditor.smeNotes}
                                                onChange={(value) => setKarthicEditor((current) => ({ ...current, smeNotes: value }))}
                                                rows={5}
                                                hint="Optional notes that will shape the structured golden targets."
                                            />
                                            {karthicEditor.frankPacketId ? (
                                                <FrankSummaryRow
                                                    label="Selected Frank Packet"
                                                    value={(() => {
                                                        const packet = approvedFrankPackets.find((item) => item.id === karthicEditor.frankPacketId);
                                                        return packet
                                                            ? `${packet.legalDomain} · ${packet.domainScope}`
                                                            : 'Packet not found';
                                                    })()}
                                                />
                                            ) : null}
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setKarthicStep('domains')}
                                                    disabled={!karthicEditor.frankPacketId}
                                                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    Continue to Domains
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {karthicStep === 'domains' && (
                                        <div className="mt-6 space-y-4">
                                            <FrankSummaryRow
                                                label="Approved Frank Packet"
                                                value={(() => {
                                                    const packet = approvedFrankPackets.find((item) => item.id === karthicEditor.frankPacketId);
                                                    return packet
                                                        ? `${packet.legalDomain} · ${packet.domainScope}`
                                                        : 'No Frank packet selected yet';
                                                })()}
                                            />
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 2 · Karthic Domains</p>
                                                        <p className="mt-1 text-sm text-slate-500">Start from Frank’s analysis domains, then edit the names, weights, and NA guidance before Dasha ever sees them.</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => void draftKarthicDomains()}
                                                        disabled={!karthicEditor.frankPacketId || karthicDraftingDomains}
                                                        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                    >
                                                        {karthicDraftingDomains ? 'Drafting...' : 'Draft Domains From Frank'}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                                                <span>{karthicEditor.domains.length} domains in the pack.</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setKarthicEditor((current) => ({
                                                        ...current,
                                                        domains: [...current.domains, createEmptyDomainRow(current.domains.length)],
                                                    }))}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                                >
                                                    Add Domain
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {karthicEditor.domains.length === 0 ? (
                                                    <p className="text-sm text-slate-500">No domains yet. Draft them from Frank first, then edit as needed.</p>
                                                ) : karthicEditor.domains.map((domain, index) => (
                                                    <div key={domain.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Domain {index + 1}</p>
                                                            <button
                                                                type="button"
                                                                onClick={() => setKarthicEditor((current) => ({
                                                                    ...current,
                                                                    domains: current.domains.filter((_, domainIndex) => domainIndex !== index),
                                                                    goldenTargets: current.goldenTargets.filter((target) => target.domainId !== domain.id),
                                                                }))}
                                                                className="text-xs font-semibold text-rose-600"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                        <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.45fr]">
                                                            <LabeledInput label="Domain Name" value={domain.name} onChange={(value) => updateDomain(index, { name: value })} />
                                                            <LabeledInput label="Weight" value={String(domain.weight)} onChange={(value) => updateDomain(index, { weight: Number(value) || 1 })} />
                                                        </div>
                                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                            <LabeledTextarea label="Description" value={domain.description} onChange={(value) => updateDomain(index, { description: value })} rows={4} />
                                                            <LabeledTextarea label="NA Guidance" value={domain.naGuidance} onChange={(value) => updateDomain(index, { naGuidance: value })} rows={4} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {!karthicDomainCountValid ? (
                                                <p className="text-sm text-amber-700">Karthic needs at least one complete domain before moving on.</p>
                                            ) : null}
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setKarthicStep('packet')}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setKarthicStep('targets')}
                                                    disabled={!karthicDomainCountValid}
                                                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    Continue to Golden Targets
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {karthicStep === 'targets' && (
                                        <div className="mt-6 space-y-4">
                                            <FrankSummaryRow
                                                label="Approved Frank Packet"
                                                value={(() => {
                                                    const packet = approvedFrankPackets.find((item) => item.id === karthicEditor.frankPacketId);
                                                    return packet
                                                        ? `${packet.legalDomain} · ${packet.domainScope}`
                                                        : 'No Frank packet selected yet';
                                                })()}
                                            />
                                            <FrankSummaryRow label="Karthic Domains" value={`${karthicEditor.domains.length} domain(s)`} />
                                            <LabeledTextarea
                                                label="SME Notes"
                                                value={karthicEditor.smeNotes}
                                                onChange={(value) => setKarthicEditor((current) => ({ ...current, smeNotes: value }))}
                                                rows={5}
                                                hint="These notes are sent when generating the structured golden targets."
                                            />
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 3 · Structured Golden Targets</p>
                                                <p className="mt-1 text-sm text-slate-500">Karthic now turns Frank’s golden answer into separate comparison targets per domain: what the golden answer contains, what can be omitted, and what would count as a contradiction.</p>
                                                <button
                                                    type="button"
                                                    onClick={() => void generateKarthicTargets()}
                                                    disabled={karthicGeneratingTargets || !karthicDomainCountValid}
                                                    className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    {karthicGeneratingTargets ? 'Generating...' : 'Generate And Save Golden Targets'}
                                                </button>
                                            </div>
                                            <div className="space-y-4">
                                                {karthicEditor.goldenTargets.length === 0 ? (
                                                    <p className="text-sm text-slate-500">No structured targets yet. Generate them first, then edit as needed.</p>
                                                ) : karthicEditor.goldenTargets.map((target, index) => (
                                                    <div key={target.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target {index + 1} · {target.domainName}</p>
                                                        <div className="mt-3 space-y-3">
                                                            <LabeledTextarea
                                                                label="Golden Target Summary"
                                                                value={target.summary}
                                                                onChange={(value) => setKarthicEditor((current) => ({
                                                                    ...current,
                                                                    goldenTargets: current.goldenTargets.map((item, itemIndex) => itemIndex === index ? { ...item, summary: value } : item),
                                                                }))}
                                                                rows={3}
                                                            />
                                                            <div className="grid gap-3 md:grid-cols-3">
                                                                <LabeledTextarea
                                                                    label="Golden Contains"
                                                                    value={target.goldenContains.join('\n')}
                                                                    onChange={(value) => setKarthicEditor((current) => ({
                                                                        ...current,
                                                                        goldenTargets: current.goldenTargets.map((item, itemIndex) => itemIndex === index ? { ...item, goldenContains: splitTextarea(value) } : item),
                                                                    }))}
                                                                    rows={6}
                                                                />
                                                                <LabeledTextarea
                                                                    label="Allowed Omissions"
                                                                    value={target.allowedOmissions.join('\n')}
                                                                    onChange={(value) => setKarthicEditor((current) => ({
                                                                        ...current,
                                                                        goldenTargets: current.goldenTargets.map((item, itemIndex) => itemIndex === index ? { ...item, allowedOmissions: splitTextarea(value) } : item),
                                                                    }))}
                                                                    rows={6}
                                                                />
                                                                <LabeledTextarea
                                                                    label="Contradiction Flags"
                                                                    value={target.contradictionFlags.join('\n')}
                                                                    onChange={(value) => setKarthicEditor((current) => ({
                                                                        ...current,
                                                                        goldenTargets: current.goldenTargets.map((item, itemIndex) => itemIndex === index ? { ...item, contradictionFlags: splitTextarea(value) } : item),
                                                                    }))}
                                                                    rows={6}
                                                                />
                                                            </div>
                                                            <LabeledTextarea
                                                                label="Comparison Guidance"
                                                                value={target.comparisonGuidance}
                                                                onChange={(value) => setKarthicEditor((current) => ({
                                                                    ...current,
                                                                    goldenTargets: current.goldenTargets.map((item, itemIndex) => itemIndex === index ? { ...item, comparisonGuidance: value } : item),
                                                                }))}
                                                                rows={3}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setKarthicStep('domains')}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setKarthicStep('approve')}
                                                    disabled={!karthicTargetsReady}
                                                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    Continue to Approval
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {karthicStep === 'approve' && (
                                        <div className="mt-6 space-y-4">
                                            <FrankSummaryRow
                                                label="Approved Frank Packet"
                                                value={(() => {
                                                    const packet = approvedFrankPackets.find((item) => item.id === karthicEditor.frankPacketId);
                                                    return packet
                                                        ? `${packet.legalDomain} · ${packet.domainScope}`
                                                        : 'No Frank packet selected yet';
                                                })()}
                                            />
                                            <FrankSummaryRow label="Domains" value={`${karthicEditor.domains.length} domain(s)`} />
                                            <FrankSummaryRow label="Golden Targets" value={`${karthicEditor.goldenTargets.length} target(s)`} />
                                            <LabeledTextarea
                                                label="Comparison Method Note"
                                                value={karthicEditor.comparisonMethodNote}
                                                onChange={(value) => setKarthicEditor((current) => ({ ...current, comparisonMethodNote: value }))}
                                                rows={4}
                                                hint="This explains how Dasha should compare centroids against the structured golden targets."
                                            />
                                            <ReadOnlyListCard
                                                title="Seed Criteria Snapshot"
                                                emptyMessage="Generate golden targets first."
                                                items={karthicEditor.criteria.filter((criterion) => criterion.status === 'active').map((criterion) => ({
                                                    id: criterion.id,
                                                    label: criterion.text,
                                                    meta: criterion.domainId,
                                                }))}
                                            />
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setKarthicStep('targets')}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void saveKarthic('draft')}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                >
                                                    Save Draft
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void saveKarthic('approved')}
                                                    disabled={!karthicPackReady}
                                                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                                                >
                                                    Approve for Dasha
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <ArtifactListCard title="Karthic Rubric Packs" items={karthicPacks} onSelect={(id) => {
                            const item = karthicPacks.find((pack) => pack.id === id);
                            if (item) {
                                applyKarthicPack(item);
                            }
                        }} />
                    </div>
                </section>
            )}

            {!isLoading && activeTab === 'dasha' && (
                <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <SectionHeader
                                title="Dasha Wizard"
                                description="One step at a time: pick the approved Karthic pack, load Frank’s canonical question packet automatically, choose the frontier models, then run clustering and centroid-vs-golden comparison."
                                actions={selectedDashaRun ? <ApprovalBadge approved={selectedDashaRun?.status === 'completed'} label={selectedDashaRun ? selectedDashaRun.status : 'idle'} /> : null}
                            />
                            <DashaStepRail
                                step={dashaStep}
                                rubricReady={dashaRubricReady}
                                questionReady={dashaQuestionReady}
                                modelsReady={dashaModelsReady}
                                runReady={dashaRunReady}
                                onChange={setDashaStep}
                            />
                            {!dashaReady ? (
                                <div className="mt-4">
                                    <EmptyState
                                        title="No Approved Karthic Rubric Pack"
                                        description="Approve a Karthic rubric pack first. Dasha only consumes approved rubric outputs."
                                        icon={<Network className="h-5 w-5" />}
                                    />
                                </div>
                            ) : (
                                <>
                                    {dashaStep === 'rubric' && (
                                        <div className="mt-6 space-y-4">
                                            <LabeledSelect
                                                label="Approved Karthic Rubric Pack"
                                                value={dashaForm.rubricPackId}
                                                onChange={(value) => setDashaForm((current) => ({ ...current, rubricPackId: value }))}
                                                options={[
                                                    { value: '', label: 'Select an approved Karthic rubric pack' },
                                                    ...approvedKarthicPacks.map((pack) => ({
                                                        value: pack.id,
                                                        label: `${pack.id} · ${pack.domains.length} domains`,
                                                    })),
                                                ]}
                                            />
                                            {dashaForm.rubricPackId ? (
                                                <FrankSummaryRow
                                                    label="Selected Rubric Pack"
                                                    value={(() => {
                                                        const pack = approvedKarthicPacks.find((item) => item.id === dashaForm.rubricPackId);
                                                        return pack
                                                            ? `${pack.domains.length} domains · ${pack.goldenTargets.length} structured targets`
                                                            : 'Pack not found';
                                                    })()}
                                                />
                                            ) : null}
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setDashaStep('question')}
                                                    disabled={!dashaRubricReady}
                                                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    Continue to Question Packet
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {dashaStep === 'question' && (
                                        <div className="mt-6 space-y-4">
                                            <FrankSummaryRow
                                                label="Approved Rubric Pack"
                                                value={dashaForm.rubricPackId || 'No rubric pack selected yet'}
                                            />
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 2 · Canonical Question Packet</p>
                                                <p className="mt-1 text-sm text-slate-500">Dasha automatically uses the exact same question packet Frank generated and Karthic inherited. You do not upload a new question here.</p>
                                            </div>
                                            <LabeledTextarea
                                                label="Question Packet From Frank"
                                                value={selectedDashaFrankPacket?.benchmarkQuestion ?? ''}
                                                onChange={() => undefined}
                                                rows={14}
                                                hint={selectedDashaFrankPacket
                                                    ? `Loaded automatically from Frank packet ${selectedDashaFrankPacket.id}.`
                                                    : 'Select an approved rubric pack to load the linked Frank question packet.'}
                                                readOnly
                                            />
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setDashaStep('rubric')}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDashaStep('models')}
                                                    disabled={!dashaQuestionReady}
                                                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    Continue to Models
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {dashaStep === 'models' && (
                                        <div className="mt-6 space-y-4">
                                            <FrankSummaryRow
                                                label="Canonical Question Packet"
                                                value={selectedDashaFrankPacket
                                                    ? `Loaded from Frank packet ${selectedDashaFrankPacket.id}`
                                                    : 'No linked Frank question packet loaded yet'}
                                            />
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 3 · Frontier Models</p>
                                                <p className="mt-1 text-sm text-slate-500">Choose which current frontier models should each write one free-form legal answer. Dasha will cluster those answers before scoring centroids against Karthic’s structured golden targets.</p>
                                            </div>
                                            <div className="grid gap-4 lg:grid-cols-3">
                                                {(Object.keys(MODEL_OPTIONS_BY_PROVIDER) as ModelProvider[]).map((provider) => (
                                                    <div key={provider} className="rounded-xl border border-slate-200 bg-white p-4">
                                                        <p className="text-sm font-semibold text-slate-800">{PROVIDER_LABELS[provider]}</p>
                                                        <div className="mt-2 space-y-2">
                                                            {MODEL_OPTIONS_BY_PROVIDER[provider].slice(0, 4).map((option) => {
                                                                const key = `${provider}::${option.value}`;
                                                                const checked = dashaForm.selectedModelKeys.includes(key);
                                                                return (
                                                                    <label key={key} className="flex items-start gap-2 text-sm text-slate-700">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={() => setDashaForm((current) => ({
                                                                                ...current,
                                                                                selectedModelKeys: checked
                                                                                    ? current.selectedModelKeys.filter((item) => item !== key)
                                                                                    : [...current.selectedModelKeys, key],
                                                                            }))}
                                                                            className="mt-1"
                                                                        />
                                                                        <span>{option.label}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setDashaStep('question')}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDashaStep('run')}
                                                    disabled={!dashaModelsReady}
                                                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    Continue to Run
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {dashaStep === 'run' && (
                                        <div className="mt-6 space-y-4">
                                            <FrankSummaryRow label="Rubric Pack" value={dashaForm.rubricPackId || 'No rubric pack selected yet'} />
                                            <FrankSummaryRow
                                                label="Question Packet"
                                                value={selectedDashaFrankPacket
                                                    ? `Using Frank packet ${selectedDashaFrankPacket.id}`
                                                    : 'No linked Frank question packet loaded yet'}
                                            />
                                            <FrankSummaryRow label="Selected Models" value={`${dashaForm.selectedModelKeys.length} model(s)`} />
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Step 4 · Run Dasha</p>
                                                <div className="mt-2 space-y-2 text-sm text-slate-600">
                                                    <p>Dasha generates one answer per selected model.</p>
                                                    <p>Every model gets the exact same canonical question packet that Frank generated.</p>
                                                    <p>Dasha then runs the repo’s clustering path: instruction-tuned embeddings, UMAP reduction, HDBSCAN clustering, then one representative centroid per cluster.</p>
                                                    <p>Each centroid is compared against Karthic’s structured golden targets and stored as matched points, missing points, extra points, and contradiction points.</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setDashaStep('models')}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void runDasha()}
                                                    disabled={!dashaRunReady || dashaRunning}
                                                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                                >
                                                    {dashaRunning ? 'Running...' : 'Run Dasha Evaluation'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {selectedDashaRun ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <SectionHeader
                                    title="Latest Dasha Run"
                                    description="Centroid-first results only. Each winning centroid is compared against the structured golden targets rather than against the raw golden prose alone."
                                />
                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <MetricCard label="Status" value={selectedDashaRun.status} />
                                    <MetricCard label="Clusters" value={String(selectedDashaRun.clusters.length)} />
                                    <MetricCard label="Clustering" value={selectedDashaRun.clusteringMethod || 'unknown'} />
                                </div>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <MetricCard label="Weighted Score" value={selectedDashaRun.weightedSummary.weightedScore === null ? 'N/A' : selectedDashaRun.weightedSummary.weightedScore.toFixed(1)} />
                                    <MetricCard label="Not Applicable Domains" value={String(selectedDashaRun.weightedSummary.notApplicableDomainIds.length)} />
                                </div>
                                {selectedDashaRun.clusteringNotes ? (
                                    <p className="mt-4 text-sm text-slate-500">{selectedDashaRun.clusteringNotes}</p>
                                ) : null}

                                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                                    <ReadOnlyListCard
                                        title="Winning Domains"
                                        emptyMessage="No domain results yet."
                                        items={selectedDashaRun.domainResults.map((result) => {
                                            const winningEvaluation = result.centroidEvaluations.find((evaluation) => evaluation.clusterId === result.winningCentroidId);
                                            return {
                                                id: result.domainId,
                                                label: `${result.domainName}: ${result.winningCentroidId ?? 'N/A'} (${result.winningScore ?? 'N/A'})`,
                                                meta: result.applicabilityStatus === 'applicable'
                                                    ? [
                                                        result.winningModelMix.map((entry) => `${entry.model} x${entry.count}`).join(', '),
                                                        winningEvaluation?.difference?.differenceSummary ?? null,
                                                        winningEvaluation
                                                            ? `Matched ${winningEvaluation.difference?.matchedGoldenPoints.length ?? 0}, missing ${winningEvaluation.difference?.missingGoldenPoints.length ?? 0}, extra ${winningEvaluation.difference?.extraCentroidPoints.length ?? 0}, contradictions ${winningEvaluation.difference?.contradictionPoints.length ?? 0}`
                                                            : null,
                                                    ].filter(Boolean).join(' · ')
                                                    : result.applicabilityExplanation,
                                            };
                                        })}
                                    />
                                    <ReadOnlyListCard
                                        title="Clusters"
                                        emptyMessage="No clusters generated yet."
                                        items={selectedDashaRun.clusters.map((cluster) => ({
                                            id: cluster.id,
                                            label: `${cluster.id} · ${cluster.size} responses`,
                                            meta: [
                                                cluster.modelBreakdown.map((entry) => `${entry.model} x${entry.count}`).join(', '),
                                                `${selectedDashaRun.domainResults.filter((result) => result.winningCentroidId === cluster.id).length} winning domain(s)`,
                                            ].filter(Boolean).join(' · '),
                                        }))}
                                    />
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-6">
                        <ArtifactListCard
                            title="Dasha Runs"
                            items={dashaRuns}
                            onSelect={(id) => {
                                const run = dashaRuns.find((item) => item.id === id) ?? null;
                                setSelectedDashaRunId(id);
                                setSelectedClusterId(pickDefaultClusterId(run));
                            }}
                            selectedId={selectedDashaRun?.id ?? selectedDashaRunId ?? undefined}
                        />
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Cluster View</p>
                                    <p className="mt-1 text-xs text-slate-500">Toggle the global answer-cluster map on or off.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowClusterView((current) => !current)}
                                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${showClusterView ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-slate-300 bg-white text-slate-700'}`}
                                >
                                    {showClusterView ? 'Hide Cluster View' : 'Show Cluster View'}
                                </button>
                            </div>
                        </div>
                        {showClusterView ? (
                            <ClusterViewCard
                                run={selectedDashaRun}
                                selectedClusterId={selectedClusterId}
                                onSelectCluster={setSelectedClusterId}
                            />
                        ) : null}
                    </div>
                </section>
            )}
        </AppShell>
    );

    function updateDomain(index: number, patch: Partial<KarthicDomain>) {
        setKarthicEditor((current) => ({
            ...current,
            domains: current.domains.map((domain, domainIndex) => domainIndex === index ? { ...domain, ...patch } : domain),
            goldenTargets: current.goldenTargets.map((target) => {
                const domain = current.domains[index];
                if (!domain || target.domainId !== domain.id) {
                    return target;
                }
                return {
                    ...target,
                    domainName: patch.name ?? target.domainName,
                };
            }),
        }));
    }
}

function inferFrankStep(state: FrankEditorState): FrankWizardStep {
    if (!state.legalDomain.trim()) {
        return 'domain';
    }
    if (!state.selectedCase) {
        return 'case';
    }
    if (!isValidFrankDomainCount(state.analysisDomains)) {
        return 'domains';
    }
    if (!state.benchmarkAnswer.trim()) {
        return 'golden';
    }
    if (!state.benchmarkQuestion.trim()) {
        return 'question';
    }
    return 'question';
}

function isValidFrankDomainCount(domains: FrankAnalysisDomain[]) {
    const filled = domains.filter((domain) => domain.name.trim() && domain.description.trim());
    return filled.length >= 5 && filled.length <= 10;
}

function inferKarthicStep(state: KarthicEditorState): KarthicWizardStep {
    if (!state.frankPacketId) {
        return 'packet';
    }
    if (!hasEditableKarthicDomains(state.domains)) {
        return 'domains';
    }
    if (!hasKarthicGoldenTargets(state.goldenTargets, state.domains)) {
        return 'targets';
    }
    return 'approve';
}

function hasEditableKarthicDomains(domains: KarthicDomain[]) {
    return domains.some((domain) => domain.name.trim() && domain.description.trim());
}

function hasKarthicGoldenTargets(targets: KarthicGoldenDomainTarget[], domains: KarthicDomain[]) {
    const filledDomains = domains.filter((domain) => domain.name.trim() && domain.description.trim());
    if (targets.length === 0 || filledDomains.length === 0) {
        return false;
    }
    return filledDomains.every((domain) => targets.some((target) => target.domainId === domain.id && target.goldenContains.length > 0));
}

function FrankStepRail({
    step,
    legalDomainSet,
    caseSelected,
    domainsReady,
    goldenReady,
    questionReady,
    onChange,
}: {
    step: FrankWizardStep;
    legalDomainSet: boolean;
    caseSelected: boolean;
    domainsReady: boolean;
    goldenReady: boolean;
    questionReady: boolean;
    onChange: (step: FrankWizardStep) => void;
}) {
    const steps: Array<{ id: FrankWizardStep; label: string; ready: boolean }> = [
        { id: 'domain', label: '1. Domain', ready: legalDomainSet },
        { id: 'case', label: '2. Case', ready: caseSelected },
        { id: 'domains', label: '3. Domains', ready: domainsReady },
        { id: 'golden', label: '4. Golden', ready: goldenReady },
        { id: 'question', label: '5. Question', ready: questionReady },
    ];

    return (
        <div className="mt-5 flex flex-wrap gap-2">
            {steps.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange(item.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${step === item.id ? 'border-teal-300 bg-teal-50 text-teal-800' : item.ready ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

function KarthicStepRail({
    step,
    packetReady,
    domainsReady,
    targetsReady,
    approveReady,
    onChange,
}: {
    step: KarthicWizardStep;
    packetReady: boolean;
    domainsReady: boolean;
    targetsReady: boolean;
    approveReady: boolean;
    onChange: (step: KarthicWizardStep) => void;
}) {
    const steps: Array<{ id: KarthicWizardStep; label: string; ready: boolean }> = [
        { id: 'packet', label: '1. Packet', ready: packetReady },
        { id: 'domains', label: '2. Domains', ready: domainsReady },
        { id: 'targets', label: '3. Targets', ready: targetsReady },
        { id: 'approve', label: '4. Approve', ready: approveReady },
    ];

    return (
        <div className="mt-5 flex flex-wrap gap-2">
            {steps.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange(item.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${step === item.id ? 'border-teal-300 bg-teal-50 text-teal-800' : item.ready ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

function DashaStepRail({
    step,
    rubricReady,
    questionReady,
    modelsReady,
    runReady,
    onChange,
}: {
    step: DashaWizardStep;
    rubricReady: boolean;
    questionReady: boolean;
    modelsReady: boolean;
    runReady: boolean;
    onChange: (step: DashaWizardStep) => void;
}) {
    const steps: Array<{ id: DashaWizardStep; label: string; ready: boolean }> = [
        { id: 'rubric', label: '1. Rubric', ready: rubricReady },
        { id: 'question', label: '2. Question', ready: questionReady },
        { id: 'models', label: '3. Models', ready: modelsReady },
        { id: 'run', label: '4. Run', ready: runReady },
    ];

    return (
        <div className="mt-5 flex flex-wrap gap-2">
            {steps.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange(item.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${step === item.id ? 'border-teal-300 bg-teal-50 text-teal-800' : item.ready ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

function FrankSummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm text-slate-700">{value}</p>
        </div>
    );
}

function StageCard(props: {
    title: string;
    description: string;
    icon: ReactNode;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={`rounded-2xl border p-5 text-left shadow-sm transition ${props.active ? 'border-teal-300 bg-teal-50/70 shadow-[0_14px_32px_rgba(13,148,136,0.12)]' : 'border-slate-200 bg-white hover:border-teal-200'}`}
        >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-white text-teal-700">
                {props.icon}
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">{props.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{props.description}</p>
        </button>
    );
}

function ApprovalBadge({ approved, label }: { approved: boolean; label?: string }) {
    return (
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${approved ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {approved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FlaskConical className="h-3.5 w-3.5" />}
            {label ?? (approved ? 'Approved' : 'Draft')}
        </div>
    );
}

function ArtifactListCard({
    title,
    items,
    onSelect,
    selectedId,
}: {
    title: string;
    items: Array<{ id: string; status?: string; updatedAt?: string; legalDomain?: string; domainScope?: string; createdAt?: string }>;
    onSelect: (id: string) => void;
    selectedId?: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader title={title} description="Most recently updated first." />
            {items.length === 0 ? (
                <div className="mt-4">
                    <EmptyState title="Nothing here yet" description="Create the first item from this stage to populate the list." />
                </div>
            ) : (
                <div className="mt-4 space-y-3">
                    {items.map((item) => {
                        const isSelected = item.id === selectedId;
                        return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelect(item.id)}
                            className={`w-full rounded-xl border px-4 py-3 text-left transition ${isSelected ? 'border-teal-300 bg-teal-50/70 shadow-[0_10px_24px_rgba(13,148,136,0.08)]' : 'border-slate-200 bg-slate-50 hover:border-teal-200 hover:bg-teal-50/40'}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-800">{item.legalDomain ? `${item.legalDomain} · ${item.domainScope ?? ''}` : item.id}</p>
                                <ApprovalBadge approved={item.status === 'approved' || item.status === 'completed'} label={item.status ?? 'draft'} />
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{item.updatedAt ?? item.createdAt ?? ''}</p>
                        </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ReadOnlyListCard({
    title,
    items,
    emptyMessage,
}: {
    title: string;
    items: Array<{ id: string; label: string; meta?: string }>;
    emptyMessage: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</p>
            {items.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>
            ) : (
                <div className="mt-3 space-y-2">
                    {items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-sm text-slate-800">{item.label}</p>
                            {item.meta ? <p className="mt-1 text-xs text-slate-500">{item.meta}</p> : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ClusterViewCard({
    run,
    selectedClusterId,
    onSelectCluster,
}: {
    run: DashaRun | null;
    selectedClusterId: string | null;
    onSelectCluster: (clusterId: string | null) => void;
}) {
    const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
    const entries = useMemo(() => buildClusterViewEntries(run), [run]);
    const visibleModels = useMemo(
        () => Array.from(new Set(entries.flatMap((entry) => entry.cluster.modelBreakdown.map((item) => item.model)))),
        [entries],
    );
    const modelColorMap = useMemo(() => buildModelColorMap(visibleModels), [visibleModels]);
    const mapData = useMemo(() => buildDashaClusterMapData(entries), [entries]);
    const axisDomain = useMemo(() => buildDashaAxisDomain(mapData.points, mapData.regions), [mapData.points, mapData.regions]);
    const xTicks = useMemo(() => buildTicks(axisDomain.minX, axisDomain.maxX, 4), [axisDomain.maxX, axisDomain.minX]);
    const yTicks = useMemo(() => buildTicks(axisDomain.minY, axisDomain.maxY, 4), [axisDomain.maxY, axisDomain.minY]);
    const filteredLookup = useMemo(
        () => new Map(entries.map((entry) => [entry.cluster.id, entry])),
        [entries],
    );
    const selectedEntry = selectedClusterId ? filteredLookup.get(selectedClusterId) ?? null : null;
    const hoveredEntry = hoveredClusterId ? filteredLookup.get(hoveredClusterId) ?? null : null;
    const focusEntry = selectedEntry ?? hoveredEntry;
    const activeClusterId = selectedClusterId ?? hoveredClusterId;

    useEffect(() => {
        if (hoveredClusterId && !entries.some((entry) => entry.cluster.id === hoveredClusterId)) {
            setHoveredClusterId(null);
        }
    }, [entries, hoveredClusterId]);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
                title="Cluster View"
                description="This uses the same scatter-map style as LSH-clustering: click or hover a cluster to inspect it, and click the background to clear focus."
            />

            {!run || entries.length === 0 ? (
                <div className="mt-4">
                    <EmptyState
                        title="No clusters to inspect yet"
                        description="Run Dasha first. The cluster view will appear here once frontier-model answers have been grouped."
                    />
                </div>
            ) : (
                <div className="mt-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-4">
                        <div className="min-w-0 xl:basis-[58%]">
                            <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                                <svg
                                    viewBox={`0 0 ${DASHA_MAP_WIDTH} ${DASHA_MAP_HEIGHT}`}
                                    className="h-auto w-full"
                                    role="img"
                                    aria-label="Dasha cluster scatter map"
                                >
                                    <rect
                                        x={0}
                                        y={0}
                                        width={DASHA_MAP_WIDTH}
                                        height={DASHA_MAP_HEIGHT}
                                        fill="#061227"
                                        onClick={() => onSelectCluster(null)}
                                    />

                                    {xTicks.map((tick) => {
                                        const x = toDashaSvgX(tick, axisDomain);
                                        return (
                                            <g key={`x-${tick}`}>
                                                <line x1={x} y1={0} x2={x} y2={DASHA_MAP_HEIGHT} stroke="#334155" strokeOpacity={0.42} strokeWidth={1} />
                                                <text x={x} y={DASHA_MAP_HEIGHT - 9} textAnchor="middle" fontSize="11" fill="#94a3b8">
                                                    {formatTick(tick)}
                                                </text>
                                            </g>
                                        );
                                    })}

                                    {yTicks.map((tick) => {
                                        const y = toDashaSvgY(tick, axisDomain);
                                        return (
                                            <g key={`y-${tick}`}>
                                                <line x1={0} y1={y} x2={DASHA_MAP_WIDTH} y2={y} stroke="#334155" strokeOpacity={0.42} strokeWidth={1} />
                                                <text x={10} y={y - 6} textAnchor="start" fontSize="11" fill="#94a3b8">
                                                    {formatTick(tick)}
                                                </text>
                                            </g>
                                        );
                                    })}

                                    {mapData.regions.map((region) => {
                                        const active = activeClusterId === region.clusterId;
                                        const muted = Boolean(activeClusterId) && !active;
                                        const color = modelColorMap.get(region.dominantModel) || '#94a3b8';
                                        const labelX = toDashaSvgX(region.centerX, axisDomain);
                                        const labelY = toDashaSvgY(region.centerY, axisDomain);
                                        return (
                                            <g
                                                key={`region-${region.clusterId}`}
                                                onMouseEnter={() => setHoveredClusterId(region.clusterId)}
                                                onMouseLeave={() => setHoveredClusterId((current) => (current === region.clusterId ? null : current))}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSelectCluster(region.clusterId);
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <circle
                                                    cx={labelX}
                                                    cy={labelY}
                                                    r={Math.max((region.radius / (axisDomain.maxX - axisDomain.minX || 1)) * DASHA_MAP_WIDTH, 8)}
                                                    fill={color}
                                                    fillOpacity={active ? 0.22 : muted ? 0.05 : 0.12}
                                                    stroke={color}
                                                    strokeOpacity={active ? 0.95 : muted ? 0.2 : 0.55}
                                                    strokeWidth={active ? 2.2 : 1.2}
                                                />
                                                <text
                                                    x={labelX}
                                                    y={labelY + 4}
                                                    textAnchor="middle"
                                                    fontSize={active ? '11' : '10'}
                                                    fontWeight={active ? '700' : '600'}
                                                    fill={color}
                                                    fillOpacity={active ? 0.9 : muted ? 0.35 : 0.65}
                                                    pointerEvents="none"
                                                >
                                                    {formatClusterMapLabel(region.clusterId)}
                                                </text>
                                            </g>
                                        );
                                    })}

                                    {mapData.points.map((point, index) => {
                                        const active = activeClusterId === point.clusterId;
                                        const muted = Boolean(activeClusterId) && !active;
                                        const isCentroid = point.isCentroid ?? false;
                                        return (
                                            <g key={`${point.clusterId}-${index}`}>
                                                <title>{isCentroid ? `${point.memberId} (cluster centroid)` : point.memberId ?? point.model}</title>
                                                <circle
                                                    cx={toDashaSvgX(point.x, axisDomain)}
                                                    cy={toDashaSvgY(point.y, axisDomain)}
                                                    r={isCentroid ? 4.8 : active ? 4.2 : 3.4}
                                                    fill={modelColorMap.get(point.model) || '#94a3b8'}
                                                    fillOpacity={muted ? 0.18 : 0.9}
                                                    stroke={isCentroid ? '#0d9488' : 'none'}
                                                    strokeWidth={isCentroid ? 2 : 0}
                                                    onMouseEnter={() => setHoveredClusterId(point.clusterId)}
                                                    onMouseLeave={() => setHoveredClusterId((current) => (current === point.clusterId ? null : current))}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onSelectCluster(point.clusterId);
                                                    }}
                                                    className="cursor-pointer"
                                                />
                                            </g>
                                        );
                                    })}

                                    <text x={DASHA_MAP_WIDTH / 2} y={22} textAnchor="middle" fontSize="15" fill="#dbeafe" fontWeight="700">
                                        {run.id}
                                    </text>
                                    <text x={DASHA_MAP_WIDTH - 16} y={DASHA_MAP_HEIGHT - 28} textAnchor="end" fontSize="11" fill="#94a3b8">
                                        Projection X
                                    </text>
                                    <text
                                        transform={`translate(18 ${DASHA_MAP_HEIGHT / 2}) rotate(-90)`}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fill="#94a3b8"
                                    >
                                        Projection Y
                                    </text>
                                </svg>

                                {mapData.points.length === 0 ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 p-4 text-center">
                                        <p className="max-w-md rounded-lg border border-slate-600 bg-slate-900/90 px-4 py-3 text-sm text-slate-200">
                                            No cluster points are available for this Dasha run.
                                        </p>
                                    </div>
                                ) : null}
                            </div>

                            <p className="mt-2 text-xs text-slate-500">
                                Visible clusters: {entries.length} · Visible points: {mapData.points.length} · Method: {run.clusteringMethod || 'unknown'}
                            </p>

                            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-bold text-slate-900">Selected Cluster Outcomes</h3>
                                    {selectedEntry ? (
                                        <p className="text-[11px] font-semibold text-slate-500">
                                            {formatClusterInspectorTitle(selectedEntry.cluster.id)}
                                        </p>
                                    ) : null}
                                </div>

                                {selectedEntry ? (
                                    <div className="mt-3 space-y-3">
                                        <p className="text-xs text-slate-600">
                                            These metrics describe the currently selected Dasha cluster only, not the whole run.
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Winning domains</p>
                                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedEntry.winningDomains.length}</p>
                                            </div>
                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Average winning score</p>
                                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedEntry.averageWinningScore === null ? 'N/A' : selectedEntry.averageWinningScore.toFixed(1)}</p>
                                            </div>
                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Representative model</p>
                                                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedEntry.representativeResponse?.model ?? 'Unknown'}</p>
                                            </div>
                                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Difference footprint</p>
                                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                                    {formatDifferenceFootprint(selectedEntry.winningDomains, selectedEntry.cluster.id)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-600">
                                        Click a cluster to pin it and see its outcomes here.
                                    </p>
                                )}
                            </div>
                        </div>

                        <aside className="min-w-0 xl:basis-[42%]">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-bold text-slate-900">Cluster Inspector</h3>
                                    {selectedClusterId ? (
                                        <button
                                            type="button"
                                            onClick={() => onSelectCluster(null)}
                                            className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                                        >
                                            Clear focus
                                        </button>
                                    ) : null}
                                </div>

                                {focusEntry ? (
                                    <div className="mt-3 space-y-3">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{formatClusterInspectorTitle(focusEntry.cluster.id)}</p>
                                            <p className="mt-0.5 text-xs text-slate-600">{focusEntry.cluster.size} members</p>
                                        </div>

                                        <p className="text-xs text-slate-700">
                                            Representative: <span className="font-semibold">{focusEntry.representativeResponse?.id ?? focusEntry.cluster.representativeResponseId}</span>
                                            {' '}({focusEntry.representativeResponse?.model ?? 'unknown'})
                                        </p>
                                        <p className="text-xs text-slate-600">
                                            {truncateText(focusEntry.cluster.representativeText, 260) || 'No representative preview available.'}
                                        </p>

                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Model breakdown</p>
                                            <div className="mt-1.5 space-y-1.5">
                                                {focusEntry.cluster.modelBreakdown.map((entry) => (
                                                    <div key={`${focusEntry.cluster.id}-${entry.modelKey}`} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                                                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: modelColorMap.get(entry.model) || '#94a3b8' }} />
                                                            {entry.model}
                                                        </span>
                                                        <span className="text-xs font-semibold text-slate-600">{entry.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Winning domains</p>
                                            <div className="mt-2 space-y-2">
                                                {focusEntry.winningDomains.length === 0 ? (
                                                    <p className="text-xs text-slate-500">No domain selected this cluster as the winner.</p>
                                                ) : (
                                                    focusEntry.winningDomains.map((domain) => {
                                                        const winningEvaluation = domain.centroidEvaluations.find((evaluation) => evaluation.clusterId === focusEntry.cluster.id);
                                                        const difference = winningEvaluation?.difference;
                                                        return (
                                                            <div key={`${focusEntry.cluster.id}_${domain.domainId}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="text-xs font-semibold text-slate-800">{domain.domainName}</p>
                                                                    <span className="text-[11px] font-semibold text-slate-500">{domain.winningScore ?? 'N/A'}</span>
                                                                </div>
                                                                {difference?.differenceSummary ? (
                                                                    <p className="mt-1 text-xs leading-5 text-slate-600">{difference.differenceSummary}</p>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Representative answer</p>
                                            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-700 whitespace-pre-wrap">
                                                {focusEntry.cluster.representativeText}
                                            </div>
                                        </div>

                                        <div className="border-t border-slate-200 pt-3">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Visible cluster list</p>
                                            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                                                {entries.map((entry) => {
                                                    const dominantModel = entry.cluster.modelBreakdown[0]?.model || 'unknown';
                                                    const dominantColor = modelColorMap.get(dominantModel) || '#94a3b8';
                                                    const selected = selectedClusterId === entry.cluster.id;
                                                    const hovered = hoveredClusterId === entry.cluster.id;
                                                    return (
                                                        <button
                                                            key={entry.cluster.id}
                                                            type="button"
                                                            onClick={() => onSelectCluster(entry.cluster.id)}
                                                            onMouseEnter={() => setHoveredClusterId(entry.cluster.id)}
                                                            onMouseLeave={() => setHoveredClusterId((current) => (current === entry.cluster.id ? null : current))}
                                                            className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition ${selected ? 'border-blue-300 bg-blue-50' : hovered ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                                        >
                                                            <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                                                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dominantColor }} />
                                                                {formatClusterInspectorTitle(entry.cluster.id)}
                                                            </span>
                                                            <span className="font-semibold text-slate-600">{entry.cluster.size}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-600">Click or hover a cluster to inspect details.</p>
                                )}
                            </div>
                        </aside>
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
    );
}

function LabeledInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
        </label>
    );
}

function LabeledTextarea({
    label,
    value,
    onChange,
    rows,
    hint,
    readOnly,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    rows: number;
    hint?: string;
    readOnly?: boolean;
}) {
    return (
        <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={rows}
                readOnly={readOnly}
                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 ${readOnly ? 'bg-slate-50' : 'bg-white'}`}
            />
            {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
        </label>
    );
}

function LabeledSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
}) {
    return (
        <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </label>
    );
}

function createEmptyDomainRow(index: number): KarthicDomain {
    return {
        id: `domain_${index + 1}`,
        name: '',
        description: '',
        weight: 1,
        naGuidance: 'This domain is not applicable to the given question.',
    };
}

function splitTextarea(value: string) {
    return value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

function sortByUpdated<T extends { updatedAt?: string; createdAt?: string; completedAt?: string | null }>(items: T[]): T[] {
    return [...items].sort((left, right) => {
        const leftValue = left.updatedAt ?? left.completedAt ?? left.createdAt ?? '';
        const rightValue = right.updatedAt ?? right.completedAt ?? right.createdAt ?? '';
        return String(rightValue).localeCompare(String(leftValue));
    });
}

function buildSelectedModels(keys: string[]): DashaSelectedModel[] {
    return keys.map((key) => {
        const [provider, model] = key.split('::');
        return {
            provider: provider as ModelProvider,
            model,
            reasoningEffort: defaultReasoningEffort(provider as ModelProvider, model),
            temperature: 0.2,
        };
    });
}

function defaultReasoningEffort(provider: ModelProvider, model: string): ReasoningEffort {
    if (provider === 'openai' && model.startsWith('gpt-5')) {
        return 'medium';
    }
    if (provider === 'gemini') {
        return model.includes('pro') ? 'high' : 'medium';
    }
    return 'none';
}

function buildClusterViewEntries(run: DashaRun | null) {
    if (!run) {
        return [];
    }

    const responseById = new Map(run.responses.map((response) => [response.id, response]));

    return run.clusters
        .map((cluster) => {
            const winningDomains = run.domainResults
                .filter((result) => result.winningCentroidId === cluster.id)
                .sort((left, right) => {
                    const scoreDelta = (right.winningScore ?? -1) - (left.winningScore ?? -1);
                    if (scoreDelta !== 0) {
                        return scoreDelta;
                    }
                    const weightDelta = right.weight - left.weight;
                    if (weightDelta !== 0) {
                        return weightDelta;
                    }
                    return left.domainName.localeCompare(right.domainName);
                });

            const memberResponses = cluster.memberResponseIds
                .map((id) => responseById.get(id))
                .filter((response): response is DashaRun['responses'][number] => Boolean(response));

            const representativeResponse = responseById.get(cluster.representativeResponseId) ?? memberResponses[0] ?? null;
            const scores = winningDomains
                .map((domain) => domain.winningScore)
                .filter((score): score is number => score !== null);

            return {
                cluster,
                representativeResponse,
                memberResponses,
                winningDomains,
                averageWinningScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
            };
        })
        .sort((left, right) => {
            const winningDelta = right.winningDomains.length - left.winningDomains.length;
            if (winningDelta !== 0) {
                return winningDelta;
            }
            const sizeDelta = right.cluster.size - left.cluster.size;
            if (sizeDelta !== 0) {
                return sizeDelta;
            }
            return left.cluster.id.localeCompare(right.cluster.id);
        });
}

function pickDefaultClusterId(run: DashaRun | null) {
    return buildClusterViewEntries(run)[0]?.cluster.id ?? null;
}

function shortClusterLabel(clusterId: string) {
    const number = clusterId.replace(/^cluster_/, '');
    return number === clusterId ? clusterId : `C${number}`;
}

function formatClusterMapLabel(clusterId: string) {
    if (clusterId.toLowerCase() === 'noise') {
        return 'Noise';
    }
    return shortClusterLabel(clusterId);
}

function formatClusterInspectorTitle(clusterId: string) {
    if (clusterId.toLowerCase() === 'noise') {
        return 'Noise Cluster';
    }
    const short = shortClusterLabel(clusterId);
    return short === clusterId ? `Cluster ${clusterId}` : `Cluster ${short.slice(1)}`;
}

function buildDashaClusterMapData(entries: ReturnType<typeof buildClusterViewEntries>) {
    if (entries.length === 0) {
        return { points: [] as DashaClusterMapPoint[], regions: [] as DashaClusterMapRegion[] };
    }

    const seeds = entries
        .map((entry) => {
            const visibleMembers = entry.cluster.modelBreakdown.reduce((total, item) => total + item.count, 0);
            if (visibleMembers === 0) {
                return null;
            }

            const dominantModel = entry.cluster.modelBreakdown[0]?.model || 'unknown';
            const radius = 2.8 + Math.sqrt(visibleMembers) * 1.9;

            return {
                clusterId: entry.cluster.id,
                radius,
                visibleMembers,
                totalMembers: entry.cluster.size,
                dominantModel,
                note: truncateText(entry.cluster.representativeText, 180),
                visibleBreakdown: entry.cluster.modelBreakdown,
                members: entry.memberResponses.map((response) => ({ id: response.id, model: response.model })),
                representativeId: entry.cluster.representativeResponseId,
            };
        })
        .filter((seed): seed is NonNullable<typeof seed> => seed !== null);

    if (seeds.length === 0) {
        return { points: [] as DashaClusterMapPoint[], regions: [] as DashaClusterMapRegion[] };
    }

    const seededRegions: DashaClusterMapRegion[] = seeds.map((seed, index) => {
        const spiralStep = 8 + Math.floor(index / 6) * 7;
        const angle = index * GOLDEN_ANGLE * 0.92;
        return {
            clusterId: seed.clusterId,
            centerX: Math.cos(angle) * spiralStep,
            centerY: Math.sin(angle) * spiralStep * 0.72,
            radius: seed.radius,
            visibleMembers: seed.visibleMembers,
            totalMembers: seed.totalMembers,
            dominantModel: seed.dominantModel,
            note: seed.note,
        };
    });

    const regions = resolveDashaRegionOverlaps(seededRegions);
    const regionByCluster = new Map(regions.map((region) => [region.clusterId, region]));

    const points: DashaClusterMapPoint[] = [];
    for (const seed of seeds) {
        const region = regionByCluster.get(seed.clusterId);
        if (!region) {
            continue;
        }

        const sequence = expandModelsByCount(seed.visibleBreakdown, seed.visibleMembers);
        const membersByModel = new Map<string, string[]>();
        for (const member of seed.members) {
            const list = membersByModel.get(member.model) ?? [];
            list.push(member.id);
            membersByModel.set(member.model, list);
        }
        const modelCounters = new Map<string, number>();
        for (const entry of seed.visibleBreakdown) {
            modelCounters.set(entry.model, 0);
        }

        sequence.forEach((model, pointIndex) => {
            const randomSeed = hashString(`${seed.clusterId}:${model}:${pointIndex}`);
            const radialPosition = region.radius * Math.sqrt((pointIndex + 1) / sequence.length);
            const theta = pointIndex * GOLDEN_ANGLE + seededFloat(randomSeed, 1) * 0.85;
            const jitterX = (seededFloat(randomSeed, 2) - 0.5) * 0.85;
            const jitterY = (seededFloat(randomSeed, 3) - 0.5) * 0.85;

            const modelList = membersByModel.get(model) ?? [];
            const counter = modelCounters.get(model) ?? 0;
            const memberId = modelList[counter] ?? undefined;
            modelCounters.set(model, counter + 1);

            points.push({
                x: region.centerX + Math.cos(theta) * radialPosition + jitterX,
                y: region.centerY + Math.sin(theta) * radialPosition + jitterY,
                model,
                clusterId: seed.clusterId,
                memberId,
                isCentroid: memberId === seed.representativeId,
            });
        });
    }

    return {
        points,
        regions: regions.sort((left, right) => right.visibleMembers - left.visibleMembers),
    };
}

function resolveDashaRegionOverlaps(regions: DashaClusterMapRegion[]) {
    const adjusted = regions.map((region) => ({ ...region }));

    for (let iteration = 0; iteration < 120; iteration += 1) {
        let moved = false;

        for (let i = 0; i < adjusted.length; i += 1) {
            for (let j = i + 1; j < adjusted.length; j += 1) {
                const left = adjusted[i];
                const right = adjusted[j];
                const dx = right.centerX - left.centerX;
                const dy = right.centerY - left.centerY;
                const distance = Math.hypot(dx, dy) || 0.0001;
                const minimumDistance = left.radius + right.radius + 2.3;

                if (distance < minimumDistance) {
                    const overlap = (minimumDistance - distance) * 0.5;
                    const ux = dx / distance;
                    const uy = dy / distance;
                    left.centerX -= ux * overlap;
                    left.centerY -= uy * overlap;
                    right.centerX += ux * overlap;
                    right.centerY += uy * overlap;
                    moved = true;
                }
            }
        }

        for (const region of adjusted) {
            region.centerX *= 0.995;
            region.centerY *= 0.995;
        }

        if (!moved) {
            break;
        }
    }

    return adjusted;
}

function expandModelsByCount(entries: Array<{ model: string; count: number }>, fallbackCount: number) {
    const expanded: string[] = [];
    for (const entry of entries) {
        const safeCount = Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
        for (let index = 0; index < safeCount; index += 1) {
            expanded.push(entry.model);
        }
    }
    if (expanded.length === 0 && fallbackCount > 0) {
        expanded.push('unknown');
    }
    return expanded;
}

function buildModelColorMap(models: string[]) {
    const map = new Map<string, string>();
    models.forEach((model, index) => {
        map.set(model, MODEL_PALETTE[index % MODEL_PALETTE.length]);
    });
    return map;
}

function buildDashaAxisDomain(points: DashaClusterMapPoint[], regions: DashaClusterMapRegion[]): DashaAxisDomain {
    if (points.length === 0 && regions.length === 0) {
        return { minX: -20, maxX: 20, minY: -20, maxY: 20 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }

    for (const region of regions) {
        minX = Math.min(minX, region.centerX - region.radius);
        maxX = Math.max(maxX, region.centerX + region.radius);
        minY = Math.min(minY, region.centerY - region.radius);
        maxY = Math.max(maxY, region.centerY + region.radius);
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const paddingX = Math.max(6, width * 0.16);
    const paddingY = Math.max(6, height * 0.16);

    return {
        minX: minX - paddingX,
        maxX: maxX + paddingX,
        minY: minY - paddingY,
        maxY: maxY + paddingY,
    };
}

function buildTicks(min: number, max: number, steps: number) {
    const range = max - min;
    if (range <= 0 || steps <= 0) {
        return [min];
    }
    return Array.from({ length: steps + 1 }, (_, index) => min + (range * index) / steps);
}

function toDashaSvgX(value: number, domain: DashaAxisDomain) {
    const ratio = (value - domain.minX) / (domain.maxX - domain.minX || 1);
    return ratio * DASHA_MAP_WIDTH;
}

function toDashaSvgY(value: number, domain: DashaAxisDomain) {
    const ratio = (value - domain.minY) / (domain.maxY - domain.minY || 1);
    return DASHA_MAP_HEIGHT - ratio * DASHA_MAP_HEIGHT;
}

function hashString(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededFloat(seed: number, stream: number) {
    const mixed = Math.sin(seed * 0.013 + stream * 17.933) * 43758.5453;
    return mixed - Math.floor(mixed);
}

function formatTick(value: number) {
    return value.toFixed(0);
}

function formatDifferenceFootprint(domains: ReturnType<typeof buildClusterViewEntries>[number]['winningDomains'], clusterId: string) {
    let matched = 0;
    let missing = 0;
    let extra = 0;
    let contradictions = 0;

    for (const domain of domains) {
        const evaluation = domain.centroidEvaluations.find((item) => item.clusterId === clusterId);
        if (!evaluation?.difference) {
            continue;
        }
        matched += evaluation.difference.matchedGoldenPoints.length;
        missing += evaluation.difference.missingGoldenPoints.length;
        extra += evaluation.difference.extraCentroidPoints.length;
        contradictions += evaluation.difference.contradictionPoints.length;
    }

    return `M ${matched} · Miss ${missing} · Extra ${extra} · Contr ${contradictions}`;
}

function truncateText(value: string, maxLength: number) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}
