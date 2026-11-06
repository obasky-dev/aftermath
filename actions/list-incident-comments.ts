import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List the discussion comments on an incident, oldest first.",
  schema: z.object({
    incidentId: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    comments: z.array(
      z.object({
        id: z.string(),
        body: z.string(),
        author: z.string(),
        eventId: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
  }),
  run: async ({ incidentId }) => {
    const rows = await getDb()
      .select({
        id: schema.incidentComments.id,
        body: schema.incidentComments.body,
        author: schema.incidentComments.author,
        eventId: schema.incidentComments.eventId,
        createdAt: schema.incidentComments.createdAt,
      })
      .from(schema.incidentComments)
      .where(eq(schema.incidentComments.incidentId, incidentId))
      .orderBy(asc(schema.incidentComments.createdAt));
    return { comments: rows };
  },
});
