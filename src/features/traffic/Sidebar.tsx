import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Lock,
  LockOpen,
  Monitor,
  Pin,
  Search,
  Star,
  Zap,
} from "lucide-react";
import { useTraffic } from "./store";
import { buildDomainTree, groupByApp, parseHost, pinnedRows } from "./selectors";

const MONO_COLORS = [
  "bg-orange-500/20 border-orange-500/40 text-orange-400",
  "bg-purple-500/20 border-purple-500/30 text-purple-400",
  "bg-blue-500/20 border-blue-500/30 text-blue-400",
  "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
  "bg-cyan-500/20 border-cyan-500/30 text-cyan-400",
  "bg-amber-500/20 border-amber-500/30 text-amber-400",
];

function monoColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return MONO_COLORS[h % MONO_COLORS.length];
}

function monogram(name: string): string {
  const clean = name.replace(/\.exe$/i, "").replace(/[^a-zA-Z0-9]/g, "");
  return (clean.slice(0, 2) || "?").toUpperCase();
}

/** Tiny sparkline path from the client's row timestamps (last 12 buckets of 3s). */
function sparkline(rows: Array<{ started_at_ms: number }>): string {
  if (rows.length < 2) return "";
  const now = Date.now();
  const BUCKETS = 12;
  const span = 3000;
  const counts = new Array<number>(BUCKETS).fill(0);
  for (const r of rows) {
    const b = BUCKETS - 1 - Math.floor((now - r.started_at_ms) / span);
    if (b >= 0 && b < BUCKETS) counts[b]++;
  }
  const max = Math.max(...counts, 1);
  const pts = counts.map((c, i) => `${(i / (BUCKETS - 1)) * 34 + 1},${12 - (c / max) * 10}`);
  return `M${pts.join(" L")}`;
}

/** Left nav: collapsible rail (52px) ↔ expanded cockpit (260px). */
export function Sidebar({ view, onViewChange }: { view: "log" | "overview"; onViewChange: (view: "log" | "overview") => void }) {
  const [expanded, setExpanded] = useState(true);
  const rows = useTraffic((s) => s.rows);
  const pinned = useTraffic((s) => s.pinned);
  const setHostFilter = useTraffic((s) => s.setHostFilter);
  const setClientFilter = useTraffic((s) => s.setClientFilter);
  const clientFilter = useTraffic((s) => s.clientFilter);
  const hostFilter = useTraffic((s) => s.hostFilter);
  const sidebarView = useTraffic((s) => s.sidebarView);
  const setSidebarView = useTraffic((s) => s.setSidebarView);

  const appData = groupByApp(rows);
  const domainData = buildDomainTree(rows);
  const pinnedData = pinnedRows(rows, pinned);
  const clearFilters = () => {
    setHostFilter(null);
    setClientFilter(null);
    setSidebarView("capture");
  };

  // Session duration ticks once per second while expanded.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [expanded]);
  const oldest = rows.length > 0 ? rows[rows.length - 1].started_at_ms : 0;
  const newest = rows.length > 0 ? rows[0].started_at_ms : 0;
  const secs = oldest > 0 ? Math.max(0, Math.floor((newest - oldest) / 1000)) : 0;
  const duration = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const httpCount = rows.filter((r) => r.scheme === "http").length;

  const railView = (
    <>
      <div className="flex w-full flex-col items-center space-y-3">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Expand sidebar"
          className="group relative flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="relative flex h-8 w-8 items-center justify-center" title="Capturing">
          <span className="absolute h-4 w-4 animate-ping rounded-full bg-success/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-success ring-2 ring-success/30" />
        </div>
        <div className="h-px w-7 bg-line" />
        <RailButton
          active={sidebarView === "capture"}
          badge={rows.length}
          title={`Live Capture (${rows.length})`}
          onClick={() => {
            onViewChange("log");
            clearFilters();
          }}
          icon={<Zap className="h-4 w-4" />}
        />
        <RailButton
          title="Overview"
          onClick={() => onViewChange("overview")}
          icon={<Monitor className="h-4 w-4" />}
        />
        <RailButton
          active={sidebarView === "favorites"}
          title="Favorites"
          onClick={() => setSidebarView("favorites")}
          icon={<Star className="h-4 w-4" />}
        />
        <RailButton
          active={sidebarView === "pinned"}
          badge={pinnedData.length}
          title={`Pinned (${pinnedData.length})`}
          onClick={() => setSidebarView("pinned")}
          icon={<Pin className="h-4 w-4" />}
        />
        <div className="h-px w-7 bg-line" />
        {appData.slice(0, 5).map((a) => (
          <button
            key={a.client}
            type="button"
            onClick={() => setClientFilter(clientFilter === a.client ? null : a.client)}
            title={`${a.client} (${a.count} requests)`}
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg border font-bold text-[10px] ${monoColor(a.client)} ${
              clientFilter === a.client ? "ring-1 ring-accent" : ""
            }`}
          >
            {monogram(a.client)}
            {a.count > 0 && (
              <span className="absolute -bottom-1 -right-1 rounded-full border border-surface bg-accent px-1 text-[8px] font-mono leading-tight text-app">
                {a.count}
              </span>
            )}
          </button>
        ))}
        <div className="h-px w-7 bg-line" />
        <button
          type="button"
          onClick={() => setHostFilter(null)}
          title={httpCount > 0 ? `${httpCount} unencrypted HTTP streams` : "All traffic encrypted"}
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            httpCount > 0 ? "text-warning hover:bg-warning/10" : "text-success hover:bg-success/10"
          }`}
        >
          {httpCount > 0 ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex flex-col items-center space-y-2">
        <button
          type="button"
          title="Search"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg"
        >
          <Search className="h-4 w-4" />
        </button>
        <span className="h-1.5 w-1.5 rounded-full bg-success" title="System proxy on" />
      </div>
    </>
  );

  const expandedView = (
    <>
      <div className="flex-1 space-y-3.5 overflow-y-auto overflow-x-hidden p-2.5">
        {/* Capture cockpit */}
        <div className="rounded-lg border border-line bg-app p-2.5 transition-colors hover:border-line">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/50 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg">Live Capture Active</span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="Collapse to rail"
              className="rounded p-1 text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-1">
            <div className="rounded border border-line bg-app px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-tight text-muted">Intercepted</span>
              <div className="font-mono text-xs font-semibold text-accent">{rows.length} reqs</div>
            </div>
            <div className="rounded border border-line bg-app px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-tight text-muted">Duration</span>
              <div className="font-mono text-xs font-semibold text-fg">{duration}</div>
            </div>
          </div>
        </div>

        {/* Saved views */}
        <div className="space-y-1">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Saved Views</div>
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <ViewCard
              label="All Traffic"
              count={rows.length}
              active={sidebarView === "capture"}
              dot="bg-accent"
              onClick={() => {
                onViewChange("log");
                clearFilters();
              }}
            />
            <ViewCard label="Dashboard" count={rows.length} active={view === "overview"} dot="bg-accent" onClick={() => onViewChange("overview")} />
            <ViewCard label="Pinned" count={pinnedData.length} dot="bg-warning" onClick={() => setSidebarView("pinned")} />
            <ViewCard label="Favorites" count={0} dot="bg-warning" onClick={() => setSidebarView("favorites")} />
          </div>
        </div>

        {/* Apps */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Active Apps</span>
            <span className="rounded bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
              {appData.length}
            </span>
          </div>
          {appData.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1">
              {appData.map((a) => {
                const clientRows = rows.filter((r) => (r.client ?? "(unknown)") === a.client);
                const path = sparkline(clientRows);
                return (
                  <button
                    key={a.client}
                    type="button"
                    onClick={() => setClientFilter(clientFilter === a.client ? null : a.client)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-all ${
                      clientFilter === a.client
                        ? "border-accent/30 bg-accent/10 text-fg"
                        : "text-muted hover:bg-app hover:text-fg"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${monoColor(a.client)}`}>
                        {monogram(a.client)}
                      </span>
                      <span className="truncate text-xs font-medium">{a.client}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {path && (
                        <svg viewBox="0 0 36 14" className="h-3.5 w-9 shrink-0 fill-none stroke-accent opacity-80">
                          <path d={path} strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      )}
                      <span className="min-w-[20px] rounded bg-accent/15 px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-accent">
                        {a.count}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Domains */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Target Domains</span>
            <span className="rounded bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
              {domainData.length}
            </span>
          </div>
          {domainData.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1">
              {domainData.slice(0, 12).map((d) => {
                const secure = rows.some((r) => parseHost(r.url) === d.host && r.scheme !== "http");
                return (
                  <button
                    key={d.host}
                    type="button"
                    onClick={() => setHostFilter(hostFilter === d.host ? null : d.host)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-all ${
                      hostFilter === d.host
                        ? "border-accent/30 bg-accent/10 text-fg"
                        : "text-muted hover:bg-app hover:text-fg"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {secure ? (
                        <Lock className="h-3 w-3 shrink-0 text-success" />
                      ) : (
                        <LockOpen className="h-3 w-3 shrink-0 text-danger" />
                      )}
                      <span className="truncate text-xs">{d.host}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] font-medium text-muted">{d.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer status */}
      <div className="flex items-center justify-between border-t border-line bg-app p-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5 text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="font-mono text-[10.5px]">8080</span>
          <span className="text-line">·</span>
          <span className="truncate">System Mode</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          title="Collapse sidebar"
          className="rounded p-1 text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );

  return (
    <aside
      className={`relative flex h-full shrink-0 select-none flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-300 ease-in-out ${
        expanded ? "w-[260px]" : "w-[52px]"
      }`}
    >
      <div
        className={`absolute inset-0 flex w-[52px] flex-col items-center justify-between py-2.5 transition-opacity duration-200 ${
          expanded ? "pointer-events-none invisible opacity-0" : "opacity-100 visible"
        }`}
      >
        {railView}
      </div>
      <div
        className={`absolute inset-0 flex w-[260px] flex-col overflow-hidden transition-opacity duration-200 ${
          expanded ? "opacity-100 visible" : "pointer-events-none invisible opacity-0"
        }`}
      >
        {expandedView}
      </div>
    </aside>
  );
}

function RailButton({
  icon,
  title,
  onClick,
  active = false,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-lg ${
        active
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg"
      }`}
    >
      {active && <span className="absolute -left-1 top-1.5 h-6 w-1 rounded-r bg-accent" />}
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full border border-surface bg-accent px-1 text-[9px] font-mono leading-tight text-app">
          {badge}
        </span>
      )}
    </button>
  );
}

function ViewCard({
  label,
  count,
  active = false,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active?: boolean;
  dot: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-all ${
        active ? "border-accent/30 bg-accent/10 text-fg" : "border-line bg-app text-muted hover:text-fg"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-xs font-medium">{label}</span>
      </span>
      <span className={`font-mono text-[11px] font-semibold ${active ? "text-accent" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function Empty() {
  return <div className="px-3 py-2 text-center text-xs text-muted/50">No data captured yet</div>;
}

