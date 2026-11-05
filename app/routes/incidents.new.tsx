import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation } from "@agent-native/core/client/hooks";
import { IconArrowLeft, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";

const SAMPLE_PACK = `2026-11-02 14:00 [alert] p95 latency above 2s for five minutes | Alertmanager
2026-11-02 14:02 [deploy] checkout v2.14.3 to production | GitHub Actions #4821
14:03 [error] 5xx rate climbs from 0.2% to 8.4% | Grafana
14:05 [error] p99 latency reaches 4.2s | Datadog
14:09 [chat] six customers report failed payments | Slack #support
14:12 [log] database connection pool saturated (100/100) | RDS metrics
14:18 [note] someone on the bridge blames the database failover | Incident call
14:24 [action] rolled back checkout to v2.14.2 | GitHub Actions #4824
14:27 [log] error rate returns to 0.3% | Grafana
14:31 [action] incident resolved | PagerDuty`;

export function meta() {
  return [{ title: "Import an incident — Aftermath" }];
}

export default function NewIncidentRoute() {
  const navigate = useNavigate();
  const create = useActionMutation("create-incident-from-pack");
  const [pack, setPack] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function build() {
    setError(null);
    create.mutate(
      {
        pack,
        ...(date ? { date } : {}),
      },
      {
        onSuccess: (result) => {
          if (result?.id) navigate(`/incidents/${result.id}`);
        },
        onError: (cause) => setError(cause.message),
      },
    );
  }

  function askAgent() {
    setError(null);
    try {
      sendToAgentChat({
        message: `Create an incident from this operational pack using create-incident-from-pack. Keep every time and source exactly as written. After it is created, tell me which event you would mark as the suspected cause and why.\n\n${pack}`,
        submit: true,
        openSidebar: true,
      });
    } catch {
      setError("The agent surface is unavailable. Build the timeline directly instead.");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconArrowLeft className="size-3.5" strokeWidth={2} />
          All incidents
        </Link>

        <h1 className="font-display mt-6 text-5xl leading-[1.02] tracking-[-0.02em]">
          Import an incident
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Paste what you actually have: alerts, deploys, log lines, chat. One event per line,
          with a time. Put the type in brackets and the source after a pipe. Aftermath turns it
          into a timeline you can correct — or hand the same pack to the agent and watch it
          build the timeline through the same action.
        </p>

        <div className="mt-8 rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="pack"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
            >
              Operational pack
            </label>
            <Button variant="ghost" size="sm" onClick={() => setPack(SAMPLE_PACK)}>
              Use the sample pack
            </Button>
          </div>
          <textarea
            id="pack"
            value={pack}
            onChange={(event) => setPack(event.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={"14:03 [error] 5xx rate climbs to 8.4% | Grafana\n14:02 [deploy] checkout v2.14.3 | GitHub Actions"}
            className="mt-3 w-full resize-y rounded-sm border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/60"
          />

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-muted-foreground">
              Fallback date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 block rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary/60"
              />
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button onClick={build} disabled={create.isPending || pack.trim().length === 0}>
                {create.isPending ? "Building…" : "Build timeline"}
              </Button>
              <Button
                variant="outline"
                onClick={askAgent}
                disabled={pack.trim().length === 0}
              >
                <IconSparkles className="size-4" strokeWidth={1.8} />
                Let the agent build it
              </Button>
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
          <p>
            <span className="font-medium text-foreground">Time first.</span> A line without a
            time is skipped, not guessed.
          </p>
          <p>
            <span className="font-medium text-foreground">Kind in brackets.</span> deploy, alert,
            error, log, chat, action or note. Without one, it is inferred.
          </p>
          <p>
            <span className="font-medium text-foreground">Source after a pipe.</span> Every
            event keeps the evidence it came from.
          </p>
        </div>
      </div>
    </div>
  );
}
