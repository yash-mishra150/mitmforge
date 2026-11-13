import { useTraffic } from "./store";
import { totals, statusBreakdown, topApps, topDomains, slowest, durationBuckets } from "./stats";

/** Overview stats panel for traffic. */
export function Overview() {
  const rows = useTraffic((s) => s.rows);

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-neutral-500">No traffic captured yet</span>
      </div>
    );
  }

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

  return (
    <div className="flex flex-col gap-6 overflow-auto p-4">
      {/* Totals */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Totals</h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>Requests: {totalsData.requests}</div>
          <div>Responded: {totalsData.responded}</div>
          <div>Errors: {totalsData.errors}</div>
          <div>Bytes: {fmtBytes(totalsData.dataBytes)}</div>
          {totalsData.avgMs !== null && <div>Avg duration: {totalsData.avgMs.toFixed(1)}ms</div>}
          {totalsData.avgMs === null && <div>Avg duration: —</div>}
        </div>
      </section>

      {/* Status */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Status</h3>
        <div className="grid grid-cols-5 gap-2 text-xs">
          {statusData.map(({ status, count }) => (
            <div key={status} className="flex justify-between">
              <span className="text-neutral-500">{status} — {count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Top apps */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Top apps</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {topAppsData.map(({ client, count }) => (
            <div key={client} className="flex justify-between">
              <span className="text-neutral-500 truncate max-w-[60%]">{client}: {count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Top domains */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Top domains</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {topDomainsData.map(({ host, count }) => (
            <div key={host} className="flex justify-between">
              <span className="text-neutral-500 truncate max-w-[60%]">{host}: {count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Slowest */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Slowest</h3>
        <div className="space-y-1 text-xs">
          {slowestData.map((r) => {
            const truncatedUrl = r.url.length > 60 ? r.url.slice(0, 60) + "…" : r.url;
            return (
              <div key={r.id} className="flex items-center gap-2">
                <span className="text-neutral-500 w-12 text-right">{r.durationMs}ms</span>
                <span className="text-neutral-500 w-12">{r.method}</span>
                <span className="truncate max-w-[60%]">{truncatedUrl}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Duration buckets */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">Duration</h3>
        <div className="space-y-1 text-xs">
          {durationData.map(({ label, count }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-neutral-500 w-24">{label}</span>
              <div className="flex-1 relative h-2">
                <div className="absolute inset-0 bg-neutral-800 rounded-full" />
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full"
                  style={{ width: `${(count / maxDurationCount) * 100}%` }}
                />
              </div>
              <span className="text-neutral-500 w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}