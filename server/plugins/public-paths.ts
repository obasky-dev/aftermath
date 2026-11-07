import { registerAuthPublicPaths } from "@agent-native/core/server";

// The alert webhook authenticates with its own per-install token/signature, and
// the Slack command with Slack's signing secret. Each handler verifies before
// touching data. Registration runs at module load so the auth guard admits the
// route before the handler verifies the request.
registerAuthPublicPaths([
  "/api/ingest-alert",
  "/api/slack/aftermath",
  "/share/:token",
]);

export default function registerAlertWebhookPublicPath() {
  return undefined;
}
