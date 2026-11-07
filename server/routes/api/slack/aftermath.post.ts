import { createHmac, timingSafeEqual } from "node:crypto";

import { getSetting } from "@agent-native/core/settings";
import { desc, eq } from "drizzle-orm";
import { defineEventHandler, getHeader, readRawBody, setResponseStatus } from "h3";

import { getDb, schema } from "../../../db/index.js";
import { analyzeIncident } from "../../../lib/analysis.js";
import { recordDelivery } from "../../../lib/integrations.js";
import { updateIncidentEvent, utcTime } from "../../../lib/incidents.js";

const SETTING = "alert-webhook";
const MAX_CLOCK_SKEW_SECONDS = 300;

interface WebhookSetting {
  slackSigningSecret?: string;
  ownerEmail?: string;
}

function safeEqual(expected: string, received: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validSlackSignature(
  secret: string,
  timestamp: string,
  raw: string,
  header: string,
) {
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = `v0=${createHmac("sha256", secret)
    .update(`v0:${timestamp}:${raw}`)
    .digest("hex")}`;
  return safeEqual(expected, header);
}

function reply(text: string) {
  return { response_type: "in_channel", text };
}

/**
 * Slack slash command. Slack signs every request with the app's signing secret;
 * there is no session. The command calls the same updateIncidentEvent path as
 * the UI drag and the agent, so the actor changes but the invariant does not.
 */
export default defineEventHandler(async (event) => {
  const setting = (await getSetting(SETTING)) as WebhookSetting | null;
  const timestamp = getHeader(event, "x-slack-request-timestamp") ?? "";
  const signature = getHeader(event, "x-slack-signature") ?? "";
  const raw = (await readRawBody(event)) ?? "";

  const signatureOk =
    Boolean(setting?.slackSigningSecret) &&
    validSlackSignature(setting!.slackSigningSecret!, timestamp, raw, signature);

  if (!signatureOk) {
    await recordDelivery({
      provider: "slack-command",
      event: "slash.rejected",
      status: "rejected",
      deliveryKey: timestamp || null,
    }).catch(() => undefined);
    setResponseStatus(event, 401);
    return { error: "Invalid Slack signature" };
  }

  const contentType = getHeader(event, "content-type") ?? "";
  let fields: URLSearchParams;
  if (contentType.includes("application/json")) {
    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      fields = new URLSearchParams(
        Object.entries(body).map(([key, value]) => [key, String(value)]),
      );
    } catch {
      setResponseStatus(event, 400);
      return { error: "Expected JSON" };
    }
  } else {
    fields = new URLSearchParams(raw);
  }
  const text = (fields.get("text") ?? "").trim();
  const [command, ...rest] = text.split(/\s+/).filter(Boolean);
  const owner = { userEmail: setting?.ownerEmail ?? "", orgId: null };

  try {
    if (!command || command === "help") {
      return reply(
        "Aftermath commands\n" +
          "`/aftermath status <incidentId>` — verdict, leading cause, exposure\n" +
          "`/aftermath move <incidentId> <event text> <HH:MM>` — move one event in UTC",
      );
    }

    if (command === "status") {
      let incidentId = rest[0];
      if (!incidentId) {
        const [latest] = await getDb()
          .select({ id: schema.incidents.id, title: schema.incidents.title })
          .from(schema.incidents)
          .orderBy(desc(schema.incidents.startedAt))
          .limit(1);
        incidentId = latest?.id;
      }
      if (!incidentId) return reply("No incidents yet. Open Aftermath and load the demo.");
      const analysis = await analyzeIncident(incidentId, "current");
      await recordDelivery({
        provider: "slack-command",
        event: "slash.status",
        status: "ok",
        incidentId,
        deliveryKey: `status:${incidentId}:${timestamp}`,
        owner,
      });
      return reply(
        `*${analysis.verdict.toUpperCase()}* — ${analysis.summaryLine}\n` +
          `Leading: ${analysis.leading?.label ?? "none"} · exposure ${
            analysis.exposure?.minutes ?? "?"
          } min · <${fields.get("response_url") ?? ""}|open Aftermath>`,
      );
    }

    if (command === "move") {
      const incidentId = rest[0];
      const time = rest[rest.length - 1];
      const query = rest.slice(1, -1).join(" ");
      if (!incidentId || !/^\d{2}:\d{2}$/.test(time ?? "") || query.length === 0) {
        return reply("Usage: `/aftermath move <incidentId> <event text> <HH:MM>`");
      }
      const rows = await getDb()
        .select({
          id: schema.incidentEvents.id,
          at: schema.incidentEvents.at,
          title: schema.incidentEvents.title,
        })
        .from(schema.incidentEvents)
        .where(eq(schema.incidentEvents.incidentId, incidentId));
      const matches = rows.filter((row) =>
        row.title.toLowerCase().includes(query.toLowerCase()),
      );
      if (matches.length === 0) {
        return reply(`No event on ${incidentId} matches "${query}".`);
      }
      if (matches.length > 1) {
        return reply(
          `"${query}" matches ${matches.length} events: ${matches
            .map((row) => `*${row.title}* (${utcTime(row.at)})`)
            .join(", ")}. Say more of the title so the move is unambiguous.`,
        );
      }
      const match = matches[0]!;
      const hours = Number(time!.slice(0, 2));
      const minutes = Number(time!.slice(3, 5));
      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
        return reply("Time must be HH:MM in UTC.");
      }
      const at = `${match.at.slice(0, 10)}T${time}:00.000Z`;
      const updated = await updateIncidentEvent(match.id, { at });
      const analysis = await analyzeIncident(incidentId, "current");
      await recordDelivery({
        provider: "slack-command",
        event: "slash.move",
        status: "ok",
        incidentId,
        deliveryKey: `move:${updated.id}:${updated.at}:${timestamp}`,
        owner,
      });
      return reply(
        `Moved *${updated.title}* from ${utcTime(match.at)} to ${utcTime(updated.at)}.\n` +
          `Verdict is now *${analysis.verdict}* — ${
            analysis.leading
              ? `${analysis.leading.label} leads at ${analysis.leading.lagMinutes} min`
              : "no candidate leads"
          }.`,
      );
    }

    return reply(`Unknown command "${command}". Try \`/aftermath help\`.`);
  } catch (error) {
    setResponseStatus(event, 200);
    return reply(
      error instanceof Error ? `Aftermath could not run that: ${error.message}` : "Failed.",
    );
  }
});
