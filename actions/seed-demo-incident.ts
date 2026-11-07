import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId } from "../server/lib/incidents.js";

const TITLE = "Checkout API 5xx spike";
const STARTED_AT = "2026-11-04T13:40:00.000Z";
const RESOLVED_AT = "2026-11-04T14:23:00.000Z";

const seedEvents = [
  {
    at: "2026-11-04T13:40:00.000Z",
    kind: "deploy",
    title: "r-482 deploy",
    detail: "Build created by the deploy pipeline; not yet promoted to production.",
    source: "Vercel deployments",
    confidence: 45,
    isRootCause: true,
    eventStatus: "confirmed",
    editedBy: "agent",
  },
  {
    at: "2026-11-04T13:55:00.000Z",
    kind: "alert",
    title: "Cache-miss alert (noisy)",
    detail: "Cache hit rate dipped for 90 seconds; dismissed on the bridge as noise.",
    source: "Sentry",
    confidence: 30,
    isRootCause: false,
    eventStatus: "red_herring",
    editedBy: "human",
  },
  {
    at: "2026-11-04T14:00:00.000Z",
    kind: "log",
    title: "Database replica failover",
    detail: "Eight-second failover blip on the primary replica.",
    source: "Supabase",
    confidence: 80,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "agent",
  },
  {
    at: "2026-11-04T14:02:00.000Z",
    kind: "chat",
    title: "promoting r-482 now",
    detail: "#incident-checkout: promoting r-482 to production now.",
    source: "Slack #incident-checkout",
    confidence: 95,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "human",
  },
  {
    at: "2026-11-04T14:05:00.000Z",
    kind: "error",
    title: "Error rate 0.2% → 18% sustained",
    detail: "5xx on POST /checkout/confirm; sustained above threshold.",
    source: "Sentry",
    confidence: 96,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "agent",
  },
  {
    at: "2026-11-04T14:06:00.000Z",
    kind: "alert",
    title: "On-call paged",
    detail: "PagerDuty incident opened for checkout-api.",
    source: "PagerDuty",
    confidence: 99,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "agent",
  },
  {
    at: "2026-11-04T14:09:00.000Z",
    kind: "action",
    title: "Acknowledged by on-call",
    detail: "Incident commander assigned; bridge opened.",
    source: "PagerDuty",
    confidence: 99,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "human",
  },
  {
    at: "2026-11-04T14:10:00.000Z",
    kind: "log",
    title: "DB connection errors stay flat at 0.2%",
    detail: "The replica failover did not raise database connection errors.",
    source: "Datadog",
    confidence: 88,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "agent",
  },
  {
    at: "2026-11-04T14:14:00.000Z",
    kind: "action",
    title: "Rollback decided",
    detail: "Bridge agrees to roll back r-482.",
    source: "Slack #incident-checkout",
    confidence: 95,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "human",
  },
  {
    at: "2026-11-04T14:19:00.000Z",
    kind: "action",
    title: "Rollback complete",
    detail: "r-482 rolled back to r-481.",
    source: "Vercel deployments",
    confidence: 99,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "human",
  },
  {
    at: "2026-11-04T14:23:00.000Z",
    kind: "log",
    title: "Error rate back to 0.2%",
    detail: "Recovery sustained for five minutes.",
    source: "Sentry",
    confidence: 96,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "agent",
  },
];

const seedEvidence = [
  {
    eventTitle: "Release r-482 build started",
    label: "Build log",
    url: "https://vercel.example.com/checkout-api/deployments/r-482",
    snippet: "r-482 · config diff: DB pool max 40 → 4",
  },
  {
    eventTitle: "Database replica failover",
    label: "Supabase failover log",
    url: "https://supabase.example.com/project/checkout/logs",
    snippet: "8s failover at 14:00; DB connection errors unchanged",
  },
  {
    eventTitle: "Error rate 0.2% → 18% sustained",
    label: "Sentry issue",
    url: "https://sentry.example.com/issues/checkout-5xx",
    snippet: "5xx 18% from 14:05; checkout-api",
  },
  {
    eventTitle: "DB connection errors stay flat at 0.2%",
    label: "Datadog metric",
    url: "https://datadog.example.com/dashboard/db-connections",
    snippet: "connection errors 0.2% through the failover window",
  },
];

const seedActionItems = [
  {
    title: "Set a lower bound on the checkout DB pool size",
    owner: "platform",
    status: "open",
  },
  {
    title: "Add a config check to CI for pool-size changes",
    owner: "checkout",
    status: "open",
  },
  {
    title: "Alert when pool saturation exceeds 80% for 5 minutes",
    owner: "sre",
    status: "open",
  },
];

const seedPastIncidents = [
  {
    title: "Checkout API pool exhaustion after config change",
    summary:
      "DB connection pool max lowered from 40 to 4; 5xx rate hit 18% after promotion. Rollback restored traffic.",
    rootCauseTag: "pool-exhaustion",
  },
  {
    title: "Search API latency after index rebuild",
    summary:
      "Search p95 tripled after a reindex; a query planner regression caused full scans.",
    rootCauseTag: "index",
  },
  {
    title: "Payments timeout after provider SDK upgrade",
    summary:
      "Provider calls timed out after an SDK upgrade; the retry loop amplified load.",
    rootCauseTag: "dependency",
  },
  {
    title: "CDN 5xx after DNS change",
    summary:
      "Edge 5xx after a nameserver change; TTL propagation took 30 minutes.",
    rootCauseTag: "dns",
  },
  {
    title: "Login failures after auth config change",
    summary:
      "Session cookie domain changed; users were logged out and sign-in failed.",
    rootCauseTag: "config",
  },
  {
    title: "Queue backlog after worker deploy",
    summary:
      "Workers consumed an old message schema; the backlog grew for 40 minutes.",
    rootCauseTag: "deploy",
  },
  {
    title: "Image uploads failing at storage quota",
    summary:
      "Uploads returned 500 after the bucket quota was hit.",
    rootCauseTag: "quota",
  },
  {
    title: "API errors after certificate rotation",
    summary:
      "Clients rejected the new certificate chain after rotation.",
    rootCauseTag: "certificate",
  },
];

export default defineAction({
  description:
    "Seed the demo incident with a full timeline, evidence, hypotheses and action items. Idempotent: returns the existing incident if already seeded.",
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
    const owner = {
      ownerEmail: ctx?.userEmail ?? "",
      orgId: ctx?.orgId ?? null,
    };

    const [existingPast] = await db
      .select({ id: schema.pastIncidents.id })
      .from(schema.pastIncidents)
      .limit(1);
    if (!existingPast) {
      for (const past of seedPastIncidents) {
        await db.insert(schema.pastIncidents).values({
          id: newId("past"),
          title: past.title,
          summary: past.summary,
          rootCauseTag: past.rootCauseTag,
          ...owner,
        });
      }
    }

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
      severity: "sev1",
      status: "resolved",
      service: "checkout-api",
      source: "pagerduty",
      startedAt: STARTED_AT,
      resolvedAt: RESOLVED_AT,
      summary:
        "Checkout API 5xx spiked to 18% from 14:05 to 14:23. The r-482 deploy started at 13:40, but the incident channel says it was promoted at 14:02. A database replica failover at 14:00 is the early suspect.",
      customerStatus:
        "Checkout requests failed for some customers between 14:05 and 14:23 UTC. Service is restored.",
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
        eventStatus: event.eventStatus,
        editedBy: event.editedBy,
        originalAt: event.at,
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

    await db.insert(schema.incidentComments).values({
      id: newId("cmt"),
      incidentId,
      body: "r-482 lowered the DB pool max from 40 to 4; that matches the onset. The failover is 5 minutes early, but DB connection errors stayed flat.",
      author: ctx?.userEmail ?? "dev@local.test",
      ...owner,
    });

    return {
      incidentId,
      created: true,
      events: seedEvents.length,
      actionItems: seedActionItems.length,
    };
  },
});
