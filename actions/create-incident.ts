import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId, toIso } from "../server/lib/incidents.js";

export default defineAction({
  description:
    "Create a new incident. Returns its id so you can add timeline events to it.",
  schema: z.object({
    title: z.string().min(1).describe('Short incident title, e.g. "Checkout latency spike"'),
    severity: z
      .enum(["sev1", "sev2", "sev3"])
      .default("sev2")
      .describe('Severity: "sev1", "sev2" or "sev3"; defaults to "sev2"'),
    startedAt: z
      .string()
      .optional()
      .describe("ISO 8601 start time with UTC offset; defaults to now"),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    severity: z.string(),
    startedAt: z.string(),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "incidents",
      to: `/incidents/${encodeURIComponent(result.id)}`,
      params: { id: result.id },
    }),
    label: `Open ${result.title}`,
  }),
  run: async (args, ctx) => {
    const startedAt = args.startedAt ? toIso(args.startedAt, "startedAt") : new Date().toISOString();
    const incident = {
      id: newId("inc"),
      title: args.title,
      severity: args.severity,
      status: "open" as const,
      startedAt,
      ownerEmail: ctx?.userEmail ?? "",
      orgId: ctx?.orgId ?? null,
    };
    await getDb().insert(schema.incidents).values(incident);
    return {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      startedAt: incident.startedAt,
    };
  },
});
