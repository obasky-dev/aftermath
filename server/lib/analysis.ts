import { fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../db/index.js";

export const analysisOutput = z.object({
  incidentId: z.string(),
  mode: z.enum(["current", "original"]),
  verdict: z.enum(["consistent", "weak", "contradicted", "no-suspect"]),
  summaryLine: z.string(),
  impactWindow: z
    .object({
      start: z.string(),
      end: z.string().nullable(),
      minutes: z.number().nullable(),
    })
    .nullable(),
  suspect: z
    .object({ id: z.string(), title: z.string(), at: z.string() })
    .nullable(),
  firstFailure: z
    .object({ id: z.string(), title: z.string(), at: z.string() })
    .nullable(),
  deltaMinutes: z.number().nullable(),
  nearest: z
    .object({
      id: z.string(),
      title: z.string(),
      at: z.string(),
      deltaMinutes: z.number(),
    })
    .nullable(),
  findings: z.array(
    z.object({
      tone: z.enum(["good", "warn", "bad"]),
      title: z.string(),
      detail: z.string(),
    }),
  ),
});

export type Analysis = z.infer<typeof analysisOutput>;
export type AnalysisMode = "current" | "original";

function minutesBetween(a: string, b: string) {
  return Math.round((Date.parse(a) - Date.parse(b)) / 60_000);
}

function fmt(iso: string) {
  return `${iso.slice(11, 16)} UTC`;
}

export async function analyzeIncident(
  id: string,
  mode: AnalysisMode = "current",
): Promise<Analysis> {
  const { incidents, incidentEvents } = schema;
  const [incident] = await getDb()
    .select()
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
      isRootCause: incidentEvents.isRootCause,
    })
    .from(incidentEvents)
    .where(eq(incidentEvents.incidentId, id))
    .orderBy(asc(incidentEvents.at));

  const timeOf = (event: { at: string; originalAt: string | null }) =>
    mode === "original" ? (event.originalAt ?? event.at) : event.at;

  const events = rows
    .map((event) => ({ ...event, time: timeOf(event) }))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

  const suspect = events.find((event) => event.isRootCause) ?? null;
  const firstFailure =
    events.find(
      (event) =>
        event.kind === "error" ||
        (event.kind === "log" && /error rate|latency|5xx|timeout/i.test(event.title)),
    ) ?? null;

  const findings: Array<{ tone: "good" | "warn" | "bad"; title: string; detail: string }> = [];

  if (!suspect || !firstFailure) {
    return {
      incidentId: id,
      mode,
      verdict: "no-suspect",
      summaryLine: !suspect
        ? "No event is marked as the suspected cause, so there is nothing to re-check yet."
        : "No failure event was found to compare against the suspected cause.",
      impactWindow: firstFailure
        ? {
            start: firstFailure.time,
            end: incident.resolvedAt ?? events[events.length - 1]?.time ?? null,
            minutes: incident.resolvedAt
              ? minutesBetween(incident.resolvedAt, firstFailure.time)
              : null,
          }
        : null,
      suspect: suspect
        ? { id: suspect.id, title: suspect.title, at: suspect.time }
        : null,
      firstFailure: firstFailure
        ? { id: firstFailure.id, title: firstFailure.title, at: firstFailure.time }
        : null,
      deltaMinutes: null,
      nearest: null,
      findings,
    };
  }

  const deltaMinutes = minutesBetween(firstFailure.time, suspect.time);
  const verdict: "consistent" | "weak" | "contradicted" =
    deltaMinutes < 0 ? "contradicted" : deltaMinutes <= 5 ? "consistent" : "weak";

  const others = events.filter(
    (event) => event.id !== suspect.id && event.id !== firstFailure.id,
  );
  const nearest =
    others
      .map((event) => ({
        id: event.id,
        title: event.title,
        at: event.time,
        deltaMinutes: minutesBetween(event.time, suspect.time),
      }))
      .sort((a, b) => Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes))[0] ?? null;

  const impactEnd = incident.resolvedAt ?? events[events.length - 1]?.time ?? null;

  if (verdict === "contradicted") {
    findings.push({
      tone: "bad",
      title: "The suspected cause cannot have triggered the failure",
      detail: `Errors began at ${fmt(firstFailure.time)}, ${Math.abs(deltaMinutes)} minutes before "${suspect.title}" at ${fmt(suspect.time)}. A cause cannot follow its effect.`,
    });
  } else if (verdict === "consistent") {
    findings.push({
      tone: "good",
      title: "The suspected cause still precedes the failure",
      detail: `Errors began ${deltaMinutes} minute${deltaMinutes === 1 ? "" : "s"} after "${suspect.title}" at ${fmt(suspect.time)}. The ordering is consistent.`,
    });
  } else {
    findings.push({
      tone: "warn",
      title: "The gap is too long to be conclusive",
      detail: `Errors began ${deltaMinutes} minutes after "${suspect.title}". That is plausible but not tight enough to confirm causation.`,
    });
  }

  findings.push({
    tone: "warn",
    title: "Impact window",
    detail: impactEnd
      ? `From the first failure at ${fmt(firstFailure.time)} to resolution at ${fmt(impactEnd)} — ${minutesBetween(impactEnd, firstFailure.time)} minutes.`
      : `From the first failure at ${fmt(firstFailure.time)}; the incident is still open.`,
  });

  if (mode === "current" && nearest && Math.abs(nearest.deltaMinutes) <= 5) {
    findings.push({
      tone: "warn",
      title: "The corrected time now coincides with another signal",
      detail: `"${nearest.title}" sits ${Math.abs(nearest.deltaMinutes)} minute${Math.abs(nearest.deltaMinutes) === 1 ? "" : "s"} ${nearest.deltaMinutes >= 0 ? "after" : "before"} the corrected time (${fmt(nearest.at)}). Check whether that signal explains the failure.`,
    });
  }

  const summaryLine =
    verdict === "contradicted"
      ? `Errors began ${Math.abs(deltaMinutes)} minutes before "${suspect.title}". The theory that it caused the failure is contradicted.`
      : verdict === "consistent"
        ? `"${suspect.title}" still precedes the first failure by ${deltaMinutes} minute${deltaMinutes === 1 ? "" : "s"}. The theory holds.`
        : `"${suspect.title}" precedes the first failure by ${deltaMinutes} minutes. The link is weak.`;

  return {
    incidentId: id,
    mode,
    verdict,
    summaryLine,
    impactWindow: {
      start: firstFailure.time,
      end: impactEnd,
      minutes: impactEnd ? minutesBetween(impactEnd, firstFailure.time) : null,
    },
    suspect: { id: suspect.id, title: suspect.title, at: suspect.time },
    firstFailure: { id: firstFailure.id, title: firstFailure.title, at: firstFailure.time },
    deltaMinutes,
    nearest,
    findings,
  };
}
