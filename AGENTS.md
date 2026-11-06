# Aftermath — Agent Guide

Aftermath is an incident postmortem app. The product surface is the incident timeline at `/incidents`; chat is the agent surface beside it. `/` redirects to shared sign-in, then the incident list. Every incident operation is an action, so the UI and the agent edit the same rows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

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

## Blameless domain

Primary workflow: open an incident, read its timeline, correct an event, and let the agent re-reason from the correction.

- Routes: `/incidents` (list), `/incidents/:id` (timeline, strongest signals, action items). `app.homePath` is `/incidents`.
- Tables (`server/db/schema.ts`): `incidents`, `incident_events`, `incident_evidence`, `incident_action_items`. Incidents are workspace-visible: reads are intentionally not filtered by owner, because an incident room is shared by responders.
- Actions: `list-incidents` (text/severity/status filters), `get-incident`, `create-incident`, `create-incident-from-alert`, `create-incident-from-pack`, `add-incident-event`, `update-incident-event`, `mark-incident-cause`, `analyze-incident`, `challenge-incident`, `generate-postmortem`, `approve-postmortem`, `create-postmortem-share`, `list-incident-comments`, `add-incident-comment`, `update-incident-action-item`, `install-alert-webhook`, `delete-incident`, `seed-demo-incident` (demo data, hidden from the model).
- Discussion: `incident_comments` rows are part of the incident; `add-incident-comment` records a decision or question and `generate-postmortem` includes them. Comments are not timeline events.
- Sharing: `create-postmortem-share` stores `share_token` once; `/share/<token>` is public and read-only, registered in `server/plugins/public-paths.ts`. Never expose the token beyond the copied link.
- Automation: `POST /api/ingest-alert` is public but token-protected (settings key `alert-webhook`); it calls the same `create-incident-from-alert` logic as the agent. The incidents page installs the token and shows the curl. Never log the token or widen the public path.
- Import: `/incidents/new` pastes a pack (one timed event per line, kind in brackets, source after a pipe). `create-incident-from-pack` parses and stores it deterministically; the agent calls the same action. `add-incident-event` is for individual lines the agent finds in a conversation.
- Invariants: `update-incident-event` is the only way to correct a timeline; `at` is ISO 8601 with a UTC offset and stored normalized to UTC; `confidence` is 0–100; a correction must not create a new event. Never fabricate an event, a source, or a confidence score — if evidence is missing, say so.
- Re-check: `analyze-incident` is deterministic and read-only. It compares the suspected cause with the first failure, returns `consistent` / `weak` / `contradicted`, the impact window, and the nearest coincident event. `challenge-incident` turns that into evidence-based objections plus the one question that would settle it. The buttons and the agent call the same actions; the UI shows the structured result, the agent narrates it. Run them after any correction, before asserting causation.
- App state: view `incidents`, and the open incident id in the route. Use `view-screen` after a correction so the agent sees the edited timeline.
- Deferred until later days: postmortem drafting, the alert webhook, and production hardening.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
