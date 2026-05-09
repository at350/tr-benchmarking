import { ResearchRunButton } from "@/components/ResearchRunButton";

const stages = [
  "Frank: doctrine/gate detection, gold answer, neutral question, and boundary variations",
  "Karthic: dynamic source-grounded rubric rows and quality gates",
  "Dasha: response clustering by legal reasoning signature",
  "Judge: centroid row scoring, projected member scores, and model rankings",
  "Zak: targeted escalation packet only when uncertainty, disagreement, or stage failure requires review",
];

export default function ResearchWorkbenchPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          TR Benchmarking
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          Legal Reasoning Research Workbench
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700">
          This interface is intentionally bare. The source of truth is the reproducible
          research harness in <code>research/validation</code>; this page gives the
          research team a simple way to run the offline SOF fixture and inspect the
          source-to-score stages before broader internal validation.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Pipeline stages</h2>
          <ol className="mt-4 space-y-3">
            {stages.map((stage, index) => (
              <li className="flex gap-3 text-sm leading-6 text-slate-700" key={stage}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-950 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{stage}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Offline fixture</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Runs the tiny source case through the research harness without API calls. Fresh
            run artifacts are written under <code>research/runs/</code>, which is ignored by git.
          </p>
          <ResearchRunButton />
          <pre className="mt-4 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            python3 -m research.validation run --config research/fixtures/tiny_config.json
          </pre>
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Internal evidence</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="border-l-2 border-slate-950 pl-4">
            <h3 className="text-sm font-semibold text-slate-950">Live provider path</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Runs real response models through OpenAI, Anthropic, and Replicate provider
              clients, then validates Frank, Karthic, Dasha, Judge, and Zak artifacts.
            </p>
            <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
              python3 -m research.validation validate --run-dir research/runs/live_three_provider_smoke
            </pre>
          </div>
          <div className="border-l-2 border-slate-950 pl-4">
            <h3 className="text-sm font-semibold text-slate-950">500-response stress</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Uses controlled fixture responses with known legal-reasoning labels to test
              Dasha clustering mechanics at the target compression scale.
            </p>
            <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
              python3 -m research.validation stress --sample-count 500
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}
