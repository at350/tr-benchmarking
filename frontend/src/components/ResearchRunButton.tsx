"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type RunState = {
  status: "idle" | "running" | "done" | "error";
  message: string;
  result?: PipelineResult;
};

type PipelineResult = {
  status: string;
  outputDir: string;
  sourceCase: string;
  artifacts: {
    manifest: Record<string, unknown>;
    frank: {
      statute_of_frauds?: {
        primary_gate_id?: string;
        gates?: Array<Record<string, unknown>>;
      };
      source_extraction?: {
        trigger_facts?: string[];
      };
      gold_answer?: string;
      neutral_question?: string;
      variations?: Array<Record<string, unknown>>;
      controller_card?: Record<string, unknown>;
    };
    karthic: {
      rows?: Array<{
        id: string;
        category: string;
        weight: number;
        criterion: string;
        source_support?: string[];
      }>;
      scoring_policy?: Record<string, unknown>;
    };
    responses: Array<{ id: string; model: string; text: string }>;
    dasha: {
      method?: string;
      clusters?: Array<{
        id: string;
        legal_signal: Record<string, string>;
        representative_response_id: string;
        member_response_ids: string[];
        centroid_quality?: Record<string, unknown>;
      }>;
    };
    judge: {
      mode?: string;
      model_rankings?: Array<Record<string, unknown>>;
      cluster_scores?: Array<Record<string, unknown>>;
      member_scores?: Array<Record<string, unknown>>;
      agreement_score?: number;
      needs_zak?: boolean;
    };
    zak: {
      packets?: Array<Record<string, unknown>>;
      reason?: string;
    };
  };
};

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section className="scroll-mt-6 rounded border border-slate-200 bg-white p-5" id={id}>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function ResearchRunButton() {
  const [state, setState] = useState<RunState>({
    status: "idle",
    message: "Ready.",
  });

  async function runFixture() {
    setState({ status: "running", message: "Running offline fixture..." });
    try {
      const response = await fetch("/api/research/run", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setState({ status: "error", message: body.error || "Pipeline run failed." });
        return;
      }
      setState({ status: "done", message: `${body.status}: ${body.outputDir}`, result: body });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return (
    <div className="mt-5">
      <button
        className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={state.status === "running"}
        onClick={runFixture}
        type="button"
      >
        {state.status === "running" ? "Running..." : "Run Offline Fixture"}
      </button>
      <p className="mt-3 text-sm text-slate-700">{state.message}</p>
      {state.result ? <PipelineInspector result={state.result} /> : null}
    </div>
  );
}

function PipelineInspector({ result }: { result: PipelineResult }) {
  const { artifacts } = result;
  const frank = artifacts.frank;
  const karthic = artifacts.karthic;
  const dasha = artifacts.dasha;
  const judge = artifacts.judge;
  const zak = artifacts.zak;

  return (
    <div className="mt-6 space-y-5">
      <nav className="flex flex-wrap gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
        <a className="rounded bg-white px-3 py-2 hover:bg-slate-100" href="#case-input">Case Input</a>
        <a className="rounded bg-white px-3 py-2 hover:bg-slate-100" href="#frank-packet">Frank Packet</a>
        <a className="rounded bg-white px-3 py-2 hover:bg-slate-100" href="#karthic-rubric">Karthic Rubric</a>
        <a className="rounded bg-white px-3 py-2 hover:bg-slate-100" href="#dasha-clusters">Dasha Clusters</a>
        <a className="rounded bg-white px-3 py-2 hover:bg-slate-100" href="#judge-scores">Judge Scores</a>
        <a className="rounded bg-white px-3 py-2 hover:bg-slate-100" href="#zak-packet">Zak Packet</a>
      </nav>

      <Section id="case-input" title="1. Case Input To Frank">
        <p className="text-sm leading-6 text-slate-700">
          This is the source case text supplied to Frank for this run.
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-800">
          {result.sourceCase}
        </pre>
      </Section>

      <Section id="frank-packet" title="2. Frank Packet">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Primary SOF gate
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {frank.statute_of_frauds?.primary_gate_id}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Controller card
            </p>
            <JsonBlock value={frank.controller_card} />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Detected gates
          </p>
          <JsonBlock value={frank.statute_of_frauds?.gates} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Neutral question
          </p>
          <p className="mt-1 rounded border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800">
            {frank.neutral_question}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Gold answer
          </p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-800">
            {frank.gold_answer}
          </pre>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Boundary variations
          </p>
          <JsonBlock value={frank.variations} />
        </div>
      </Section>

      <Section id="karthic-rubric" title="3. Karthic Rubric">
        <p className="text-sm leading-6 text-slate-700">
          Karthic creates fresh rows from the locked Frank packet. These rows are what
          the judge applies to cluster centroids.
        </p>
        <div className="space-y-3">
          {(karthic.rows || []).map((row) => (
            <div className="rounded border border-slate-200 p-3" key={row.id}>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span>{row.id}</span>
                <span>{row.category}</span>
                <span>weight {row.weight}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-800">{row.criterion}</p>
              {row.source_support?.length ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Source support: {row.source_support.join(" | ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <JsonBlock value={karthic.scoring_policy} />
      </Section>

      <Section id="dasha-clusters" title="4. Dasha Responses And Clusters">
        <p className="text-sm leading-6 text-slate-700">
          Dasha clusters responses by normalized legal-reasoning signatures recovered from
          natural model answers.
        </p>
        <JsonBlock value={{ method: dasha.method, clusters: dasha.clusters }} />
      </Section>

      <Section id="judge-scores" title="5. Judge Scores And Model Ranking">
        <JsonBlock
          value={{
            mode: judge.mode,
            agreement_score: judge.agreement_score,
            needs_zak: judge.needs_zak,
            model_rankings: judge.model_rankings,
            cluster_scores: judge.cluster_scores,
            member_scores: judge.member_scores,
          }}
        />
      </Section>

      <Section id="zak-packet" title="6. Zak Escalation Packet">
        <JsonBlock value={zak} />
      </Section>
    </div>
  );
}
