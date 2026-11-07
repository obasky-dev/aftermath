import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { denyInPublicDemo } from "../server/lib/public-demo.js";

export default defineAction({
  description:
    "Delete one timeline event and its evidence. Hidden from the agent: destructive timeline edits belong to the owner.",
  schema: z.object({
    id: z.string().describe("Event id from get-incident"),
  }),
  http: { method: "DELETE" },
  agentTool: false,
  authorize: denyInPublicDemo,
  outputSchema: z.object({
    id: z.string(),
    deleted: z.boolean(),
  }),
  run: async ({ id }) => {
    const { incidentEvents, incidentEvidence } = schema;
    const [event] = await getDb()
      .select({ id: incidentEvents.id })
      .from(incidentEvents)
      .where(eq(incidentEvents.id, id))
      .limit(1);
    if (!event) {
      fail("Event not found.", { errorCode: "not_found", statusCode: 404 });
    }
    await getDb().delete(incidentEvidence).where(eq(incidentEvidence.eventId, id));
    await getDb().delete(incidentEvents).where(eq(incidentEvents.id, id));
    return { id, deleted: true };
  },
});
