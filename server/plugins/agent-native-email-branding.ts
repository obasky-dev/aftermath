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
  // Runtime agent config. The OpenAI-compatible engine reads OPENAI_API_KEY and
  // OPENAI_BASE_URL (River) from the deployment, so no visitor connects one.
  agent: {
    engine: "ai-sdk:openai",
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    mainChatMaxOutputTokens: 8192,
    emptyResponseRetryMaxOutputTokens: 8192,
  },
});
