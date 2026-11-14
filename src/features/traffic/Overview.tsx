import { useEffect, useState } from "react";
import { useTraffic } from "./store";
import { totals, statusBreakdown, slowest, durationBuckets } from "./stats";
import { parseHost } from "./selectors";
import { commands, type SystemMetrics } from "../../bindings";
import { FileText, AlertTriangle, Clock, Cpu, MemoryStick } from "lucide-react";

/** Overview stats panel for traffic. */
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

  if (rows.length === 0) {
    // Even with no traffic, system resources stay visible.
    return (
      <div className="flex h-full flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface py-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--mt-accent)_8%,transparent)]">
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

  const suspiciousEntries = Object.entries(suspicious).map(([idStr, reason]) => ({ id: Number(idStr), reason }));
  const totalsData = totals(rows);
  const statusData = statusBreakdown(rows);
  const slowestData = slowest(rows, 5);
  const durationData = durationBuckets(rows);
  const maxDurationCount = Math.max(...durationData.map((b) => b.count), 1);

  function fmtBytes(n: number): string {
    if (n < 1024) return n + "B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "KB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + "MB";
    return (n / (1024 * 1024 * 1024)).toFixed(1) + "GB";
  }

  const errorRate = totalsData.requests > 0 ? ((totalsData.errors / totalsData.requests) * 100).toFixed(1) : "0";

  return (
    <div className="flex flex-col gap-4 overflow-auto p-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Total Requests"
          value={totalsData.requests.toLocaleString()}
          trend={totalsData.responded > 0 ? `${totalsData.responded} responded` : undefined}
        />
        <StatCard
          icon={<Globe className="h-5 w-5" />}
          label="Data Transferred"
          value={fmtBytes(totalsData.dataBytes)}
          trend={`${totalsData.requests} requests`}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Errors"
          value={`${totalsData.errors} (${errorRate}%)`}
          trend={totalsData.errors > 0 ? `${totalsData.errors} failed` : "No errors"}
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Avg Duration"
          value={totalsData.avgMs !== null ? `${totalsData.avgMs.toFixed(0)}ms` : "—"}
          trend={totalsData.avgMs !== null ? `${totalsData.responded} measured` : undefined}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Breakdown */}
        <Card title="Status Breakdown" icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-2">
            {statusData.map(({ status, count }) => {
              const pct = totalsData.requests > 0 ? (count / totalsData.requests) * 100 : 0;
              const color = getStatusColor(status);
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-14 text-xs font-medium text-muted">{status}</span>
                  <div className="flex-1 h-2 bg-app rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs text-muted font-medium">{count} ({pct.toFixed(1)}%)</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Duration Distribution */}
        <Card title="Duration Distribution" icon={<Clock className="h-4 w-4" />}>
          <div className="space-y-2">
            {durationData.map(({ label, count }) => {
              const pct = maxDurationCount > 0 ? (count / maxDurationCount) * 100 : 0;
              return (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted">{label}</span>
                  <div className="flex-1 h-2 bg-app rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs text-muted font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* System Resources — live CPU/Memory (polls every 2s) */}
      <SystemResourcesCard metrics={metrics} />

      {/* Slowest Requests */}
      <Card title="Slowest Requests" icon={<Clock className="h-4 w-4" />}>
        {slowestData.length === 0 ? (
          <div className="text-center py-4 text-muted text-sm">No timing data</div>
        ) : (
          <>
            {slowestData.map((r) => {
              const truncatedUrl = r.url.length > 70 ? r.url.slice(0, 70) + "…" : r.url;
              return (
                <div key={r.id} className="flex items-center gap-3 py-2 hover:bg-[color-mix(in_srgb,var(--mt-text)_3%,transparent)] rounded px-2 transition-colors group">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="h-2 w-2 rounded-full bg-warning/50" />
                    <span className="text-sm font-medium text-fg truncate">{truncatedUrl}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="font-medium text-warning">{r.durationMs}ms</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getStatusColorClass(r.status)}`}>
                      {r.status ?? "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {/* Suspicious */}
      <Card title="Suspicious Activity" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="space-y-2">
          {suspiciousEntries.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted">
              <AlertTriangle className="h-8 w-8 mx-auto opacity-30" />
              <p className="ml-2">No suspicious activity detected</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-warning mb-2">
                <AlertTriangle className="h-3 w-3" />
                <span>{suspiciousEntries.length} flagged — check sidebar for details</span>
              </div>
              {suspiciousEntries.slice(0, 5).map(({ id, reason }) => {
                const row = rows.find((r) => r.id === id);
                if (!row) return null;
                const host = parseHost(row.url);
                return (
                  <div key={id} className="flex items-center gap-3 py-2 px-2 rounded bg-warning/5 border border-warning/20">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-warning font-medium">{reason}</p>
                      <p className="text-xs text-muted truncate">{row.method} {host}</p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-muted">{icon}</span>}
        <h3 className="text-sm font-medium text-fg">{title}</h3>
      </div>
      <div className="flex-1">{children}</div>
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
    <Card title="System Resources" icon={<Cpu className="h-4 w-4" />}>
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
    </Card>
  );
}

function StatCard({ icon, label, value, trend }: { icon: React.ReactNode; label: string; value: string; trend?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
          <p className="text-2xl font-bold text-fg mt-1">{value}</p>
          {trend && <p className="text-xs text-muted mt-1">{trend}</p>}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--mt-accent)_8%,transparent)] flex-shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  const code = parseInt(status.charAt(0), 10);
  if (code === 1) return "var(--mt-accent)";
  if (code === 2) return "var(--mt-success)";
  if (code === 3) return "var(--mt-warning)";
  if (code === 4) return "var(--mt-warning)";
  return "var(--mt-danger)";
}

function getStatusColorClass(status: number | null): string {
  if (status === null) return "bg-muted text-muted-foreground";
  if (status < 300) return "bg-success/20 text-success";
  if (status < 400) return "bg-accent/20 text-accent";
  if (status < 500) return "bg-warning/20 text-warning";
  return "bg-danger/20 text-danger";
}