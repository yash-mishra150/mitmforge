export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Default AI settings for OpenRouter.
 */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "",
  model: "openrouter/auto",
};

/**
 * Load AI settings from localStorage with fallback to defaults.
 * Reads the key "mitmforge.ai" and merges partial settings over defaults.
 * Shortcut: key stored in localStorage, fine for a local debugging tool;
 * move to OS keychain if this ever ships beyond that.
 */
export function loadAiSettings(): AiSettings {
  const raw = localStorage.getItem("mitmforge.ai");
  let parsed: Partial<AiSettings> = {};
  try {
    if (raw) parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return {
    baseUrl: parsed.baseUrl ?? DEFAULT_AI_SETTINGS.baseUrl,
    apiKey: parsed.apiKey ?? DEFAULT_AI_SETTINGS.apiKey,
    model: parsed.model ?? DEFAULT_AI_SETTINGS.model,
  };
}

/**
 * Save AI settings to localStorage.
 * Shortcut: key stored in localStorage, fine for a local debugging tool;
 * move to OS keychain if this ever ships beyond that.
 */
export function saveAiSettings(s: AiSettings): void {
  localStorage.setItem("mitmforge.ai", JSON.stringify(s));
}