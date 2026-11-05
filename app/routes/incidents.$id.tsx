import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { setClientAppState } from "@agent-native/core/client/application-state";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconDownload,
  IconSparkles,
} from "@tabler/icons-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import {
  IncidentTimeline,
  type TimelineEvent,
} from "@/components/incidents/IncidentTimeline";
import { Button } from "@/components/ui/button";

const MINUTE = 60_000;

type Verdict = "consistent" | "weak" | "contradicted" | "no-suspect";

interface AnalysisView {
  mode: "current" | "original";
  verdict: Verdict;
  summaryLine: string;
  impactWindow: { start: string; end: string | null; minutes: number | null } | null;
  suspect: { id: string; title: string; at: string } | null;
  firstFailure: { id: string; title: string; at: string } | null;
  deltaMinutes: number | null;
  nearest: { id: string; title: string; at: string; deltaMinutes: number } | null;
  findings: Array<{ tone: "good" | "warn" | "bad"; title: string; detail: string }>;
}

interface EventRow extends TimelineEvent {
  originalAt: string | null;
}

const VERDICT: Record<
  Verdict,
  { label: string; badge: string; dot: string; panel: string }
> = {
  consistent: {
    label: "Consistent",
    badge:
      "border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-400",
    dot: "bg-emerald-600",
    panel: "border-emerald-700/25 bg-emerald-700/[0.04]",
  },
  weak: {
    label: "Weak link",
    badge: "border-amber-700/30 bg-amber-700/10 text-amber-800 dark:text-amber-400",
    dot: "bg-amber-600",
    panel: "border-amber-700/25 bg-amber-700/[0.04]",
  },
  contradicted: {
    label: "Contradicted",
    badge: "border-red-800/30 bg-red-800/10 text-red-800 dark:text-red-400",
    dot: "bg-red-700",
    panel: "border-red-800/25 bg-red-800/[0.04]",
  },
  "no-suspect": {
    label: "Nothing to check",
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    panel: "border-border bg-muted/40",
  },
};

function fmt(iso: string | null | undefined) {
  return iso ? `${iso.slice(11, 16)} UTC` : "—";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function meta() {
  return [{ title: "Incident — Aftermath" }];
}

export default function IncidentRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <IncidentDetail id={id} />;
}

function IncidentDetail({ id }: { id: string }) {
  const incidentQuery = useActionQuery("get-incident", { id });
  const originalQuery = useActionQuery("analyze-incident", { id, mode: "original" });
  const currentQuery = useActionQuery("analyze-incident", { id, mode: "current" });
  const postmortemQuery = useActionQuery("generate-postmortem", { id });
  const moveEvent = useActionMutation("update-incident-event");
  const approvePostmortem = useActionMutation("approve-postmortem", { uiOnly: true });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const events = useMemo<EventRow[]>(() => {
    const rows = incidentQuery.data?.events ?? [];
    return rows.map((event) => ({
      ...event,
      at: overrides[event.id] ?? event.at,
    }));
  }, [incidentQuery.data, overrides]);

  const corrected = events.some(
    (event) => event.originalAt !== null && event.originalAt !== event.at,
  );
  const original = originalQuery.data as AnalysisView | undefined;
  const current = currentQuery.data as AnalysisView | undefined;
  const postmortem = postmortemQuery.data;

  useEffect(() => {
    if (events.length === 0) return;
    if (selectedId && events.some((event) => event.id === selectedId)) return;
    const root = events.find((event) => event.isRootCause) ?? events[0];
    setSelectedId(root?.id ?? null);
  }, [events, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void setClientAppState("selection", { incidentId: id, eventId: selectedId });
  }, [id, selectedId]);

  function refreshDerived() {
    void originalQuery.refetch();
    void currentQuery.refetch();
    void postmortemQuery.refetch();
  }

  function applyMove(eventId: string, at: string) {
    setOverrides((state) => ({ ...state, [eventId]: at }));
    setCopied(false);
    moveEvent.mutate(
      { id: eventId, at },
      {
        onSuccess: refreshDerived,
        onError: () =>
          setOverrides((state) => {
            const next = { ...state };
            delete next[eventId];
            return next;
          }),
      },
    );
  }

  function tryCorrection() {
    const suspect = events.find((event) => event.isRootCause) ?? events.find((event) => event.kind === "deploy");
    if (!suspect) return;
    const base = suspect.originalAt ?? suspect.at;
    applyMove(suspect.id, new Date(Date.parse(base) + 10 * MINUTE).toISOString());
  }

  function resetCorrection() {
    for (const event of events) {
      if (event.originalAt && event.originalAt !== event.at) {
        applyMove(event.id, event.originalAt);
      }
    }
  }

  function askAgent() {
    try {
      sendToAgentChat({
        message: `Explain the correction to incident ${id}. Call analyze-incident twice: mode "original" and mode "current". In three short paragraphs, say what the original timeline implied, what changed when the suspect's time was corrected, and which theory the corrected timeline contradicts. Use the minute figures. Do not invent events or sources.`,
        submit: true,
        openSidebar: true,
      });
    } catch {
      // The computed comparison on the page stands on its own.
    }
  }

  async function copyMarkdown() {
    if (!postmortem) return;
    try {
      await navigator.clipboard.writeText(postmortem.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function downloadMarkdown() {
    if (!postmortem) return;
    const blob = new Blob([postmortem.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(postmortem.title)}-postmortem.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (incidentQuery.isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-6 h-12 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-8 h-48 animate-pulse rounded-md border border-border bg-muted/40" />
        </div>
      </div>
    );
  }

  if (!incidentQuery.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="text-sm text-muted-foreground">Incident not found.</p>
        <Link className="mt-3 inline-flex text-sm underline" to="/incidents">
          Back to incidents
        </Link>
      </div>
    );
  }

  const { incident, actionItems } = incidentQuery.data;
  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null;
  const signals = [...events]
    .filter((event) => event.confidence >= 85)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <Link
            to="/incidents"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconArrowLeft className="size-3.5" strokeWidth={2} />
            All incidents
          </Link>
          <Button variant="outline" size="sm" onClick={askAgent}>
            <IconSparkles className="size-4" strokeWidth={1.8} />
            Ask the agent
          </Button>
        </div>

        <header className="mt-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>Incident</span>
            <span aria-hidden="true">·</span>
            <span>{incident.severity}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              {incident.status === "resolved" ? (
                <IconCircleCheck className="size-3.5" strokeWidth={2} />
              ) : (
                <IconAlertTriangle className="size-3.5" strokeWidth={2} />
              )}
              {incident.status}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {incident.startedAt.slice(0, 10)} · {fmt(incident.startedAt)} → {fmt(incident.resolvedAt)}
            </span>
          </div>

          <h1 className="font-display mt-3 text-[2.75rem] leading-[1.02] tracking-[-0.02em] sm:text-6xl">
            {incident.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {corrected
              ? "The corrected timeline rules out the deploy. The conclusion below is computed from the times on this page."
              : "The deploy looks like the cause — until you move it. Correct the timeline and the conclusion changes."}
          </p>
        </header>

        <StoryComparison
          original={original}
          current={current}
          corrected={corrected}
          busy={moveEvent.isPending || currentQuery.isFetching}
          onTry={tryCorrection}
          onReset={resetCorrection}
          onAsk={askAgent}
        />

        {incident.summary ? (
          <div className="mt-8 border-l-2 border-primary/60 pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              What we know
            </p>
            <p className="mt-1.5 max-w-4xl text-sm leading-relaxed">{incident.summary}</p>
          </div>
        ) : null}

        <section className="mt-10" aria-label="Timeline">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              The timeline
            </h2>
            <p className="text-xs text-muted-foreground">
              Drag any event to correct its time · UTC
            </p>
          </div>
          <IncidentTimeline
            events={events}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onMove={applyMove}
            disabled={moveEvent.isPending}
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {selected
                ? `${selected.title} · ${fmt(selected.at)} · ${selected.confidence}% confidence`
                : `${events.length} events`}
            </span>
            <span>{moveEvent.isPending ? "Saving correction…" : "Every edit is the same action the agent calls."}</span>
          </div>
        </section>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <PostmortemPanel
            postmortem={postmortem}
            loading={postmortemQuery.isLoading}
            approving={approvePostmortem.isPending}
            copied={copied}
            onCopy={copyMarkdown}
            onDownload={downloadMarkdown}
            onApprove={() =>
              approvePostmortem.mutate(
                { id },
                { onSuccess: () => void postmortemQuery.refetch() },
              )
            }
          />

          <aside className="space-y-7">
            <section>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Strongest signals
              </h2>
              <ul className="mt-3 space-y-3">
                {signals.map((signal) => (
                  <li key={signal.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 text-left"
                      onClick={() => setSelectedId(signal.id)}
                    >
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/40" />
                      <span className="min-w-0">
                        <span className="block text-sm leading-snug">{signal.title}</span>
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {fmt(signal.at)} · {signal.confidence}% · {signal.source ?? "unknown"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Action items
              </h2>
              <ul className="mt-3 space-y-3">
                {actionItems.length === 0 ? (
                  <li className="text-sm text-muted-foreground">None yet.</li>
                ) : (
                  actionItems.map((item) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{item.title}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {item.owner ?? "unassigned"} · {item.status}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            {incident.customerStatus ? (
              <section className="border-t border-border pt-4">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Customer status
                </h2>
                <p className="mt-2 text-sm leading-relaxed">{incident.customerStatus}</p>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function StoryComparison({
  original,
  current,
  corrected,
  busy,
  onTry,
  onReset,
  onAsk,
}: {
  original: AnalysisView | undefined;
  current: AnalysisView | undefined;
  corrected: boolean;
  busy: boolean;
  onTry: () => void;
  onReset: () => void;
  onAsk: () => void;
}) {
  return (
    <section className="mt-8" aria-label="Story comparison">
      <div className="grid overflow-hidden rounded-md border border-border bg-card md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <StoryColumn
          eyebrow="Original story"
          analysis={original}
          muted={false}
        />

        <div className="flex items-center justify-center border-y border-border px-4 py-2 md:border-x md:border-y-0 md:py-0">
          <IconArrowRight className="size-5 text-muted-foreground" strokeWidth={1.6} />
        </div>

        {corrected ? (
          <StoryColumn eyebrow="Corrected story" analysis={current} muted={false} />
        ) : (
          <div className="flex min-h-[176px] flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Corrected story
            </p>
            <p className="max-w-[26ch] text-sm leading-relaxed text-muted-foreground">
              Move the suspected cause ten minutes later and the verdict appears here.
            </p>
            <Button size="sm" onClick={onTry} disabled={busy}>
              Try the correction
              <IconArrowRight className="size-4" strokeWidth={2} />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {corrected ? (
          <Button variant="outline" size="sm" onClick={onReset} disabled={busy}>
            Reset to the original
          </Button>
        ) : (
          <Button size="sm" onClick={onTry} disabled={busy}>
            Try the correction
            <IconArrowRight className="size-4" strokeWidth={2} />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onAsk}>
          <IconSparkles className="size-4" strokeWidth={1.8} />
          Ask the agent to explain
        </Button>
        <p className="text-xs text-muted-foreground">
          {corrected
            ? "One move. The agent and the page now read the same corrected timeline."
            : "One move. The verdict is recomputed, not rewritten."}
        </p>
      </div>
    </section>
  );
}

function StoryColumn({
  eyebrow,
  analysis,
  muted,
}: {
  eyebrow: string;
  analysis: AnalysisView | undefined;
  muted: boolean;
}) {
  const verdict = analysis?.verdict ?? "no-suspect";
  const style = VERDICT[verdict];
  const suspectTime = analysis?.suspect?.at;
  const failureTime = analysis?.firstFailure?.at;

  return (
    <div className={`p-5 ${muted ? "bg-muted/30" : ""}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {eyebrow}
      </p>

      <div className="mt-3 flex items-center gap-2 font-mono text-sm">
        <span className="text-muted-foreground">deploy</span>
        <span className="text-lg font-medium tabular-nums">{fmt(suspectTime)}</span>
        <IconArrowRight className="size-3.5 text-muted-foreground" strokeWidth={2} />
        <span className="text-muted-foreground">failure</span>
        <span className="text-lg font-medium tabular-nums">{fmt(failureTime)}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${style.badge}`}
        >
          <span className={`size-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
        {analysis?.deltaMinutes !== null && analysis?.deltaMinutes !== undefined ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {analysis.deltaMinutes > 0 ? "+" : ""}
            {analysis.deltaMinutes} min
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed">{analysis?.summaryLine ?? "Reading the timeline…"}</p>
    </div>
  );
}

function PostmortemPanel({
  postmortem,
  loading,
  approving,
  copied,
  onCopy,
  onDownload,
  onApprove,
}: {
  postmortem:
    | { title: string; markdown: string; approvedAt: string | null; verdict: string }
    | undefined;
  loading: boolean;
  approving: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onApprove: () => void;
}) {
  return (
    <section aria-label="Postmortem">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Postmortem
          </h2>
          {postmortem?.approvedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/30 bg-emerald-700/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-400">
              <IconCheck className="size-3" strokeWidth={2.5} />
              Approved {fmt(postmortem.approvedAt)}
            </span>
          ) : (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Draft
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCopy} disabled={!postmortem}>
            {copied ? <IconCheck className="size-4" strokeWidth={2} /> : <IconCopy className="size-4" strokeWidth={1.8} />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload} disabled={!postmortem}>
            <IconDownload className="size-4" strokeWidth={1.8} />
            .md
          </Button>
          {postmortem && !postmortem.approvedAt ? (
            <Button size="sm" onClick={onApprove} disabled={approving}>
              {approving ? "Approving…" : "Approve"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 max-h-[620px] overflow-y-auto pr-2">
        {loading || !postmortem ? (
          <div className="space-y-3">
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <MarkdownDoc markdown={postmortem.markdown} />
        )}
      </div>
    </section>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function MarkdownDoc({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = () => {
    if (list.length === 0) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="mt-2 space-y-1.5">
        {list.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />
            <span>
              <Inline text={item} />
            </span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flush();

    if (line === "" || line === "---") {
      if (line === "---") nodes.push(<hr key={`hr-${nodes.length}`} className="my-5 border-border" />);
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <h3
          key={`h3-${nodes.length}`}
          className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        >
          {line.slice(3)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(
        <h2 key={`h2-${nodes.length}`} className="font-display text-2xl tracking-tight">
          {line.slice(2)}
        </h2>,
      );
      continue;
    }
    nodes.push(
      <p key={`p-${nodes.length}`} className="mt-2 text-sm leading-relaxed">
        <Inline text={line} />
      </p>,
    );
  }
  flush();

  return <div>{nodes}</div>;
}
