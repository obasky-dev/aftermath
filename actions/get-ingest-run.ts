import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Read a durable ingest run's status, current stage and progress. Poll it while the run is in progress.",
  schema: z.object({
    id: z.string().describe("Run id from start-ingest"),
  }),
  http: { method: "GET" },
  readOnly: true,
  outputSchema: z.object({
    id: z.string(),
    incidentId: z.string(),
    status: z.string(),
    stage: z.string(),
    progress: z.number(),
    error: z.string().nullable(),
    startedAt: z.string(),
    updatedAt: z.string(),
  }),
  run: async ({ id }) => {
    const [run] = await getDb()
      .select()
      .from(schema.ingestRuns)
      .where(eq(schema.ingestRuns.id, id))
      .limit(1);
    if (!run) {
      fail("Run not found.", { errorCode: "not_found", statusCode: 404 });
    }
    return {
      id: run.id,
      incidentId: run.incidentId,
      status: run.status,
      stage: run.stage,
      progress: run.progress,
      error: run.error,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
    };
  },
});
