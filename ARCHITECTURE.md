# ARCHITECTURE

## Stack

- **Agent-Native** (`@agent-native/core`, `@agent-native/toolkit`) on React Router 8, Vite, Nitro.
- **PostgreSQL** via Drizzle: PGlite locally, hosted Postgres in production.
- **Turns**: every operation is a `defineAction()` in `actions/`. The UI calls actions through React hooks, the agent calls them as tools, and the same actions are exposed over HTTP, the CLI and MCP.
- **UI**: warm paper/ink design tokens in `app/global.css`, Tabler icons, toolkit primitives.

## Data

| Table | Purpose |
| --- | --- |
| `incidents` | title, severity, status, service, source, start/resolve, summary, customer status, approval and share token |
| `incident_events` | timestamp, original timestamp, kind, title, source, confidence, suspected cause, `event_status` (confirmed / red\_herring), `edited_by` |
| `incident_evidence` | evidence rows attached to an event |
| `incident_action_items` | owner team, status |
| `incident_comments` | discussion, included in the postmortem |
| `postmortem_artifacts` | Linear/GitHub/Slack/Statuspage/Notion drafts, `mode` live or fixture |
| `integration_state` / `integration_deliveries` | provider connection state and delivery log, including idempotency keys |
| `ingest_runs` | durable ingest stage, progress, bundle, error |
| `past_incidents` | seeded recurrence memory: title, summary, root-cause tag |

Migrations are additive and live in `server/plugins/db.ts` (versions 1–9).

## Deterministic engine

`server/lib/analysis.ts`:

1. **Onset** = the first sustained failure event.
2. **Candidates** = deploy events and change-shaped events (failover, migration, config, DNS, certificate, scaling, quota, feature flag).
3. **Lag** = onset − candidate time.
4. **Status**:
   - `leading`: smallest non-negative lag within 10 minutes;
   - `plausible`: also within 10 minutes but not first;
   - `contradicted`: a non-leading candidate with contradicting evidence (the DB failover vs. flat connection errors);
   - `outcompeted`: later than onset or more than 10 minutes early;
   - `unverifiable`: plausible but with no connected source that can confirm it.
5. **Exposure** = marked cause → recovery. **Impact** = onset → recovery.
6. **Metrics**: TTD, TTA, TTM, TTR.

The LLM never computes a number. It reads the computed result and narrates it; the prompt forbids invented events, sources or confidence.

## Actions

- Incidents: `list-incidents`, `get-incident`, `create-incident`, `update-incident-event`, `delete-incident-event`, `mark-incident-cause`, `create-incident-from-alert`, `create-incident-from-pack`, `add-incident-event`, `delete-incident`, `seed-demo-incident`.
- Analysis: `analyze-incident` (current / original), `challenge-incident`, `list-conflicts`, `simulate-rollback`, `find-similar-incidents`, `detection-gap`, `get-readiness`, `lint-blame`, `get-summaries`.
- Postmortem: `generate-postmortem`, `approve-postmortem`, `create-postmortem-share`, `create-postmortem-artifacts`, `get-postmortem-artifacts`.
- Discussion: `list-incident-comments`, `add-incident-comment`, `delete-incident-comment`.
- Connections: `list-integrations`, `connect-integration`, `disconnect-integration`, `test-integration`, `send-integration-fixture`, `list-integration-deliveries`.
- Ingest: `start-ingest`, `get-ingest-run`.

## Durability

`ingest_runs` is the durable state. `start-ingest` returns a run id immediately and processes three stages. `server/plugins/ingest-resume.ts` re-runs any `running` row at boot. Event inserts are de-duplicated by incident + title + time, so a resumed run does not duplicate the timeline.

This is a product-level durable run, not the framework's agent-run store. It survives a process restart; it does not survive a database reset.

## Timeline interaction

`app/components/incidents/IncidentTimeline.tsx` is a pointer- and keyboard-driven canvas. It maps a zoom window (1×–8×) to percentages, supports wheel zoom and pan, drags with a live minute tooltip and an original-time ghost, and exposes ↑/↓ moves of 1 and 5 minutes. The page keeps a client-side history so undo/redo can call the same `sendMove` path. Every mutation goes through `updateIncidentEvent` in `server/lib/incidents.ts`, which writes `original_at` once.

Evidence popovers read the evidence rows attached to each event; `get-incident` returns them, so the popover and the agent see the same links.

## Conflicts and generative UI

`list-conflicts` is deterministic: an uncertain change (confidence < 60) compared with the nearest later promotion claim, plus every contradicted hypothesis compared with the evidence that contradicts it. Each conflict carries the two events, a question, and options whose `patch` is an exact `update-incident-event` body. Marking an event `red_herring` removes it from candidate causes in `analysis.ts`, which is why resolving a conflict changes the verdict.

Four actions declare `chatUI` renderers (`aftermath.analysis-card`, `aftermath.rollback-card`, `aftermath.conflict-card`, `aftermath.challenge-card`). `app/components/chat/aftermath-cards.tsx` registers them once; the agent chat renders the same result the page uses.

## Sharing and public routes

- `/share/<token>` renders the postmortem as read-only HTML without a session (`server/routes/share/[token].get.ts`, enabled by `registerAuthPublicPaths`).
- `/api/ingest-alert` authenticates with a per-install token or an HMAC-SHA256 signature over `timestamp.rawBody`, rejects timestamps older than five minutes, and dedupes on `x-aftermath-delivery`.
- `/api/slack/aftermath` verifies Slack's `v0` signature scheme and runs `updateIncidentEvent` for `status` and `move` commands. Ambiguous event queries are refused rather than guessed.

## Connections

`server/lib/integrations.ts` defines the provider catalog and the evidence-coverage meter. Every provider is fixture-backed in this build. A fixture delivery normalizes into the same `incident_events` rows as a real provider would; connecting a real credential changes the label, not the adapter contract.

## Approval

`get-readiness` checks impact, marked cause, owner teams, a detection item, a prevention item, blame-free language, and unresolved competing theories. Approval is UI-only. It sets `postmortem_approved_at` and creates seven fixture artifacts from the computed facts (three Linear issues, GitHub draft PR, Slack post, Statuspage draft, Notion export); nothing is sent to a provider.

## Known limits

- The live deployment runs public demo mode (`AFTERMATH_PUBLIC_DEMO=1`): every request resolves to a demo identity through `getAdditionalSession`, destructive actions are closed, and no model key is deployed, so the agent chat asks for a provider key.
- No live provider credentials are connected. Every connection/artifact is labelled fixture (**UNVERIFIED-LIVE**).
- Outbound retry/backoff is not implemented for fixture deliveries.
- Recurrence memory is keyword Jaccard, not embeddings; the UI says so.
- Agent teams are wired by instruction (`.agents/skills/incident-team/SKILL.md`), not exercised by an automated model run.
- Browser-level interaction tests are not in CI; SSR and all HTTP actions are.
- Incidents are workspace-visible by design; there is no per-incident ACL.
