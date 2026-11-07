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
      service: z.string().nullable(),
      source: z.string().nullable(),
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
        eventStatus: z.string(),
        editedBy: z.string(),
        originalAt: z.string().nullable(),
        evidence: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            url: z.string().nullable(),
            snippet: z.string().nullable(),
          }),
        ),
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
    const { incidents, incidentEvents, incidentActionItems, incidentEvidence: evidence } =
      schema;
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
        eventStatus: incidentEvents.eventStatus,
        editedBy: incidentEvents.editedBy,
        originalAt: incidentEvents.originalAt,
      })
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, id))
      .orderBy(asc(incidentEvents.at));

    const evidenceRows = await getDb()
      .select({
        id: evidence.id,
        eventId: evidence.eventId,
        label: evidence.label,
        url: evidence.url,
        snippet: evidence.snippet,
      })
      .from(evidence)
      .innerJoin(incidentEvents, eq(evidence.eventId, incidentEvents.id))
      .where(eq(incidentEvents.incidentId, id));

    const evidenceByEvent = new Map<string, typeof evidenceRows>();
    for (const row of evidenceRows) {
      const list = evidenceByEvent.get(row.eventId) ?? [];
      list.push(row);
      evidenceByEvent.set(row.eventId, list);
    }

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
        service: incident.service,
        source: incident.source,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
        summary: incident.summary,
        customerStatus: incident.customerStatus,
      },
      events: events.map((event) => ({
        ...event,
        evidence: (evidenceByEvent.get(event.id) ?? []).map((row) => ({
          id: row.id,
          label: row.label,
          url: row.url,
          snippet: row.snippet,
        })),
      })),
      actionItems,
    };
  },
});
