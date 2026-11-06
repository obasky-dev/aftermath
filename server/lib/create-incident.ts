import { getDb, schema } from "../db/index.js";
import { newId, toIso } from "./incidents.js";

export type AlertSeverity = "sev1" | "sev2" | "sev3";

export interface AlertIncidentInput {
  title: string;
  severity?: AlertSeverity;
  startedAt?: string | undefined;
  source?: string;
  detail?: string | undefined;
}

export interface IncidentOwner {
  userEmail?: string | null | undefined;
  orgId?: string | null | undefined;
}

/** Shared by the agent action and the inbound alert webhook. */
export async function createIncidentFromAlert(
  input: AlertIncidentInput,
  owner: IncidentOwner,
) {
  const startedAt = input.startedAt
    ? toIso(input.startedAt, "startedAt")
    : new Date().toISOString();
  const severity = input.severity ?? "sev2";
  const source = input.source ?? "Alertmanager";
  const ownership = {
    ownerEmail: owner.userEmail ?? "",
    orgId: owner.orgId ?? null,
  };
  const incidentId = newId("inc");
  const db = getDb();

  await db.insert(schema.incidents).values({
    id: incidentId,
    title: input.title,
    severity,
    status: "open",
    startedAt,
    summary: `Opened from an alert: ${input.title}. The timeline has one event so far.`,
    ...ownership,
  });

  await db.insert(schema.incidentEvents).values({
    id: newId("evt"),
    incidentId,
    at: startedAt,
    kind: "alert",
    title: input.title,
    detail: input.detail ?? null,
    source,
    confidence: 95,
    isRootCause: false,
    originalAt: startedAt,
    ...ownership,
  });

  return { id: incidentId, title: input.title, severity, startedAt };
}
