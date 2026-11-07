# FRAMEWORK MAP

Each primitive named in the build contract, mapped to the real API or file used here, and its honest status.

| Primitive | Real API / file | Status |
| --- | --- | --- |
| Shared actions | `defineAction()` in `actions/*.ts`; each is an agent tool, React hook (`useActionQuery` / `useActionMutation`), HTTP endpoint and CLI command | **In use.** 30+ actions. |
| Shared data | `createGetDb(schema)` + Drizzle (`server/db`), additive `runMigrations` in `server/plugins/db.ts` | **In use.** Versions 1–9, including delivery idempotency. |
| Application state / selection | `setClientAppState("selection", { incidentId, eventId })`; `view-screen` action | **In use.** Selection is published on focus. |
| Agent chat | `AgentSidebar` + `createAgentChatPlugin` (`server/plugins/agent-chat.ts`) | **In use.** Domain prompt and first-turn tools. |
| Agent resources | `AGENTS.md`, `.agents/skills/*/SKILL.md`, DB-backed resources | **In use.** Domain guide and the `incident-team` skill; custom sub-agent profiles are not seeded as resources. |
| Webhook automation | Custom `POST /api/ingest-alert` with a per-install token and HMAC secret in settings; delivery-id dedupe | **In use.** Real intake, 202 creation, `duplicate: true` replay, stale-signature rejection and recorded rejections. A custom route, not the framework's `manage-automation` webhook. |
| Durable run | `ingest_runs` table, `start-ingest`, `get-ingest-run`, boot resume in `server/plugins/ingest-resume.ts` | **Partial.** Survives a process restart with de-duplicated event inserts. This is not the framework's agent-run store. |
| Agent teams | Framework `agent-teams` tool, briefed by `.agents/skills/incident-team/SKILL.md` | **Wired by instruction.** Roles, handoff rules and approval limits are written; no model run is recorded in CI. |
| Generative UI | `chatUI.renderer` on four actions + `registerActionChatRenderer()` in `app/components/chat/aftermath-cards.tsx`; `render-inline-extension` remains available to the agent | **In use.** Analysis, rollback slider, conflict and challenge cards; action results are the only data source. |
| MCP / A2A | Every action is exposed automatically by the framework | **Not verified.** No external client test was run. |
| Toolkit UI | `@agent-native/toolkit/ui/*` via local adapters (`@/components/ui/button`) | **In use.** |
| Public signed route | `registerAuthPublicPaths(["/api/slack/aftermath", ...])` + Slack `v0` HMAC verification in the route | **In use.** Signed `status` and `move` commands call the same event-update function as the UI. |
| Public read-only route | `registerAuthPublicPaths(["/share/:token"])` + `server/routes/share/[token].get.ts` | **In use.** |
| Model | Builder connection (`claude-haiku-5-5`), or an Anthropic/OpenAI key | **Connected.** 15 requests/day on the free tier. |

## Where the contract and the build diverge

- The contract asks for **live** GitHub, Vercel, Slack, Linear, PagerDuty, Sentry, Supabase and Cloudflare adapters. This build ships the connection surface, normalized fixture adapters and real inbound HMAC/idempotency, clearly labelled. No live provider credential is connected; these are **UNVERIFIED-LIVE**.
- Outbound retry/backoff is not implemented for fixture deliveries. The Slack Web API path uses the framework provider-API runtime with approval, and pauses for a workspace connection.
- **Deployment** is live on Vercel with Neon Postgres. The deployed app has no model key, so the chat agent asks for one; every deterministic surface works.
- **Browser automation** for drag/zoom/undo and the chat cards is not in CI; SSR and all actions are.
- Recurrence memory uses a **keyword fallback**, labelled, not embeddings.

Every gap above is marked rather than presented as done.
