// All available models with default enabled state
// This file is shared between frontend and backend
export const ALL_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", defaultEnabled: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", defaultEnabled: false },
  { id: "gpt-5.2", name: "GPT-5.2", defaultEnabled: true },
  { id: "claude-opus-4-5-20251101", name: "Opus 4.5", defaultEnabled: true },
  { id: "claude-opus-4-1-20250805", name: "Opus 4.1", defaultEnabled: false },
  { id: "claude-sonnet-4-20250514", name: "Sonnet 4", defaultEnabled: true },
  { id: "claude-3-5-haiku-latest", name: "Haiku 3.5", defaultEnabled: true },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", defaultEnabled: false },
  { id: "claude-sonnet-4-5-20250929", name: "Sonnet 4.5", defaultEnabled: false },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", defaultEnabled: true },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", defaultEnabled: true },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", defaultEnabled: false },
  { id: "grok-4", name: "Grok 4", defaultEnabled: true },
] as const;

export type ModelId = typeof ALL_MODELS[number]["id"];

// Helper to get display name from model id
export function getModelName(modelId: string): string {
  const model = ALL_MODELS.find(m => m.id === modelId);
  return model?.name ?? modelId;
}
