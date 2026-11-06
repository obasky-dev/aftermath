import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { createIncidentFromAlert } from "../server/lib/create-incident.js";

export default defineAction({
  description:
    "Create an incident from an incoming alert. Stores the alert as the first timeline event. Use this when a monitoring webhook or a person reports an alert.",
  schema: z.object({
    title: z.string().min(1).describe("Alert title, e.g. 'p95 latency above 2s'"),
    severity: z
      .enum(["sev1", "sev2", "sev3"])
      .default("sev2")
      .describe('Severity: "sev1", "sev2" or "sev3"; defaults to "sev2"'),
    startedAt: z
      .string()
      .optional()
      .describe("ISO 8601 time with a UTC offset; defaults to now"),
    source: z
      .string()
      .default("Alertmanager")
      .describe("Where the alert came from; defaults to Alertmanager"),
    detail: z.string().optional().describe("One sentence of alert detail"),
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
  run: async (args, ctx) =>
    createIncidentFromAlert(args, {
      userEmail: ctx?.userEmail,
      orgId: ctx?.orgId,
    }),
});
