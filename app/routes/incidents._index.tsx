import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconAlertTriangle, IconArrowUpRight, IconCircleCheck } from "@tabler/icons-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

const SEVERITY_STYLES: Record<string, string> = {
  sev1: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  sev2: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sev3: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

function fmtTime(iso: string) {
  return `${iso.slice(11, 16)} UTC`;
}

export function meta() {
  return [{ title: "Incidents — Blameless" }];
}

export default function IncidentsIndex() {
  const { data, isLoading } = useActionQuery("list-incidents", { limit: 25 });
  const seed = useActionMutation("seed-demo-incident");
  const incidents = data?.incidents ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Blameless
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Incidents</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            A timeline your team can correct, and an agent that re-reasons from the
            correction.
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <IconAlertTriangle className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="mt-4 text-base font-medium">No incidents yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seed a realistic incident to explore the timeline.
            </p>
            <Button
              className="mt-5"
              disabled={seed.isPending}
              onClick={() => seed.mutate({})}
            >
              {seed.isPending ? "Seeding…" : "Load demo incident"}
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  to={`/incidents/${incident.id}`}
                  className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-4">
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
                      <h2 className="mt-2 truncate text-lg font-medium tracking-tight">
                        {incident.title}
                      </h2>
                      {incident.summary ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {incident.summary}
                        </p>
                      ) : null}
                    </div>
                    <IconArrowUpRight
                      className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      strokeWidth={1.8}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
