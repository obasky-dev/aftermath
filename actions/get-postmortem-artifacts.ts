import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List the artifacts created from a postmortem: Linear issues, a GitHub draft PR, a Slack post, a Statuspage draft and a Notion export. Fixture-backed artifacts are labelled mode=fixture.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
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
  run: async ({ id }) => {
    const rows = await getDb()
      .select({
        id: schema.postmortemArtifacts.id,
        provider: schema.postmortemArtifacts.provider,
        kind: schema.postmortemArtifacts.kind,
        title: schema.postmortemArtifacts.title,
        url: schema.postmortemArtifacts.url,
        status: schema.postmortemArtifacts.status,
        mode: schema.postmortemArtifacts.mode,
      })
      .from(schema.postmortemArtifacts)
      .where(eq(schema.postmortemArtifacts.incidentId, id))
      .orderBy(asc(schema.postmortemArtifacts.createdAt));
    return { artifacts: rows };
  },
});
