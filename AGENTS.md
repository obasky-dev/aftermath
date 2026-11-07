# Aftermath — Agent Guide

Aftermath is an incident postmortem app. The product surface is the incident timeline at `/incidents`; chat is the agent surface beside it. `/` redirects to shared sign-in, then the incident list. Every incident operation is an action, so the UI and the agent edit the same rows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`, `.agents/skills/incident-team/SKILL.md` (multi-role reviews via agent teams). Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; incidents is `incidents` at `/incidents` and `/incidents/<id>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Aftermath domain

Primary workflow: open an incident, read its timeline, correct an event, and let the agent re-reason from the correction. Every operation is one action shared by the UI, the agent, HTTP, and MCP.

- Routes: `/incidents` (list), `/incidents/:id` (story comparison, timeline, conflicts, review), `/incidents/new` (pack import), `/connections`, `/share/:token` (public read-only). `app.homePath` is `/incidents`.
- Tables (`server/db/schema.ts`): `incidents`, `incident_events`, `incident_evidence`, `incident_action_items`, `incident_comments`, `postmortem_artifacts`, `integration_state`, `integration_deliveries`, `ingest_runs`, `past_incidents`. Incidents are workspace-visible: reads are intentionally not filtered by owner, because an incident room is shared by responders.
- Timeline actions: `list-incidents`, `get-incident` (events carry their evidence), `create-incident`, `create-incident-from-alert`, `create-incident-from-pack`, `add-incident-event`, `update-incident-event` (time, confidence, cause, `eventStatus`), `delete-incident-event`, `mark-incident-cause`, `delete-incident`, `seed-demo-incident` (demo data, hidden from the model).
- Analysis actions: `analyze-incident` (mode `original` or `current`; deterministic), `challenge-incident`, `list-conflicts` (question cards with one-click patches), `find-similar-incidents` (keyword-Jaccard fallback, labelled), `detection-gap`, `simulate-rollback` (what-if exposure), `get-summaries` (engineer/exec/customer).
- Shipping actions: `generate-postmortem`, `approve-postmortem` (`uiOnly`, human-only), `get-readiness` (7 checks), `lint-blame`, `create-postmortem-artifacts` (7 fixture artifacts), `get-postmortem-artifacts`, `create-postmortem-share`.
- Discussion: `list-incident-comments`, `add-incident-comment`, `delete-incident-comment`. Comments are decisions/questions, not timeline events; the postmortem includes them.
- Connections and automation: `list-integrations`, `connect-integration`, `disconnect-integration`, `test-integration`, `send-integration-fixture`, `list-integration-deliveries`. Fixture mode is the default and every card/delivery says so; provider credentials would switch mode to live without changing the adapter contract. `POST /api/ingest-alert` is public but token-protected (settings key `alert-webhook`) and calls the same alert logic as the agent.
- Durable ingest: `start-ingest` and `get-ingest-run` run Log Analyst → Pattern Analyst → Comms Writer stages, visible in `DurableIngestCard`, resumable across restarts (`server/plugins/ingest-resume.ts`).
- Generative UI: `analyze-incident`, `simulate-rollback`, `list-conflicts` and `challenge-incident` declare `chatUI` renderers. They are registered in `app/components/chat/aftermath-cards.tsx`; return the full action result, do not use `projectResult`.
- Invariants: `update-incident-event` is the only way to correct a timeline; `at` is ISO 8601 with a UTC offset and stored normalized to UTC; `confidence` is 0–100; a correction must not create a new event. Never fabricate an event, a source, or a confidence score — if evidence is missing, say so.
- Conflicts: `list-conflicts` is the shared source of truth. `recommendedOptionId` identifies the defensible resolution; `patch` is an `update-incident-event` body. A `red_herring` event is excluded from the candidate causes, so resolving a conflict actually changes the analysis.
- App state: view `incidents`, and the open incident id in the route. Use `view-screen` after a correction so the agent sees the edited timeline.
- Team protocol: for multi-step reviews, read `.agents/skills/incident-team/SKILL.md` and use `agent-teams` spawn. Attribute each role's output; never let a sub-agent approve or ship.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
