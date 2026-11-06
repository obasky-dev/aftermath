import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { lintBlame } from "../server/lib/ship.js";

export default defineAction({
  description:
    "Lint an incident's summary, comments and action items for blame language and return systemic rewrites. Read-only.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    findings: z.array(
      z.object({
        text: z.string(),
        suggestion: z.string(),
      }),
    ),
  }),
  run: async ({ id }) => {
    const { incidents, incidentComments, incidentActionItems } = schema;
    const [incident] = await getDb()
      .select({ summary: incidents.summary })
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!incident) return { findings: [] };

    const comments = await getDb()
      .select({ body: incidentComments.body })
      .from(incidentComments)
      .where(eq(incidentComments.incidentId, id))
      .orderBy(asc(incidentComments.createdAt));
    const actionItems = await getDb()
      .select({ title: incidentActionItems.title })
      .from(incidentActionItems)
      .where(eq(incidentActionItems.incidentId, id));

    const text = [
      incident.summary ?? "",
      ...comments.map((row) => row.body),
      ...actionItems.map((item) => item.title),
    ].join(" ");
    return { findings: lintBlame(text) };
  },
});
