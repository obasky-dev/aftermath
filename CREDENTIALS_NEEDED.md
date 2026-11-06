# CREDENTIALS NEEDED

Tracked here so nothing is hardcoded or committed. Secrets belong in `.env` (git-ignored) or the host's environment, never in the repository.

## Present

- **Vercel CLI**: logged in as `obasky-dev`. No project is linked yet.
- **GitHub CLI**: authenticated as `obasky-dev` with `repo` scope.
- **Builder.io model connection**: configured in the app (`claude-haiku-5-5`), 15 requests/day on the free tier.

## Needed for a live deployment

- `DATABASE_URL` — a hosted Postgres (Neon or Vercel Postgres). The production server refuses local PGlite by design.
- `BETTER_AUTH_SECRET` — a random 32-byte secret.
- `SECRETS_ENCRYPTION_KEY` — a random 32-byte secret.
- `AGENT_NATIVE_RELEASE_MIGRATIONS=1`.
- A model key if not using a signed-in Builder session (`BUILDER_PRIVATE_KEY` or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`).

A `vercel.json` for the Nitro Vercel preset has not been added yet. The reference command is:

```
NITRO_PRESET=vercel pnpm build && pnpm migrate:production
```

## Needed for live integrations

Each provider card stays `Connected (fixture)` until its credential exists. Read-only scopes only.

| Provider | Credential |
| --- | --- |
| GitHub | GitHub App or fine-grained PAT, `repo` read + draft PR write for the demo repo |
| Vercel | Read token + deployment webhook secret |
| Slack | App with Events API, signing secret, `/aftermath` slash command, chat:write |
| Linear | API key, team id, issue create/webhook |
| PagerDuty | Events API v2 webhook, read-only |
| Sentry | Integration token / alert webhook |
| Supabase | Read-only service key for logs and metrics |
| Cloudflare | Read-only API token for DNS and analytics |

No provider credential is present in this workspace. Every card says so.
