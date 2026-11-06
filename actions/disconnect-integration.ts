import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { disconnectProvider } from "../server/lib/integrations.js";

export default defineAction({
  description:
    "Disconnect an evidence provider. Hidden from the agent: connection setup belongs to the owner.",
  schema: z.object({
    provider: z.string().describe("Provider id from list-integrations"),
  }),
  agentTool: false,
  outputSchema: z.object({
    ok: z.boolean(),
    provider: z.string(),
    lastChecked: z.string(),
    delivery: z.object({
      id: z.string(),
      provider: z.string(),
      event: z.string(),
      status: z.string(),
      at: z.string(),
    }),
  }),
  run: async ({ provider }) => disconnectProvider(provider),
});
