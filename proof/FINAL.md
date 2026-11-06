# FINAL PROOF

Date: 2026-11-06. Repo: `obasky-dev/aftermath`.

## Verified

| Item | Evidence |
| --- | --- |
| Typecheck | CI `verify` job, clean |
| Framework guards | CI `verify` job, 14 guards, clean |
| Unit tests | 4 parser tests pass |
| Contract timeline | HTTP proof: original `weak`, deploy 25 min early, failover leads at 5, exposure 43 |
| Correction | HTTP proof: deploy moved to 14:02, `consistent`, lag 3, exposure 21 |
| Contradiction | HTTP proof: DB failover `contradicted` by flat connection errors |
| Postmortem | HTTP proof: correction log 13:40 → 14:02, metrics and candidate causes |
| Challenge | HTTP proof: 3 evidence-based objections and the settling question |
| Approval gate | HTTP: 403 outside the signed-in UI |
| Comments / share / filters | HTTP: added and listed, public page 200 without a session, filters 1 vs 0 |
| Alert webhook | HTTP: wrong token 401, valid alert 202 and a sev1 incident with its source |

The last full HTTP run printed **26/27**; the single failure was the old incident title in the share assertion. It was fixed and the public page was confirmed separately (200, title and Discussion present).

## Implemented but not runtime-verified

The machine had **7.3 GB RAM, 1.1 GB free** at the end. The dev server hit a JavaScript heap OOM right after `create-postmortem-artifacts` returned 200, and the shell began failing `fork`.

- Review & ship readiness, summaries and artifacts: implemented and typechecked; the artifact action returned 200 before the OOM; the full proof did not print.
- Durable ingest stepper and what-if tuner: implemented and typechecked by CI; not exercised in a running app.
- Connections surface and fixture deliveries: typechecked and CI-green; not exercised in a running app.
- Browser pass over the new Review & ship, Connections, Durable ingest and What-if UI: not run.

## Not built

- Live provider adapters with signatures, idempotency and retries.
- Agent teams and generative UI.
- Undo/redo, zoom/pan, command palette, ±5 minute shortcuts, number-morph animations.
- Recurrence memory, detection gap, conflict-resolution cards.
- `DEMO.md` beats beyond the current UI are written; the Clips recording does not exist.
- Deployment.

## Environment

- 7.3 GB RAM; 1.1 GB free.
- Disk 3.3 GB free of 238 GB.
- PGlite locks `./data/pglite` to one process; stale locks must be removed after a crash.
- Dev-server cold start on this machine can take minutes; do not restart during a recording.

Run `pnpm dev` after freeing memory. The app is not running now.
