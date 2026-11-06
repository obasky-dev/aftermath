import { asc, eq } from "drizzle-orm";

import { analyzeIncident } from "./analysis.js";
import { buildPostmortem } from "./postmortem.js";
import { newId } from "./incidents.js";
import { getDb, schema } from "../db/index.js";

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

const BLAME = /\b(broke|blame|at fault|careless|negligent|human error|should have known|to blame)\b/i;

async function loadIncident(id: string) {
  const { incidents, incidentEvents, incidentComments, incidentActionItems } = schema;
  const [incident] = await getDb()
    .select()
    .from(incidents)
    .where(eq(incidents.id, id))
    .limit(1);
  if (!incident) return null;
  const events = await getDb()
    .select({
      id: incidentEvents.id,
      title: incidentEvents.title,
      isRootCause: incidentEvents.isRootCause,
    })
    .from(incidentEvents)
    .where(eq(incidentEvents.incidentId, id))
    .orderBy(asc(incidentEvents.at));
  const actionItems = await getDb()
    .select()
    .from(incidentActionItems)
    .where(eq(incidentActionItems.incidentId, id))
    .orderBy(asc(incidentActionItems.createdAt));
  const comments = await getDb()
    .select({ body: incidentComments.body })
    .from(incidentComments)
    .where(eq(incidentComments.incidentId, id));
  return { incident, events, actionItems, comments };
}

export async function checkReadiness(id: string) {
  const data = await loadIncident(id);
  if (!data) return { ready: false, checks: [] as ReadinessCheck[] };
  const analysis = await analyzeIncident(id, "current");
  const { incident, events, actionItems, comments } = data;

  const hasCause = events.some((event) => event.isRootCause);
  const allOwners = actionItems.length > 0 && actionItems.every((item) => Boolean(item.owner));
  const detection = actionItems.some((item) => /alert|detect|monitor/i.test(item.title));
  const prevention = actionItems.some((item) =>
    /guard|check|prevent|bound|pool|config|limit/i.test(item.title),
  );
  const text = [incident.summary ?? "", ...comments.map((row) => row.body), ...actionItems.map((item) => item.title)].join(" ");
  const blameFree = !BLAME.test(text);
  const unresolved = analysis.hypotheses.filter((hypothesis) => hypothesis.status === "plausible");

  const checks: ReadinessCheck[] = [
    {
      key: "impact",
      label: "Impact is stated with a window",
      ok: Boolean(incident.customerStatus) && analysis.impactWindow?.minutes != null,
      detail: analysis.impactWindow?.minutes != null
        ? `${analysis.impactWindow.minutes} minutes from ${analysis.impactWindow.start.slice(11, 16)} UTC`
        : "No impact window computed.",
    },
    {
      key: "cause",
      label: "A suspected cause is marked",
      ok: hasCause,
      detail: hasCause ? "The timeline has a marked cause." : "Mark the event you suspect.",
    },
    {
      key: "owners",
      label: "Every action item has an owner team",
      ok: allOwners,
      detail: `${actionItems.filter((item) => item.owner).length}/${actionItems.length} action items have an owner.`,
    },
    {
      key: "detection",
      label: "At least one detection action",
      ok: detection,
      detail: detection ? "A detection item is present." : "Add an alert or detection item.",
    },
    {
      key: "prevention",
      label: "At least one prevention action",
      ok: prevention,
      detail: prevention ? "A prevention item is present." : "Add a guard, check or bound.",
    },
    {
      key: "blameless",
      label: "No blame language",
      ok: blameFree,
      detail: blameFree ? "No individual is blamed." : "Rewrite the blame language before shipping.",
    },
    {
      key: "conflict",
      label: "No unresolved competing theory",
      ok: unresolved.length === 0,
      detail:
        unresolved.length === 0
          ? "The timeline has one leading theory; alternatives are outcompeted or contradicted."
          : `Unresolved: ${unresolved.map((hypothesis) => hypothesis.label).join(", ")}.`,
    },
  ];

  return { ready: checks.every((check) => check.ok), checks };
}

export async function buildSummaries(id: string) {
  const data = await loadIncident(id);
  if (!data) return { engineer: "", executive: "", customer: "" };
  const analysis = await analyzeIncident(id, "current");
  const { incident, actionItems } = data;
  const leading = analysis.leading;
  const contradicted = analysis.hypotheses
    .filter((hypothesis) => hypothesis.status === "contradicted")
    .map((hypothesis) => hypothesis.label);
  const nextSteps = actionItems.map((item) => `${item.title} (${item.owner ?? "unassigned"})`).join("; ");

  const engineer = `${incident.title} — ${incident.severity.toUpperCase()}, ${incident.status}.
${analysis.summaryLine}
Lag: ${leading?.lagMinutes ?? "n/a"} min. Exposure: ${analysis.exposure?.minutes ?? "n/a"} min. Impact: ${analysis.impactWindow?.minutes ?? "n/a"} min.
Metrics: TTD ${analysis.metrics?.timeToDetect ?? "n/a"} / TTA ${analysis.metrics?.timeToAcknowledge ?? "n/a"} / TTM ${analysis.metrics?.timeToMitigate ?? "n/a"} / TTR ${analysis.metrics?.timeToResolve ?? "n/a"} min.
${contradicted.length > 0 ? `Contradicted: ${contradicted.join(", ")}.` : "No competing theory is contradicted yet."}`;

  const executive = `${incident.title}. Impact lasted ${analysis.impactWindow?.minutes ?? "?"} minutes (${analysis.impactWindow?.start.slice(11, 16) ?? "?"}–${analysis.impactWindow?.end?.slice(11, 16) ?? "?"} UTC). Exposure from the leading change was ${analysis.exposure?.minutes ?? "?"} minutes. Leading cause: ${leading?.label ?? "not established"} at ${leading?.lagMinutes ?? "?"} minutes before onset.${contradicted.length > 0 ? ` ${contradicted.join(", ")} is contradicted by the evidence.` : ""} Next: ${nextSteps || "action items pending"}.`;

  const customer = `${incident.customerStatus ?? "No customer update has been drafted."} Impact window: ${analysis.impactWindow?.start.slice(11, 16) ?? "?"}–${analysis.impactWindow?.end?.slice(11, 16) ?? "?"} UTC (${analysis.impactWindow?.minutes ?? "?"} minutes). The service is restored; we are tracking prevention work.`;

  return { engineer, executive, customer };
}

export interface ArtifactInput {
  provider: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
}

export async function buildArtifactInputs(id: string): Promise<ArtifactInput[]> {
  const data = await loadIncident(id);
  if (!data) return [];
  const analysis = await analyzeIncident(id, "current");
  const summaries = await buildSummaries(id);
  const postmortem = await buildPostmortem(id);
  const { incident, actionItems } = data;
  const prevention = actionItems.find((item) =>
    /guard|check|prevent|bound|pool|config/i.test(item.title),
  );

  const artifacts: ArtifactInput[] = actionItems.map((item) => ({
    provider: "linear",
    kind: "issue",
    title: item.title,
    payload: {
      team: item.owner ?? "unassigned",
      priority: "high",
      description: `Prevent recurrence of ${incident.title}.`,
    },
  }));

  artifacts.push({
    provider: "github",
    kind: "draft_pr",
    title: prevention
      ? `Draft PR: ${prevention.title}`
      : "Draft PR: add a guard for the failing configuration",
    payload: {
      branch: "aftermath/prevent-recurrence",
      draft: true,
      service: incident.service ?? "checkout-api",
    },
  });
  artifacts.push({
    provider: "slack",
    kind: "message",
    title: "Post the postmortem summary",
    payload: { channel: "#incidents", text: summaries.executive },
  });
  artifacts.push({
    provider: "statuspage",
    kind: "status_draft",
    title: "Draft customer status update",
    payload: { body: summaries.customer, state: "draft" },
  });
  artifacts.push({
    provider: "notion",
    kind: "page",
    title: "Export the postmortem to Notion",
    payload: { markdown: postmortem.markdown },
  });

  return artifacts;
}

export async function ensureArtifacts(
  id: string,
  owner: { userEmail?: string | null | undefined; orgId?: string | null | undefined },
) {
  const existing = await getDb()
    .select()
    .from(schema.postmortemArtifacts)
    .where(eq(schema.postmortemArtifacts.incidentId, id))
    .orderBy(asc(schema.postmortemArtifacts.createdAt));
  if (existing.length > 0) return existing;

  const inputs = await buildArtifactInputs(id);
  for (const input of inputs) {
    await getDb().insert(schema.postmortemArtifacts).values({
      id: newId("art"),
      incidentId: id,
      provider: input.provider,
      kind: input.kind,
      title: input.title,
      url: null,
      status: "draft",
      mode: "fixture",
      payload: JSON.stringify(input.payload),
      ownerEmail: owner.userEmail ?? "",
      orgId: owner.orgId ?? null,
    });
  }

  return getDb()
    .select()
    .from(schema.postmortemArtifacts)
    .where(eq(schema.postmortemArtifacts.incidentId, id))
    .orderBy(asc(schema.postmortemArtifacts.createdAt));
}

export function lintBlame(text: string) {
  const findings: Array<{ text: string; suggestion: string }> = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (!BLAME.test(sentence)) continue;
    const suggestion = sentence
      .replace(/human error/gi, "a process gap")
      .replace(/\bbroke\b/gi, "failed")
      .replace(/at fault/gi, "a contributing factor")
      .replace(/careless/gi, "unprotected by a guard")
      .replace(/negligent/gi, "missing a required check")
      .replace(/to blame/gi, "a contributing factor");
    findings.push({ text: sentence.trim(), suggestion: suggestion.trim() });
  }
  return findings;
}
