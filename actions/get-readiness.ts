import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { checkReadiness } from "../server/lib/ship.js";

export default defineAction({
  description:
    "Check whether the postmortem is ready to ship: impact stated, cause marked, owners set, detection and prevention items, blameless language, no unresolved competing theory.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    ready: z.boolean(),
    checks: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        ok: z.boolean(),
        detail: z.string(),
      }),
    ),
  }),
  run: async ({ id }) => checkReadiness(id),
});
