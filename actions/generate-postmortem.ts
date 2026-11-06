import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { buildPostmortem } from "../server/lib/postmortem.js";

export default defineAction({
  description:
    "Generate the current postmortem as Markdown. It cites the corrected timeline, the verdict it produces, the evidence, the discussion and the action items. Read-only; approving is a separate owner-only action.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    title: z.string(),
    markdown: z.string(),
    approvedAt: z.string().nullable(),
    verdict: z.string(),
  }),
  run: async ({ id }) => buildPostmortem(id),
});
