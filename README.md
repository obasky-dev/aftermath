# Blameless

**An incident postmortem app where the timeline is a shared artifact: a human can correct it, and the agent re-reasons from the correction.**

Built for the [Agent-Native Hackathon](https://www.builder.io/hackathon) on Builder.io's open-source [Agent-Native](https://agent-native.com) framework.

---

## The problem

Every outage ends with someone rebuilding a timeline by hand from logs, deploys, alerts and chat. Then a group of tired people argues about the story, and the postmortem records whatever the loudest person remembered.

The timeline is the artifact that matters, and it is usually wrong in small ways: an event happened two minutes later than the first draft said, a deploy landed after the errors rather than before. Those small corrections change the conclusion.

## The 3-beat demo

1. **Read the timeline.** Open *Checkout latency spike*. Twelve events from 14:00 to 14:34 UTC, each with a source and a confidence score. The deploy sits at 14:02, the first failure at 14:03. Re-check says: **consistent**, one minute apart.
2. **Correct it.** Drag the deploy to 14:12. The correction saves through the same action the UI and the agent share.
3. **Re-check.** The verdict flips to **contradicted**: errors began nine minutes *before* the deploy, so the deploy cannot be the cause. The panel also notices that the corrected time now coincides with the database connection pool saturation at 14:12 — an alternative theory worth chasing. The agent sidebar narrates the same finding.

That is the whole thesis: the human corrects the record, and the agent re-reasons from the corrected record instead of defending its first answer.

## Why this is agent-native

- **One action, every surface.** `analyze-incident` is a plain typed function. The Re-check button calls it through a React hook, the agent calls it as a tool, and it is also reachable over HTTP and the CLI. There is no second implementation of the verdict.
- **Shared data.** The timeline lives in PostgreSQL (PGlite locally). A drag in the UI and a tool call from the agent write the same rows.
- **Shared application state.** The selected event is published to `selection` app state, so "move this one" resolves without the user naming it.
- **The agent narrates, it does not invent.** The verdict, the minute delta, the impact window and the nearest coincident event are deterministic. The model explains them; it is explicitly instructed not to fabricate events, sources or confidence scores.
- **Four-area parity.** Every feature has a UI, an action, written instructions (`AGENTS.md`) and application state.

## Actions

| Action | What it does |
| --- | --- |
| `list-incidents` | Incidents, newest first |
| `get-incident` | One incident with its timeline and action items |
| `create-incident` | Create an incident |
| `update-incident-event` | Correct an event's time, title, detail, confidence or suspected-cause flag |
| `analyze-incident` | Deterministic re-check: `consistent` / `weak` / `contradicted`, impact window, nearest signal |
| `seed-demo-incident` | Load the demo incident (idempotent; hidden from the model) |

## Run it locally

Prerequisites: **Node.js 22.22+** and **pnpm**.

```bash
git clone https://github.com/obasky-dev/blameless.git
cd blameless
pnpm install
pnpm dev
```

Open **http://localhost:8080** and choose *Continue as local dev*.

Then connect a model: a Builder.io account, or an Anthropic / OpenAI key under *Custom keys*. The data screens work without a model; the agent chat does not.

Load the demo incident from the empty state (**Load demo incident**) or, with the dev server stopped:

```bash
pnpm action seed-demo-incident
```

> PGlite locks its data directory to one process. Stop `pnpm dev` before running a CLI action, then start it again.

## Demo data

The seeded incident is fictional. Its evidence links point at `example.com` and an illustrative GitHub Actions URL; no real customer data is included. Timestamps are UTC so the server and client render the same timeline.

## Hackathon disclosure

Blameless was built during the Agent-Native Hackathon, starting **2026-11-04**, from the official `chat` starter template. The incident schema, migrations, actions, list and detail screens, horizontal timeline, drag-to-correct interaction, deterministic re-check and demo seed were all written during the event. No pre-existing product code was reused.

Built with Agent-Native, React Router, Drizzle ORM, PGlite, Tailwind CSS and Tabler icons.
