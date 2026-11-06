import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId } from "../server/lib/incidents.js";

export default defineAction({
  description:
    "Add a discussion comment to an incident, optionally attached to one timeline event. Use it to record a decision, a question or a correction that is not itself an event.",
  schema: z.object({
    incidentId: z.string().describe("Incident id from list-incidents"),
    body: z.string().min(1).max(2000).describe("The comment text"),
    eventId: z
      .string()
      .optional()
      .describe("Optional event id to attach the comment to"),
  }),
  outputSchema: z.object({
    id: z.string(),
    author: z.string(),
    createdAt: z.string(),
  }),
  run: async ({ incidentId, body, eventId }, ctx) => {
    const [incident] = await getDb()
      .select({ id: schema.incidents.id })
      .from(schema.incidents)
      .where(eq(schema.incidents.id, incidentId))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const comment = {
      id: newId("cmt"),
      incidentId,
      eventId: eventId ?? null,
      body,
      author: ctx?.userEmail ?? "local",
      ownerEmail: ctx?.userEmail ?? "",
      orgId: ctx?.orgId ?? null,
    };
    await getDb().insert(schema.incidentComments).values(comment);
    return {
      id: comment.id,
      author: comment.author,
      createdAt: new Date().toISOString(),
    };
  },
});
