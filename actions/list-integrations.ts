import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listConnections } from "../server/lib/integrations.js";

const delivery = z.object({
  id: z.string(),
  provider: z.string(),
  event: z.string(),
  status: z.string(),
  at: z.string(),
});

export default defineAction({
  description:
    "List the evidence providers, their connection status (live or fixture) and the evidence-coverage meter.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    providers: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
        value: z.string(),
        coverage: z.string().nullable(),
        mode: z.string(),
        status: z.string(),
        lastChecked: z.string().nullable(),
        lastError: z.string().nullable(),
        inbound: z.boolean(),
      }),
    ),
    coverage: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        connected: z.boolean(),
        providers: z.array(z.string()),
      }),
    ),
    connectedCount: z.number(),
    total: z.number(),
  }),
  run: async () => listConnections(),
});
