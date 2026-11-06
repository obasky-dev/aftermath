import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { buildSummaries } from "../server/lib/ship.js";

export default defineAction({
  description:
    "Generate the same postmortem facts for three audiences: engineer, executive and customer. Read-only.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    engineer: z.string(),
    executive: z.string(),
    customer: z.string(),
  }),
  run: async ({ id }) => buildSummaries(id),
});
