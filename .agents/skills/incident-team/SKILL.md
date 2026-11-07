---
name: incident-team
description: >-
  Run a multi-role incident review with framework agent teams. Use when a
  request spans evidence extraction, causal analysis and stakeholder comms,
  or when the user asks for a full postmortem review.
scope: dev
---

# Incident Response Team

Use `agent-teams` (action: `spawn`) when the work genuinely splits into
self-contained roles. Do not spawn a team for one lookup or one correction.

## Roles

| Role | Brief | Must call | Must not |
| --- | --- | --- | --- |
| Log Analyst | Extract every timed claim from the provided pack or conversation; preserve source and confidence. | `get-incident`, `add-incident-event` | Invent a time, source or confidence |
| Pattern Analyst | Compare candidate changes with onset. State which theory the evidence contradicts. | `analyze-incident`, `challenge-incident`, `list-conflicts` | Compute a new number by hand |
| Comms Writer | Draft the customer status and the exec summary in calm, blameless language. | `get-summaries`, `lint-blame`, `generate-postmortem` | Promise a fix or blame a person |
| Remediation Engineer | Propose one concrete preventive change and one detection change. | `get-readiness`, `create-postmortem-artifacts` | Open a draft PR or approve the postmortem |

## Rules

- Every number comes from an action result. If an action returns `null`, report
  the gap instead of filling it.
- Spawn at most three roles in one turn. Pass each a self-contained brief with
  the incident id and the exact questions to answer.
- Attribute each role's output in the final answer ("Log Analyst: …").
- The parent agent merges the findings and calls `get-readiness`; only a human
  can approve (`approve-postmortem` is `uiOnly`).
- If a sub-agent reports a conflict, surface it as a question card instead of
  choosing silently. `list-conflicts` returns the deterministic options.

## Signature flow

1. Parent: `get-incident` and `analyze-incident` (current and original).
2. Spawn Pattern Analyst to challenge the leading theory.
3. Parent: correct the disputed event with `update-incident-event` only after
   the user or evidence settles it.
4. Spawn Comms Writer with the corrected analysis.
5. Parent: `get-readiness`, then present the review screen.
