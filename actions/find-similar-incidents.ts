import { defineAction, fail } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

const STOP = new Set([
  "the", "and", "after", "before", "with", "from", "that", "this", "were", "was",
  "for", "into", "over", "under", "when", "then", "than", "them", "they", "their",
  "have", "has", "had", "been", "being", "which", "while", "about", "would",
  "could", "should", "there", "here", "what", "where", "your", "ours", "its",
]);

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP.has(word)),
  );
}

export default defineAction({
  description:
    "Find past incidents that resemble this one using a local keyword-similarity fallback (no embeddings). Returns up to three matches with a score and the shared keywords.",
  schema: z.object({
    id: z.string().describe("Incident id from list-incidents"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    method: z.string(),
    matches: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        score: z.number(),
        sharedKeywords: z.array(z.string()),
      }),
    ),
  }),
  run: async ({ id }) => {
    const { incidents, incidentEvents, incidentActionItems, pastIncidents } = schema;
    const [incident] = await getDb()
      .select({
        id: incidents.id,
        title: incidents.title,
        summary: incidents.summary,
        ownerEmail: incidents.ownerEmail,
      })
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    if (!incident) {
      fail("Incident not found.", { errorCode: "not_found", statusCode: 404 });
    }

    const events = await getDb()
      .select({ title: incidentEvents.title, ownerEmail: incidentEvents.ownerEmail })
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, id))
      .orderBy(asc(incidentEvents.at));

    const actionItems = await getDb()
      .select({ title: incidentActionItems.title, ownerEmail: incidentActionItems.ownerEmail })
      .from(incidentActionItems)
      .where(eq(incidentActionItems.incidentId, id))
      .orderBy(asc(incidentActionItems.createdAt));

    const mine = tokens(
      [
        incident.title,
        incident.summary ?? "",
        ...events.map((event) => event.title),
        ...actionItems.map((item) => item.title),
      ].join(" "),
    );
    const past = await getDb()
      .select({
        id: pastIncidents.id,
        title: pastIncidents.title,
        summary: pastIncidents.summary,
        ownerEmail: pastIncidents.ownerEmail,
      })
      .from(pastIncidents);

    const matches = past
      .map((row) => {
        const theirs = tokens(`${row.title} ${row.summary}`);
        const shared = [...mine].filter((word) => theirs.has(word));
        const union = new Set([...mine, ...theirs]);
        return {
          id: row.id,
          title: row.title,
          summary: row.summary,
          score: union.size > 0 ? Math.round((shared.length / union.size) * 100) / 100 : 0,
          sharedKeywords: shared.slice(0, 6),
        };
      })
      .filter((match) => match.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      method: "keyword-jaccard (local fallback; no embeddings)",
      matches,
    };
  },
});
