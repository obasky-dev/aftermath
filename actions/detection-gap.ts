import { defineAction, fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { analyzeIncident } from "../server/lib/analysis.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Compare the first failure with the first page/alert and propose a concrete detection rule. Read-only.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    onset: z.string().nullable(),
    page: z.string().nullable(),
    gapMinutes: z.number().nullable(),
    suggestion: z.string(),
  }),
  run: async ({ id }) => {
    const { incidents, incidentEvents } = schema;
    const [incident] = await getDb()
      .select({
        id: incidents.id,
        service: incidents.service,
        ownerEmail: incidents.ownerEmail,
      })
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const analysis = await analyzeIncident(id, "current");
    const onset = analysis.firstFailure?.at ?? null;

    const events = await getDb()
      .select({ at: incidentEvents.at, title: incidentEvents.title, ownerEmail: incidentEvents.ownerEmail })
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, id))
      .orderBy(asc(incidentEvents.at));

    const page =
      onset === null
        ? null
        : events.find(
            (event) =>
              Date.parse(event.at) >= Date.parse(onset) &&
              /paged|page|alert/i.test(event.title),
          )?.at ?? null;

    const gapMinutes =
      onset && page
        ? Math.round((Date.parse(page) - Date.parse(onset)) / 60_000)
        : null;
    const service = incident.service ?? "the service";

    return {
      onset,
      page,
      gapMinutes,
      suggestion: `Alert when ${service} 5xx rate exceeds 5% for 2 consecutive minutes and page at 300s.`,
    };
  },
});
