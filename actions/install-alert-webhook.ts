import { randomBytes } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { getSetting, putSetting } from "@agent-native/core/settings";
import { z } from "zod";

const SETTING = "alert-webhook";

export default defineAction({
  description:
    "Return the inbound alert webhook URL and token, creating the token on first use. Owner-facing setup for the automation; hidden from the agent.",
  schema: z.object({
    rotate: z
      .boolean()
      .default(false)
      .describe("Replace the existing token with a new one; defaults to false"),
  }),
  agentTool: false,
  outputSchema: z.object({
    path: z.string(),
    token: z.string(),
    ownerEmail: z.string(),
  }),
  run: async ({ rotate }, ctx) => {
    const existing = (await getSetting(SETTING)) as
      | { token?: string; ownerEmail?: string }
      | null;
    const ownerEmail = ctx?.userEmail ?? existing?.ownerEmail ?? "";
    const token =
      !rotate && typeof existing?.token === "string" && existing.token.length > 0
        ? existing.token
        : randomBytes(24).toString("base64url");

    if (token !== existing?.token || ownerEmail !== existing?.ownerEmail) {
      await putSetting(SETTING, { token, ownerEmail });
    }

    return { path: "/api/ingest-alert", token, ownerEmail };
  },
});
