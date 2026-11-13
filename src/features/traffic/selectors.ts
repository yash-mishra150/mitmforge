import type { TrafficRow } from "./store";

/**
 * Extract host part from URL.
 */
export function parseHost(url: string): string {
  const proto = url.indexOf("://");
  if (proto === -1) return url;
  const afterProto = url.slice(proto + 3);
  const slash = afterProto.indexOf("/");
  return slash === -1 ? afterProto : afterProto.slice(0, slash);
}

/**
 * Group traffic rows by client application (process name); null client → "(unknown)".
 */
export function groupByApp(rows: TrafficRow[]): Array<{ client: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const client = r.client ?? "(unknown)";
    map.set(client, (map.get(client) || 0) + 1);
  }
  const out = Array.from(map.entries()).map(([client, count]) => ({ client, count }));
  out.sort((a, b) => b.count - a.count);
  return out;
}

/**
 * Group rows by URL host, then by URL path (query string excluded), counts sorted desc.
 */
export function buildDomainTree(
  rows: TrafficRow[],
): Array<{ host: string; count: number; paths: Array<{ path: string; count: number }> }> {
  const hostMap = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const host = parseHost(r.url);
    if (!host) continue;
    const pathStart = r.url.indexOf("/", r.url.indexOf("://") + 3);
    const raw = pathStart === -1 ? "/" : r.url.slice(pathStart);
    const path = raw.includes("?") ? raw.slice(0, raw.indexOf("?")) : raw;
    if (!hostMap.has(host)) hostMap.set(host, new Map());
    const pathMap = hostMap.get(host)!;
    pathMap.set(path, (pathMap.get(path) || 0) + 1);
  }
  const out: Array<{ host: string; count: number; paths: Array<{ path: string; count: number }> }> = [];
  for (const [host, pathMap] of hostMap.entries()) {
    const paths = Array.from(pathMap.entries()).map(([path, count]) => ({ path, count }));
    paths.sort((a, b) => b.count - a.count);
    out.push({ host, count: paths.reduce((a, b) => a + b.count, 0), paths });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

/**
 * Rows whose id is in `pinned`, in pinned order (missing rows dropped).
 */
export function pinnedRows(rows: TrafficRow[], pinned: number[]): TrafficRow[] {
  if (!pinned.length) return [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return pinned.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/**
 * Parse the query string of a URL into decoded key/value pairs;
 * undecodable parts fall back to their raw text.
 */
export function parseQueryParams(url: string): Array<{ key: string; value: string }> {
  const q = url.indexOf("?");
  if (q === -1) return [];
  return url
    .slice(q + 1)
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      const key = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? "" : part.slice(eq + 1);
      try {
        return { key: decodeURIComponent(key), value: decodeURIComponent(value) };
      } catch {
        return { key, value };
      }
    });
}

/**
 * Map a MIME content type to a FilterBar chip key ("json", "form", …, "other").
 */
export function contentCategory(res: string | null, req: string | null): string {
  const t = (res || req || "").toLowerCase();
  if (!t) return "other";
  if (t.includes("json")) return "json";
  if (t.includes("graphql")) return "graphql";
  if (t.includes("urlencoded") || t.includes("form-data")) return "form";
  if (t.includes("xml")) return "xml";
  if (t.includes("javascript") || t.includes("ecmascript")) return "js";
  if (t.includes("css")) return "css";
  if (t.includes("html") || t.includes("pdf")) return "document";
  if (t.includes("image") || t.includes("audio") || t.includes("video")) return "media";
  return "other";
}
