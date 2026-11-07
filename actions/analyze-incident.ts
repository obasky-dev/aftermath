import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { analysisOutput, analyzeIncident } from "../server/lib/analysis.js";

export default defineAction({
  description:
    "Re-check an incident timeline. Compares the suspected cause with the first failure and returns a verdict (consistent, weak, contradicted), the impact window, and the nearest coincident event. Read-only; call it after any event's time changes. Use mode \"original\" to compare against the times before corrections.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
    mode: z
      .enum(["current", "original"])
      .default("current")
      .describe(
        'Which timeline to analyze: "current" after corrections, or "original" before corrections; defaults to "current"',
      ),
  }),
  http: { method: "GET" },
  readOnly: true,
  chatUI: { renderer: "aftermath.analysis-card", title: "Analysis" },
  outputSchema: analysisOutput,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "incidents",
      to: `/incidents/${encodeURIComponent(args.id)}`,
      params: { id: args.id },
    }),
    label: "Open incident",
  }),
  run: async ({ id, mode }) => analyzeIncident(id, mode),
});
