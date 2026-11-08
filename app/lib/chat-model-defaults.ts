/**
 * Seed the composer's model selection before any chat mounts. The server pins
 * the same engine/model in defineAppConfig; this also pins reasoning to "none"
 * so the fast, non-reasoning path is the default for every visitor. A choice a
 * visitor makes in the picker is preserved on later visits.
 */
const SELECTION = {
  model: "cohere/north-mini-code:free",
  engine: "ai-sdk:openrouter",
  effort: "none",
} as const;

const KEYS = [
  "agent-native:chat-models:selection",
  "agent-native:chat-models:selection:chat",
];

if (typeof window !== "undefined") {
  for (const key of KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      const current = raw ? (JSON.parse(raw) as { model?: unknown } | null) : null;
      if (!current || typeof current.model !== "string" || current.model.length === 0) {
        window.localStorage.setItem(key, JSON.stringify(SELECTION));
      }
    } catch {
      // Storage can be unavailable in private modes; the server config still
      // selects the engine and model.
    }
  }
}

export {};
