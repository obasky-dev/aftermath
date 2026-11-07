import { defineAction, fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { analyzeIncident, isChangeEvent } from "../server/lib/analysis.js";

const eventRef = z.object({
  eventId: z.string(),
  label: z.string(),
  at: z.string(),
  detail: z.string().nullable(),
  source: z.string().nullable(),
  confidence: z.number(),
});

const conflictOption = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  patch: z.record(z.string(), z.unknown()).nullable(),
});

const conflictCard = z.object({
  id: z.string(),
  kind: z.enum(["timing", "causal"]),
  title: z.string(),
  question: z.string(),
  left: eventRef,
  right: eventRef,
  options: z.array(conflictOption),
  recommendedOptionId: z.string(),
});

function fmt(iso: string) {
  return `${iso.slice(11, 16)} UTC`;
}

function minutesBetween(laterIso: string, earlierIso: string) {
  return Math.round((Date.parse(laterIso) - Date.parse(earlierIso)) / 60_000);
}

const PROMOTION_CLAIM = /promot|deploy(ed|ing)?.*(now|prod)|rolled (back|out)|is live|shipped/i;

export default defineAction({
  description:
    "List the unresolved evidence conflicts on an incident as question cards. Each conflict names the two events that disagree and offers one-click resolutions with the exact patch to send to update-incident-event. Use this before accepting a timeline correction, and answer the question instead of guessing when evidence is ambiguous.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  chatUI: { renderer: "aftermath.conflict-card", title: "Evidence conflicts" },
  outputSchema: z.object({
    incidentId: z.string(),
    method: z.literal("deterministic"),
    conflicts: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["timing", "causal"]),
        title: z.string(),
        question: z.string(),
        left: eventRef,
        right: eventRef,
        options: z.array(conflictOption),
        recommendedOptionId: z.string(),
      }),
    ),
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
        kind: incidentEvents.kind,
        title: incidentEvents.title,
        detail: incidentEvents.detail,
        source: incidentEvents.source,
        confidence: incidentEvents.confidence,
        eventStatus: incidentEvents.eventStatus,
      })
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, id))
      .orderBy(asc(incidentEvents.at));

    const analysis = await analyzeIncident(id, "current");
    const conflicts: Array<z.infer<typeof conflictCard>> = [];

    for (const change of rows) {
      if (change.eventStatus === "red_herring") continue;
      if (!isChangeEvent(change)) continue;
      if (change.confidence >= 60) continue;

      const claim = rows.find((candidate) => {
        if (candidate.id === change.id) return false;
        if (candidate.eventStatus === "red_herring") return false;
        if (!PROMOTION_CLAIM.test(`${candidate.title} ${candidate.detail ?? ""}`)) return false;
        const delta = minutesBetween(candidate.at, change.at);
        return delta >= 2 && delta <= 40;
      });
      if (!claim) continue;

      const delta = minutesBetween(claim.at, change.at);
      conflicts.push({
        id: `timing:${change.id}:${claim.id}`,
        kind: "timing",
        title: `Two times for "${change.title}"`,
        question: `The record says ${fmt(change.at)} (${change.confidence}% confidence). ${claim.source ?? "A witness"} says ${fmt(claim.at)} (${claim.confidence}%). Which time should the timeline keep?`,
        left: {
          eventId: change.id,
          label: change.source ?? "Timeline record",
          at: change.at,
          detail: change.detail,
          source: change.source,
          confidence: change.confidence,
        },
        right: {
          eventId: claim.id,
          label: claim.source ?? "Witness claim",
          at: claim.at,
          detail: claim.detail,
          source: claim.source,
          confidence: claim.confidence,
        },
        options: [
          {
            id: "use-claim",
            label: `Move to ${fmt(claim.at)}`,
            description: `Use the ${claim.confidence}% witness claim and move "${change.title}" ${delta} minutes later.`,
            patch: { id: change.id, at: claim.at },
          },
          {
            id: "keep-record",
            label: `Keep ${fmt(change.at)}`,
            description: `Keep the recorded time and mark the witness claim as a red herring.`,
            patch: { id: claim.id, eventStatus: "red_herring" },
          },
          {
            id: "ask-agent",
            label: "Ask the agent",
            description: "Open the agent with both pieces of evidence and ask it to decide.",
            patch: null,
          },
        ],
        recommendedOptionId: "use-claim",
      });
    }

    for (const hypothesis of analysis.hypotheses) {
      if (hypothesis.status !== "contradicted") continue;
      const suspectEvent = rows.find((row) => row.id === hypothesis.id);
      if (!suspectEvent || suspectEvent.eventStatus === "red_herring") continue;
      const contradicting = rows.find(
        (row) =>
          row.id !== suspectEvent.id &&
          /connection errors.*flat|db.*errors.*flat|no increase in database/i.test(
            `${row.title} ${row.detail ?? ""}`,
          ),
      );
      if (!contradicting) continue;

      conflicts.push({
        id: `causal:${suspectEvent.id}:${contradicting.id}`,
        kind: "causal",
        title: `"${suspectEvent.title}" is contradicted by the evidence`,
        question: `The timeline ranks "${suspectEvent.title}" as a cause, but "${contradicting.title}" at ${fmt(contradicting.at)} says the expected symptom never appeared. Should it stay in the story?`,
        left: {
          eventId: suspectEvent.id,
          label: suspectEvent.title,
          at: suspectEvent.at,
          detail: suspectEvent.detail,
          source: suspectEvent.source,
          confidence: suspectEvent.confidence,
        },
        right: {
          eventId: contradicting.id,
          label: contradicting.title,
          at: contradicting.at,
          detail: contradicting.detail,
          source: contradicting.source,
          confidence: contradicting.confidence,
        },
        options: [
          {
            id: "mark-red-herring",
            label: "Accept the evidence",
            description: `Mark "${suspectEvent.title}" as a red herring and rerun the analysis.`,
            patch: { id: suspectEvent.id, eventStatus: "red_herring" },
          },
          {
            id: "keep-candidate",
            label: "Keep as a candidate",
            description: "Keep it in the hypothesis list until a source confirms or refutes it.",
            patch: { id: suspectEvent.id, eventStatus: "confirmed" },
          },
          {
            id: "ask-agent",
            label: "Ask the agent",
            description: "Ask the agent what evidence would settle the contradiction.",
            patch: null,
          },
        ],
        recommendedOptionId: "mark-red-herring",
      });
    }

    return { incidentId: id, method: "deterministic" as const, conflicts };
  },
});
