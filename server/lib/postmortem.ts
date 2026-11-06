import { fail } from "@agent-native/core/action";
import { asc, eq, inArray } from "drizzle-orm";

import { analyzeIncident } from "./analysis.js";
import { getDb, schema } from "../db/index.js";

function fmt(iso: string | null) {
  return iso ? `${iso.slice(11, 16)} UTC` : "—";
}

export interface Postmortem {
  title: string;
  markdown: string;
  approvedAt: string | null;
  verdict: string;
}

export async function buildPostmortem(id: string): Promise<Postmortem> {
  const {
    incidents,
    incidentEvents,
    incidentEvidence,
    incidentActionItems,
    incidentComments,
  } = schema;
  const [incident] = await getDb()
    .select()
    .from(incidents)
    .where(eq(incidents.id, id))
    .limit(1);
  if (!incident) {
    fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
  }

  const events = await getDb()
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

  const eventIds = events.map((event) => event.id);
  const evidence =
    eventIds.length > 0
      ? await getDb()
          .select({
            label: incidentEvidence.label,
            url: incidentEvidence.url,
            snippet: incidentEvidence.snippet,
          })
          .from(incidentEvidence)
          .where(inArray(incidentEvidence.eventId, eventIds))
      : [];

  const actionItems = await getDb()
    .select()
    .from(incidentActionItems)
    .where(eq(incidentActionItems.incidentId, id))
    .orderBy(asc(incidentActionItems.createdAt));

  const comments = await getDb()
    .select({
      body: incidentComments.body,
      author: incidentComments.author,
      createdAt: incidentComments.createdAt,
    })
    .from(incidentComments)
    .where(eq(incidentComments.incidentId, id))
    .orderBy(asc(incidentComments.createdAt));

  const analysis = await analyzeIncident(id, "current");
  const corrected = events.filter(
    (event) => event.originalAt !== null && event.originalAt !== event.at,
  );

  const impact = analysis.impactWindow
    ? `${analysis.impactWindow.minutes ?? "?"} minutes, from ${fmt(analysis.impactWindow.start)} to ${fmt(analysis.impactWindow.end)}.`
    : "Unknown.";
  const exposure = analysis.exposure
    ? `${analysis.exposure.minutes ?? "?"} minutes, from ${fmt(analysis.exposure.start)} to ${fmt(analysis.exposure.end)}.`
    : "Unknown.";
  const metrics = analysis.metrics
    ? [
        `- Time to detect: ${analysis.metrics.timeToDetect ?? "n/a"} min`,
        `- Time to acknowledge: ${analysis.metrics.timeToAcknowledge ?? "n/a"} min`,
        `- Time to mitigate: ${analysis.metrics.timeToMitigate ?? "n/a"} min`,
        `- Time to resolve: ${analysis.metrics.timeToResolve ?? "n/a"} min`,
      ].join("\n")
    : "No metrics computed.";
  const candidates =
    analysis.hypotheses.length > 0
      ? analysis.hypotheses
          .map(
            (hypothesis) =>
              `- **${hypothesis.status.toUpperCase()}** — ${hypothesis.label} at ${fmt(hypothesis.at)} (lag ${hypothesis.lagMinutes} min). ${hypothesis.reasons.join(" ")}`,
          )
          .join("\n")
      : "No candidate changes.";

  const timeline = events
    .map((event) => {
      const source = event.source ? ` — _${event.source}_` : "";
      const correctedMark = corrected.some((row) => row.id === event.id)
        ? ` (corrected from ${fmt(event.originalAt)})`
        : "";
      const cause = event.isRootCause ? " **[suspected cause]**" : "";
      return `- **${fmt(event.at)}** — ${event.title}${source}${cause}${correctedMark}`;
    })
    .join("\n");

  const findings = analysis.findings
    .map((finding) => `- **${finding.title}.** ${finding.detail}`)
    .join("\n");

  const evidenceList =
    evidence.length > 0
      ? evidence
          .map((row) => {
            const url = row.url ? ` — ${row.url}` : "";
            const snippet = row.snippet ? `: ${row.snippet}` : "";
            return `- ${row.label}${snippet}${url}`;
          })
          .join("\n")
      : "No evidence attached.";

  const changes =
    actionItems.length > 0
      ? actionItems
          .map(
            (item) =>
              `- [${item.status === "done" ? "x" : " "}] ${item.title} (${item.owner ?? "unassigned"})`,
          )
          .join("\n")
      : "No action items yet.";

  const discussion =
    comments.length > 0
      ? comments
          .map(
            (comment) =>
              `- **${comment.author || "anonymous"}** (${fmt(comment.createdAt.slice(0, 16))}) — ${comment.body}`,
          )
          .join("\n")
      : "No comments.";

  const corrections =
    corrected.length > 0
      ? corrected
          .map(
            (event) =>
              `- "${event.title}": originally ${fmt(event.originalAt)}, corrected to ${fmt(event.at)}.`,
          )
          .join("\n")
      : "No corrections were made to this timeline.";

  const markdown = `# ${incident.title}

**Severity:** ${incident.severity.toUpperCase()} · **Status:** ${incident.status} · **Started:** ${fmt(incident.startedAt)} · **Resolved:** ${fmt(incident.resolvedAt)}

## Summary

${analysis.summaryLine}

## Initial account

${incident.summary ?? "No initial account recorded."}

## Impact

${impact}

Exposure from the leading change: ${exposure}

## Metrics

${metrics}

## What happened

${timeline}

## Cause analysis

**Verdict: ${analysis.verdict.toUpperCase()}.** ${analysis.summaryLine}

${findings}

## Candidate causes

${candidates}

## Evidence

${evidenceList}

## What we are changing

${changes}

## Discussion

${discussion}

## Correction log

${corrections}

---

_Generated by Aftermath from the timeline above. The verdict is computed, not narrated._
`;

  return {
    title: incident.title,
    markdown,
    approvedAt: incident.postmortemApprovedAt,
    verdict: analysis.verdict,
  };
}
