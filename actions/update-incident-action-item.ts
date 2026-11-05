import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Mark one incident action item open or done. Returns the updated status so the caller can confirm the write.",
  schema: z.object({
    id: z.string().describe("Action item id from get-incident"),
    status: z.enum(["open", "done"]).describe('New status: "open" or "done"'),
  }),
  http: { method: "PUT" },
  outputSchema: z.object({
    id: z.string(),
    status: z.string(),
  }),
  run: async ({ id, status }) => {
    const [row] = await getDb()
      .update(schema.incidentActionItems)
      .set({ status })
      .where(eq(schema.incidentActionItems.id, id))
      .returning({
        id: schema.incidentActionItems.id,
        status: schema.incidentActionItems.status,
      });
    if (!row) {
      fail("Action item not found.", { errorCode: "not_found", statusCode: 404 });
    }
    return row;
  },
});
