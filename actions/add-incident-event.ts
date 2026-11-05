import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId, toIso } from "../server/lib/incidents.js";

const KINDS = ["deploy", "alert", "error", "log", "chat", "action", "note"] as const;

export default defineAction({
  description:
    "Add one event to an incident's timeline. Use this while building a timeline from a pasted pack or a conversation. The time is ISO 8601 with a UTC offset and is stored as the event's original time.",
  schema: z.object({
    incidentId: z.string().describe("Incident id from list-incidents or create-incident"),
    at: z.string().describe("When it happened, ISO 8601 with a UTC offset"),
    title: z.string().min(1).describe("Short event title"),
    kind: z
      .enum(KINDS)
      .default("note")
      .describe('Event type: deploy, alert, error, log, chat, action or note; defaults to "note"'),
    detail: z.string().optional().describe("One sentence of detail"),
    source: z.string().optional().describe("Where the evidence comes from, e.g. Grafana"),
    confidence: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .default(70)
      .describe("Confidence 0-100; defaults to 70"),
    isRootCause: z
      .boolean()
      .default(false)
      .describe("Mark this event as the suspected cause; defaults to false"),
  }),
  outputSchema: z.object({
    id: z.string(),
    incidentId: z.string(),
    at: z.string(),
    title: z.string(),
    kind: z.string(),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "incidents",
      to: `/incidents/${encodeURIComponent(result.incidentId)}`,
      params: { id: result.incidentId },
    }),
    label: "Open incident",
  }),
  run: async (args, ctx) => {
    const { incidents, incidentEvents } = schema;
    const [incident] = await getDb()
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, args.incidentId))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const at = toIso(args.at, "at");
    const event = {
      id: newId("evt"),
      incidentId: args.incidentId,
      at,
      kind: args.kind,
      title: args.title,
      detail: args.detail ?? null,
      source: args.source ?? null,
      confidence: args.confidence,
      isRootCause: args.isRootCause,
      originalAt: at,
      ownerEmail: ctx?.userEmail ?? "",
      orgId: ctx?.orgId ?? null,
    };
    await getDb().insert(incidentEvents).values(event);
    return {
      id: event.id,
      incidentId: event.incidentId,
      at: event.at,
      title: event.title,
      kind: event.kind,
    };
  },
});
