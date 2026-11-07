# FINAL PROOF

Date: 2026-11-07. Repo: `obasky-dev/aftermath`. Branch: `master`.

## Verified

Every line below is from the GitHub Actions run for commit `3a190ea`, not a hand-run claim.

| Item | Evidence |
| --- | --- |
| Typecheck | `verify` job, clean |
| Framework guards | `verify` job, 14 guards, clean |
| Unit tests | 6 parser tests pass (including WebVTT and SRT) |
| HTTP proof | `runtime` job prints **55/55 checks passed** |
| Contract timeline | original `weak`, deploy 25 min early, failover leads at 5, exposure 43 |
| Correction | deploy moved to 14:02, `consistent`, lag 3, exposure 21 |
| Contradiction | DB failover `contradicted` by flat connection errors |
| Evidence links | the suspected cause returns its build-log evidence |
| Conflict cards | a timing conflict names both sides before the correction; it closes after, and a causal conflict appears with a one-click patch |
| One-click resolution | `eventStatus: red_herring` persists and removes the conflict |
| Postmortem | correction log 13:40 → 14:02, metrics and candidate causes |
| Challenge | 3 evidence-based objections and the settling question |
| Approval gate | 403 outside the signed-in UI |
| Approval artifacts | 7 fixture-labelled artifacts, listed back |
| Comments / share / filters | added and listed, public page 200 without a session, filters 1 vs 0 |
| Recurrence memory | the pool-exhaustion match is returned with its method label |
| Detection gap | 1 minute, with a concrete alert rule |
| What-if rollback | exposure recomputed 21 → 8 |
| Durable ingest | three stages, complete, 100% |
| Alert webhook | wrong token 401; valid alert 202 with its source; replay by delivery id returns duplicate |
| HMAC intake | valid signature accepted; stale signature 401 |
| Slack command | signed `status` returns `CONSISTENT`; unsigned 401; signed `move` lands on the same event row |
| Pages | `/incidents`, `/connections`, `/incidents/:id` return 200 with their SSR title and no error page |
| Live deployment (2026-11-07) | `https://aftermath-live.vercel.app` — opens without sign-in via the public-demo session; `/auth/session` returns the demo identity with no cookie; the seeded incident lists; `analyze-incident` returns `weak / 25 / 43`; `/share/03UO…` returns 200 logged out |

## Implemented, not browser-automated

These are typechecked and their actions are proven over HTTP, but no headless-browser test in CI exercises the pixels or the pointer/keyboard path:

- Timeline drag, ghost marker, zoom/pan, ±1/±5-minute keys, undo/redo and evidence popovers.
- Number-morph animation and the `was N` diff chip.
- Command palette entries and the `?` shortcut sheet.
- The four chat cards registered for `analyze-incident`, `simulate-rollback`, `list-conflicts` and `challenge-incident`.
- The agent-team protocol in `.agents/skills/incident-team/SKILL.md`; no model call is made in CI.

## Not built or not verified live

- **Live provider adapters**: GitHub, Vercel, Linear, PagerDuty, Sentry, Supabase and Cloudflare remain fixture-backed and labelled. No credential exists in this workspace. Marked **UNVERIFIED-LIVE**, as the contract requires.
- **Real Slack workspace round-trip**: the signature scheme is verified with a locally generated signature; no Slack app is installed.
- **Model connection in production**: no provider key is deployed, so the chat agent prompts for one. The deterministic timeline and every action work without it.
- **Browser automation on the live URL**: the live checks are HTTP; drag/zoom/chat-card pixels are still not automated.
- **Embeddings**: recurrence memory uses a keyword-Jaccard fallback and says so in the UI.
- **Browser visual/a11y pass**: not run in this environment; CI covers SSR and HTTP only.
- **Clips recording**: the owner's task.

## Environment

- 7.3 GB RAM; the dev server previously hit a JavaScript heap OOM locally, so CI is the runtime proof.
- Disk was tight during the build; free space was below 3 GB at points. No build output is committed.
- PGlite locks `./data/pglite` to one process; stop `pnpm dev` before CLI actions.

The app is not running locally. To re-derive the proof, push to `master` or run `pnpm dev` followed by `pnpm verify:timeline`.
