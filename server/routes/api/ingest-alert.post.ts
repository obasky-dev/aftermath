import { createHmac, timingSafeEqual } from "node:crypto";

import { getSetting } from "@agent-native/core/settings";
import { defineEventHandler, getHeader, readRawBody, setResponseStatus } from "h3";

import { createIncidentFromAlert } from "../../lib/create-incident.js";
import { findDeliveryByKey, recordDelivery } from "../../lib/integrations.js";

const SETTING = "alert-webhook";
const PROVIDER = "alert-webhook";
const MAX_CLOCK_SKEW_SECONDS = 300;

interface WebhookSetting {
  token?: string;
  secret?: string;
  ownerEmail?: string;
}

function safeEqual(expected: string, received: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validSignature(secret: string, timestamp: string, raw: string, header: string) {
  if (!/^\d{10,13}$/.test(timestamp)) return false;
  const seconds = timestamp.length === 13 ? Number(timestamp) / 1000 : Number(timestamp);
  if (Math.abs(Date.now() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex")}`;
  return safeEqual(expected, header);
}

/**
 * Inbound alert webhook. Authenticated by a per-install token or an HMAC
 * signature (x-aftermath-timestamp + x-aftermath-signature), and idempotent on
 * x-aftermath-delivery. Creates the incident deterministically, with no model
 * call. This is the one deliberately public route in the app.
 */
export default defineEventHandler(async (event) => {
  const setting = (await getSetting(SETTING)) as WebhookSetting | null;
  const providedToken = getHeader(event, "x-aftermath-token") ?? "";
  const timestamp = getHeader(event, "x-aftermath-timestamp") ?? "";
  const signature = getHeader(event, "x-aftermath-signature") ?? "";
  const deliveryKey = (getHeader(event, "x-aftermath-delivery") ?? "").slice(0, 200);

  const tokenOk = Boolean(setting?.token) && safeEqual(setting!.token!, providedToken);
  const raw = (await readRawBody(event)) ?? "";
  const signatureOk =
    Boolean(setting?.secret) &&
    signature.length > 0 &&
    validSignature(setting!.secret!, timestamp, raw, signature);

  if (!tokenOk && !signatureOk) {
    if (deliveryKey) {
      await recordDelivery({
        provider: PROVIDER,
        event: "webhook.rejected",
        status: "rejected",
        deliveryKey,
      }).catch(() => undefined);
    }
    setResponseStatus(event, 401);
    return { error: "Invalid alert token or signature" };
  }

  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    setResponseStatus(event, 400);
    return { error: "Expected JSON" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    setResponseStatus(event, 400);
    return { error: "Expected a JSON object" };
  }

  const record = body as Record<string, unknown>;
  const key =
    deliveryKey ||
    (typeof record.id === "string" ? record.id.slice(0, 200) : "");

  if (key) {
    const existing = await findDeliveryByKey(PROVIDER, key);
    if (existing) {
      setResponseStatus(event, 200);
      return {
        accepted: true,
        duplicate: true,
        id: existing.incidentId,
        deliveryId: existing.id,
      };
    }
  }

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
      { userEmail: setting?.ownerEmail ?? "", orgId: null },
    );
    const delivery = await recordDelivery({
      provider: PROVIDER,
      event: "webhook.accepted",
      status: signatureOk && !tokenOk ? "signed" : "token",
      incidentId: incident.id,
      deliveryKey: key || null,
      owner: { userEmail: setting?.ownerEmail ?? "", orgId: null },
    });
    setResponseStatus(event, 202);
    return { accepted: true, ...incident, deliveryId: delivery.id };
  } catch (error) {
    // A replay race can hit the unique delivery index; resolve it as a replay.
    if (key) {
      const existing = await findDeliveryByKey(PROVIDER, key).catch(() => null);
      if (existing) {
        setResponseStatus(event, 200);
        return { accepted: true, duplicate: true, id: existing.incidentId };
      }
    }
    setResponseStatus(event, 500);
    return {
      error: error instanceof Error ? error.message : "Could not create the incident",
    };
  }
});
