import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listDeliveries } from "../server/lib/integrations.js";

export default defineAction({
  description:
    "List recent integration deliveries, newest first, optionally filtered by provider.",
  schema: z.object({
    provider: z.string().optional().describe("Provider id to filter by"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    deliveries: z.array(
      z.object({
        id: z.string(),
        provider: z.string(),
        event: z.string(),
        status: z.string(),
        at: z.string(),
        incidentId: z.string().nullable(),
      }),
    ),
  }),
  run: async ({ provider }) => ({ deliveries: await listDeliveries(provider) }),
});
