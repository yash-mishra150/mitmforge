import { useEffect, useMemo, useState } from "react";
import { useTraffic } from "./store";
import { totals } from "./stats";
import { parseHost } from "./selectors";
import { commands, type SystemMetrics } from "../../bindings";
import { FileText, Cpu, MemoryStick } from "lucide-react";

/** Overview dashboard panel for traffic: hero metrics, volume chart, top hosts, flags, system resources. */
export function Overview() {
  const rows = useTraffic((s) => s.rows);
  const suspicious = useTraffic((s) => s.suspicious);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  // Poll system metrics every 2s while the overview is open.
  useEffect(() => {
    let alive = true;
    const poll = () => {
      void commands
        .systemMetrics()
        .then((m) => {
          if (alive) setMetrics(m);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const suspiciousEntries = Object.entries(suspicious).map(([idStr, reason]) => ({ id: Number(idStr), reason }));
  const totalsData = totals(rows);
  const errorRate =
    totalsData.requests > 0 ? ((totalsData.errors / totalsData.requests) * 100).toFixed(1) : "0";

  const volume = useMemo(() => buildVolume(rows), [rows]);

  const topHosts = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const host = parseHost(r.url);
      const key = host || "unknown";
      const arr = map.get(key);
      if (arr) arr.push(r);
      else map.set(key, [r]);
    }
    const total = rows.length || 1;
    return Array.from(map.entries())
      .map(([host, hostRows]) => {
        const count = hostRows.length;
        const durations = hostRows.filter((r) => r.durationMs !== null).map((r) => r.durationMs!);
        const avgMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
        return { host, count, avgMs, share: (count / total) * 100 };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [rows]);

  const activityRows = useMemo(() => {
    const flagged = suspiciousEntries.slice(0, 3).map(({ id, reason }) => ({ row: rows.find((r) => r.id === id), reason }));
    if (flagged.length > 0) return flagged;
    return rows.slice(-3).reverse().map((r) => ({ row: r, reason: null }));
  }, [suspicious, rows]);

  if (rows.length === 0) {
    // Even with no traffic, system resources stay visible.
    return (
      <div className="flex h-full flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface py-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-app">
            <FileText className="h-8 w-8 text-accent/60" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium text-fg">No traffic captured yet</h3>
            <p className="text-sm text-muted mt-1">Start the proxy and browse to see analytics</p>
          </div>
        </div>
        <SystemResourcesCard metrics={metrics} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-auto p-4">
      {/* Hero header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-accent font-mono">
            MITM Proxy // 127.0.0.1:8080
          </span>
          <span className="w-1 h-1 rounded-full bg-muted" />
          <span className="text-[10px] text-muted font-mono">v0.1.0</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Overview &amp; Insights</h1>
      </div>

      {/* Hero metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Total Requests */}
        <div className="relative group p-4 rounded-xl bg-surface transition-all hover:shadow-lg">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-wider text-muted">Total Requests</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-success/10 text-success">
              +{totalsData.responded} responded
            </span>
          </div>
          <div className="text-3xl font-semibold text-fg mb-1">
            {totalsData.requests.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span>live capture session</span>
          </div>
        </div>

        {/* Avg Latency */}
        <div className="relative group p-4 rounded-xl bg-surface transition-all hover:shadow-lg">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-wider text-muted">Avg Latency</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-accent/10 text-accent">p50</span>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-semibold text-fg">
              {totalsData.avgMs !== null ? Math.round(totalsData.avgMs) : "—"}
            </span>
            <span className="text-sm text-muted font-mono">ms</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>across responded requests</span>
          </div>
        </div>

        {/* Error Rate */}
        <div className="relative group p-4 rounded-xl bg-surface transition-all hover:shadow-lg">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-wider text-muted">Error Rate</span>
            {totalsData.errors > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-danger/10 text-danger">
                {totalsData.errors} failed
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-success/10 text-success">
                0 failed
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-3xl font-semibold text-fg">{errorRate}</span>
            <span className="text-sm text-muted font-mono">%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`w-1.5 h-1.5 rounded-full ${totalsData.errors > 0 ? "bg-danger" : "bg-success"}`} />
            <span>4xx + 5xx responses</span>
          </div>
        </div>
      </div>

      {/* Charts row: volume + top hosts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Request Volume chart */}
        <div className="lg:col-span-8 p-4 rounded-xl bg-surface">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="block text-[10px] uppercase tracking-widest text-muted">Telemetry Flow</span>
              <h2 className="text-lg font-medium text-fg mt-0.5">Request Volume</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-xs text-muted">Requests</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-xs text-muted">2xx OK</span>
              </div>
            </div>
          </div>
          {volume.buckets.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted">No timing data yet</div>
          ) : (
            <VolumeChart volume={volume} />
          )}
        </div>

        {/* Top Hosts */}
        <div className="lg:col-span-4 p-4 rounded-xl bg-surface">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="block text-[10px] uppercase tracking-widest text-muted">Distribution</span>
              <h3 className="text-lg font-medium text-fg mt-0.5">Top Hosts</h3>
            </div>
            <span className="text-[10px] font-mono text-muted">{topHosts.length} active</span>
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {topHosts.map(({ host, count, avgMs, share }) => (
              <div
                key={host}
                className="flex items-center justify-between p-2 rounded-lg bg-app hover:bg-surface transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-app/60 flex items-center justify-center text-accent font-semibold shrink-0">
                    {host.charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <div className="text-[13px] font-medium text-fg truncate">{host}</div>
                    <div className="text-[11px] text-muted">
                      {count} reqs · {avgMs !== null ? `${avgMs}ms` : "—"} avg
                    </div>
                  </div>
                </div>
                <span className="text-[10px] rounded bg-app text-muted px-1.5 py-0.5 font-mono shrink-0">
                  {share.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity & Flags */}
      <div className="p-4 rounded-xl bg-surface">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <h3 className="text-lg font-medium text-fg">Recent Activity &amp; Flags</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {activityRows.map(({ row, reason }) => {
            if (!row) return null;
            if (reason !== null) {
              return (
                <div key={row.id} className="p-3 rounded-lg bg-app border border-warning/20">
                  <p className="text-[13px] font-medium text-warning line-clamp-2">{reason}</p>
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    {row.method} {parseHost(row.url)}
                  </p>
                  <span className="inline-block mt-2 text-[10px] bg-warning/10 text-warning rounded px-1.5 py-0.5 font-mono">
                    FLAGGED
                  </span>
                </div>
              );
            }
            const url = row.url.length > 60 ? row.url.slice(0, 60) + "…" : row.url;
            return (
              <div key={row.id} className="p-3 rounded-lg bg-app">
                <p className="text-[13px] font-medium text-fg truncate">{parseHost(row.url)}</p>
                <p className="text-[11px] text-muted truncate mt-0.5">
                  {row.method} {url}
                </p>
                <span className="inline-block mt-2 text-[10px] bg-accent/10 text-accent rounded px-1.5 py-0.5 font-mono">
                  {row.status ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* System Resources — live CPU/Memory (polls every 2s) */}
      <SystemResourcesCard metrics={metrics} />
    </div>
  );
}

type VolumeData = {
  /** Bucket start timestamps (ms) when data exists, else empty. */
  buckets: number[];
  /** Total requests per bucket. */
  requests: number[];
  /** 2xx responses per bucket. */
  ok: number[];
};

/** Bucket rows into 24 equal time slices between the first and last request. */
function buildVolume(rows: import("./store").TrafficRow[]): VolumeData {
  const times = rows.map((r) => r.started_at_ms);
  const distinct = new Set(times);
  if (times.length === 0 || distinct.size < 2) return { buckets: [], requests: [], ok: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const t of times) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const span = max - min || 1;
  const COUNT = 24;
  const buckets: number[] = [];
  const requests = new Array<number>(COUNT).fill(0);
  const ok = new Array<number>(COUNT).fill(0);
  for (let i = 0; i < COUNT; i++) {
    buckets.push(min + Math.round((span * i) / (COUNT - 1)));
  }
  for (const r of rows) {
    let idx = Math.floor(((r.started_at_ms - min) / span) * COUNT);
    if (idx >= COUNT) idx = COUNT - 1;
    if (idx < 0) idx = 0;
    requests[idx]++;
    if (r.status !== null && r.status < 300) ok[idx]++;
  }
  return { buckets, requests, ok };
}

/** Hand-rolled SVG area chart for the volume series. */
function VolumeChart({ volume }: { volume: VolumeData }) {
  const { buckets, requests, ok } = volume;
  const max = Math.max(...requests, 1);
  const n = requests.length;
  const xAt = (i: number) => (i / (n - 1)) * 700;
  const yAt = (v: number) => 210 - (v / max) * 180;

  const line = (series: number[]) => series.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(" ");
  const area = (series: number[]) => `${line(series)} L 700,210 L 0,210 Z`;

  const lastX = xAt(n - 1);
  const lastY = yAt(requests[n - 1]);
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

  return (
    <div>
      <svg viewBox="0 0 700 240" preserveAspectRatio="none" className="w-full h-[240px]">
        <defs>
          <linearGradient id="ov-accent-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c0c1ff" stopOpacity="0.28" />
            <stop offset="85%" stopColor="#c0c1ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ov-success-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2fd9f4" stopOpacity="0.22" />
            <stop offset="90%" stopColor="#2fd9f4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[50, 120, 190].map((y) => (
          <line
            key={y}
            x1="0"
            x2="700"
            y1={y}
            y2={y}
            stroke="var(--mt-border)"
            strokeOpacity="0.35"
            strokeDasharray="3 4"
          />
        ))}
        <path d={area(requests)} fill="url(#ov-accent-grad)" />
        <path d={area(ok)} fill="url(#ov-success-grad)" />
        <path d={line(ok)} fill="none" stroke="#2fd9f4" strokeLinecap="round" strokeWidth="2" />
        <path d={line(requests)} fill="none" stroke="#c0c1ff" strokeLinecap="round" strokeWidth="2.5" />
        <circle className="animate-ping" cx={lastX} cy={lastY} fill="#c0c1ff" r="4" />
        <circle cx={lastX} cy={lastY} fill="#ffffff" r="3.5" />
      </svg>
      <div className="w-full flex items-center justify-between pt-2 px-1 text-[10px] text-muted font-mono">
        <span>{fmt(buckets[0])}</span>
        <span>{fmt(buckets[Math.floor(buckets.length / 2)])}</span>
        <span>{fmt(buckets[buckets.length - 1])}</span>
        <span className="text-success">Live</span>
      </div>
    </div>
  );
}

/** Byte count formatted as B/KB/MB/GB (shared, module-level). */
function fmtBytes(n: number): string {
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + "MB";
  return (n / (1024 * 1024 * 1024)).toFixed(1) + "GB";
}

/** Live CPU/Memory card; polls handled by the parent (2s interval). */
function SystemResourcesCard({ metrics }: { metrics: SystemMetrics | null }) {
  // Backend can report null CPU readings mid-refresh; treat as 0 for display.
  const cpuUsage = metrics?.cpu_usage ?? 0;
  const cpuCores = metrics?.cpu_per_core?.map((u) => u ?? 0) ?? [];
  const memPct = metrics && metrics.total_memory > 0 ? (metrics.used_memory / metrics.total_memory) * 100 : 0;
  const cpuColor = cpuUsage > 80 ? "text-danger" : cpuUsage > 50 ? "text-warning" : "text-success";
  const cpuBar = cpuUsage > 80 ? "bg-danger" : cpuUsage > 50 ? "bg-warning" : "bg-success";

  return (
    <div className="rounded-xl border border-line bg-surface p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted">
          <Cpu className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium text-fg">System Resources</h3>
      </div>
      <div className="flex-1">
        {!metrics ? (
          <div className="text-center py-4 text-muted text-sm">Loading metrics…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CPU */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
                  <Cpu className="h-3.5 w-3.5" /> CPU
                </span>
                <span className={`text-2xl font-bold ${cpuColor}`}>{cpuUsage.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-app rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${cpuBar}`}
                  style={{ width: `${Math.min(cpuUsage, 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {cpuCores.map((usage, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="h-1 bg-app rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${usage > 80 ? "bg-danger" : usage > 50 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(usage, 100)}%` }}
                      />
                    </div>
                    <span className="block text-center text-[9px] text-muted/60">{i}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Memory */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
                  <MemoryStick className="h-3.5 w-3.5" /> Memory
                </span>
                <span className="text-2xl font-bold text-fg">{memPct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-app rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${memPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{fmtBytes(metrics.used_memory)} used</span>
                <span>{fmtBytes(metrics.total_memory)} total</span>
              </div>
              {/* MitmForge process */}
              <div className="flex items-center justify-between pt-2 border-t border-line/50">
                <span className="text-xs text-muted">mitmforge process</span>
                <span className="text-xs font-medium text-fg">
                  {fmtBytes(metrics.process_memory)} · {(metrics.process_cpu_usage ?? 0).toFixed(1)}% CPU
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}