import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Read one incident with its full timeline of events and its action items. Use the id returned by list-incidents.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    incident: z.object({
      id: z.string(),
      title: z.string(),
      severity: z.string(),
      status: z.string(),
      startedAt: z.string(),
      resolvedAt: z.string().nullable(),
      summary: z.string().nullable(),
      customerStatus: z.string().nullable(),
    }),
    events: z.array(
      z.object({
        id: z.string(),
        at: z.string(),
        kind: z.string(),
        title: z.string(),
        detail: z.string().nullable(),
        source: z.string().nullable(),
        confidence: z.number(),
        isRootCause: z.boolean(),
        originalAt: z.string().nullable(),
      }),
    ),
    actionItems: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        owner: z.string().nullable(),
        status: z.string(),
      }),
    ),
  }),
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "incidents",
      to: `/incidents/${encodeURIComponent(args.id)}`,
      params: { id: args.id },
    }),
    label: "Open incident",
  }),
  run: async ({ id }) => {
    const { incidents, incidentEvents, incidentActionItems } = schema;
    const [incident] = await getDb()
      .select()
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const events = await getDb()
      .select({
        id: incidentEvents.id,
        at: incidentEvents.at,
        kind: incidentEvents.kind,
        title: incidentEvents.title,
        detail: incidentEvents.detail,
        source: incidentEvents.source,
        confidence: incidentEvents.confidence,
        isRootCause: incidentEvents.isRootCause,
        originalAt: incidentEvents.originalAt,
      })
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, id))
      .orderBy(asc(incidentEvents.at));

    const actionItems = await getDb()
      .select({
        id: incidentActionItems.id,
        title: incidentActionItems.title,
        owner: incidentActionItems.owner,
        status: incidentActionItems.status,
      })
      .from(incidentActionItems)
      .where(eq(incidentActionItems.incidentId, id))
      .orderBy(asc(incidentActionItems.createdAt));

    return {
      incident: {
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
        summary: incident.summary,
        customerStatus: incident.customerStatus,
      },
      events,
      actionItems,
    };
  },
});
