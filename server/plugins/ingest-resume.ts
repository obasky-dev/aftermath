import { resumeIngestRuns } from "../lib/ingest.js";

// Resume any ingest run that was interrupted by a restart. The run row is the
// durable state; the tool-call journal is the unique event check in ingest.ts.
setTimeout(() => {
  void resumeIngestRuns();
}, 4000);

export default function resumeIngestOnBoot() {
  return undefined;
}
