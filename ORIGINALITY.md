# ORIGINALITY

## Pre-existing work

- **Agent-Native** framework and the official **`chat` starter template** (`npx @agent-native/core create ... --template chat`), started **2026-11-04**. The template supplied the app shell, auth, chat surfaces, toolkit primitives, migration plumbing and example actions.
- Open-source libraries: React, React Router, Vite, Drizzle, PGlite, Tailwind, Tabler icons, Inter.
- The demo incident, provider payloads and postmortem artifacts are **fictional fixtures** authored for the demo. No customer data is included.

## Built during the hackathon

- Incident, event, evidence, action-item and comment schema, plus migrations v1–v7.
- The deterministic analysis engine: onset, candidate causes, lag, hypothesis statuses and reasons, exposure, TTD/TTA/TTM/TTR, challenge questions.
- The incident list, detail, before/after comparison, horizontal draggable timeline, red-herring and agent/human state, metrics strip, hypothesis panel and correction log.
- Pack import (paste and file), cause marking, alert webhook and automation card.
- Readiness checklist, blame linter, audience summaries, fixture approval artifacts, Review & ship panel.
- Public read-only share page, print stylesheet, Slack copy, comments, filters.
- Connections surface with provider catalog, coverage meter, fixture adapters and delivery log.
- Durable ingest runs with boot resume, and the what-if rollback tuner.
- All proof scripts, CI workflow, screenshots and documentation.

## No reuse of product code

No code from SermonFlow or any other private product was copied into Aftermath. The domain language and utility patterns were learned from the same public framework, which is the intended starting point.

## Honest labelling

- Every fixture-backed connection, delivery and approval artifact is labelled `fixture` in the UI and the docs.
- The demo incident is explicitly fictional.
- No live provider call is claimed without a recorded result.
