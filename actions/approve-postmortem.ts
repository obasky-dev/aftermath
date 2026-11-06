import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ensureArtifacts } from "../server/lib/ship.js";

export default defineAction({
  description:
    "Approve the current postmortem. Owner-only: this runs only for a signed-in person in the app UI, never for the agent, MCP, raw HTTP or the CLI.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  uiOnly: true,
  agentTool: false,
  outputSchema: z.object({
    id: z.string(),
    approvedAt: z.string(),
    artifacts: z.array(
      z.object({
        id: z.string(),
        provider: z.string(),
        kind: z.string(),
        title: z.string(),
        status: z.string(),
        mode: z.string(),
      }),
    ),
  }),
  run: async ({ id }, ctx) => {
    const approvedAt = new Date().toISOString();
    const [row] = await getDb()
      .update(schema.incidents)
      .set({ postmortemApprovedAt: approvedAt, updatedAt: approvedAt })
      .where(eq(schema.incidents.id, id))
      .returning({ id: schema.incidents.id, approvedAt: schema.incidents.postmortemApprovedAt });
    if (!row || !row.approvedAt) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const artifacts = await ensureArtifacts(id, {
      userEmail: ctx?.userEmail,
      orgId: ctx?.orgId,
    });

    return {
      id: row.id,
      approvedAt: row.approvedAt,
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        provider: artifact.provider,
        kind: artifact.kind,
        title: artifact.title,
        status: artifact.status,
        mode: artifact.mode,
      })),
    };
  },
});
