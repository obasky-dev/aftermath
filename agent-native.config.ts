import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  agent: {
    engine: "ai-sdk:openai",
    model: "qwen/qwen3.8-27b",
  },
});
