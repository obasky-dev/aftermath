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
    secret: z.string(),
    signatureHeader: z.string(),
    ownerEmail: z.string(),
  }),
  run: async ({ rotate }, ctx) => {
    const existing = (await getSetting(SETTING)) as
      | { token?: string; secret?: string; ownerEmail?: string }
      | null;
    const ownerEmail = ctx?.userEmail ?? existing?.ownerEmail ?? "";
    const token =
      !rotate && typeof existing?.token === "string" && existing.token.length > 0
        ? existing.token
        : randomBytes(24).toString("base64url");
    const secret =
      !rotate && typeof existing?.secret === "string" && existing.secret.length > 0
        ? existing.secret
        : randomBytes(32).toString("base64url");

    if (
      token !== existing?.token ||
      secret !== existing?.secret ||
      ownerEmail !== existing?.ownerEmail
    ) {
      await putSetting(SETTING, { token, secret, ownerEmail });
    }

    return {
      path: "/api/ingest-alert",
      token,
      secret,
      signatureHeader: "sha256=HMAC_SHA256(secret, `${x-aftermath-timestamp}.${rawBody}`)",
      ownerEmail,
    };
  },
});
