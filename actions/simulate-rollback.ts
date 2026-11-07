import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { analyzeIncident } from "../server/lib/analysis.js";
import { toIso } from "../server/lib/incidents.js";

export default defineAction({
  description:
    "What-if: if the rollback happened at a given time, how much exposure would it have saved? Deterministic, using the current exposure window.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
    at: z.string().describe("Hypothetical rollback time, ISO 8601 with a UTC offset"),
  }),
  http: { method: "GET" },
  readOnly: true,
  chatUI: { renderer: "aftermath.rollback-card", title: "What-if rollback" },
  outputSchema: z.object({
    at: z.string(),
    exposureStart: z.string(),
    recovery: z.string(),
    baselineMinutes: z.number(),
    rollbackMinutes: z.number(),
    savedMinutes: z.number(),
    percentSaved: z.number(),
  }),
  run: async ({ id, at }) => {
    const analysis = await analyzeIncident(id, "current");
    const start = analysis.exposure?.start;
    const end = analysis.exposure?.end;
    if (!start || !end) {
      fail("No exposure window is available for this incident.", {
        errorCode: "no_exposure",
        statusCode: 409,
      });
    }

    const requested = Date.parse(toIso(at, "at"));
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    const clamped = Math.min(endMs, Math.max(startMs, requested));
    const baselineMinutes = Math.round((endMs - startMs) / 60_000);
    const rollbackMinutes = Math.round((clamped - startMs) / 60_000);
    const savedMinutes = Math.max(0, baselineMinutes - rollbackMinutes);

    return {
      at: new Date(clamped).toISOString(),
      exposureStart: start,
      recovery: end,
      baselineMinutes,
      rollbackMinutes,
      savedMinutes,
      percentSaved:
        baselineMinutes > 0 ? Math.round((savedMinutes / baselineMinutes) * 100) : 0,
    };
  },
});
