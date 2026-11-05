import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId } from "../server/lib/incidents.js";
import { parseIncidentPack } from "../server/lib/pack.js";

export default defineAction({
  description:
    "Create an incident from a pasted operational pack (alerts, deploys, logs, chat). Parses timed lines into a timeline, stores each event with its original time, and returns the new incident id. Use this to turn a real incident into a starting timeline.",
  schema: z.object({
    pack: z
      .string()
      .min(1)
      .describe(
        "One event per line, with a time. Optional date and bracket kind, source after a pipe: '14:03 [error] 5xx rate 8.4% | Grafana'",
      ),
    title: z.string().optional().describe("Incident title; defaults to the first alert or deploy"),
    date: z
      .string()
      .optional()
      .describe(
        "Fallback date for lines without one, YYYY-MM-DD; defaults to the first date in the pack, then today",
      ),
    severity: z
      .enum(["sev1", "sev2", "sev3"])
      .default("sev2")
      .describe('Severity: "sev1", "sev2" or "sev3"; defaults to "sev2"'),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    events: z.number(),
    skipped: z.number(),
    startedAt: z.string(),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "incidents",
      to: `/incidents/${encodeURIComponent(result.id)}`,
      params: { id: result.id },
    }),
    label: `Open ${result.title}`,
  }),
  run: async (args, ctx) => {
    const parsed = parseIncidentPack(args.pack, args.date);
    if (parsed.events.length === 0) {
      fail("No timed lines found in the pack. Put a time at the start of each event.", {
        errorCode: "empty_pack",
      });
    }

    const first = parsed.events[0];
    if (!first) {
      fail("No timed lines found in the pack. Put a time at the start of each event.", {
        errorCode: "empty_pack",
      });
    }

    const owner = {
      ownerEmail: ctx?.userEmail ?? "",
      orgId: ctx?.orgId ?? null,
    };
    const incidentId = newId("inc");
    const title = args.title?.trim() || parsed.title;
    const startedAt = first.at;

    const db = getDb();
    await db.insert(schema.incidents).values({
      id: incidentId,
      title,
      severity: args.severity,
      status: "open",
      startedAt,
      summary: `Imported from a ${parsed.events.length}-event pack${
        parsed.skipped > 0 ? `; ${parsed.skipped} untimed line(s) skipped` : ""
      }. The timeline has not been corrected yet.`,
      ...owner,
    });

    for (const event of parsed.events) {
      await db.insert(schema.incidentEvents).values({
        id: newId("evt"),
        incidentId,
        at: event.at,
        kind: event.kind,
        title: event.title,
        source: event.source,
        confidence: event.confidence,
        isRootCause: false,
        originalAt: event.at,
        ...owner,
      });
    }

    return {
      id: incidentId,
      title,
      events: parsed.events.length,
      skipped: parsed.skipped,
      startedAt,
    };
  },
});
