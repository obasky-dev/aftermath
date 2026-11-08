import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  agent: {
    engine: "ai-sdk:openai",
    model: "qwen/qwen3.8-27b",
    // Groq caps max_tokens at 16384 for this model.
    mainChatMaxOutputTokens: 8192,
    emptyResponseRetryMaxOutputTokens: 8192,
  },
});
