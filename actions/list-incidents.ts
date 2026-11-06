import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List incidents in the workspace, newest first. Optionally filter by a text search, severity or status.",
  schema: z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of incidents to return; defaults to 25"),
    search: z
      .string()
      .optional()
      .describe("Match this text against the title and summary"),
    severity: z
      .enum(["sev1", "sev2", "sev3"])
      .optional()
      .describe("Only incidents with this severity"),
    status: z
      .enum(["open", "resolved"])
      .optional()
      .describe("Only incidents with this status"),
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
  run: async ({ limit, search, severity, status }) => {
    const { incidents } = schema;
    const filters = [];
    if (search?.trim()) {
      const pattern = `%${search.trim()}%`;
      filters.push(
        or(ilike(incidents.title, pattern), ilike(incidents.summary, pattern)),
      );
    }
    if (severity) filters.push(eq(incidents.severity, severity));
    if (status) filters.push(eq(incidents.status, status));

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
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(incidents.startedAt))
      .limit(limit);
    return { incidents: rows };
  },
});
