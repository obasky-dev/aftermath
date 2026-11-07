import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import {
  registerActionChatRenderer,
  type ToolRendererProps,
} from "@agent-native/toolkit/app/chat/agentkit-chat";
import { useState } from "react";

type Verdict = "consistent" | "weak" | "contradicted" | "no-suspect";

interface AnalysisResult {
  incidentId: string;
  mode: "current" | "original";
  verdict: Verdict;
  summaryLine: string;
  impactWindow: { start: string; end: string | null; minutes: number | null } | null;
  exposure: { start: string | null; end: string | null; minutes: number | null } | null;
  metrics: {
    timeToDetect: number | null;
    timeToAcknowledge: number | null;
    timeToMitigate: number | null;
    timeToResolve: number | null;
  } | null;
  hypotheses: Array<{
    id: string;
    label: string;
    at: string;
    confidence?: number;
    status: string;
    lagMinutes: number;
  }>;
  leading: { label: string; at: string; lagMinutes: number } | null;
  suspect: { id: string; title: string; at: string } | null;
  deltaMinutes: number | null;
}

interface RollbackResult {
  at: string;
  exposureStart: string;
  recovery: string;
  baselineMinutes: number;
  rollbackMinutes: number;
  savedMinutes: number;
  percentSaved: number;
}

interface ConflictResult {
  incidentId: string;
  conflicts: Array<{
    id: string;
    kind: "timing" | "causal";
    title: string;
    question: string;
    left: {
      eventId: string;
      label: string;
      title: string;
      at: string;
      detail: string | null;
      source: string | null;
      confidence: number;
    };
    right: {
      eventId: string;
      label: string;
      title: string;
      at: string;
      detail: string | null;
      source: string | null;
      confidence: number;
    };
    options: Array<{
      id: string;
      label: string;
      description: string;
      patch: Record<string, unknown> | null;
    }>;
    recommendedOptionId: string;
  }>;
}

interface ChallengeResult {
  incidentId: string;
  verdict: string;
  corrected: boolean;
  challenges: Array<{ tone: "good" | "warn" | "bad"; title: string; detail: string }>;
  question: string;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(11, 16);
}

function fmtRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return "—";
  return `${fmtTime(start)} → ${fmtTime(end)}`;
}

function CardShell({
  label,
  incidentId,
  children,
}: {
  label: string;
  incidentId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-card text-foreground">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        {incidentId ? (
          <a
            href={`/incidents/${incidentId}`}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
          >
            Open incident
          </a>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  consistent: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-400",
  weak: "border-amber-700/30 bg-amber-700/10 text-amber-800 dark:text-amber-400",
  contradicted: "border-red-700/30 bg-red-700/10 text-red-800 dark:text-red-400",
  "no-suspect": "border-border bg-muted text-muted-foreground",
};

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">
        {value === null ? "—" : `${value} min`}
      </p>
    </div>
  );
}

function AnalysisCard({ context }: ToolRendererProps) {
  const result = context.resultJson as AnalysisResult | null;
  if (!result) return null;
  const contradicted = result.hypotheses.filter(
    (hypothesis) => hypothesis.status === "contradicted",
  );

  return (
    <CardShell label="Aftermath · analysis" incidentId={result.incidentId}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${VERDICT_STYLE[result.verdict]}`}
        >
          {result.verdict}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {result.mode === "original" ? "Before corrections" : "Current timeline"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{result.summaryLine}</p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Detect" value={result.metrics?.timeToDetect ?? null} />
        <Metric label="Ack" value={result.metrics?.timeToAcknowledge ?? null} />
        <Metric label="Mitigate" value={result.metrics?.timeToMitigate ?? null} />
        <Metric label="Resolve" value={result.metrics?.timeToResolve ?? null} />
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Impact {result.impactWindow?.minutes ?? "—"} min · Exposure{" "}
        {result.exposure?.minutes ?? "—"} min ·{" "}
        {fmtRange(result.impactWindow?.start, result.impactWindow?.end)}
      </p>

      {result.leading ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Leading: <span className="font-medium text-foreground">{result.leading.label}</span>{" "}
          at {fmtTime(result.leading.at)} · {result.leading.lagMinutes} min before onset
        </p>
      ) : null}

      {contradicted.length > 0 ? (
        <div className="mt-3 space-y-1 border-l-2 border-red-600/40 pl-3">
          {contradicted.map((hypothesis) => (
            <p key={hypothesis.id} className="text-xs leading-relaxed">
              <span className="font-medium">{hypothesis.label}</span> is contradicted by the
              evidence.
            </p>
          ))}
        </div>
      ) : null}
    </CardShell>
  );
}

function RollbackCard({ context }: ToolRendererProps) {
  const result = context.resultJson as RollbackResult | null;
  const incidentId = typeof context.args.id === "string" ? context.args.id : "";
  const [at, setAt] = useState<string>(result?.at ?? "");
  const simulation = useActionQuery(
    "simulate-rollback",
    { id: incidentId, at },
    { enabled: Boolean(incidentId) && at !== "" && at !== result?.at },
  );
  const keyedData = (simulation.data as RollbackResult | undefined) ?? result;
  if (!result || !keyedData) return null;

  const startMs = Date.parse(result.exposureStart);
  const endMs = Date.parse(result.recovery);
  const valueMs = Date.parse(keyedData.at);
  const percent =
    keyedData.baselineMinutes > 0
      ? Math.round((keyedData.rollbackMinutes / keyedData.baselineMinutes) * 100)
      : 0;

  return (
    <CardShell label="Aftermath · what-if rollback" incidentId={incidentId}>
      <p className="text-sm leading-relaxed">
        If the rollback landed at{" "}
        <span className="font-mono font-medium tabular-nums">{fmtTime(keyedData.at)}</span>,
        exposure is recomputed from the real window — not guessed.
      </p>
      <input
        type="range"
        min={startMs}
        max={endMs}
        step={60_000}
        value={Number.isNaN(valueMs) ? startMs : valueMs}
        onChange={(event) => setAt(new Date(Number(event.target.value)).toISOString())}
        className="mt-3 w-full accent-[hsl(var(--primary))]"
        aria-label="Hypothetical rollback time"
      />
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-16 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            Baseline
          </span>
          <div className="h-2 flex-1 rounded-sm bg-foreground/15" />
          <span className="w-14 text-right font-mono text-[10px] tabular-nums">
            {keyedData.baselineMinutes} min
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            Rollback
          </span>
          <div className="h-2 flex-1 rounded-sm bg-muted">
            <div
              className="h-full rounded-sm bg-primary transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-14 text-right font-mono text-[10px] tabular-nums">
            {keyedData.rollbackMinutes} min
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm">
        Saves{" "}
        <strong className="font-semibold tabular-nums">{keyedData.savedMinutes} min</strong> of
        exposure ({keyedData.percentSaved}%).
      </p>
    </CardShell>
  );
}

function ConflictCard({ context }: ToolRendererProps) {
  const result = context.resultJson as ConflictResult | null;
  const update = useActionMutation("update-incident-event");
  const [resolved, setResolved] = useState<Record<string, string>>({});
  if (!result) return null;

  function resolve(conflictId: string, optionId: string, patch: Record<string, unknown> | null) {
    if (!patch) return;
    update.mutate(
      patch as { id: string } & Record<string, unknown>,
      { onSuccess: () => setResolved((state) => ({ ...state, [conflictId]: optionId })) },
    );
  }

  return (
    <CardShell label="Aftermath · evidence conflicts" incidentId={result.incidentId}>
      {result.conflicts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No unresolved conflicts. Every claim agrees with its sources.
        </p>
      ) : (
        <div className="space-y-4">
          {result.conflicts.slice(0, 3).map((conflict) => {
            const done = resolved[conflict.id];
            return (
              <div key={conflict.id} className="rounded-sm border border-border p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                  {conflict.kind === "timing" ? "Timing conflict" : "Causal conflict"}
                </p>
                <p className="mt-1 text-sm font-semibold leading-snug">{conflict.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {conflict.question}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {[conflict.left, conflict.right].map((side) => (
                    <div key={side.eventId} className="rounded-sm bg-muted/50 p-2">
                      <p className="font-mono text-[10px] tabular-nums">
                        {fmtTime(side.at)} · {side.confidence}%
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium leading-snug">{side.label}</p>
                      {side.source ? (
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                          {side.source}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {done ? (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
                    Resolved — rerun list-conflicts to confirm.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {conflict.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={update.isPending}
                        onClick={() => resolve(conflict.id, option.id, option.patch)}
                        className={`rounded-sm border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                          option.id === conflict.recommendedOptionId
                            ? "border-primary/60 bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CardShell>
  );
}

function ChallengeCard({ context }: ToolRendererProps) {
  const result = context.resultJson as ChallengeResult | null;
  if (!result) return null;
  return (
    <CardShell label="Aftermath · challenge" incidentId={result.incidentId}>
      <ul className="space-y-2.5">
        {result.challenges.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span
              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                item.tone === "bad"
                  ? "bg-red-600"
                  : item.tone === "good"
                    ? "bg-emerald-600"
                    : "bg-amber-600"
              }`}
            />
            <div>
              <p className="text-sm font-medium leading-snug">{item.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="font-display mt-3 text-base leading-snug tracking-tight">
        {result.question}
      </p>
    </CardShell>
  );
}

registerActionChatRenderer({
  id: "aftermath-analysis",
  renderer: "aftermath.analysis-card",
  Component: AnalysisCard,
});

registerActionChatRenderer({
  id: "aftermath-rollback",
  renderer: "aftermath.rollback-card",
  Component: RollbackCard,
});

registerActionChatRenderer({
  id: "aftermath-conflicts",
  renderer: "aftermath.conflict-card",
  Component: ConflictCard,
});

registerActionChatRenderer({
  id: "aftermath-challenge",
  renderer: "aftermath.challenge-card",
  Component: ChallengeCard,
});
