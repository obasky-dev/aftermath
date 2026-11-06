import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Delete one discussion comment. Hidden from the agent; used by the app's cleanup paths.",
  schema: z.object({
    id: z.string().describe("Comment id from list-incident-comments"),
  }),
  http: { method: "DELETE" },
  agentTool: false,
  outputSchema: z.object({
    id: z.string(),
    deleted: z.boolean(),
  }),
  run: async ({ id }) => {
    const [row] = await getDb()
      .delete(schema.incidentComments)
      .where(eq(schema.incidentComments.id, id))
      .returning({ id: schema.incidentComments.id });
    if (!row) {
      fail("Comment not found.", { errorCode: "not_found", statusCode: 404 });
    }
    return { id: row.id, deleted: true };
  },
});
