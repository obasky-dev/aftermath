import { and, eq } from "drizzle-orm";

import { analyzeIncident } from "./analysis.js";
import { newId } from "./incidents.js";
import { parseIncidentPack } from "./pack.js";
import { buildSummaries } from "./ship.js";
import { getDb, schema } from "../db/index.js";

type Owner = { userEmail?: string | null | undefined; orgId?: string | null | undefined };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function setStage(
  id: string,
  stage: string,
  progress: number,
  status: "running" | "complete" | "failed" = "running",
  error: string | null = null,
) {
  await getDb()
    .update(schema.ingestRuns)
    .set({ stage, progress, status, error, updatedAt: new Date().toISOString() })
    .where(eq(schema.ingestRuns.id, id));
}

export async function startIngestRun(
  incidentId: string,
  bundle: string,
  owner: Owner,
) {
  const [incident] = await getDb()
    .select({ id: schema.incidents.id, ownerEmail: schema.incidents.ownerEmail })
    .from(schema.incidents)
    .where(eq(schema.incidents.id, incidentId))
    .limit(1);
  if (!incident) throw new Error("Incident not found");

  const id = newId("run");
  await getDb().insert(schema.ingestRuns).values({
    id,
    incidentId,
    status: "running",
    stage: "queued",
    progress: 0,
    bundle,
    ownerEmail: owner.userEmail ?? "",
    orgId: owner.orgId ?? null,
  });
  void processIngestRun(id);
  return id;
}

export async function processIngestRun(id: string) {
  const [run] = await getDb()
    .select({
      id: schema.ingestRuns.id,
      incidentId: schema.ingestRuns.incidentId,
      status: schema.ingestRuns.status,
      stage: schema.ingestRuns.stage,
      progress: schema.ingestRuns.progress,
      bundle: schema.ingestRuns.bundle,
      ownerEmail: schema.ingestRuns.ownerEmail,
      orgId: schema.ingestRuns.orgId,
    })
    .from(schema.ingestRuns)
    .where(eq(schema.ingestRuns.id, id))
    .limit(1);
  if (!run || run.status !== "running") return;

  try {
    await setStage(id, "Log Analyst", 15);
    await sleep(450);

    const parsed = parseIncidentPack(run.bundle);
    for (const event of parsed.events) {
      const [existing] = await getDb()
        .select({ id: schema.incidentEvents.id })
        .from(schema.incidentEvents)
        .where(
          and(
            eq(schema.incidentEvents.incidentId, run.incidentId),
            eq(schema.incidentEvents.title, event.title),
            eq(schema.incidentEvents.at, event.at),
          ),
        )
        .limit(1);
      if (existing) continue;
      await getDb().insert(schema.incidentEvents).values({
        id: newId("evt"),
        incidentId: run.incidentId,
        at: event.at,
        kind: event.kind,
        title: event.title,
        source: event.source,
        confidence: event.confidence,
        isRootCause: false,
        eventStatus: "confirmed",
        editedBy: "agent",
        originalAt: event.at,
        ownerEmail: run.ownerEmail,
        orgId: run.orgId,
      });
    }
    await setStage(id, "Pattern Analyst", 55);
    await sleep(450);

    await analyzeIncident(run.incidentId, "current");
    await setStage(id, "Comms Writer", 80);
    await sleep(450);

    await buildSummaries(run.incidentId);
    await setStage(id, "complete", 100, "complete");
  } catch (error) {
    await setStage(
      id,
      "failed",
      100,
      "failed",
      error instanceof Error ? error.message : "Ingest failed",
    );
  }
}

export async function resumeIngestRuns() {
  try {
    const rows = await getDb()
      .select({
        id: schema.ingestRuns.id,
        ownerEmail: schema.ingestRuns.ownerEmail,
      })
      .from(schema.ingestRuns)
      .where(eq(schema.ingestRuns.status, "running"));
    for (const row of rows) {
      void processIngestRun(row.id);
    }
  } catch {
    // The table may not exist yet on the very first boot.
  }
}
