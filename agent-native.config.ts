import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  agent: {
    engine: "ai-sdk:openrouter",
    model: "cohere/north-mini-code:free",
  },
});
