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
    FrankPacket,
    KarthicCriterion,
    KarthicDomain,
    KarthicRubricPack,
    ReasoningEffort,
} from '@/lib/legal-workflow-types';

type WorkflowTab = 'frank' | 'karthic' | 'dasha';

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
    sourceArtifacts: FrankPacket['sourceArtifacts'];
};

type KarthicEditorState = {
    id?: string;
    frankPacketId: string;
    status: KarthicRubricPack['status'];
    domains: KarthicDomain[];
    criteria: KarthicCriterion[];
    refinementLog: KarthicRubricPack['refinementLog'];
    smeNotes: string;
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
    sourceArtifacts: [],
};

const DEFAULT_MODEL_KEYS = [
    'openai::gpt-4.1-mini',
    'anthropic::claude-sonnet-4-5',
    'gemini::gemini-2.5-pro',
];

const FRANK_ROLES: ArtifactRole[] = ['anchor_case', 'issue_statement', 'evidence_packet', 'supplemental'];
const DASHA_ROLES: ArtifactRole[] = ['question_packet', 'issue_statement', 'evidence_packet', 'supplemental'];

export default function LegalWorkflowPage() {
    const [activeTab, setActiveTab] = useState<WorkflowTab>('frank');
    const [frankPackets, setFrankPackets] = useState<FrankPacket[]>([]);
    const [karthicPacks, setKarthicPacks] = useState<KarthicRubricPack[]>([]);
    const [dashaRuns, setDashaRuns] = useState<DashaRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [frankUploads, setFrankUploads] = useState<UploadRow[]>([]);
    const [frankDrafting, setFrankDrafting] = useState(false);
    const [frankEditor, setFrankEditor] = useState<FrankEditorState>(DEFAULT_FRANK_STATE);

    const [karthicEditor, setKarthicEditor] = useState<KarthicEditorState>({
        frankPacketId: '',
        status: 'draft',
        domains: [createEmptyDomainRow(0)],
        criteria: [],
        refinementLog: [],
        smeNotes: '',
    });
    const [contrastiveStrongAnswer, setContrastiveStrongAnswer] = useState('');
    const [contrastiveMediocreAnswer, setContrastiveMediocreAnswer] = useState('');
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
        setFrankEditor({
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
            sourceArtifacts: packet.sourceArtifacts,
        });
    }

    function applyKarthicPack(pack: KarthicRubricPack) {
        setKarthicEditor({
            id: pack.id,
            frankPacketId: pack.frankPacketId,
            status: pack.status,
            domains: pack.domains,
            criteria: pack.criteria,
            refinementLog: pack.refinementLog,
            smeNotes: pack.smeNotes,
        });
    }

    async function handleFrankDraft() {
        if (frankUploads.length === 0) {
            setErrorMessage('Upload at least one Frank-stage PDF.');
            return;
        }
        setFrankDrafting(true);
        setErrorMessage(null);
        setStatusMessage('Drafting Frank packet from uploaded source materials...');
        try {
            const formData = new FormData();
            formData.set('legalDomain', frankEditor.legalDomain);
            formData.set('domainScope', frankEditor.domainScope);
            formData.set('sourceFamily', frankEditor.sourceFamily);
            frankUploads.forEach((upload, index) => {
                formData.append('files', upload.file);
                formData.set(`role_${index}`, upload.role);
            });
            const response = await fetch('/api/frank-packets/draft', {
                method: 'POST',
                body: formData,
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to draft Frank packet.');
            }
            const item = json.item as FrankPacket;
            applyFrankPacket(item);
            setFrankPackets((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage('Frank packet drafted. Review, edit, then approve for Karthic.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to draft Frank packet.');
            setStatusMessage(null);
        } finally {
            setFrankDrafting(false);
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
                    domainScope: frankEditor.domainScope,
                    sourceFamily: frankEditor.sourceFamily,
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
                    criteria: karthicEditor.criteria,
                    refinementLog: karthicEditor.refinementLog,
                    smeNotes: karthicEditor.smeNotes,
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

    async function runRefinement() {
        if (!karthicEditor.id) {
            setErrorMessage('Save the Karthic rubric pack before refinement.');
            return;
        }
        setErrorMessage(null);
        setStatusMessage('Refining coarse Karthic criteria using a lightweight contrastive pass...');
        try {
            const response = await fetch('/api/karthic-rubric-packs/refine', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    packId: karthicEditor.id,
                    contrastiveStrongAnswer,
                    contrastiveMediocreAnswer,
                }),
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || 'Failed to refine Karthic rubric pack.');
            }
            const item = json.item as KarthicRubricPack;
            applyKarthicPack(item);
            setKarthicPacks((current) => sortByUpdated([item, ...current.filter((existing) => existing.id !== item.id)]));
            setStatusMessage('Karthic refinement complete. Review promoted criteria before approval.');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to refine Karthic rubric pack.');
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

    const frankReady = frankEditor.sourceArtifacts.length > 0;
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
                    description="Approved domains, SME weights, NA guidance, and rubric refinement only."
                    icon={<Scale className="h-5 w-5" />}
                    active={activeTab === 'karthic'}
                    onClick={() => setActiveTab('karthic')}
                />
                <StageCard
                    title="Dasha"
                    description="Free-form answer generation, clustering, and per-domain centroid selection only."
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
                                title="Frank Builder"
                                description="Use the SoF packet logic narrowly: source intake, extraction, benchmark answer drafting, and reverse-engineered question drafting."
                                actions={frankReady ? <ApprovalBadge approved={frankPackets.find((item) => item.id === frankEditor.id)?.status === 'approved'} /> : null}
                            />
                            <div className="mt-4 grid gap-4 md:grid-cols-3">
                                <LabeledInput label="Legal Domain" value={frankEditor.legalDomain} onChange={(value) => setFrankEditor((current) => ({ ...current, legalDomain: value }))} />
                                <LabeledInput label="Domain Scope" value={frankEditor.domainScope} onChange={(value) => setFrankEditor((current) => ({ ...current, domainScope: value }))} />
                                <LabeledInput label="Source Family" value={frankEditor.sourceFamily} onChange={(value) => setFrankEditor((current) => ({ ...current, sourceFamily: value }))} />
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Uploaded Source Packet</p>
                                <p className="mt-1 text-sm text-slate-500">Frank accepts PDFs only. Each file stays stage-scoped and becomes a source artifact with explicit role metadata.</p>
                                <div className="mt-3 flex flex-wrap gap-3">
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        multiple
                                        onChange={(event) => {
                                            const files = Array.from(event.target.files ?? []);
                                            setFrankUploads(files.map((file, index) => ({
                                                file,
                                                role: FRANK_ROLES[Math.min(index, FRANK_ROLES.length - 1)],
                                            })));
                                        }}
                                        className="text-sm text-slate-600"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleFrankDraft}
                                        disabled={frankDrafting}
                                        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                                    >
                                        {frankDrafting ? 'Drafting...' : 'Draft Frank Packet'}
                                    </button>
                                </div>
                                {frankUploads.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {frankUploads.map((upload, index) => (
                                            <div key={`${upload.file.name}-${index}`} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[180px_1fr]">
                                                <select
                                                    value={upload.role}
                                                    onChange={(event) => {
                                                        const role = event.target.value as ArtifactRole;
                                                        setFrankUploads((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, role } : row));
                                                    }}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                                >
                                                    {FRANK_ROLES.map((role) => (
                                                        <option key={role} value={role}>{role}</option>
                                                    ))}
                                                </select>
                                                <div className="text-sm text-slate-700">{upload.file.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <LabeledTextarea label="Master Issue Statement" value={frankEditor.masterIssueStatement} onChange={(value) => setFrankEditor((current) => ({ ...current, masterIssueStatement: value }))} rows={4} />
                                <LabeledTextarea label="Failure-Mode Seeds" value={frankEditor.failureModeSeedsText} onChange={(value) => setFrankEditor((current) => ({ ...current, failureModeSeedsText: value }))} rows={4} hint="Draft-only seeds. These do not become Karthic criteria unless an SME explicitly promotes them." />
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <LabeledInput label="Source Quality Rating" value={frankEditor.sourceQualityRating} onChange={(value) => setFrankEditor((current) => ({ ...current, sourceQualityRating: value }))} />
                                <LabeledInput label="Recommendation" value={frankEditor.recommendation} onChange={(value) => setFrankEditor((current) => ({ ...current, recommendation: value }))} />
                                <LabeledSelect
                                    label="Benchmark Posture"
                                    value={frankEditor.benchmarkPosture}
                                    onChange={(value) => setFrankEditor((current) => ({ ...current, benchmarkPosture: value as FrankPacket['sourceIntake']['benchmarkPosture'] }))}
                                    options={[
                                        { value: 'narrow_source_grounded_benchmark_only', label: 'Narrow source-grounded' },
                                        { value: 'generalizable_only_with_supporting_authority', label: 'Generalizable with support' },
                                        { value: 'portable_common_law_benchmark', label: 'Portable common-law' },
                                    ]}
                                />
                                <LabeledSelect
                                    label="Reverse-Engineering Suitability"
                                    value={frankEditor.reverseEngineeringSuitability}
                                    onChange={(value) => setFrankEditor((current) => ({ ...current, reverseEngineeringSuitability: value as FrankPacket['sourceIntake']['reverseEngineeringSuitability'] }))}
                                    options={[
                                        { value: 'strong', label: 'Strong' },
                                        { value: 'moderate', label: 'Moderate' },
                                        { value: 'weak', label: 'Weak' },
                                    ]}
                                />
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <LabeledTextarea label="JD Review Burden" value={frankEditor.jdReviewBurdenText} onChange={(value) => setFrankEditor((current) => ({ ...current, jdReviewBurdenText: value }))} rows={4} />
                                <LabeledTextarea label="Trigger Facts" value={frankEditor.triggerFactsText} onChange={(value) => setFrankEditor((current) => ({ ...current, triggerFactsText: value }))} rows={4} />
                                <LabeledTextarea label="Legal Issue" value={frankEditor.legalIssue} onChange={(value) => setFrankEditor((current) => ({ ...current, legalIssue: value }))} rows={4} />
                                <LabeledTextarea label="Black-Letter Rule" value={frankEditor.blackLetterRule} onChange={(value) => setFrankEditor((current) => ({ ...current, blackLetterRule: value }))} rows={4} />
                                <LabeledTextarea label="Holding" value={frankEditor.holding} onChange={(value) => setFrankEditor((current) => ({ ...current, holding: value }))} rows={4} />
                                <LabeledTextarea label="Limits / Uncertainty" value={[frankEditor.limitsText, frankEditor.uncertaintyText].filter(Boolean).join('\n---\n')} onChange={(value) => {
                                    const [limitsText, uncertaintyText] = value.split('\n---\n');
                                    setFrankEditor((current) => ({ ...current, limitsText: limitsText ?? '', uncertaintyText: uncertaintyText ?? '' }));
                                }} rows={6} />
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <LabeledTextarea label="Benchmark Answer" value={frankEditor.benchmarkAnswer} onChange={(value) => setFrankEditor((current) => ({ ...current, benchmarkAnswer: value }))} rows={14} />
                                <LabeledTextarea label="Benchmark Question" value={frankEditor.benchmarkQuestion} onChange={(value) => setFrankEditor((current) => ({ ...current, benchmarkQuestion: value }))} rows={14} />
                            </div>

                            <div className="mt-5 flex flex-wrap gap-3">
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
                                title="Karthic Rubric"
                                description="Build approved domains, NA guidance, and stage-bounded rubric criteria from an approved Frank packet."
                                actions={<ApprovalBadge approved={karthicEditor.status === 'approved'} />}
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
                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                        <LabeledSelect
                                            label="Approved Frank Packet"
                                            value={karthicEditor.frankPacketId}
                                            onChange={(value) => setKarthicEditor((current) => ({ ...current, frankPacketId: value }))}
                                            options={[
                                                { value: '', label: 'Select an approved Frank packet' },
                                                ...approvedFrankPackets.map((packet) => ({
                                                    value: packet.id,
                                                    label: `${packet.legalDomain} · ${packet.domainScope}`,
                                                })),
                                            ]}
                                        />
                                        <LabeledTextarea label="SME Notes" value={karthicEditor.smeNotes} onChange={(value) => setKarthicEditor((current) => ({ ...current, smeNotes: value }))} rows={4} />
                                    </div>

                                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Domains</p>
                                            <button
                                                type="button"
                                                onClick={() => setKarthicEditor((current) => ({ ...current, domains: [...current.domains, createEmptyDomainRow(current.domains.length)] }))}
                                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                            >
                                                Add Domain
                                            </button>
                                        </div>
                                        <div className="mt-3 space-y-3">
                                            {karthicEditor.domains.map((domain, index) => (
                                                <div key={domain.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                                    <div className="grid gap-3 md:grid-cols-[1.2fr_0.5fr]">
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
                                    </div>

                                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                                        <LabeledTextarea label="Contrastive Strong Answer" value={contrastiveStrongAnswer} onChange={setContrastiveStrongAnswer} rows={8} hint="Optional. Karthic uses this to refine coarse criteria only." />
                                        <LabeledTextarea label="Contrastive Mediocre Answer" value={contrastiveMediocreAnswer} onChange={setContrastiveMediocreAnswer} rows={8} hint="Optional. Failure-mode seeds stay draft-only until an SME promotes them." />
                                    </div>

                                    <div className="mt-5 flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => void saveKarthic('draft')}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                        >
                                            Save Draft
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void runRefinement()}
                                            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
                                        >
                                            Refine Coarse Criteria
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveKarthic('approved')}
                                            disabled={!karthicEditor.frankPacketId}
                                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                                        >
                                            Approve for Dasha
                                        </button>
                                    </div>

                                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                                        <ReadOnlyListCard
                                            title="Criteria"
                                            emptyMessage="Save the rubric pack to seed initial criteria."
                                            items={karthicEditor.criteria.filter((criterion) => criterion.status === 'active').map((criterion) => ({
                                                id: criterion.id,
                                                label: `${criterion.domainId} · ${criterion.text}`,
                                                meta: `${criterion.source} · depth ${criterion.depth}`,
                                            }))}
                                        />
                                        <ReadOnlyListCard
                                            title="Refinement Log"
                                            emptyMessage="No refinement activity yet."
                                            items={karthicEditor.refinementLog.map((entry) => ({
                                                id: entry.id,
                                                label: `${entry.action} · ${entry.note}`,
                                                meta: `${entry.domainId}${entry.criterionId ? ` · ${entry.criterionId}` : ''}`,
                                            }))}
                                        />
                                    </div>
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
                                description="Run free-form model answers, cluster them, and score centroid representatives per approved Karthic domain."
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
                                    description="Centroid-first results only. Model rankings are intentionally not synthesized into a global leaderboard."
                                />
                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <MetricCard label="Status" value={selectedDashaRun.status} />
                                    <MetricCard label="Clusters" value={String(selectedDashaRun.clusters.length)} />
                                    <MetricCard label="Weighted Score" value={selectedDashaRun.weightedSummary.weightedScore === null ? 'N/A' : selectedDashaRun.weightedSummary.weightedScore.toFixed(1)} />
                                </div>

                                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                                    <ReadOnlyListCard
                                        title="Winning Domains"
                                        emptyMessage="No domain results yet."
                                        items={selectedDashaRun.domainResults.map((result) => ({
                                            id: result.domainId,
                                            label: `${result.domainName}: ${result.winningCentroidId ?? 'N/A'} (${result.winningScore ?? 'N/A'})`,
                                            meta: result.applicabilityStatus === 'applicable'
                                                ? result.winningModelMix.map((entry) => `${entry.model} x${entry.count}`).join(', ')
                                                : result.applicabilityExplanation,
                                        }))}
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
        }));
    }
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
