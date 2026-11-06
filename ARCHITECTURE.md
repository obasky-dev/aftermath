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
| `integration_state` / `integration_deliveries` | provider connection state and delivery log |
| `ingest_runs` | durable ingest stage, progress, bundle, error |

Migrations are additive and live in `server/plugins/db.ts` (versions 1–7).

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
- Analysis: `analyze-incident` (current / original), `challenge-incident`, `simulate-rollback`, `get-readiness`, `lint-blame`, `get-summaries`.
- Postmortem: `generate-postmortem`, `approve-postmortem`, `create-postmortem-share`, `create-postmortem-artifacts`, `get-postmortem-artifacts`.
- Discussion: `list-incident-comments`, `add-incident-comment`, `delete-incident-comment`.
- Connections: `list-integrations`, `connect-integration`, `disconnect-integration`, `test-integration`, `send-integration-fixture`, `list-integration-deliveries`.
- Ingest: `start-ingest`, `get-ingest-run`.

## Durability

`ingest_runs` is the durable state. `start-ingest` returns a run id immediately and processes three stages. `server/plugins/ingest-resume.ts` re-runs any `running` row at boot. Event inserts are de-duplicated by incident + title + time, so a resumed run does not duplicate the timeline.

This is a product-level durable run, not the framework's agent-run store. It survives a process restart; it does not survive a database reset.

## Sharing and public routes

- `/share/<token>` renders the postmortem as read-only HTML without a session (`server/routes/share/[token].get.ts`, enabled by `registerAuthPublicPaths`).
- `/api/ingest-alert` is the only other public route; a per-install token in settings authenticates it. The token is compared in constant time.

## Connections

`server/lib/integrations.ts` defines the provider catalog and the evidence-coverage meter. Every provider is fixture-backed in this build. A fixture delivery normalizes into the same `incident_events` rows as a real provider would; connecting a real credential changes the label, not the adapter contract.

## Approval

`get-readiness` checks impact, marked cause, owner teams, a detection item, a prevention item, blame-free language, and unresolved competing theories. Approval is UI-only. It sets `postmortem_approved_at` and creates five fixture artifacts from the computed facts; nothing is sent to a provider.

## Known limits

- No live provider credentials are connected. Every connection/artifact is labelled fixture.
- Agent teams and generative UI are not wired; the chat agent narrates and challenges, but does not spawn specialist sub-agents or render inline controls.
- No undo/redo, zoom/pan, or command palette yet.
- Incidents are workspace-visible by design; there is no per-incident ACL.
