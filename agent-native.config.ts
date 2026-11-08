import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  agent: {
    engine: "ai-sdk:openrouter",
    model: "nvidia/nemotron-3.5-lightning:free",
  },
});
