import { useTraffic } from "./store";
import { totals, statusBreakdown, topApps, topDomains, slowest, durationBuckets } from "./stats";
import { parseHost } from "./selectors";
import { FileText, Globe, AlertTriangle, Clock, Server } from "lucide-react";

/** Overview stats panel for traffic. */
export function Overview() {
  const rows = useTraffic((s) => s.rows);
  const suspicious = useTraffic((s) => s.suspicious);

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--mt-accent)_8%,transparent)]">
          <FileText className="h-8 w-8 text-accent/60" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-medium text-fg">No traffic captured yet</h3>
          <p className="text-sm text-muted mt-1">Start the proxy and browse to see analytics</p>
        </div>
      </div>
    );
  }

  const suspiciousEntries = Object.entries(suspicious).map(([idStr, reason]) => ({ id: Number(idStr), reason }));
  const totalsData = totals(rows);
  const statusData = statusBreakdown(rows);
  const topAppsData = topApps(rows, 5);
  const topDomainsData = topDomains(rows, 5);
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

      {/* Top Items Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Apps */}
        <Card title="Top Apps" icon={<Server className="h-4 w-4" />}>
          <div className="space-y-2">
            {topAppsData.length === 0 ? (
              <div className="text-center py-4 text-muted text-sm">No app data</div>
            ) : (
              topAppsData.map(({ client, count }) => (
                <div key={client} className="flex items-center justify-between py-1.5 hover:bg-[color-mix(in_srgb,var(--mt-text)_3%,transparent)] rounded px-2 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-accent/50" />
                    <span className="truncate text-sm text-fg">{client}</span>
                  </div>
                  <span className="text-xs font-medium text-muted">{count}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Top Domains */}
        <Card title="Top Domains" icon={<Globe className="h-4 w-4" />}>
          <div className="space-y-2">
            {topDomainsData.length === 0 ? (
              <div className="text-center py-4 text-muted text-sm">No domain data</div>
            ) : (
              topDomainsData.map(({ host, count }) => (
                <div key={host} className="flex items-center justify-between py-1.5 hover:bg-[color-mix(in_srgb,var(--mt-text)_3%,transparent)] rounded px-2 transition-colors">
                  <span className="truncate text-sm text-fg max-w-[70%]">{host}</span>
                  <span className="text-xs font-medium text-muted">{count}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

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