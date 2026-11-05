import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List incidents in the workspace, newest first. Returns id, title, severity, status, start time and summary.",
  schema: z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of incidents to return; defaults to 25"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    incidents: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        severity: z.string(),
        status: z.string(),
        startedAt: z.string(),
        summary: z.string().nullable(),
      }),
    ),
  }),
  link: () => ({
    url: buildDeepLink({ view: "incidents", to: "/incidents" }),
    label: "Open Incidents",
  }),
  run: async ({ limit }) => {
    const { incidents } = schema;
    const rows = await getDb()
      .select({
        id: incidents.id,
        title: incidents.title,
        severity: incidents.severity,
        status: incidents.status,
        startedAt: incidents.startedAt,
        summary: incidents.summary,
      })
      .from(incidents)
      .orderBy(desc(incidents.startedAt))
      .limit(limit);
    return { incidents: rows };
  },
});
