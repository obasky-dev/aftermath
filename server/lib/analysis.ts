import { fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../db/index.js";

export const hypothesisOutput = z.object({
  id: z.string(),
  label: z.string(),
  at: z.string(),
  kind: z.string(),
  lagMinutes: z.number(),
  status: z.enum(["leading", "plausible", "outcompeted", "contradicted", "unverifiable"]),
  reasons: z.array(z.string()),
});

export type Hypothesis = z.infer<typeof hypothesisOutput>;

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
  exposure: z
    .object({
      start: z.string().nullable(),
      end: z.string().nullable(),
      minutes: z.number().nullable(),
    })
    .nullable(),
  metrics: z
    .object({
      timeToDetect: z.number().nullable(),
      timeToAcknowledge: z.number().nullable(),
      timeToMitigate: z.number().nullable(),
      timeToResolve: z.number().nullable(),
    })
    .nullable(),
  hypotheses: z.array(hypothesisOutput),
  leading: hypothesisOutput.nullable(),
  suspect: z
    .object({ id: z.string(), title: z.string(), at: z.string(), kind: z.string() })
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

function fmt(iso: string | null | undefined) {
  return iso ? `${iso.slice(11, 16)} UTC` : "—";
}

function isChangeEvent(event: { kind: string; title: string }) {
  if (event.kind === "deploy") return true;
  if (/rollback|resolved|acknowledged|paged|recovery/i.test(event.title)) return false;
  return /failover|migration|config|dns|certificate|scaled|scaling|quota|feature flag/i.test(
    event.title,
  );
}

function findEvidence(events: Array<{ title: string; time: string }>, pattern: RegExp) {
  return events.find((event) => pattern.test(event.title)) ?? null;
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
      eventStatus: incidentEvents.eventStatus,
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
  const recoveryAt = incident.resolvedAt ?? events[events.length - 1]?.time ?? null;

  const findings: Array<{ tone: "good" | "warn" | "bad"; title: string; detail: string }> = [];

  if (!firstFailure) {
    return {
      incidentId: id,
      mode,
      verdict: "no-suspect",
      summaryLine: "No onset event was found, so the timeline cannot be scored yet.",
      impactWindow: null,
      exposure: null,
      metrics: null,
      hypotheses: [],
      leading: null,
      suspect: suspect
        ? { id: suspect.id, title: suspect.title, at: suspect.time, kind: suspect.kind }
        : null,
      firstFailure: null,
      deltaMinutes: null,
      nearest: null,
      findings,
    };
  }

  const onset = firstFailure.time;
  const flatDbEvidence = findEvidence(
    events,
    /connection errors.*flat|db.*errors.*flat|no increase in database/i,
  );

  const hypotheses: Hypothesis[] = events
    .filter(isChangeEvent)
    .map((event) => {
      const lagMinutes = minutesBetween(onset, event.time);
      const contradictedBy =
        flatDbEvidence && /failover/i.test(event.title) ? flatDbEvidence : null;
      return {
        id: event.id,
        label: event.title,
        at: event.time,
        kind: event.kind,
        lagMinutes,
        status: "plausible" as const,
        reasons: [],
      } satisfies Hypothesis;
    });

  const plausible = hypotheses.filter(
    (hypothesis) => hypothesis.lagMinutes >= 0 && hypothesis.lagMinutes <= 10,
  );

  let leading: Hypothesis | null = null;
  for (const hypothesis of hypotheses) {
    const event = events.find((row) => row.id === hypothesis.id);
    const reasons: string[] = [];
    const lag = hypothesis.lagMinutes;

    if (lag >= 0) reasons.push(`Precedes onset by ${lag} minute${lag === 1 ? "" : "s"}.`);
    else reasons.push(`Follows onset by ${Math.abs(lag)} minutes, so it cannot be the cause.`);

    if (lag < 0) {
      hypothesis.status = "outcompeted";
    } else if (plausible.length > 0) {
      const leader = [...plausible].sort((a, b) => a.lagMinutes - b.lagMinutes)[0];
      if (leader && leader.id === hypothesis.id) {
        hypothesis.status = "leading";
        reasons.push("Smallest lag among candidate changes.");
        leading = hypothesis;
      } else if (event && flatDbEvidence && /failover/i.test(event.title)) {
        hypothesis.status = "contradicted";
        reasons.push(
          `Contradicted by "${flatDbEvidence.title}" at ${fmt(flatDbEvidence.time)}: database connection errors stayed flat.`,
        );
      } else if (lag > 10) {
        hypothesis.status = "outcompeted";
        reasons.push(
          `Too early: the closest candidate leads by ${leader?.lagMinutes ?? "?"} minutes.`,
        );
      } else {
        hypothesis.status = "plausible";
        reasons.push(
          `Plausible, but "${leader?.label ?? "another change"}" leads by ${leader?.lagMinutes ?? "?"} minutes.`,
        );
      }
    } else {
      hypothesis.status = lag <= 10 ? "unverifiable" : "outcompeted";
      reasons.push(
        lag <= 10
          ? "No source is connected that can confirm this change."
          : "No plausible cause falls within 10 minutes of onset.",
      );
    }

    hypothesis.reasons = reasons;
  }

  const suspectHypothesis = suspect
    ? hypotheses.find((hypothesis) => hypothesis.id === suspect.id)
    : null;
  const deltaMinutes = suspect ? minutesBetween(onset, suspect.time) : null;

  const verdict: Analysis["verdict"] = !suspect
    ? "no-suspect"
    : suspectHypothesis?.status === "contradicted"
      ? "contradicted"
      : deltaMinutes !== null && deltaMinutes >= 0 && deltaMinutes <= 10
        ? "consistent"
        : "weak";

  const contradicted = hypotheses.filter((hypothesis) => hypothesis.status === "contradicted");
  const exposureStart = suspect?.time ?? leading?.at ?? null;
  const exposure =
    exposureStart && recoveryAt
      ? {
          start: exposureStart,
          end: recoveryAt,
          minutes: minutesBetween(recoveryAt, exposureStart),
        }
      : null;

  const ack = events.find(
    (event) => event.kind === "action" && /acknowledg/i.test(event.title) && Date.parse(event.time) >= Date.parse(onset),
  );
  const mitigate = events.find(
    (event) =>
      event.kind === "action" &&
      /rollback complete|rolled back|mitigat/i.test(event.title) &&
      Date.parse(event.time) >= Date.parse(onset),
  );
  const metrics = {
    timeToDetect: minutesBetween(onset, incident.startedAt),
    timeToAcknowledge: ack ? minutesBetween(ack.time, onset) : null,
    timeToMitigate: mitigate ? minutesBetween(mitigate.time, onset) : null,
    timeToResolve: recoveryAt ? minutesBetween(recoveryAt, onset) : null,
  };

  if (leading) {
    findings.push({
      tone: "good",
      title: `${leading.label} leads the timeline`,
      detail: `It precedes onset by ${leading.lagMinutes} minute${leading.lagMinutes === 1 ? "" : "s"}. The leading change sets the exposure window until recovery.`,
    });
  }

  for (const hypothesis of contradicted) {
    findings.push({
      tone: "bad",
      title: `${hypothesis.label} is contradicted`,
      detail: hypothesis.reasons.join(" "),
    });
  }

  if (suspect && deltaMinutes !== null && deltaMinutes > 10) {
    findings.push({
      tone: "warn",
      title: "The marked cause is not plausible yet",
      detail: `"${suspect.title}" is ${deltaMinutes} minutes before onset. The incident channel says the promotion was at ${fmt(events.find((event) => /promot/i.test(event.title))?.time ?? onset)} — move the event to the promotion time.`,
    });
  }

  findings.push({
    tone: "warn",
    title: "Impact window",
    detail: `Onset ${fmt(onset)} to recovery ${fmt(recoveryAt)} — ${metrics.timeToResolve ?? "?"} minutes. Exposure from the leading change: ${exposure?.minutes ?? "?"} minutes.`,
  });

  const summaryLine = leading
    ? `${leading.label} leads at ${leading.lagMinutes} minute${leading.lagMinutes === 1 ? "" : "s"} before onset.${contradicted.length > 0 ? ` ${contradicted.map((hypothesis) => `"${hypothesis.label}"`).join(", ")} ${contradicted.length === 1 ? "is" : "are"} contradicted by the evidence.` : ""}`
    : "No change event falls within ten minutes before onset.";

  const nearest =
    suspect
      ? events
          .filter((event) => event.id !== suspect.id && event.id !== firstFailure.id)
          .map((event) => ({
            id: event.id,
            title: event.title,
            at: event.time,
            deltaMinutes: minutesBetween(event.time, suspect.time),
          }))
          .sort((a, b) => Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes))[0] ?? null
      : null;

  return {
    incidentId: id,
    mode,
    verdict,
    summaryLine,
    impactWindow: {
      start: onset,
      end: recoveryAt,
      minutes: recoveryAt ? minutesBetween(recoveryAt, onset) : null,
    },
    exposure,
    metrics,
    hypotheses,
    leading,
    suspect: suspect
      ? { id: suspect.id, title: suspect.title, at: suspect.time, kind: suspect.kind }
      : null,
    firstFailure: { id: firstFailure.id, title: firstFailure.title, at: onset },
    deltaMinutes,
    nearest,
    findings,
  };
}
