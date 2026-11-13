import type { AiSettings } from "./settings";

/**
 * Send chat messages to OpenRouter AI API and get completion.
 */
export async function chat(
  settings: AiSettings,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxTokens?: number,
): Promise<string> {
  const url = `${settings.baseUrl}/chat/completions`;
  const body = {
    model: settings.model,
    messages,
    temperature: 0,
    max_tokens: maxTokens ?? 1024,
  };
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers["Authorization"] = `Bearer ${settings.apiKey}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error("unexpected AI response shape");
  }
  return data.choices[0].message.content;
}