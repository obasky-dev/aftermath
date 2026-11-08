/**
 * Seed the composer's model selection before any chat mounts. The server pins
 * the same engine/model in defineAppConfig; this makes the configured model
 * the default for every visitor. A choice a visitor makes in the picker is
 * preserved on later visits.
 */
const SELECTION = {
  model: "qwen/qwen3.8-27b",
  engine: "ai-sdk:openai",
  effort: "auto",
} as const;

// Earlier builds seeded these; move those visitors to the configured model.
const PREVIOUS_DEFAULTS = new Set([
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
]);

const KEYS = [
  "agent-native:chat-models:selection",
  "agent-native:chat-models:selection:chat",
];

if (typeof window !== "undefined") {
  for (const key of KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      const current = raw ? (JSON.parse(raw) as { model?: unknown } | null) : null;
      const model = typeof current?.model === "string" ? current.model : "";
      if (!model || PREVIOUS_DEFAULTS.has(model)) {
        window.localStorage.setItem(key, JSON.stringify(SELECTION));
      }
    } catch {
      // Storage can be unavailable in private modes; the server config still
      // selects the engine and model.
    }
  }
}

export {};
