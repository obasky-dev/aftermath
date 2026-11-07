import { fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

export interface EventUpdate {
  at?: string | undefined;
  title?: string | undefined;
  detail?: string | undefined;
  confidence?: number | undefined;
  isRootCause?: boolean | undefined;
  eventStatus?: "confirmed" | "red_herring" | "unverified" | undefined;
}

/**
 * The single place a timeline event changes. Every caller — the UI drag, the
 * agent, the Slack slash command — goes through this, so the first-correction
 * rule (`original_at` is written once) cannot drift between surfaces.
 */
export async function updateIncidentEvent(id: string, args: EventUpdate) {
  const { incidentEvents } = schema;
  const [existing] = await getDb()
    .select({ at: incidentEvents.at, originalAt: incidentEvents.originalAt })
    .from(incidentEvents)
    .where(eq(incidentEvents.id, id))
    .limit(1);
  if (!existing) {
    fail("Event not found.", { errorCode: "not_found", statusCode: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (args.at !== undefined) {
    patch.at = toIso(args.at, "at");
    // The first correction preserves the time the timeline originally had.
    if (existing.originalAt === null) patch.originalAt = existing.at;
  }
  if (args.title !== undefined) patch.title = args.title;
  if (args.detail !== undefined) patch.detail = args.detail;
  if (args.confidence !== undefined) patch.confidence = args.confidence;
  if (args.isRootCause !== undefined) patch.isRootCause = args.isRootCause;
  if (args.eventStatus !== undefined) patch.eventStatus = args.eventStatus;
  if (Object.keys(patch).length === 0) {
    fail("Send at least one field to update.", { errorCode: "empty_patch" });
  }

  const [row] = await getDb()
    .update(incidentEvents)
    .set(patch)
    .where(eq(incidentEvents.id, id))
    .returning({
      id: incidentEvents.id,
      at: incidentEvents.at,
      title: incidentEvents.title,
      confidence: incidentEvents.confidence,
      isRootCause: incidentEvents.isRootCause,
      eventStatus: incidentEvents.eventStatus,
    });
  if (!row) {
    fail("Event not found.", { errorCode: "not_found", statusCode: 404 });
  }
  return row;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Accepts an ISO 8601 date-time and returns normalized UTC ISO text. */
export function toIso(value: string, field = "time"): string {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(`${field} must include a time and UTC offset.`, {
      errorCode: "invalid_time",
    });
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    fail(`${field} must be a valid ISO 8601 date-time.`, {
      errorCode: "invalid_time",
    });
  }
  return new Date(ms).toISOString();
}

/** "14:02" for an ISO timestamp, always UTC so server and client agree. */
export function utcTime(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}
