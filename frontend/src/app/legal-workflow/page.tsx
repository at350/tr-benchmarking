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
    'openai::gpt-4.1-mini',
    'anthropic::claude-sonnet-4-5',
    'gemini::gemini-2.5-pro',
];

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
    const [dashaForm, setDashaForm] = useState<DashaFormState>({
        rubricPackId: '',
        selectedModelKeys: DEFAULT_MODEL_KEYS,
    });
    const [dashaRunning, setDashaRunning] = useState(false);

    const approvedFrankPackets = useMemo(
        () => frankPackets.filter((item) => item.status === 'approved'),
        [frankPackets],
    );
    const approvedKarthicPacks = useMemo(
        () => karthicPacks.filter((item) => item.status === 'approved'),
        [karthicPacks],
    );
    const selectedDashaRun = dashaRuns[0] ?? null;

    useEffect(() => {
        void loadAll();
    }, []);

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
            setFrankPackets(Array.isArray(frankJson.items) ? frankJson.items : []);
            setKarthicPacks(Array.isArray(karthicJson.items) ? karthicJson.items : []);
            setDashaRuns(Array.isArray(dashaJson.items) ? dashaJson.items : []);
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
        if (dashaUploads.length === 0) {
            setErrorMessage('Upload at least one Dasha-stage PDF.');
            return;
        }
        setDashaRunning(true);
        setErrorMessage(null);
        setStatusMessage('Running Dasha evaluation: model generation, clustering, and per-domain centroid scoring...');
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
            setDashaRuns((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage(item.status === 'completed' ? 'Dasha evaluation completed.' : 'Dasha evaluation finished with failures.');
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
                                title="Dasha Evaluation"
                                description="Run free-form model answers, cluster them, and score centroid representatives against Karthic’s structured golden targets."
                                actions={<ApprovalBadge approved={selectedDashaRun?.status === 'completed'} label={selectedDashaRun ? selectedDashaRun.status : 'idle'} />}
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
                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                        <LabeledSelect
                                            label="Approved Rubric Pack"
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
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Question Packet Upload</p>
                                            <input
                                                type="file"
                                                accept=".pdf"
                                                multiple
                                                onChange={(event) => {
                                                    const files = Array.from(event.target.files ?? []);
                                                    setDashaUploads(files.map((file, index) => ({
                                                        file,
                                                        role: DASHA_ROLES[Math.min(index, DASHA_ROLES.length - 1)],
                                                    })));
                                                }}
                                                className="mt-3 text-sm text-slate-600"
                                            />
                                            {dashaUploads.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {dashaUploads.map((upload, index) => (
                                                        <div key={`${upload.file.name}-${index}`} className="grid gap-2 md:grid-cols-[180px_1fr]">
                                                            <select
                                                                value={upload.role}
                                                                onChange={(event) => {
                                                                    const role = event.target.value as ArtifactRole;
                                                                    setDashaUploads((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, role } : row));
                                                                }}
                                                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                                            >
                                                                {DASHA_ROLES.map((role) => (
                                                                    <option key={role} value={role}>{role}</option>
                                                                ))}
                                                            </select>
                                                            <div className="text-sm text-slate-700">{upload.file.name}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Selected Models</p>
                                        <div className="mt-3 grid gap-4 lg:grid-cols-3">
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
                                    </div>

                                    <div className="mt-5 flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => void runDasha()}
                                            disabled={!dashaForm.rubricPackId || dashaRunning || dashaForm.selectedModelKeys.length === 0}
                                            className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                        >
                                            {dashaRunning ? 'Running...' : 'Run Dasha Evaluation'}
                                        </button>
                                    </div>
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
                                            meta: cluster.modelBreakdown.map((entry) => `${entry.model} x${entry.count}`).join(', '),
                                        }))}
                                    />
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-6">
                        <ArtifactListCard title="Dasha Runs" items={dashaRuns} onSelect={() => undefined} />
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
}: {
    title: string;
    items: Array<{ id: string; status?: string; updatedAt?: string; legalDomain?: string; domainScope?: string; createdAt?: string }>;
    onSelect: (id: string) => void;
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
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelect(item.id)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-teal-200 hover:bg-teal-50/40"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-800">{item.legalDomain ? `${item.legalDomain} · ${item.domainScope ?? ''}` : item.id}</p>
                                <ApprovalBadge approved={item.status === 'approved' || item.status === 'completed'} label={item.status ?? 'draft'} />
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{item.updatedAt ?? item.createdAt ?? ''}</p>
                        </button>
                    ))}
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
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    rows: number;
    hint?: string;
}) {
    return (
        <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={rows}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
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
    if (provider === 'openai' && (model === 'gpt-5.2' || model === 'gpt-5.2-pro')) {
        return 'medium';
    }
    if (provider === 'gemini') {
        return 'medium';
    }
    return 'none';
}
