import fs from 'fs/promises';
import path from 'path';

import { generateModelResponse } from '../frontend/src/lib/dasha-model-runtime.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_DASHA_RUN = path.join(ROOT, 'legal-workflow-data', 'dasha-runs', 'dasha_1775367155213_70677f12.json');
const DEFAULT_KARTHIC_PACK = path.join(ROOT, 'legal-workflow-data', 'karthic-rubric-packs', 'karthic_1775367155213_270af0ba.json');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'paper', 'results');
const DEFAULT_JUDGE_TIMEOUT_MS = 90000;

const JUDGE_PANEL = [
    { judgeId: 'openai_gpt41mini', provider: 'openai', model: 'gpt-4.1-mini', label: 'OpenAI' },
    { judgeId: 'anthropic_claude4sonnet', provider: 'replicate', model: 'anthropic/claude-4-sonnet', label: 'Claude' },
    { judgeId: 'deepseek_v3', provider: 'replicate', model: 'deepseek-ai/deepseek-v3', label: 'DeepSeek' },
];

const JUDGE_CONFIGURATION = {
    method: 'median_score_majority_vote',
    judges: JUDGE_PANEL.map((judge) => ({
        judgeId: judge.judgeId,
        provider: judge.label.toLowerCase(),
        model: judge.model,
    })),
};

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const mode = args.mode ?? 'audit-winning';
    const dashaPath = args.dasha ?? DEFAULT_DASHA_RUN;
    const karthicPath = args.karthic ?? DEFAULT_KARTHIC_PACK;
    const outputDir = args.outputDir ?? DEFAULT_OUTPUT_DIR;
    const concurrency = clampNumber(Number(args.concurrency ?? 2), 1, 6);

    const dashaRun = JSON.parse(await fs.readFile(dashaPath, 'utf8'));
    const karthicPack = JSON.parse(await fs.readFile(karthicPath, 'utf8'));

    const responseById = new Map(dashaRun.responses.map((response) => [response.id, response]));
    const clusterById = new Map(dashaRun.clusters.map((cluster) => [cluster.id, cluster]));
    const domainById = new Map(karthicPack.domains.map((domain) => [domain.id, domain]));
    const targetByDomainId = new Map(karthicPack.goldenTargets.map((target) => [target.domainId, target]));
    const criteriaByDomainId = new Map();
    for (const criterion of karthicPack.criteria) {
        if (criterion.status !== 'active') continue;
        const bucket = criteriaByDomainId.get(criterion.domainId) || [];
        bucket.push(criterion.text);
        criteriaByDomainId.set(criterion.domainId, bucket);
    }

    let report;
    if (mode === 'rejudge-all') {
        report = await runFullRejudge({
            dashaRun,
            karthicPack,
            responseById,
            clusterById,
            targetByDomainId,
            criteriaByDomainId,
            concurrency,
        });
        await fs.writeFile(dashaPath, JSON.stringify(report.updatedDashaRun, null, 2), 'utf8');
    } else if (mode === 'retry-missing') {
        report = await runRetryMissing({
            dashaRun,
            responseById,
            clusterById,
            domainById,
            targetByDomainId,
            criteriaByDomainId,
        });
        await fs.writeFile(dashaPath, JSON.stringify(report.updatedDashaRun, null, 2), 'utf8');
    } else {
        report = await runWinningAudit({
            dashaRun,
            targetByDomainId,
            clusterById,
            responseById,
            criteriaByDomainId,
        });
    }

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    await fs.mkdir(outputDir, { recursive: true });
    const stem = mode === 'rejudge-all'
        ? 'ensemble_judge_full_rejudge'
        : mode === 'retry-missing'
            ? 'ensemble_judge_retry_missing'
            : 'ensemble_judge_audit';
    const jsonPath = path.join(outputDir, `${stem}_${timestamp}.json`);
    const txtPath = path.join(outputDir, `${stem}_${timestamp}.txt`);
    await fs.writeFile(jsonPath, JSON.stringify({
        timestamp,
        mode,
        dashaRunPath: dashaPath,
        karthicPackPath: karthicPath,
        judges: JUDGE_PANEL,
        concurrency,
        ...report.serializable,
    }, null, 2), 'utf8');
    await fs.writeFile(txtPath, buildTextReport({
        timestamp,
        mode,
        dashaRunPath: dashaPath,
        karthicPackPath: karthicPath,
        judges: JUDGE_PANEL,
        concurrency,
        ...report.serializable,
    }), 'utf8');

    console.log(`JSON report: ${jsonPath}`);
    console.log(`Text report: ${txtPath}`);
    console.log(JSON.stringify(report.serializable.overall, null, 2));
}

async function runWinningAudit(input) {
    const domainAudits = [];
    for (const result of input.dashaRun.domainResults) {
        const cluster = input.clusterById.get(result.winningCentroidId);
        const representative = cluster ? input.responseById.get(cluster.representativeResponseId) : null;
        const goldenTarget = input.targetByDomainId.get(result.domainId);
        const domainDefinition = {
            id: result.domainId,
            name: result.domainName,
            description: result.rationale ?? '',
            weight: result.weight,
            naGuidance: result.applicabilityExplanation ?? '',
        };
        if (!cluster || !representative || !goldenTarget) {
            continue;
        }

        const criteria = input.criteriaByDomainId.get(result.domainId) || [];
        const evaluation = await evaluateSingleClusterAgainstDomain({
            questionText: input.dashaRun.questionText,
            domain: domainDefinition,
            goldenTarget,
            criteria,
            cluster,
            representativeResponse: representative,
        });

        domainAudits.push({
            domainId: result.domainId,
            domainName: result.domainName,
            winningCentroidId: result.winningCentroidId,
            archivedWinningScore: result.winningScore,
            representativeResponseId: representative.id,
            judgeOutputs: evaluation.judgeOutputs,
            ensemble: evaluation.judgeEnsemble,
        });
    }

    return {
        serializable: {
            overall: summarizeWinningAudits(domainAudits),
            domainAudits,
        },
    };
}

async function runFullRejudge(input) {
    const domainResults = [];
    for (const [domainIndex, domain] of input.karthicPack.domains.entries()) {
        const goldenTarget = input.targetByDomainId.get(domain.id);
        if (!goldenTarget) {
            continue;
        }
        console.log(`[rejudge] domain ${domainIndex + 1}/${input.karthicPack.domains.length}: ${domain.name}`);
        const criteria = input.criteriaByDomainId.get(domain.id) || [];
        const tasks = input.dashaRun.clusters.map((cluster, clusterIndex) => async () => {
            const representativeResponse = input.responseById.get(cluster.representativeResponseId);
            if (!representativeResponse) {
                return null;
            }
            console.log(`[rejudge]   cluster ${clusterIndex + 1}/${input.dashaRun.clusters.length}: ${cluster.id}`);
            const evaluation = await evaluateSingleClusterAgainstDomain({
                questionText: input.dashaRun.questionText,
                domain,
                goldenTarget,
                criteria,
                cluster,
                representativeResponse,
            });
            console.log(
                `[rejudge]   done ${cluster.id}: applicability=${evaluation.applicabilityStatus} score=${evaluation.score ?? 'NA'} agreement=${evaluation.judgeEnsemble?.agreementRatio ?? 'NA'}`,
            );
            return {
                clusterId: cluster.id,
                applicabilityStatus: evaluation.applicabilityStatus,
                applicabilityExplanation: evaluation.applicabilityExplanation,
                score: evaluation.score,
                confidence: evaluation.confidence,
                rationale: evaluation.rationale,
                difference: evaluation.difference,
                judgeOutputs: evaluation.judgeOutputs,
                judgeEnsemble: evaluation.judgeEnsemble,
            };
        });
        const evaluationRows = await runWithConcurrency(tasks, input.concurrency);
        const centroidEvaluations = evaluationRows.filter((item) => item !== null);
        const winning = chooseWinningCentroid(centroidEvaluations, input.clusterById);
        domainResults.push({
            domainId: domain.id,
            domainName: domain.name,
            weight: domain.weight,
            applicabilityStatus: winning?.applicabilityStatus ?? 'not_applicable',
            applicabilityExplanation: winning?.applicabilityExplanation ?? domain.naGuidance,
            centroidEvaluations,
            winningCentroidId: winning?.clusterId ?? null,
            winningScore: winning?.score ?? null,
            rationale: winning?.rationale ?? `No applicable centroid satisfied ${domain.name}.`,
            winningModelMix: winning ? input.clusterById.get(winning.clusterId)?.modelBreakdown ?? [] : [],
        });
    }

    const weightedSummary = summarizeDomainResults(domainResults);
    const updatedDashaRun = {
        ...input.dashaRun,
        status: 'completed',
        validResponseCount: input.dashaRun.responses.filter((response) => !response.error && response.responseText.trim().length > 0).length,
        domainResults,
        weightedSummary,
        judgeConfiguration: JUDGE_CONFIGURATION,
        completedAt: new Date().toISOString(),
    };

    return {
        updatedDashaRun,
        serializable: {
            overall: summarizeFullRejudge(domainResults),
            weightedSummary,
            winningDomains: domainResults.map((result) => ({
                domainId: result.domainId,
                domainName: result.domainName,
                winningCentroidId: result.winningCentroidId,
                winningScore: result.winningScore,
                winningAgreementRatio: result.centroidEvaluations.find((item) => item.clusterId === result.winningCentroidId)?.judgeEnsemble?.agreementRatio ?? null,
                winningScoreSpread: result.centroidEvaluations.find((item) => item.clusterId === result.winningCentroidId)?.judgeEnsemble?.scoreSpread ?? null,
            })),
            domainResults,
        },
    };
}

async function runRetryMissing(input) {
    let retriedEvaluations = 0;
    const domainResults = [];
    for (const [domainIndex, result] of input.dashaRun.domainResults.entries()) {
        const domain = input.domainById.get(result.domainId);
        const goldenTarget = input.targetByDomainId.get(result.domainId);
        if (!domain || !goldenTarget) {
            domainResults.push(result);
            continue;
        }
        console.log(`[retry-missing] domain ${domainIndex + 1}/${input.dashaRun.domainResults.length}: ${domain.name}`);
        const criteria = input.criteriaByDomainId.get(result.domainId) || [];
        const centroidEvaluations = [];
        for (const centroid of result.centroidEvaluations ?? []) {
            if ((centroid.judgeOutputs?.length ?? 0) >= JUDGE_PANEL.length) {
                centroidEvaluations.push(centroid);
                continue;
            }

            const cluster = input.clusterById.get(centroid.clusterId);
            const representativeResponse = cluster ? input.responseById.get(cluster.representativeResponseId) : null;
            if (!cluster || !representativeResponse) {
                centroidEvaluations.push(centroid);
                continue;
            }

            retriedEvaluations += 1;
            console.log(
                `[retry-missing]   rerunning ${centroid.clusterId} for ${domain.name} (had ${centroid.judgeOutputs?.length ?? 0}/${JUDGE_PANEL.length} judges)`,
            );
            const evaluation = await evaluateSingleClusterAgainstDomain({
                questionText: input.dashaRun.questionText,
                domain,
                goldenTarget,
                criteria,
                cluster,
                representativeResponse,
            });
            console.log(
                `[retry-missing]   done ${centroid.clusterId}: judges=${evaluation.judgeOutputs.length} applicability=${evaluation.applicabilityStatus} score=${evaluation.score ?? 'NA'} agreement=${evaluation.judgeEnsemble?.agreementRatio ?? 'NA'}`,
            );
            centroidEvaluations.push({
                clusterId: centroid.clusterId,
                applicabilityStatus: evaluation.applicabilityStatus,
                applicabilityExplanation: evaluation.applicabilityExplanation,
                score: evaluation.score,
                confidence: evaluation.confidence,
                rationale: evaluation.rationale,
                difference: evaluation.difference,
                judgeOutputs: evaluation.judgeOutputs,
                judgeEnsemble: evaluation.judgeEnsemble,
            });
        }

        const winning = chooseWinningCentroid(centroidEvaluations, input.clusterById);
        domainResults.push({
            domainId: domain.id,
            domainName: domain.name,
            weight: domain.weight,
            applicabilityStatus: winning?.applicabilityStatus ?? 'not_applicable',
            applicabilityExplanation: winning?.applicabilityExplanation ?? domain.naGuidance,
            centroidEvaluations,
            winningCentroidId: winning?.clusterId ?? null,
            winningScore: winning?.score ?? null,
            rationale: winning?.rationale ?? `No applicable centroid satisfied ${domain.name}.`,
            winningModelMix: winning ? input.clusterById.get(winning.clusterId)?.modelBreakdown ?? [] : [],
        });
    }

    const weightedSummary = summarizeDomainResults(domainResults);
    const updatedDashaRun = {
        ...input.dashaRun,
        status: 'completed',
        domainResults,
        weightedSummary,
        judgeConfiguration: JUDGE_CONFIGURATION,
        completedAt: new Date().toISOString(),
    };

    return {
        updatedDashaRun,
        serializable: {
            retriedEvaluations,
            overall: summarizeFullRejudge(domainResults),
            weightedSummary,
            winningDomains: domainResults.map((result) => ({
                domainId: result.domainId,
                domainName: result.domainName,
                winningCentroidId: result.winningCentroidId,
                winningScore: result.winningScore,
                winningAgreementRatio: result.centroidEvaluations.find((item) => item.clusterId === result.winningCentroidId)?.judgeEnsemble?.agreementRatio ?? null,
                winningScoreSpread: result.centroidEvaluations.find((item) => item.clusterId === result.winningCentroidId)?.judgeEnsemble?.scoreSpread ?? null,
            })),
            domainResults,
        },
    };
}

async function evaluateSingleClusterAgainstDomain(input) {
    const systemPrompt = buildJudgeSystemPrompt();
    const userPrompt = buildJudgeUserPrompt({
        questionText: input.questionText,
        domain: input.domain,
        goldenTarget: input.goldenTarget,
        criteria: input.criteria,
        responseText: input.representativeResponse.responseText,
    });
    const judgeOutputs = (await Promise.all(
        JUDGE_PANEL.map((judge) => runSingleJudge(judge, systemPrompt, userPrompt)),
    )).filter((item) => item && !item.error);
    const fallback = heuristicFallback(input);
    return aggregateJudgeOutputs(judgeOutputs, fallback);
}

function buildJudgeSystemPrompt() {
    return [
        'You are a Dasha-stage domain judge.',
        'Evaluate one clustered answer representative against one approved domain only.',
        'Do not compare models globally.',
        'Return JSON only.',
    ].join(' ');
}

function buildJudgeUserPrompt(input) {
    return [
        `Domain: ${input.domain.name}`,
        `Domain description: ${input.domain.description}`,
        `NA guidance: ${input.domain.naGuidance}`,
        `Golden target summary: ${input.goldenTarget.summary}`,
        `Golden contains: ${input.goldenTarget.goldenContains.join(' | ') || 'None provided'}`,
        `Allowed omissions: ${input.goldenTarget.allowedOmissions.join(' | ') || 'None provided'}`,
        `Contradiction flags: ${input.goldenTarget.contradictionFlags.join(' | ') || 'None provided'}`,
        `Comparison guidance: ${input.goldenTarget.comparisonGuidance}`,
        `Criteria: ${input.criteria.join(' | ') || 'None provided'}`,
        '',
        'Return JSON:',
        JSON.stringify({
            applicabilityStatus: 'applicable',
            applicabilityExplanation: 'string',
            score: 0,
            confidence: 0.5,
            matchedGoldenPoints: ['string'],
            missingGoldenPoints: ['string'],
            extraCentroidPoints: ['string'],
            contradictionPoints: ['string'],
            differenceSummary: 'string',
            rationale: 'string',
        }),
        '',
        'Use score 0-100 only if applicable. If not applicable, use score null.',
        'Matched points should be things the centroid clearly covers from the golden target.',
        'Missing points should be things the golden target contains but the centroid leaves out.',
        'Extra points should be materially additional claims or emphases from the centroid.',
        'Contradiction points should be claims that conflict with the golden target.',
        '',
        'Question:',
        input.questionText.slice(0, 3500),
        '',
        'Representative answer:',
        input.responseText.slice(0, 3500),
    ].join('\n');
}

async function runSingleJudge(judge, systemPrompt, userPrompt) {
    try {
        const raw = await withTimeout(
            generateModelResponse({
                provider: judge.provider,
                model: judge.model,
                systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                temperature: 0.1,
                reasoningEffort: 'none',
            }),
            DEFAULT_JUDGE_TIMEOUT_MS,
            `${judge.label} judge timed out after ${DEFAULT_JUDGE_TIMEOUT_MS} ms.`,
        );
        const parsed = safeJsonParse(raw);
        if (!parsed) {
            console.warn(`[judge] ${judge.label} returned non-JSON output.`);
            return null;
        }
        const applicabilityStatus = parsed.applicabilityStatus === 'applicable' ? 'applicable' : 'not_applicable';
        return {
            judgeId: judge.judgeId,
            model: judge.model,
            provider: judge.label,
            applicabilityStatus,
            applicabilityExplanation: normalizeString(parsed.applicabilityExplanation),
            score: applicabilityStatus === 'applicable' ? clampNumber(toNumber(parsed.score, 0), 0, 100) : null,
            confidence: clampNumber(toNumber(parsed.confidence, 0.5), 0, 1),
            rationale: normalizeString(parsed.rationale),
            difference: {
                matchedGoldenPoints: normalizeStringArray(parsed.matchedGoldenPoints),
                missingGoldenPoints: normalizeStringArray(parsed.missingGoldenPoints),
                extraCentroidPoints: normalizeStringArray(parsed.extraCentroidPoints),
                contradictionPoints: normalizeStringArray(parsed.contradictionPoints),
                differenceSummary: normalizeString(parsed.differenceSummary),
            },
        };
    } catch (error) {
        console.warn(
            `[judge] ${judge.label} failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
        );
        return null;
    }
}

function aggregateJudgeOutputs(judgeOutputs, fallback) {
    if (judgeOutputs.length === 0) {
        return {
            ...fallback,
            judgeOutputs: [],
            judgeEnsemble: null,
        };
    }

    const applicableJudges = judgeOutputs.filter((output) => output.applicabilityStatus === 'applicable');
    const notApplicableJudges = judgeOutputs.length - applicableJudges.length;
    const applicabilityStatus = applicableJudges.length >= Math.ceil(judgeOutputs.length / 2)
        ? 'applicable'
        : 'not_applicable';
    const scoreCandidates = applicabilityStatus === 'applicable'
        ? applicableJudges.map((output) => output.score).filter((score) => typeof score === 'number')
        : [];
    const confidenceCandidates = judgeOutputs
        .map((output) => output.confidence)
        .filter((confidence) => typeof confidence === 'number');
    const consensusJudge = pickConsensusJudge(applicabilityStatus === 'applicable' ? applicableJudges : judgeOutputs);

    return {
        applicabilityStatus,
        applicabilityExplanation: consensusJudge?.applicabilityExplanation ?? fallback.applicabilityExplanation,
        score: applicabilityStatus === 'applicable' && scoreCandidates.length > 0 ? computeMedian(scoreCandidates) : null,
        confidence: confidenceCandidates.length > 0
            ? roundToTwo(confidenceCandidates.reduce((sum, value) => sum + value, 0) / confidenceCandidates.length)
            : fallback.confidence,
        rationale: consensusJudge
            ? `${consensusJudge.rationale} Ensemble method: majority vote for applicability, median score across applicable judges.`
            : fallback.rationale,
        difference: consensusJudge?.difference ?? fallback.difference,
        judgeOutputs,
        judgeEnsemble: {
            method: 'median_score_majority_vote',
            judgeIds: judgeOutputs.map((output) => output.judgeId),
            participatingJudgeCount: judgeOutputs.length,
            applicableJudgeCount: applicableJudges.length,
            notApplicableJudgeCount: notApplicableJudges,
            applicabilityStatus,
            agreementRatio: roundToTwo(Math.max(applicableJudges.length, notApplicableJudges) / Math.max(judgeOutputs.length, 1)),
            medianScore: applicabilityStatus === 'applicable' && scoreCandidates.length > 0 ? computeMedian(scoreCandidates) : null,
            scoreSpread: applicabilityStatus === 'applicable' && scoreCandidates.length > 0 ? roundToTwo(Math.max(...scoreCandidates) - Math.min(...scoreCandidates)) : null,
            scoreStdDev: applicabilityStatus === 'applicable' && scoreCandidates.length > 0 ? roundToTwo(computeStandardDeviation(scoreCandidates)) : null,
        },
    };
}

function pickConsensusJudge(judgeOutputs) {
    if (judgeOutputs.length === 0) {
        return null;
    }
    return [...judgeOutputs].sort((left, right) => {
        const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
        if (scoreDelta !== 0) return scoreDelta;
        const confidenceDelta = (right.confidence ?? -1) - (left.confidence ?? -1);
        if (confidenceDelta !== 0) return confidenceDelta;
        const matchedDelta = right.difference.matchedGoldenPoints.length - left.difference.matchedGoldenPoints.length;
        if (matchedDelta !== 0) return matchedDelta;
        return left.judgeId.localeCompare(right.judgeId);
    })[0];
}

function heuristicFallback(input) {
    const domainText = normalizeForSimilarity([
        input.domain.name,
        input.domain.description,
        input.goldenTarget.summary,
        ...input.goldenTarget.goldenContains,
        ...input.goldenTarget.contradictionFlags,
        ...input.criteria,
    ].join(' '));
    const responseText = normalizeForSimilarity(input.representativeResponse.responseText);
    const questionText = normalizeForSimilarity(input.questionText);
    const overlap = jaccardSimilarity(domainText, responseText);
    const questionOverlap = jaccardSimilarity(questionText, domainText);
    const applicable = questionOverlap > 0.06 || overlap > 0.05;
    const matchedGoldenPoints = input.goldenTarget.goldenContains.filter((point) => {
        const normalizedPoint = normalizeForSimilarity(point);
        return normalizedPoint.length > 0 && jaccardSimilarity(normalizedPoint, responseText) > 0.08;
    });
    const contradictionPoints = input.goldenTarget.contradictionFlags.filter((point) => {
        const normalizedPoint = normalizeForSimilarity(point);
        return normalizedPoint.length > 0 && jaccardSimilarity(normalizedPoint, responseText) > 0.08;
    });
    return {
        applicabilityStatus: applicable ? 'applicable' : 'not_applicable',
        applicabilityExplanation: applicable
            ? `The representative answer engages with the ${input.domain.name} domain.`
            : input.domain.naGuidance,
        score: applicable ? Math.round(clampNumber(overlap * 240, 15, 96)) : null,
        confidence: roundToTwo(applicable ? Math.max(overlap, 0.35) : 0.4),
        rationale: applicable
            ? `Score derived from overlap between the representative answer and the domain criteria for ${input.domain.name}.`
            : `Marked not applicable under the stored NA guidance for ${input.domain.name}.`,
        difference: {
            matchedGoldenPoints,
            missingGoldenPoints: input.goldenTarget.goldenContains.filter((point) => !matchedGoldenPoints.includes(point)),
            extraCentroidPoints: [],
            contradictionPoints,
            differenceSummary: applicable
                ? `Matched ${matchedGoldenPoints.length} of ${input.goldenTarget.goldenContains.length} expected points for ${input.domain.name}.`
                : `No meaningful coverage of ${input.domain.name} was detected.`,
        },
    };
}

function chooseWinningCentroid(evaluations, clusterById) {
    const applicable = evaluations.filter((evaluation) => evaluation.applicabilityStatus === 'applicable' && typeof evaluation.score === 'number');
    const pool = applicable.length > 0 ? applicable : evaluations;
    if (pool.length === 0) {
        return null;
    }
    return [...pool].sort((left, right) => {
        const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
        if (scoreDelta !== 0) return scoreDelta;
        const confidenceDelta = (right.confidence ?? -1) - (left.confidence ?? -1);
        if (confidenceDelta !== 0) return confidenceDelta;
        const sizeDelta = (clusterById.get(right.clusterId)?.size ?? 0) - (clusterById.get(left.clusterId)?.size ?? 0);
        if (sizeDelta !== 0) return sizeDelta;
        return left.clusterId.localeCompare(right.clusterId);
    })[0];
}

function summarizeDomainResults(results) {
    let weightedTotal = 0;
    let applicableWeightTotal = 0;
    const notApplicableDomainIds = [];
    for (const result of results) {
        if (result.applicabilityStatus !== 'applicable' || typeof result.winningScore !== 'number') {
            notApplicableDomainIds.push(result.domainId);
            continue;
        }
        applicableWeightTotal += result.weight;
        weightedTotal += result.weight * result.winningScore;
    }
    return {
        applicableWeightTotal,
        weightedScore: applicableWeightTotal > 0 ? roundToTwo(weightedTotal / applicableWeightTotal) : null,
        notApplicableDomainIds,
    };
}

function summarizeWinningAudits(domainAudits) {
    const agreementRatios = domainAudits.map((item) => item.ensemble?.agreementRatio).filter((value) => typeof value === 'number');
    const medianScores = domainAudits.map((item) => item.ensemble?.medianScore).filter((value) => typeof value === 'number');
    return {
        auditedDomains: domainAudits.length,
        meanAgreementRatio: agreementRatios.length > 0 ? roundToTwo(agreementRatios.reduce((sum, value) => sum + value, 0) / agreementRatios.length) : null,
        meanMedianScore: medianScores.length > 0 ? roundToTwo(medianScores.reduce((sum, value) => sum + value, 0) / medianScores.length) : null,
        fullyUnanimousDomains: domainAudits.filter((item) => item.ensemble?.agreementRatio === 1).length,
        domainsWithDisagreement: domainAudits.filter((item) => item.ensemble?.agreementRatio !== 1).length,
    };
}

function summarizeFullRejudge(domainResults) {
    const allEvaluations = domainResults.flatMap((result) => result.centroidEvaluations);
    const agreementRatios = allEvaluations
        .map((item) => item.judgeEnsemble?.agreementRatio)
        .filter((value) => typeof value === 'number');
    const medianScores = allEvaluations
        .map((item) => item.judgeEnsemble?.medianScore)
        .filter((value) => typeof value === 'number');
    const winningEvaluations = domainResults
        .map((result) => result.centroidEvaluations.find((item) => item.clusterId === result.winningCentroidId))
        .filter(Boolean);
    return {
        auditedDomains: domainResults.length,
        totalClustersJudged: domainResults.length > 0 ? domainResults[0].centroidEvaluations.length : 0,
        totalClusterDomainEvaluations: allEvaluations.length,
        meanAgreementRatioAllEvaluations: agreementRatios.length > 0 ? roundToTwo(agreementRatios.reduce((sum, value) => sum + value, 0) / agreementRatios.length) : null,
        meanMedianScoreAllApplicableEvaluations: medianScores.length > 0 ? roundToTwo(medianScores.reduce((sum, value) => sum + value, 0) / medianScores.length) : null,
        fullyUnanimousEvaluations: allEvaluations.filter((item) => item.judgeEnsemble?.agreementRatio === 1).length,
        evaluationsWithDisagreement: allEvaluations.filter((item) => item.judgeEnsemble?.agreementRatio !== 1).length,
        winningEvaluationsMeanAgreementRatio: winningEvaluations.length > 0
            ? roundToTwo(winningEvaluations.reduce((sum, item) => sum + (item.judgeEnsemble?.agreementRatio ?? 0), 0) / winningEvaluations.length)
            : null,
    };
}

function buildTextReport(report) {
    const lines = [
        report.mode === 'rejudge-all'
            ? 'Dasha Ensemble Full Rejudge'
            : report.mode === 'retry-missing'
                ? 'Dasha Ensemble Missing-Evaluation Retry'
                : 'Dasha Ensemble Judge Audit',
        `Timestamp: ${report.timestamp}`,
        `Dasha run: ${report.dashaRunPath}`,
        `Karthic pack: ${report.karthicPackPath}`,
        `Concurrency: ${report.concurrency}`,
        '',
    ];

    if (report.mode === 'rejudge-all' || report.mode === 'retry-missing') {
        if (report.mode === 'retry-missing') {
            lines.push(`Retried evaluations: ${report.retriedEvaluations}`);
        }
        lines.push(`Domains judged: ${report.overall.auditedDomains}`);
        lines.push(`Clusters judged per domain: ${report.overall.totalClustersJudged}`);
        lines.push(`Total cluster-domain evaluations: ${report.overall.totalClusterDomainEvaluations}`);
        lines.push(`Mean agreement ratio (all evaluations): ${report.overall.meanAgreementRatioAllEvaluations}`);
        lines.push(`Mean median score (all applicable evaluations): ${report.overall.meanMedianScoreAllApplicableEvaluations}`);
        lines.push(`Fully unanimous evaluations: ${report.overall.fullyUnanimousEvaluations}`);
        lines.push(`Evaluations with disagreement: ${report.overall.evaluationsWithDisagreement}`);
        lines.push(`Weighted score: ${report.weightedSummary.weightedScore}`);
        lines.push('');
        for (const winner of report.winningDomains) {
            lines.push(`${winner.domainName} -> ${winner.winningCentroidId} score=${winner.winningScore} agreement=${winner.winningAgreementRatio} spread=${winner.winningScoreSpread}`);
        }
        return lines.join('\n');
    }

    lines.push(`Audited domains: ${report.overall.auditedDomains}`);
    lines.push(`Mean agreement ratio: ${report.overall.meanAgreementRatio}`);
    lines.push(`Mean ensemble median score: ${report.overall.meanMedianScore}`);
    lines.push(`Fully unanimous domains: ${report.overall.fullyUnanimousDomains}`);
    lines.push(`Domains with disagreement: ${report.overall.domainsWithDisagreement}`);
    lines.push('');
    for (const audit of report.domainAudits) {
        lines.push(`${audit.domainName} -> ${audit.winningCentroidId}`);
        lines.push(`  ensemble applicability: ${audit.ensemble?.applicabilityStatus}`);
        lines.push(`  agreement: ${audit.ensemble?.agreementRatio}`);
        lines.push(`  median score: ${audit.ensemble?.medianScore}`);
        lines.push(`  score spread: ${audit.ensemble?.scoreSpread}`);
        for (const judge of audit.judgeOutputs) {
            lines.push(`  ${judge.provider}: ${judge.applicabilityStatus} score=${judge.score} conf=${judge.confidence}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

async function runWithConcurrency(tasks, concurrency) {
    if (tasks.length === 0) {
        return [];
    }
    const results = new Array(tasks.length);
    const limit = Math.max(1, Math.floor(concurrency));
    let nextIndex = 0;
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (nextIndex < tasks.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await tasks[currentIndex]();
        }
    }));
    return results;
}

async function withTimeout(promise, timeoutMs, message) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            continue;
        }
        const key = token.slice(2);
        const next = argv[index + 1];
        if (!next || next.startsWith('--')) {
            result[key] = true;
            continue;
        }
        result[key] = next;
        index += 1;
    }
    return result;
}

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fencedMatch?.[1]) {
            try {
                return JSON.parse(fencedMatch[1].trim());
            } catch {}
        }
        const objectStart = value.indexOf('{');
        const objectEnd = value.lastIndexOf('}');
        if (objectStart >= 0 && objectEnd > objectStart) {
            try {
                return JSON.parse(value.slice(objectStart, objectEnd + 1));
            } catch {}
        }
        return null;
    }
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
    return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function toNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function roundToTwo(value) {
    return Math.round(value * 100) / 100;
}

function computeMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
    return roundToTwo(median);
}

function computeStandardDeviation(values) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
    return Math.sqrt(variance);
}

function normalizeForSimilarity(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function jaccardSimilarity(left, right) {
    const leftSet = new Set(left.split(' ').filter(Boolean));
    const rightSet = new Set(right.split(' ').filter(Boolean));
    if (leftSet.size === 0 || rightSet.size === 0) {
        return 0;
    }
    let intersection = 0;
    for (const token of leftSet) {
        if (rightSet.has(token)) {
            intersection += 1;
        }
    }
    const union = new Set([...leftSet, ...rightSet]).size;
    return union === 0 ? 0 : intersection / union;
}

await main();
