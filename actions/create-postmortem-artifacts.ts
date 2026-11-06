import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ensureArtifacts } from "../server/lib/ship.js";

export default defineAction({
  description:
    "Create the draft artifacts for a postmortem (Linear issues, GitHub draft PR, Slack post, Statuspage draft, Notion export). Idempotent. Fixture-backed until the provider credentials are connected; each artifact is labelled mode=fixture. Hidden from the agent.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  agentTool: false,
  outputSchema: z.object({
    artifacts: z.array(
      z.object({
        id: z.string(),
        provider: z.string(),
        kind: z.string(),
        title: z.string(),
        url: z.string().nullable(),
        status: z.string(),
        mode: z.string(),
      }),
    ),
  }),
  run: async ({ id }, ctx) => {
    const rows = await ensureArtifacts(id, {
      userEmail: ctx?.userEmail,
      orgId: ctx?.orgId,
    });
    return {
      artifacts: rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        kind: row.kind,
        title: row.title,
        url: row.url,
        status: row.status,
        mode: row.mode,
      })),
    };
  },
});
