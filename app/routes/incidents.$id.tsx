import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { setClientAppState } from "@agent-native/core/client/application-state";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconClock,
  IconRefresh,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import {
  IncidentTimeline,
  type TimelineEvent,
} from "@/components/incidents/IncidentTimeline";
import { Button } from "@/components/ui/button";

const SEVERITY_STYLES: Record<string, string> = {
  sev1: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  sev2: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sev3: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

const MINUTE = 60_000;

const VERDICT_STYLES = {
  consistent: {
    label: "Consistent",
    box: "border-emerald-500/30 bg-emerald-500/5",
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  weak: {
    label: "Weak link",
    box: "border-amber-500/30 bg-amber-500/5",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  contradicted: {
    label: "Contradicted",
    box: "border-red-500/30 bg-red-500/5",
    badge: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  "no-suspect": {
    label: "Nothing to check",
    box: "border-border bg-muted/40",
    badge: "border-border bg-muted text-muted-foreground",
  },
} as const;

function fmtTime(iso: string) {
  return `${iso.slice(11, 16)} UTC`;
}

export function meta() {
  return [{ title: "Incident — Blameless" }];
}

export default function IncidentRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <IncidentDetail id={id} />;
}

function IncidentDetail({ id }: { id: string }) {
  const { data, isLoading } = useActionQuery("get-incident", { id });
  const moveEvent = useActionMutation("update-incident-event");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [recheckOn, setRecheckOn] = useState(false);
  const analysis = useActionQuery("analyze-incident", { id }, { enabled: recheckOn });

  const events = useMemo<TimelineEvent[]>(() => {
    const rows = data?.events ?? [];
    return rows.map((event) => ({
      ...event,
      at: overrides[event.id] ?? event.at,
    }));
  }, [data, overrides]);

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

  function applyMove(eventId: string, at: string) {
    setRecheckOn(false);
    setOverrides((current) => ({ ...current, [eventId]: at }));
    moveEvent.mutate(
      { id: eventId, at },
      {
        onError: () =>
          setOverrides((current) => {
            const next = { ...current };
            delete next[eventId];
            return next;
          }),
      },
    );
  }

  function nudge(event: TimelineEvent, minutes: number) {
    applyMove(event.id, new Date(Date.parse(event.at) + minutes * MINUTE).toISOString());
  }

  function recheck() {
    setRecheckOn(true);
    try {
      sendToAgentChat({
        message: `Re-check incident ${id} after a timeline correction. Call analyze-incident for ${id}, then explain in three short paragraphs: (1) what the corrected ordering implies, (2) which theory is contradicted or supported, (3) what evidence would settle it. Do not invent events or sources.`,
        submit: true,
        openSidebar: true,
      });
    } catch {
      // The deterministic panel still renders if the chat surface is unavailable.
    }
  }

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-6 h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="text-sm text-muted-foreground">Incident not found.</p>
        <Link className="mt-3 inline-flex text-sm underline" to="/incidents">
          Back to incidents
        </Link>
      </div>
    );
  }

  const { incident, actionItems } = data;
  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null;
  const signals = [...events]
    .filter((event) => event.confidence >= 85)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-3.5" strokeWidth={2} />
          All incidents
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                  SEVERITY_STYLES[incident.severity] ?? SEVERITY_STYLES.sev3
                }`}
              >
                {incident.severity}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {incident.status === "resolved" ? (
                  <IconCircleCheck className="size-3.5" strokeWidth={2} />
                ) : (
                  <IconAlertTriangle className="size-3.5" strokeWidth={2} />
                )}
                {incident.status}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {fmtTime(incident.startedAt)} · {incident.startedAt.slice(0, 10)}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{incident.title}</h1>
            {incident.summary ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {incident.summary}
              </p>
            ) : null}
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Corrected an event? Re-check what the new order means.
          </p>
          <Button size="sm" onClick={recheck} disabled={analysis.isFetching}>
            <IconRefresh
              className={`size-4 ${analysis.isFetching ? "animate-spin" : ""}`}
              strokeWidth={2}
            />
            {analysis.isFetching ? "Re-checking…" : "Re-check timeline"}
          </Button>
        </div>

        <div className="mt-4">
          <IncidentTimeline
            events={events}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onMove={applyMove}
            disabled={moveEvent.isPending}
          />
          {moveEvent.isPending ? (
            <p className="mt-2 text-right text-[11px] text-muted-foreground">Saving correction…</p>
          ) : null}
        </div>

        {recheckOn && analysis.data ? <RecheckPanel analysis={analysis.data} /> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Selected event">
            {selected ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {selected.kind}
                  </span>
                  {selected.isRootCause ? (
                    <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">
                      Suspected cause
                    </span>
                  ) : null}
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                    {selected.confidence}% confidence
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 font-mono text-2xl tabular-nums tracking-tight">
                  <IconClock className="size-5 text-muted-foreground" strokeWidth={1.8} />
                  {fmtTime(selected.at)}
                </div>

                <h2 className="mt-3 text-lg font-medium leading-snug">{selected.title}</h2>
                {selected.detail ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {selected.detail}
                  </p>
                ) : null}

                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ width: `${selected.confidence}%` }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => nudge(selected, -1)}>
                    −1 min
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => nudge(selected, 1)}>
                    +1 min
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    or drag the event on the timeline
                  </span>
                </div>

                {selected.source ? (
                  <p className="mt-4 text-[11px] text-muted-foreground">Source: {selected.source}</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                        <span className="block text-[11px] text-muted-foreground">
                          {signal.confidence}% · {signal.source ?? "unknown source"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                        <p className="text-[11px] text-muted-foreground">
                          {item.owner ?? "unassigned"} · {item.status}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            {incident.customerStatus ? (
              <section className="rounded-xl border border-border bg-muted/40 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

interface RecheckResult {
  verdict: keyof typeof VERDICT_STYLES;
  summaryLine: string;
  impactWindow: { start: string; end: string | null; minutes: number | null } | null;
  findings: Array<{ tone: "good" | "warn" | "bad"; title: string; detail: string }>;
}

function RecheckPanel({ analysis }: { analysis: RecheckResult }) {
  const style = VERDICT_STYLES[analysis.verdict] ?? VERDICT_STYLES["no-suspect"];
  return (
    <section className={`mt-4 rounded-xl border p-5 ${style.box}`} aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}
        >
          {style.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Re-check · one action shared by the UI and the agent
        </span>
      </div>

      <p className="mt-3 text-base font-medium leading-snug">{analysis.summaryLine}</p>

      {analysis.impactWindow ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Impact window: {fmtTime(analysis.impactWindow.start)}
          {analysis.impactWindow.end ? ` → ${fmtTime(analysis.impactWindow.end)}` : ""}
          {analysis.impactWindow.minutes !== null
            ? ` (${analysis.impactWindow.minutes} min)`
            : ""}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {analysis.findings.map((finding, index) => (
          <li key={index} className="flex items-start gap-2">
            <span
              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                finding.tone === "bad"
                  ? "bg-red-500"
                  : finding.tone === "good"
                    ? "bg-emerald-500"
                    : "bg-amber-500"
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{finding.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{finding.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
