import { registerAuthPublicPaths } from "@agent-native/core/server";

// The alert webhook authenticates with its own per-install token, checked in
// server/routes/api/ingest-alert.post.ts. Registration runs at module load so
// the auth guard admits the route before the handler verifies the token.
registerAuthPublicPaths(["/api/ingest-alert"]);

export default function registerAlertWebhookPublicPath() {
  return undefined;
}
