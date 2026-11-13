import type { AiSettings } from "./settings";
import type { TrafficRow } from "../traffic/store";
import { chat } from "./client";

/**
 * Compact representation of a traffic row for AI analysis.
 */
export interface RowSummary {
  id: number;
  method: string;
  host: string;
  path: string;
  status: number | null;
  client: string | null;
}

/**
 * Convert traffic rows to summaries using the newest N rows.
 */
export function toSummaries(rows: TrafficRow[], limit: number): RowSummary[] {
  // rows are newest-first (store prepends), so the newest N are at the front.
  const selected = rows.slice(0, limit);
  const result: RowSummary[] = [];
  for (const r of selected) {
    const url = r.url;
    let host = "";
    let path = "";
    const proto = url.indexOf("://");
    if (proto !== -1) {
      const afterProto = url.slice(proto + 3);
      const slash = afterProto.indexOf("/");
      host = slash === -1 ? afterProto : afterProto.slice(0, slash);
      const rest = slash === -1 ? "" : afterProto.slice(slash);
      const q = rest.indexOf("?");
      const pathRaw = q === -1 ? rest : rest.slice(0, q);
      path = pathRaw.length > 120 ? pathRaw.slice(0, 120) : pathRaw;
    }
    result.push({
      id: r.id,
      method: r.method,
      host,
      path,
      status: r.status,
      client: r.client,
    });
  }
  return result;
}

/**
 * Build prompt for suspicious traffic analysis.
 */
export function buildSuspiciousPrompt(summaries: RowSummary[]): Array<{ role: "system" | "user"; content: string }> {
  const system = "You are a security-minded HTTP traffic analyst. You receive compact summaries of intercepted HTTP requests. Reply with ONLY a JSON array of suspicious items, each {\"id\": <number>, \"reason\": \"<max 12 words>\"}. Ids not listed are considered normal. Be conservative: flag only genuinely suspicious patterns (scanning, injection attempts, credential leaks, unusual data exfiltration, anomalous paths).";
  const user = JSON.stringify(summaries);
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Parse AI response into a record of suspicious IDs and reasons.
 */
export function parseSuspicious(text: string): Record<number, string> {
  let slice = text;
  const fenceStart = slice.indexOf("```json");
  const fenceEnd = slice.indexOf("```", fenceStart + 7);
  if (fenceStart !== -1 && fenceEnd !== -1) {
    slice = slice.slice(fenceStart + 7, fenceEnd);
  }
  const open = slice.indexOf("[");
  const close = slice.lastIndexOf("]");
  if (open === -1 || close === -1) return {};
  const jsonSlice = slice.slice(open, close + 1);
  let items: Array<{ id: number; reason: string }>;
  try {
    items = JSON.parse(jsonSlice);
  } catch {
    return {};
  }
  const result: Record<number, string> = {};
  for (const it of items) {
    if (typeof it?.id === "number" && typeof it?.reason === "string") {
      result[it.id] = it.reason;
    }
  }
  return result;
}

/**
 * Analyze traffic rows for suspicious patterns using AI.
 */
export async function analyzeSuspicious(
  rows: TrafficRow[],
  settings: AiSettings,
): Promise<Record<number, string>> {
  if (!settings.apiKey) throw new Error("No API key configured — open Settings");
  const summaries = toSummaries(rows, 50);
  const messages = buildSuspiciousPrompt(summaries);
  const response = await chat(settings, messages, 1024);
  return parseSuspicious(response);
}

/**
 * Build prompt for explaining a single HTTP exchange.
 */
export function buildExchangePrompt(
  row: TrafficRow,
  body: {
    req_headers: string | null;
    res_headers: string | null;
    req_body: string | null;
    res_body: string | null;
  } | null,
): Array<{ role: "system" | "user"; content: string }> {
  const system =
    "You are an expert HTTP debugger. Explain the exchange concisely: what it does, anything unusual, and (if it failed) why it failed. Max 150 words.";
  const reqHeaders = body?.req_headers || "(none)";
  const resHeaders = body?.res_headers || "(none)";
  const reqBody = body?.req_body || "(none)";
  const resBody = body?.res_body || "(none)";
  const user = `Method: ${row.method}
URL: ${row.url}
Status: ${row.status ?? "(none)"}
Request headers (${Math.min(reqHeaders.length, 2000)} chars):
${reqHeaders.slice(0, 2000)}
Request body (${Math.min(reqBody.length, 4000)} chars):
${reqBody.slice(0, 4000)}
Response headers (${Math.min(resHeaders.length, 2000)} chars):
${resHeaders.slice(0, 2000)}
Response body (${Math.min(resBody.length, 4000)} chars):
${resBody.slice(0, 4000)}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/**
 * Explain a specific HTTP exchange using AI.
 */
export async function explainRow(
  row: TrafficRow,
  body: {
    req_headers: string | null;
    res_headers: string | null;
    req_body: string | null;
    res_body: string | null;
  } | null,
  settings: AiSettings,
): Promise<string> {
  if (!settings.apiKey) throw new Error("No API key configured — open Settings");
  const messages = buildExchangePrompt(row, body);
  const response = await chat(settings, messages, 700);
  return response;
}