import { memo, useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTraffic, type TrafficRow } from "./store";
import { RowDetail } from "./RowDetail";
import { contentCategory } from "./selectors";
import { parseHost } from "./selectors";
import { FileText, Maximize2 } from "lucide-react";

/** 8-track grid: # | Method | Status | Path/Host | Client | Latency | Size | Actions */
const GRID_COLS =
  "grid-cols-[3rem_5.5rem_5.5rem_minmax(280px,1fr)_10rem_5.5rem_5.5rem_3rem]";

/** Tailwind surface classes per HTTP method family. */
function methodClass(method: string): string {
  switch (method) {
    case "GET":
      return "bg-success/10 text-success";
    case "DELETE":
      return "bg-danger/10 text-danger";
    case "CONNECT":
      return "bg-warning/10 text-warning";
    default:
      return "bg-accent/10 text-accent";
  }
}

/** Tailwind surface classes per status class (matches the mock's pills). */
function statusClass(status: number | null): string {
  if (status === null) return "bg-warning/10 text-warning";
  if (status < 300) return "bg-success/10 text-success";
  if (status < 400) return "bg-accent/10 text-accent";
  if (status < 500) return "bg-warning/10 text-warning";
  return "bg-danger/10 text-danger";
}

/** Splits "https://host/path?query" into {host, path}; tunnels keep authority-form. */
function splitUrl(url: string): { host: string; path: string } {
  const host = parseHost(url);
  const idx = url.indexOf("//");
  const slash = url.indexOf("/", idx === -1 ? 0 : idx + 2);
  if (idx === -1 || slash === -1) return { host: host || url, path: "" };
  return { host: host || url, path: url.slice(slash) };
}

function fmtBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

const RowView = memo(function RowView({
  row,
  selected,
  index,
  start,
  size,
  onSelect,
  suspiciousReason,
}: {
  row: TrafficRow;
  selected: boolean;
  index: number;
  start: number;
  size: number;
  onSelect: (id: number) => void;
  suspiciousReason: string | undefined;
}) {
  const { host, path } = splitUrl(row.url);
  const sizeBytes = row.resSize ?? row.req_size ?? null;
  return (
    <div
      onClick={() => onSelect(row.id)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: size,
        transform: `translateY(${start}px)`,
      }}
      className={`grid cursor-pointer ${GRID_COLS} items-center border-b border-line/40 border-l-4 px-2 transition-colors duration-100 ${
        selected
          ? "border-l-accent bg-app"
          : "border-l-transparent hover:bg-[color-mix(in_srgb,var(--mt-text)_3%,transparent)]"
      }`}
      data-index={index}
    >
      <span className="text-center text-muted text-[11px] font-mono">{row.id}</span>
      <span>
        <span className={`inline-block px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${methodClass(row.method)}`}>
          {row.method === "CONNECT" ? "TUNNEL" : row.method}
        </span>
      </span>
      <span>
        <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold ${statusClass(row.status)}`}>
          {row.status ?? "…"}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-fg font-mono text-[13px] font-medium truncate">{path || "/"}</span>
        <span className="block text-muted text-[11px] truncate">{host}</span>
        {suspiciousReason && (
          <span className="inline-flex items-center gap-1 text-danger" title={suspiciousReason}>
            <FileText className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="truncate text-on-surface text-[12px] text-muted">{row.client ?? "—"}</span>
      <span className={`text-right font-mono text-[12px] ${row.durationMs !== null ? "text-fg" : "text-muted"}`}>
        {row.durationMs !== null ? `${row.durationMs}ms` : "…"}
      </span>
      <span className="text-right font-mono text-[12px] text-muted">
        {sizeBytes !== null ? fmtBytes(sizeBytes) : "—"}
      </span>
      <span className="text-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(row.id);
          }}
          className="p-1 rounded text-muted hover:text-fg hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] transition-colors"
          title="Inspect details"
          aria-label="Inspect details"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
});

interface TrafficGridProps {
  activeTabs: string[];
  sidebarView: "capture" | "favorites" | "pinned" | "saved" | "all" | null;
  search: string;
}

export function TrafficGrid({ activeTabs, sidebarView, search }: TrafficGridProps) {
  const rows = useTraffic((s) => s.rows);
  const selectedId = useTraffic((s) => s.selectedId);
  const select = useTraffic((s) => s.select);
  const pinned = useTraffic((s) => s.pinned);
  const hostFilter = useTraffic((s) => s.hostFilter);
  const clientFilter = useTraffic((s) => s.clientFilter);
  const suspicious = useTraffic((s) => s.suspicious);
  const parentRef = useRef<HTMLDivElement>(null);

  const mergedContentFilters = useMemo(() => {
    const tabs = activeTabs.filter((t) => t !== "All");
    return tabs.length > 0 ? tabs : [];
  }, [activeTabs]);

  const q = search.trim().toLowerCase();

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        // Content type filter
        if (
          mergedContentFilters.length > 0 &&
          !mergedContentFilters.includes(contentCategory(row.resContentType, row.req_content_type))
        )
          return false;
        // Search filter (matches URL or client process)
        if (q && !row.url.toLowerCase().includes(q) && !(row.client ?? "").toLowerCase().includes(q))
          return false;
        // Host filter
        if (hostFilter !== null && !row.url.includes(hostFilter)) return false;
        // Client/app filter
        if (clientFilter !== null && row.client !== clientFilter) return false;
        // Sidebar view filter
        const view = sidebarView ?? "capture";
        if (view === "favorites") return false; // TODO: implement favorites
        if (view === "pinned" && !pinned.includes(row.id)) return false;
        if (view === "saved") return false; // TODO: implement saved
        // "all", "capture", null, undefined -> show all
        return true;
      }),
    [rows, mergedContentFilters, q, hostFilter, clientFilter, sidebarView, pinned],
  );

  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const onRowClick = useCallback(
    (id: number) => select(useTraffic.getState().selectedId === id ? null : id),
    [select],
  );

  return (
    <div className="flex h-full flex-col gap-3 bg-app text-fg p-3">
      {/* Top Action Surface: search + presets + tools live in App; here the stream card */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {/* Live stream status bar */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[12px] text-muted">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-success">
              Live Stream Active
            </span>
            <span className="text-[11px] text-muted">• Intercepting TLS</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted">
            <span>{rows.length.toLocaleString()} total events</span>
          </div>
        </div>

        {/* Header */}
        <div
          className={`grid ${GRID_COLS} border-b border-line bg-app px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted`}
        >
          <span className="text-center">#</span>
          <span>Method</span>
          <span>Status</span>
          <span>Path / Host</span>
          <span>Client / App</span>
          <span className="text-right">Latency</span>
          <span className="text-right">Size</span>
          <span />
        </div>

        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((v) => (
              <RowView
                key={filteredRows[v.index].id}
                row={filteredRows[v.index]}
                selected={filteredRows[v.index].id === selectedId}
                index={v.index}
                start={v.start}
                size={v.size}
                onSelect={onRowClick}
                suspiciousReason={suspicious[filteredRows[v.index].id.toString()]}
              />
            ))}
          </div>
        </div>
      </div>

      {selected && <RowDetail row={selected} />}
    </div>
  );
}
