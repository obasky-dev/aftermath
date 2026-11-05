import { defineAction, fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { analyzeIncident } from "../server/lib/analysis.js";

function fmt(iso: string) {
  return `${iso.slice(11, 16)} UTC`;
}

export default defineAction({
  description:
    "Challenge the current incident timeline and the suspected cause. Returns evidence-based challenges: what the correction contradicts, which nearby signal now coincides, which claims are unverified, and the one question that would settle it. Read-only; use it before agreeing with a correction.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    incidentId: z.string(),
    verdict: z.string(),
    corrected: z.boolean(),
    challenges: z.array(
      z.object({
        tone: z.enum(["good", "warn", "bad"]),
        title: z.string(),
        detail: z.string(),
      }),
    ),
    question: z.string(),
  }),
  run: async ({ id }) => {
    const { incidents, incidentEvents } = schema;
    const [incident] = await getDb()
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const rows = await getDb()
      .select({
        id: incidentEvents.id,
        at: incidentEvents.at,
        originalAt: incidentEvents.originalAt,
        kind: incidentEvents.kind,
        title: incidentEvents.title,
        source: incidentEvents.source,
        confidence: incidentEvents.confidence,
        isRootCause: incidentEvents.isRootCause,
      })
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, id))
      .orderBy(asc(incidentEvents.at));

    const analysis = await analyzeIncident(id, "current");
    const corrected = rows.some(
      (row) => row.originalAt !== null && row.originalAt !== row.at,
    );
    const challenges: Array<{
      tone: "good" | "warn" | "bad";
      title: string;
      detail: string;
    }> = [];

    if (!corrected) {
      challenges.push({
        tone: "good",
        title: "No correction has been made yet",
        detail:
          "The timeline still supports the suspected cause. Challenge it by moving the event that is least certain, or by importing a pack with the real times.",
      });
    } else if (analysis.verdict === "contradicted" && analysis.suspect && analysis.firstFailure) {
      challenges.push({
        tone: "bad",
        title: "The corrected time breaks the causal story",
        detail: `"${analysis.suspect.title}" is now at ${fmt(analysis.suspect.at)}, but the first failure was at ${fmt(analysis.firstFailure.at)} — ${Math.abs(analysis.deltaMinutes ?? 0)} minutes earlier. A cause cannot follow its effect.`,
      });
    } else if (analysis.verdict === "consistent" && analysis.suspect) {
      challenges.push({
        tone: "warn",
        title: "The correction preserves the ordering",
        detail: `"${analysis.suspect.title}" still precedes the first failure. The ordering is consistent, but that is correlation — not proof.`,
      });
    }

    if (corrected && analysis.nearest && Math.abs(analysis.nearest.deltaMinutes) <= 5) {
      challenges.push({
        tone: "warn",
        title: "The correction lands on another signal",
        detail: `"${analysis.nearest.title}" sits at ${fmt(analysis.nearest.at)} (${
          analysis.nearest.deltaMinutes === 0
            ? "the same minute"
            : `${Math.abs(analysis.nearest.deltaMinutes)} min ${analysis.nearest.deltaMinutes > 0 ? "after" : "before"}`
        }). If the deploy did not cause the failure, this is the next thing to check.`,
      });
    }

    const weakClaims = rows
      .filter((row) => row.confidence < 50 && !row.isRootCause)
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, 3);
    for (const row of weakClaims) {
      challenges.push({
        tone: "warn",
        title: "An unverified claim is still in the timeline",
        detail: `"${row.title}" carries ${row.confidence}% confidence${
          row.source ? ` from ${row.source}` : ""
        }. Treat it as a hypothesis, not a fact.`,
      });
    }

    const question = corrected
      ? `What evidence would show whether "${analysis.suspect?.title ?? "the suspected cause"}" was actually responsible, given the corrected time?`
      : `What single event, if its time were wrong, would overturn the conclusion that "${analysis.suspect?.title ?? "the suspected cause"}" caused this?`;

    return {
      incidentId: id,
      verdict: analysis.verdict,
      corrected,
      challenges,
      question,
    };
  },
});
