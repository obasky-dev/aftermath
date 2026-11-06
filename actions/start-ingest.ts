import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { startIngestRun } from "../server/lib/ingest.js";

export default defineAction({
  description:
    "Start a durable ingest run: turn a pasted bundle into timeline events, recompute the analysis and build the summaries. Returns a run id immediately; poll get-ingest-run for stage and progress.",
  schema: z.object({
    incidentId: z.string().describe("Incident id from list-incidents"),
    bundle: z
      .string()
      .min(1)
      .describe("One timed event per line, as in the import pack format"),
  }),
  outputSchema: z.object({
    runId: z.string(),
  }),
  run: async ({ incidentId, bundle }, ctx) => {
    const runId = await startIngestRun(incidentId, bundle, {
      userEmail: ctx?.userEmail,
      orgId: ctx?.orgId,
    });
    return { runId };
  },
});
