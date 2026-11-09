import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  agent: {
    engine: "ai-sdk:openai",
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    mainChatMaxOutputTokens: 8192,
    emptyResponseRetryMaxOutputTokens: 8192,
  },
});
