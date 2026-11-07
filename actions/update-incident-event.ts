import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { updateIncidentEvent } from "../server/lib/incidents.js";

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
    eventStatus: z
      .enum(["confirmed", "red_herring", "unverified"])
      .optional()
      .describe("Resolution state once conflicting evidence has been reviewed"),
  }),
  http: { method: "PUT" },
  outputSchema: z.object({
    id: z.string(),
    at: z.string(),
    title: z.string(),
    confidence: z.number(),
    isRootCause: z.boolean(),
    eventStatus: z.string(),
  }),
  run: async (args) => updateIncidentEvent(args.id, args),
});
