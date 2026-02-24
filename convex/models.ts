export const PROVIDERS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
} as const;

// All available models with default enabled state
// Single source of truth - imported by both frontend and backend
export const ALL_MODELS = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", defaultEnabled: false, provider: PROVIDERS.openai },
  { id: "gpt-4o", name: "GPT-4o", defaultEnabled: true, provider: PROVIDERS.openai },
  { id: "gpt-5.2", name: "GPT-5.2", defaultEnabled: true, provider: PROVIDERS.openai },
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", defaultEnabled: true, provider: PROVIDERS.openai },
  { id: "claude-opus-4-5-20251101", name: "Opus 4.5", defaultEnabled: true, provider: PROVIDERS.anthropic },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", defaultEnabled: true, provider: PROVIDERS.anthropic },
  { id: "claude-sonnet-4-20250514", name: "Sonnet 4", defaultEnabled: true, provider: PROVIDERS.anthropic },
  { id: "claude-sonnet-4-5-20250929", name: "Sonnet 4.5", defaultEnabled: false, provider: PROVIDERS.anthropic },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", defaultEnabled: true, provider: PROVIDERS.google },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", defaultEnabled: true, provider: PROVIDERS.google },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", defaultEnabled: false, provider: PROVIDERS.google },
  { id: "grok-3", name: "Grok 3", defaultEnabled: false, provider: PROVIDERS.xai },
  { id: "grok-4", name: "Grok 4", defaultEnabled: true, provider: PROVIDERS.xai },
  { id: "grok-code-fast-1", name: "Grok 4 Code", defaultEnabled: true, provider: PROVIDERS.xai },
] as const;

export type ModelId = typeof ALL_MODELS[number]["id"];

const MODEL_ID_ALIASES: Record<string, ModelId> = {
  // Claude 3.5 Haiku was retired by Anthropic; keep old IDs working for existing demos.
  "claude-3-5-haiku-latest": "claude-haiku-4-5-20251001",
};

export function resolveModelId(modelId: string): string {
  return MODEL_ID_ALIASES[modelId] ?? modelId;
}

// Helper to get display name from model id
export function getModelName(modelId: string): string {
  const model = ALL_MODELS.find(m => m.id === resolveModelId(modelId));
  return model?.name ?? modelId;
}
