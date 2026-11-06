import { timingSafeEqual } from "node:crypto";

import { getSetting } from "@agent-native/core/settings";
import { defineEventHandler, getHeader, readBody, setResponseStatus } from "h3";

import { createIncidentFromAlert } from "../../lib/create-incident.js";

const SETTING = "alert-webhook";

function tokensMatch(expected: string, received: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Inbound alert webhook. Authenticated by a per-install token from settings,
 * and deterministic: it creates the incident immediately, without a model call.
 * This is the one deliberately public route in the app.
 */
export default defineEventHandler(async (event) => {
  const setting = (await getSetting(SETTING)) as
    | { token?: string; ownerEmail?: string }
    | null;
  const provided = getHeader(event, "x-aftermath-token") ?? "";

  if (!setting?.token || !tokensMatch(setting.token, provided)) {
    setResponseStatus(event, 401);
    return { error: "Invalid alert token" };
  }

  const body = await readBody(event).catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    setResponseStatus(event, 400);
    return { error: "Expected a JSON object" };
  }
  const record = body as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) {
    setResponseStatus(event, 400);
    return { error: "A title is required" };
  }

  const severity =
    record.severity === "sev1" || record.severity === "sev3"
      ? record.severity
      : "sev2";

  try {
    const incident = await createIncidentFromAlert(
      {
        title,
        severity,
        startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
        source: typeof record.source === "string" ? record.source : "Alertmanager",
        detail: typeof record.detail === "string" ? record.detail : undefined,
      },
      { userEmail: setting.ownerEmail ?? "", orgId: null },
    );
    setResponseStatus(event, 202);
    return { accepted: true, ...incident };
  } catch (error) {
    setResponseStatus(event, 500);
    return {
      error: error instanceof Error ? error.message : "Could not create the incident",
    };
  }
});
