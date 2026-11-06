# FRAMEWORK MAP

Each primitive named in the build contract, mapped to the real API or file used here, and its honest status.

| Primitive | Real API / file | Status |
| --- | --- | --- |
| Shared actions | `defineAction()` in `actions/*.ts`; each is an agent tool, React hook (`useActionQuery` / `useActionMutation`), HTTP endpoint and CLI command | **In use.** 30+ actions. |
| Shared data | `createGetDb(schema)` + Drizzle (`server/db`), additive `runMigrations` in `server/plugins/db.ts` | **In use.** Versions 1–7. |
| Application state / selection | `setClientAppState("selection", { incidentId, eventId })`; `view-screen` action | **In use.** Selection is published on focus. |
| Agent chat | `AgentSidebar` + `createAgentChatPlugin` (`server/plugins/agent-chat.ts`) | **In use.** Domain prompt and first-turn tools. |
| Agent resources | `AGENTS.md`, skills directory, DB-backed resources | **Partial.** Instructions/skills written; custom sub-agent profiles not configured. |
| Webhook automation | Custom `POST /api/ingest-alert` with a per-install token in settings | **Partial.** Real intake and 202 creation, but a custom route, not the framework's `manage-automation` webhook. Framework webhook automations require in-app approval. |
| Durable run | `ingest_runs` table, `start-ingest`, `get-ingest-run`, boot resume in `server/plugins/ingest-resume.ts` | **Partial.** Survives a process restart with de-duplicated event inserts. This is not the framework's agent-run store. |
| Agent teams | Framework `agent-teams` tool / `spawnTask` | **Not wired.** |
| Generative UI | Built-in `render-inline-extension` / `create-extension` | **Not wired.** The what-if tuner is a normal client control. |
| MCP / A2A | Every action is exposed automatically by the framework | **Not verified.** No external client test was run. |
| Toolkit UI | `@agent-native/toolkit/ui/*` via local adapters (`@/components/ui/button`) | **In use.** |
| Public read-only route | `registerAuthPublicPaths(["/share/:token"])` + `server/routes/share/[token].get.ts` | **In use.** |
| Model | Builder connection (`claude-haiku-5-5`), or an Anthropic/OpenAI key | **Connected.** 15 requests/day on the free tier. |

## Where the contract and the build diverge

- The contract asks for **live** GitHub, Vercel, Slack, Linear, PagerDuty, Sentry, Supabase and Cloudflare adapters. This build ships the **connection surface and normalized fixture adapters**, clearly labelled. No live credentials are connected.
- The contract asks for **agent teams** and **generative UI**. The framework supports both; neither is wired here.
- The contract asks for provider **signatures, idempotency and retries**. The alert webhook has a timing-safe token, but provider HMAC verification and retry/backoff are not implemented.
- The contract asks for **undo/redo, zoom/pan and a command palette**. Not implemented.

Every gap above is marked rather than presented as done.
