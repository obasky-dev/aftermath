import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Delete an incident and its timeline, evidence and action items. Intended for cleaning up test imports; hidden from the agent.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "DELETE" },
  agentTool: false,
  outputSchema: z.object({
    id: z.string(),
    deleted: z.boolean(),
  }),
  run: async ({ id }) => {
    const { incidents, incidentEvents, incidentEvidence, incidentActionItems } = schema;
    const db = getDb();
    const [incident] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const events = await db
      .select({ id: incidentEvents.id })
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, id));
    for (const event of events) {
      await db.delete(incidentEvidence).where(eq(incidentEvidence.eventId, event.id));
    }
    await db.delete(incidentEvents).where(eq(incidentEvents.incidentId, id));
    await db
      .delete(incidentActionItems)
      .where(eq(incidentActionItems.incidentId, id));
    await db.delete(incidents).where(eq(incidents.id, id));

    return { id, deleted: true };
  },
});
