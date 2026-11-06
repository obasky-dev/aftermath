# DEMO — click-by-click

Target: a public Clips recording, under 3 minutes, of the real app.

## Pre-flight

1. Close Slack, Chrome tabs, and other heavy apps. The dev server needs memory.
2. `cd C:\Users\HP\blameless && pnpm dev`
3. Wait for `listening on http://localhost:8080`, then open the URL once and let the first page finish loading. Do not restart the server during the recording.
4. If the incident list is empty, click **Load demo incident**.
5. Open `/incidents` and confirm **Checkout API 5xx spike** is the first card.

Do not record a cold server. The first request after a restart can take minutes on this machine.

## Beats

### 0:00 — The thesis (landing)

Say: *"A postmortem is a story about cause and effect. When the timeline is wrong, the conclusion is wrong. Move one event and watch the conclusion change."*

Click **Open the correction demo**.

### 0:15 — The original story

Point at the comparison panel and the numbers:

- The r-482 deploy is at **13:40**.
- The database failover at 14:00 is the **leading** theory, **5 minutes** before onset.
- The deploy is **25 minutes early**, so it is outcompeted.
- Exposure is **43 minutes**.
- Metrics: detect 25, acknowledge 4, mitigate 14, resolve 18.

### 0:45 — The correction

Say: *"The incident channel says r-482 was promoted at 14:02, not built at 13:40."*

Click **Try the correction** (or drag the deploy to 14:02).

Point at the change:

- The deploy now leads at **3 minutes**.
- Exposure drops to **21 minutes**.
- The database failover becomes **outcompeted and contradicted** by the flat DB connection-error metric.
- The candidate-causes panel shows the contradiction with its evidence.

### 1:15 — The challenge

Click **Challenge this correction**. Read the strongest objection and the settling question. Optionally click **Ask the agent to answer** and let the sidebar respond.

### 1:35 — Durable ingest (optional)

In **Durable ingest**, press **Start ingest**. The stepper runs **Log Analyst → Pattern Analyst → Comms Writer** with live progress. Say: *"An interrupted run resumes from its last stage."*

### 1:55 — Review and ship

Scroll to the postmortem:

- **Review & ship**: seven readiness checks are green.
- Switch audience tabs: engineer, executive, customer.
- Click **Approve & ship**. Five artifacts appear: Linear issues, GitHub draft PR, Slack post, Statuspage draft, Notion export. Say: *"These are fixture-backed until provider credentials are connected — the labels say so."*
- Click **Share** to copy the public, read-only postmortem link. Optionally open it logged out.

### 2:40 — Close

Say: *"The human corrects the record. The agent recomputes it. The postmortem cites the correction."*

## Fallbacks

- **Agent does not answer**: skip the chat beat; the deterministic verdict, challenge and postmortem carry the demo. Do not wait on camera.
- **Server cold**: wait on the loading state; do not reload repeatedly.
- **Seed missing**: click **Load demo incident**.
- **Durable ingest stalls**: it is optional; cut to the postmortem.
- **Connections**: `/connections` is a separate 30-second breadth beat, not required in the main story.

## Honesty rules

- Say **fixture** when an artifact or delivery is fixture-backed. The UI labels every one.
- Never imply a live integration is connected when the card says fixture.
- Never read numbers that the UI does not show.
