import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { sendFixture } from "../server/lib/integrations.js";

export default defineAction({
  description:
    "Deliver one provider-shaped fixture event into an incident timeline and record the delivery. Use it to demonstrate the adapter without provider credentials; the event and delivery are labelled fixture.",
  schema: z.object({
    provider: z.string().describe("Provider id from list-integrations"),
    incidentId: z.string().describe("Incident id from list-incidents"),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    provider: z.string(),
    eventId: z.string(),
    title: z.string(),
    delivery: z.object({
      id: z.string(),
      provider: z.string(),
      event: z.string(),
      status: z.string(),
      at: z.string(),
      incidentId: z.string().nullable(),
    }),
  }),
  run: async ({ provider, incidentId }, ctx) =>
    sendFixture(provider, incidentId, {
      userEmail: ctx?.userEmail,
      orgId: ctx?.orgId,
    }),
});
