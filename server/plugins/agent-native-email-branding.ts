import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  app: {
    // This name appears in transactional emails. Change it to your product name.
    name: "Aftermath",
    // The source template keeps a renamed app from inheriting first-party email branding.
    sourceTemplate: "chat",
    // Sign-in lands on the incident list, the product's primary surface.
    homePath: "/incidents",
    // Optional: use your own absolute HTTPS logo URL in transactional emails.
    // logoUrl: "https://example.com/logo.png",
  },
  // Runtime agent config. The engine reads OPENROUTER_API_KEY from the
  // deployment environment, so no visitor is asked to connect a provider.
  agent: {
    engine: "ai-sdk:openrouter",
    model: "nvidia/nemotron-3.5-lightning:free",
  },
});
