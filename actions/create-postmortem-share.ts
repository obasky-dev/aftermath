import { randomBytes } from "node:crypto";

import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Create (or return) the public read-only share token for an incident's postmortem. Hidden from the agent: only the owner should publish a link.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  agentTool: false,
  outputSchema: z.object({
    token: z.string(),
    path: z.string(),
  }),
  run: async ({ id }) => {
    const [incident] = await getDb()
      .select({ id: schema.incidents.id, shareToken: schema.incidents.shareToken })
      .from(schema.incidents)
      .where(eq(schema.incidents.id, id))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    let token = incident.shareToken;
    if (!token) {
      token = randomBytes(18).toString("base64url");
      await getDb()
        .update(schema.incidents)
        .set({ shareToken: token })
        .where(eq(schema.incidents.id, id));
    }

    return { token, path: `/share/${token}` };
  },
});
