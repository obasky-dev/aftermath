import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { toIso } from "../server/lib/incidents.js";

export default defineAction({
  description:
    "Update one timeline event on an incident. Send only the fields that change; moving an event's time is how a human corrects the timeline.",
  schema: z.object({
    id: z.string().describe("Event id from get-incident"),
    at: z
      .string()
      .optional()
      .describe("New ISO 8601 time with UTC offset"),
    title: z.string().min(1).optional().describe("New event title"),
    detail: z.string().optional().describe("New event detail"),
    confidence: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("Confidence 0-100"),
    isRootCause: z
      .boolean()
      .optional()
      .describe("Mark this event as the root cause"),
  }),
  http: { method: "PUT" },
  outputSchema: z.object({
    id: z.string(),
    at: z.string(),
    title: z.string(),
    confidence: z.number(),
    isRootCause: z.boolean(),
  }),
  run: async (args) => {
    const { incidentEvents } = schema;
    const patch: Record<string, unknown> = {};
    if (args.at !== undefined) patch.at = toIso(args.at, "at");
    if (args.title !== undefined) patch.title = args.title;
    if (args.detail !== undefined) patch.detail = args.detail;
    if (args.confidence !== undefined) patch.confidence = args.confidence;
    if (args.isRootCause !== undefined) patch.isRootCause = args.isRootCause;
    if (Object.keys(patch).length === 0) {
      fail("Send at least one field to update.", {
        errorCode: "empty_patch",
      });
    }

    const [row] = await getDb()
      .update(incidentEvents)
      .set(patch)
      .where(eq(incidentEvents.id, args.id))
      .returning({
        id: incidentEvents.id,
        at: incidentEvents.at,
        title: incidentEvents.title,
        confidence: incidentEvents.confidence,
        isRootCause: incidentEvents.isRootCause,
      });
    if (!row) {
      fail("Event not found.", { errorCode: "not_found", statusCode: 404 });
    }
    return row;
  },
});
