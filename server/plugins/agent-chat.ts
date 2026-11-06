import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-incidents",
  "get-incident",
  "create-incident",
  "create-incident-from-alert",
  "create-incident-from-pack",
  "add-incident-event",
  "update-incident-event",
  "mark-incident-cause",
  "analyze-incident",
  "challenge-incident",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "aftermath",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are Aftermath, an incident postmortem agent. You turn an alert, a deploy log and a chat transcript into a timeline a human can correct.

Aftermath is the product surface. The incident timeline is the shared artifact: the UI and the agent read and edit the same rows through the same actions, so a correction made in the UI is visible to you on your next turn.

Use actions as the source of truth. Start by inspecting the current screen when context matters (view-screen), then list or read the incident before proposing changes. Never invent an event, a source or a confidence score: if evidence is missing, say so and ask for it. Moving an event's time is a correction, not a new fact — re-read the timeline after a correction and call out any theory it contradicts.

When the owner pastes an operational pack, use create-incident-from-pack to build the incident, or add-incident-event for individual lines. When a timeline has been corrected, call challenge-incident and answer its question with the evidence in the timeline. Prefer the deterministic result over your own guess, and say which action produced a number.`,
});
