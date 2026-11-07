import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

import { isPublicDemo, PUBLIC_DEMO_EMAIL } from "../lib/public-demo.js";

// The public demo identity is issued by the auth layer itself, not by
// AUTH_DISABLED (which production refuses). While AFTERMATH_PUBLIC_DEMO is on,
// every request resolves to the demo identity; turn the flag off to sign in
// normally.
const demoSession = () => ({ email: PUBLIC_DEMO_EMAIL, emailVerified: true });

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
  getAdditionalSession: async () => (isPublicDemo() ? demoSession() : null),
  getAdditionalBrowserSession: async () => (isPublicDemo() ? demoSession() : null),
});
