import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { testProvider } from "../server/lib/integrations.js";

export default defineAction({
  description:
    "Send a test request to a provider connection and record the delivery. Fixture mode returns ok and labels the delivery fixture.",
  schema: z.object({
    provider: z.string().describe("Provider id from list-integrations"),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    provider: z.string(),
    mode: z.string(),
    delivery: z.object({
      id: z.string(),
      provider: z.string(),
      event: z.string(),
      status: z.string(),
      at: z.string(),
    }),
  }),
  run: async ({ provider }) => testProvider(provider),
});
