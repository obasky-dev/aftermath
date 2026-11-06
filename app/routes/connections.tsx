import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconPlugConnected,
  IconSearch,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

const CATEGORY_ORDER = [
  "hosting",
  "database",
  "dns",
  "monitoring",
  "code",
  "comms",
  "tickets",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  hosting: "Hosting & deploy",
  database: "Database",
  dns: "Domain, DNS & CDN",
  monitoring: "Monitoring & alerting",
  code: "Code & CI",
  comms: "Comms",
  tickets: "Tickets, docs & status",
};

function fmt(iso: string | null) {
  return iso ? `${iso.slice(11, 16)} UTC` : "—";
}

export function meta() {
  return [{ title: "Connections — Aftermath" }];
}

export default function ConnectionsRoute() {
  const integrations = useActionQuery("list-integrations", {});
  const deliveries = useActionQuery("list-integration-deliveries", {});
  const incidents = useActionQuery("list-incidents", { limit: 10 });
  const connect = useActionMutation("connect-integration");
  const disconnect = useActionMutation("disconnect-integration");
  const test = useActionMutation("test-integration");
  const send = useActionMutation("send-integration-fixture");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const providers = integrations.data?.providers ?? [];
  const coverage = integrations.data?.coverage ?? [];
  const rows = deliveries.data?.deliveries ?? [];
  const incident =
    (incidents.data?.incidents ?? []).find((row) => row.title.includes("Checkout API")) ??
    incidents.data?.incidents?.[0] ??
    null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return providers.filter((provider) => {
      if (category !== "all" && provider.category !== category) return false;
      if (!query) return true;
      return (
        provider.name.toLowerCase().includes(query) ||
        provider.value.toLowerCase().includes(query)
      );
    });
  }, [providers, search, category]);

  const grouped = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABEL[key] ?? key,
    providers: filtered.filter((provider) => provider.category === key),
  })).filter((group) => group.providers.length > 0);

  function refresh() {
    void integrations.refetch();
    void deliveries.refetch();
  }

  function run(
    provider: string,
    mutation: typeof connect | typeof test | typeof send | typeof disconnect,
    variables: Record<string, unknown>,
    success: string,
  ) {
    setBusy(provider);
    setMessage(null);
    (mutation.mutate as unknown as (
      input: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => void)(variables, {
        onSuccess: () => {
          setBusy(null);
          setMessage(success);
          refresh();
        },
        onError: (error: Error) => {
          setBusy(null);
          setMessage(error.message);
        },
      },
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Aftermath · Evidence
        </p>
        <h1 className="font-display mt-3 text-5xl leading-[1.02] tracking-[-0.02em]">
          Connections
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Read-only evidence sources for the timeline. Live where credentials exist;
          fixtures otherwise. Each card says which. Aftermath never writes to your
          providers except the approved ticket and status drafts.
        </p>

        <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-5">
          {coverage.map((segment) => (
            <div key={segment.key} className="bg-card px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                {segment.label}
              </p>
              <p
                className={`mt-1 flex items-center gap-1 text-sm ${
                  segment.connected
                    ? "text-emerald-800 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {segment.connected ? (
                  <IconCircleCheck className="size-3.5" strokeWidth={2} />
                ) : (
                  <IconAlertTriangle className="size-3.5" strokeWidth={2} />
                )}
                {segment.connected ? "Covered" : "Gap"}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {segment.providers.join(", ") || "No source connected"}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <IconSearch
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search providers"
              className="h-9 w-full rounded-sm border border-border bg-background pl-8 pr-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 rounded-sm border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary/60"
          >
            <option value="all">All categories</option>
            {CATEGORY_ORDER.map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </div>

        {message ? (
          <p className="mt-3 rounded-sm border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {message}
          </p>
        ) : null}

        <div className="mt-8 space-y-8">
          {grouped.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {group.label}
              </h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {group.providers.map((provider) => {
                  const connected = provider.status === "connected";
                  const isBusy = busy === provider.id;
                  return (
                    <article
                      key={provider.id}
                      className="rounded-md border border-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted font-mono text-[11px] uppercase text-muted-foreground">
                            {provider.name.slice(0, 2)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-medium">{provider.name}</h3>
                              <span
                                className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                                  connected
                                    ? "border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-400"
                                    : "border-border bg-muted text-muted-foreground"
                                }`}
                              >
                                {connected
                                  ? provider.mode === "live"
                                    ? "Connected (live)"
                                    : "Connected (fixture)"
                                  : "Not connected"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {provider.value}
                            </p>
                            <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                              Read-only ·{" "}
                              {connected
                                ? `last sync ${fmt(provider.lastChecked)}`
                                : "no credential"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {!connected ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              run(
                                provider.id,
                                connect,
                                { provider: provider.id },
                                `${provider.name} connected in fixture mode.`,
                              )
                            }
                            disabled={isBusy}
                          >
                            <IconPlugConnected className="size-4" strokeWidth={1.8} />
                            {isBusy ? "Connecting…" : "Connect (fixture)"}
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                run(
                                  provider.id,
                                  test,
                                  { provider: provider.id },
                                  `${provider.name} test recorded.`,
                                )
                              }
                              disabled={isBusy}
                            >
                              {isBusy ? "Testing…" : "Test"}
                            </Button>
                            {provider.inbound ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  run(
                                    provider.id,
                                    send,
                                    {
                                      provider: provider.id,
                                      incidentId: incident?.id,
                                    },
                                    `${provider.name} fixture event added to the timeline.`,
                                  )
                                }
                                disabled={isBusy || !incident}
                              >
                                {isBusy ? "Sending…" : "Send test event"}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                run(
                                  provider.id,
                                  disconnect,
                                  { provider: provider.id },
                                  `${provider.name} disconnected.`,
                                )
                              }
                              disabled={isBusy}
                            >
                              Disconnect
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-10" aria-label="Recent deliveries">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Recent deliveries
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">
              {rows.length} events
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No deliveries yet. Connect a provider and send a test event; every delivery is
              labelled live or fixture.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {rows.slice(0, 15).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {fmt(row.at)}
                  </span>
                  <span className="w-20 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {row.provider}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{row.event}</span>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
