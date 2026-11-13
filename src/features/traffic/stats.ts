import type { TrafficRow } from "./store";
import { groupByApp, parseHost } from "./selectors";

/**
 * Calculate summary statistics from traffic rows.
 */
export function totals(rows: TrafficRow[]): {
  requests: number;
  responded: number;
  errors: number;
  dataBytes: number;
  avgMs: number | null;
} {
  const requests = rows.length;
  const responded = rows.filter((r) => r.status !== null).length;
  const errors = rows.filter((r) => r.status !== null && r.status >= 400).length;
  const dataBytes = rows.reduce((sum, r) => sum + (r.resSize ?? 0), 0);
  const durations = rows.filter((r) => r.durationMs !== null).map((r) => r.durationMs!);
  const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  return { requests, responded, errors, dataBytes, avgMs };
}

/**
 * Count traffic rows by HTTP status category (1xx..5xx).
 */
export function statusBreakdown(rows: TrafficRow[]): Array<{ status: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.status === null) continue;
    const key = Math.floor(r.status / 100) + "xx";
    map.set(key, (map.get(key) || 0) + 1);
  }
  const out = Array.from(map.entries()).map(([status, count]) => ({ status, count }));
  out.sort((a, b) => b.count - a.count);
  return out;
}

/**
 * Return top N apps using groupByApp from selectors.
 */
export function topApps(rows: TrafficRow[], n: number): Array<{ client: string; count: number }> {
  const all = groupByApp(rows);
  return all.slice(0, n);
}

/**
 * Extract host from URL and return top N domains (hosts only).
 */
export function topDomains(rows: TrafficRow[], n: number): Array<{ host: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const host = parseHost(r.url);
    if (!host) continue;
    map.set(host, (map.get(host) || 0) + 1);
  }
  const out = Array.from(map.entries()).map(([host, count]) => ({ host, count }));
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, n);
}

/**
 * Return the top N slowest responded rows (durationMs desc).
 */
export function slowest(rows: TrafficRow[], n: number): TrafficRow[] {
  const responded = rows.filter((r) => r.durationMs !== null);
  responded.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
  return responded.slice(0, n);
}

/**
 * Bucket durations into fixed ranges over responded rows.
 */
export function durationBuckets(rows: TrafficRow[]): Array<{ label: string; count: number }> {
  const buckets = [
    { label: "<100ms", count: 0 },
    { label: "100–500ms", count: 0 },
    { label: "0.5–1s", count: 0 },
    { label: "1–5s", count: 0 },
    { label: ">5s", count: 0 },
  ];
  for (const r of rows) {
    if (r.durationMs === null) continue;
    const ms = r.durationMs;
    let idx = 0;
    if (ms >= 5000) idx = 4;
    else if (ms >= 1000) idx = 3;
    else if (ms >= 500) idx = 2;
    else if (ms >= 100) idx = 1;
    else idx = 0;
    buckets[idx].count++;
  }
  return buckets;
}