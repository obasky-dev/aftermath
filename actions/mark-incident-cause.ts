import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Mark one timeline event as the suspected cause of an incident, clearing any previous suspect. Use it after importing an incident, before asking for a re-check.",
  schema: z.object({
    incidentId: z.string().describe("Incident id from list-incidents"),
    eventId: z.string().describe("Event id from get-incident"),
  }),
  http: { method: "PUT" },
  outputSchema: z.object({
    incidentId: z.string(),
    eventId: z.string(),
  }),
  run: async ({ incidentId, eventId }) => {
    const { incidentEvents } = schema;
    const db = getDb();
    const [event] = await db
      .select({ id: incidentEvents.id })
      .from(incidentEvents)
      .where(eq(incidentEvents.id, eventId))
      .limit(1);
    if (!event) {
      fail("Event not found.", { errorCode: "not_found", statusCode: 404 });
    }

    await db
      .update(incidentEvents)
      .set({ isRootCause: false })
      .where(eq(incidentEvents.incidentId, incidentId));
    await db
      .update(incidentEvents)
      .set({ isRootCause: true })
      .where(eq(incidentEvents.id, eventId));

    return { incidentId, eventId };
  },
});
