import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId } from "../server/lib/incidents.js";

const TITLE = "Checkout latency spike";
const STARTED_AT = "2026-11-02T14:00:00.000Z";
const RESOLVED_AT = "2026-11-02T14:31:00.000Z";

const seedEvents = [
  {
    at: "2026-11-02T14:00:00.000Z",
    kind: "alert",
    title: "Latency alert fires",
    detail: "p95 above 2s for five consecutive minutes on the checkout service.",
    source: "Alertmanager",
    confidence: 95,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:02:00.000Z",
    kind: "deploy",
    title: "Checkout service deploy v2.14.3",
    detail: "Twelve commits, including a new payment retry path.",
    source: "GitHub Actions run #4821",
    confidence: 98,
    isRootCause: true,
  },
  {
    at: "2026-11-02T14:03:00.000Z",
    kind: "log",
    title: "Error rate climbs from 0.2% to 8.4%",
    detail: "5xx responses on POST /checkout/confirm.",
    source: "Grafana",
    confidence: 92,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:05:00.000Z",
    kind: "error",
    title: "p99 latency reaches 4.2s",
    detail: "Payment provider calls time out after 3s.",
    source: "Datadog",
    confidence: 90,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:06:00.000Z",
    kind: "chat",
    title: "Customers report failed payments",
    detail: "Six reports in #support; two mention the spinner hanging.",
    source: "Slack #incident-checkout",
    confidence: 70,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:09:00.000Z",
    kind: "action",
    title: "On-call acknowledged",
    detail: "Incident commander assigned; bridge opened.",
    source: "PagerDuty",
    confidence: 99,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:12:00.000Z",
    kind: "log",
    title: "Database connection pool saturated",
    detail: "100 of 100 connections in use; wait queue at 240.",
    source: "RDS metrics",
    confidence: 85,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:18:00.000Z",
    kind: "note",
    title: "Hypothesis: database failover caused the timeouts",
    detail: "Raised on the bridge after the pool saturation alert.",
    source: "Incident call",
    confidence: 40,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:24:00.000Z",
    kind: "action",
    title: "Rolled back checkout to v2.14.2",
    detail: "Rollback completed in 4 minutes.",
    source: "GitHub Actions run #4824",
    confidence: 99,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:27:00.000Z",
    kind: "log",
    title: "Error rate returns to 0.3%",
    detail: "Latency back under 200ms at p95.",
    source: "Grafana",
    confidence: 94,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:31:00.000Z",
    kind: "action",
    title: "Incident resolved",
    detail: "Stable for 10 minutes after rollback.",
    source: "PagerDuty",
    confidence: 99,
    isRootCause: false,
  },
  {
    at: "2026-11-02T14:34:00.000Z",
    kind: "note",
    title: "Customer status update posted",
    detail: "Statuspage note published; support notified.",
    source: "Statuspage",
    confidence: 88,
    isRootCause: false,
  },
];

const seedEvidence = [
  {
    eventTitle: "Checkout service deploy v2.14.3",
    label: "Deploy run",
    url: "https://github.com/example/checkout/actions/runs/4821",
    snippet: "v2.14.3 · 12 commits · deployed by ci-bot",
  },
  {
    eventTitle: "Error rate climbs from 0.2% to 8.4%",
    label: "Grafana panel",
    url: "https://grafana.example.com/d/checkout/errors",
    snippet: "5xx rate 8.4% at 14:03 UTC",
  },
  {
    eventTitle: "Database connection pool saturated",
    label: "RDS metric",
    url: "https://console.aws.amazon.com/rds",
    snippet: "DatabaseConnections = 100 (max 100)",
  },
];

const seedActionItems = [
  {
    title: "Add a deploy-time guard on payment provider timeout",
    owner: "payments-team",
    status: "open",
  },
  {
    title: "Alert when the DB connection pool exceeds 80%",
    owner: "platform",
    status: "open",
  },
  {
    title: "Write the checkout retry runbook",
    owner: "on-call",
    status: "open",
  },
];

export default defineAction({
  description:
    "Seed one realistic demo incident with a full timeline, evidence and action items. Idempotent: returns the existing incident if already seeded.",
  schema: z.object({}),
  http: { method: "POST" },
  agentTool: false,
  outputSchema: z.object({
    incidentId: z.string(),
    created: z.boolean(),
    events: z.number(),
    actionItems: z.number(),
  }),
  run: async (_args, ctx) => {
    const db = getDb();
    const [existing] = await db
      .select({ id: schema.incidents.id })
      .from(schema.incidents)
      .where(eq(schema.incidents.title, TITLE))
      .limit(1);
    if (existing) {
      return {
        incidentId: existing.id,
        created: false,
        events: seedEvents.length,
        actionItems: seedActionItems.length,
      };
    }

    const incidentId = newId("inc");
    const owner = {
      ownerEmail: ctx?.userEmail ?? "",
      orgId: ctx?.orgId ?? null,
    };

    await db.insert(schema.incidents).values({
      id: incidentId,
      title: TITLE,
      severity: "sev2",
      status: "resolved",
      startedAt: STARTED_AT,
      resolvedAt: RESOLVED_AT,
      summary:
        "Checkout latency spiked for 31 minutes immediately after deploy v2.14.3. A rollback restored normal latency. The deploy is the current suspect; the database-failover theory is unconfirmed.",
      customerStatus:
        "Some customers saw failed payments between 14:00 and 14:31 UTC. Service is restored.",
      ...owner,
    });

    const eventIdByTitle = new Map<string, string>();
    for (const event of seedEvents) {
      const id = newId("evt");
      eventIdByTitle.set(event.title, id);
      await db.insert(schema.incidentEvents).values({
        id,
        incidentId,
        at: event.at,
        kind: event.kind,
        title: event.title,
        detail: event.detail,
        source: event.source,
        confidence: event.confidence,
        isRootCause: event.isRootCause,
        ...owner,
      });
    }

    for (const evidence of seedEvidence) {
      const eventId = eventIdByTitle.get(evidence.eventTitle);
      if (!eventId) continue;
      await db.insert(schema.incidentEvidence).values({
        id: newId("evd"),
        eventId,
        label: evidence.label,
        url: evidence.url,
        snippet: evidence.snippet,
        ...owner,
      });
    }

    for (const item of seedActionItems) {
      await db.insert(schema.incidentActionItems).values({
        id: newId("act"),
        incidentId,
        title: item.title,
        owner: item.owner,
        status: item.status,
        ...owner,
      });
    }

    return {
      incidentId,
      created: true,
      events: seedEvents.length,
      actionItems: seedActionItems.length,
    };
  },
});
