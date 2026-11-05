import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconArrowRight, IconArrowUpRight, IconCircleCheck, IconAlertTriangle } from "@tabler/icons-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

const SEVERITY_STYLES: Record<string, string> = {
  sev1: "border-red-800/30 bg-red-800/10 text-red-800 dark:text-red-400",
  sev2: "border-amber-700/30 bg-amber-700/10 text-amber-800 dark:text-amber-400",
  sev3: "border-sky-700/30 bg-sky-700/10 text-sky-800 dark:text-sky-400",
};

function fmt(iso: string) {
  return `${iso.slice(11, 16)} UTC`;
}

export function meta() {
  return [{ title: "Aftermath — Incident postmortems that update" }];
}

export default function IncidentsIndex() {
  const { data, isLoading } = useActionQuery("list-incidents", { limit: 25 });
  const seed = useActionMutation("seed-demo-incident");
  const incidents = data?.incidents ?? [];
  const demo =
    incidents.find((incident) => incident.title === "Checkout latency spike") ??
    incidents[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
          Aftermath · Incident review
        </p>

        <h1 className="font-display mt-4 max-w-3xl text-[3.25rem] leading-[0.98] tracking-[-0.03em] sm:text-7xl">
          Move one event.
          <br />
          Watch the conclusion change.
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          A postmortem is a story about cause and effect. When the timeline is wrong,
          the conclusion is wrong. Correct the record — Aftermath recomputes the
          verdict, and the agent explains what changed.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {demo ? (
            <Button size="lg" asChild>
              <Link to={`/incidents/${demo.id}`}>
                Open the correction demo
                <IconArrowRight className="size-4" strokeWidth={2} />
              </Link>
            </Button>
          ) : (
            <Button size="lg" onClick={() => seed.mutate({})} disabled={seed.isPending}>
              {seed.isPending ? "Loading…" : "Load demo incident"}
            </Button>
          )}
          <Button size="lg" variant="outline" asChild>
            <Link to="/incidents/new">Import a pack</Link>
          </Button>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            15 seconds · no sign-up
          </span>
        </div>

        <div className="mt-14 grid gap-6 border-y border-border py-6 sm:grid-cols-3">
          <Step
            number="01"
            title="Read the record"
            body="Every event carries a source, a timestamp and a confidence score."
          />
          <Step
            number="02"
            title="Move what's wrong"
            body="Drag the event to its real time. The correction saves through the action the agent calls."
          />
          <Step
            number="03"
            title="Watch the conclusion change"
            body="The verdict and the postmortem are recomputed from the corrected timeline — not rewritten by hand."
          />
        </div>

        <section className="mt-14" aria-label="Incidents">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Incidents
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">
              {incidents.length} {incidents.length === 1 ? "incident" : "incidents"}
            </span>
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-md border border-border bg-muted/40"
                />
              ))}
            </div>
          ) : incidents.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border p-10 text-center">
              <IconAlertTriangle
                className="mx-auto size-7 text-muted-foreground"
                strokeWidth={1.5}
              />
              <p className="mt-4 text-base font-medium">No incidents yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Load the seeded incident to see the correction.
              </p>
              <Button
                className="mt-5"
                onClick={() => seed.mutate({})}
                disabled={seed.isPending}
              >
                {seed.isPending ? "Loading…" : "Load demo incident"}
              </Button>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="group flex items-start justify-between gap-6 py-5 transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
                            SEVERITY_STYLES[incident.severity] ?? SEVERITY_STYLES.sev3
                          }`}
                        >
                          {incident.severity}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          {incident.status === "resolved" ? (
                            <IconCircleCheck className="size-3.5" strokeWidth={2} />
                          ) : (
                            <IconAlertTriangle className="size-3.5" strokeWidth={2} />
                          )}
                          {incident.status}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {incident.startedAt.slice(0, 10)} · {fmt(incident.startedAt)}
                        </span>
                      </div>
                      <h3 className="font-display mt-1.5 text-2xl tracking-tight">
                        {incident.title}
                      </h3>
                      {incident.summary ? (
                        <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                          {incident.summary}
                        </p>
                      ) : null}
                    </div>
                    <IconArrowUpRight
                      className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      strokeWidth={1.8}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>One action. UI, agent, HTTP and CLI.</span>
          <span>Built with Agent-Native</span>
        </footer>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.2em] text-primary">{number}</p>
      <h2 className="font-display mt-2 text-xl tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
