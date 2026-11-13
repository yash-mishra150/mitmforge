import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ShieldCheck, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { call, commands, type ProxyStatus } from "../../platform/ipc";
import { useTraffic, type TrafficRow } from "./store";
import { FilterBar } from "./FilterBar";
import { RowDetail } from "./RowDetail";
import { contentCategory } from "./selectors";
import { analyzeSuspicious } from "../ai/analyze";
import { loadAiSettings } from "../ai/settings";
import { SettingsModal } from "./SettingsModal";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-[color-mix(in_srgb,var(--mt-success)_15%,transparent)] text-success",
  POST: "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent",
  PUT: "bg-[color-mix(in_srgb,var(--mt-warning)_15%,transparent)] text-warning",
  PATCH: "bg-[color-mix(in_srgb,var(--mt-warning)_15%,transparent)] text-warning",
  DELETE: "bg-[color-mix(in_srgb,var(--mt-danger)_15%,transparent)] text-danger",
};

function statusColor(status: number | null): string {
  if (status === null) return "text-muted";
  if (status < 300) return "bg-[color-mix(in_srgb,var(--mt-success)_15%,transparent)] text-success";
  if (status < 400) return "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent";
  if (status < 500) return "bg-[color-mix(in_srgb,var(--mt-warning)_15%,transparent)] text-warning";
  return "bg-[color-mix(in_srgb,var(--mt-danger)_15%,transparent)] text-danger";
}

function splitUrl(url: string): { host: string; path: string } {
  const i = url.indexOf("://");
  if (i < 0) return { host: "", path: url };
  const rest = url.slice(i + 3);
  const slash = rest.indexOf("/");
  if (slash < 0) return { host: rest, path: "/" };
  return { host: rest.slice(0, slash), path: rest.slice(slash) };
}

function time(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

const GRID_COLS = "grid-cols-[2rem_3rem_4.5rem_3.5rem_4rem_1fr_5.5rem_3rem_5rem_9rem]";


/** Memoized row: only the row whose object changed re-renders, not the grid. */
const RowView = memo(function RowView({
  row,
  selected,
  index,
  start,
  size,
  onSelect,
  comment,
  editing,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  suspiciousReason,
}: {
  row: TrafficRow;
  selected: boolean;
  index: number;
  start: number;
  size: number;
  onSelect: (id: number) => void;
  comment: string | undefined;
  editing: boolean;
  onStartEdit: (id: number) => void;
  onCommitEdit: (id: number, value: string) => void;
  onCancelEdit: () => void;
  suspiciousReason: string | undefined;
}) {
  const { host, path } = splitUrl(row.url);
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
      className={`grid cursor-pointer ${GRID_COLS} items-center gap-x-3 border-b border-line px-3 ${selected ? "bg-[color-mix(in_srgb,var(--mt-accent)_10%,transparent)] shadow-[inset_2px_0_0_var(--mt-accent)]" : "hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)]"}`}
      data-index={index}
    >
      <span className={row.status === null ? "text-warning" : "text-success"}>
        {row.status === null ? "●" : "✓"}
        {suspiciousReason && <span className="ml-1 text-danger" title={suspiciousReason}>⚠</span>}
      </span>
      <span className="text-muted">{row.id}</span>
      <span className={`inline-flex h-[18px] items-center rounded px-1.5 text-[11px] font-medium ${METHOD_COLORS[row.method] ?? "text-fg"}`}>{row.method}</span>
      <span className={`inline-flex h-[18px] items-center rounded px-1.5 text-[11px] font-medium ${statusColor(row.status)}`}>{row.status ?? "…"}</span>
      <span className="text-muted">{row.durationMs ?? ""}</span>
      <span className="truncate">
        <span className="text-muted">{host}</span>
        <span className="text-fg">{path}</span>
      </span>
      <span className="text-muted">{time(row.started_at_ms)}</span>
      <span className="text-muted">{row.scheme === "https" ? "SSL" : "–"}</span>
      <span className="text-muted truncate">{row.client ?? "—"}</span>
      {editing ? (
        <input
          autoFocus
          defaultValue={comment ?? ""}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => onCommitEdit(row.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitEdit(row.id, e.currentTarget.value);
            else if (e.key === "Escape") onCancelEdit();
          }}
          className="w-full rounded-md border border-line bg-surface px-1 text-xs text-fg outline-none"
        />
      ) : (
        <span
          className="truncate text-muted"
          title={comment ? undefined : "Click to add a comment"}
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit(row.id);
          }}
        >
          {comment || ""}
        </span>
      )}
    </div>
  );
});

export function TrafficGrid() {
  const rows = useTraffic((s) => s.rows);
  const selectedId = useTraffic((s) => s.selectedId);
  const select = useTraffic((s) => s.select);
  const clear = useTraffic((s) => s.clear);
  const comments = useTraffic((s) => s.comments);
  const setComment = useTraffic((s) => s.setComment);
  const hostFilter = useTraffic((s) => s.hostFilter);
  const clientFilter = useTraffic((s) => s.clientFilter);
  const setHostFilter = useTraffic((s) => s.setHostFilter);
  const setClientFilter = useTraffic((s) => s.setClientFilter);
  const suspicious = useTraffic((s) => s.suspicious);
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [contentFilters, setContentFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const refreshStatus = () => {
    void commands
      .proxyStatus()
      .then(setStatus)
      .catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => refreshStatus(), []);

  const toggleSystem = () => {
    const target = !(status?.system_proxy ?? false);
    void call(commands.proxySetSystem(target))
      .then(() => {
        setMessage(target ? "System proxy on" : "System proxy off");
        refreshStatus();
      })
      .catch((e) => setMessage(String(e)));
  };

  const trustCa = () => {
    void call(commands.proxyInstallCa())
      .then((msg) => setMessage(msg))
      // First-run flow completes here: trusted CA → capture turns on itself.
      .then(() => call(commands.proxySetSystem(true)))
      .then(() => {
        setMessage("Certificate trusted — system capture on");
        refreshStatus();
      })
      .catch((e) => setMessage(String(e)));
  };

  const toggleRecording = () => {
    const target = !recording;
    setRecording(target);
    void commands.trafficRecording(target).then(() => setMessage(target ? "Recording on" : "Recording paused"));
  };

  const toggleAutoSave = () => {
    const target = !autoSave;
    setAutoSave(target);
    void commands.trafficAutosave(target).then(() => setMessage(target ? "Auto-save on" : "Auto-save off"));
  };

  // AI batch pass over the newest 50 rows; results flag rows in the store.
  const analyze = () => {
    setAnalyzing(true);
    analyzeSuspicious(rows, loadAiSettings())
      .then((found) => {
        useTraffic.getState().setSuspicious(found);
        const n = Object.keys(found).length;
        setMessage(n > 0 ? `${n} suspicious request(s) flagged` : "Nothing suspicious found");
      })
      .catch((e) => setMessage(String(e)))
      .finally(() => setAnalyzing(false));
  };

  // View-level filter only — the ring buffer in the store is untouched.
  // Chip filters + sidebar host/client filters AND together.
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (
          contentFilters.length > 0 &&
          !contentFilters.includes(contentCategory(row.resContentType, row.req_content_type))
        )
          return false;
        if (statusFilters.length > 0 && (row.status === null || !statusFilters.includes(Math.floor(row.status / 100))))
          return false;
        if (hostFilter !== null && !row.url.includes(hostFilter)) return false;
        if (clientFilter !== null && row.client !== clientFilter) return false;
        return true;
      }),
    [rows, contentFilters, statusFilters, hostFilter, clientFilter],
  );

  const toggleContentFilter = useCallback((type: string) => {
    setContentFilters((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }, []);

  const toggleStatusFilter = useCallback((category: number) => {
    setStatusFilters((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  }, []);

  const clearFilters = useCallback(() => {
    setContentFilters([]);
    setStatusFilters([]);
  }, []);

  const startEdit = useCallback((id: number) => setEditingId(id), []);

  const commitEdit = useCallback(
    (id: number, value: string) => {
      setEditingId(null);
      setComment(id, value.trim());
    },
    [setComment],
  );

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const systemOn = status?.system_proxy ?? false;
  const onRowClick = useCallback(
    (id: number) => select(useTraffic.getState().selectedId === id ? null : id),
    [select],
  );

  return (
    <div className="flex h-full flex-col bg-app text-fg">
      <header className="flex items-center justify-between border-b border-line bg-app px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span
            className={`inline-block h-2 w-2 rounded-full ${status?.listening ? "bg-accent" : "bg-line"}`}
          />
          MitmForge — proxy 127.0.0.1:8080
        </span>
        <span className="flex items-center gap-2 text-xs">
          {message && <span className="max-w-96 truncate text-muted">{message}</span>}
          <button
            type="button"
            onClick={toggleSystem}
            className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${systemOn ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent" : ""} hover:brightness-125`}
          >
            {systemOn ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            System proxy {systemOn ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={trustCa}
            disabled={status?.ca_trusted === true}
            title={status?.ca_trusted ? "Certificate already trusted" : undefined}
            className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${status?.ca_trusted ? "bg-[color-mix(in_srgb,var(--mt-success)_15%,transparent)] text-success" : ""} hover:brightness-125 disabled:hover:brightness-100`}
          >
            <ShieldCheck size={14} />
            {status?.ca_trusted ? "CA trusted" : "Trust CA"}
          </button>
          <button
            type="button"
            onClick={toggleRecording}
            className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${recording ? "bg-[color-mix(in_srgb,var(--mt-success)_15%,transparent)] text-success" : ""} hover:brightness-125`}
          >
            {recording ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {recording ? "Recording on" : "Recording off"}
          </button>
          <button
            type="button"
            onClick={toggleAutoSave}
            className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${autoSave ? "bg-[color-mix(in_srgb,var(--mt-success)_15%,transparent)] text-success" : ""} hover:brightness-125`}
          >
            {autoSave ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {autoSave ? "Auto-save on" : "Auto-save off"}
          </button>
          <button
            type="button"
            onClick={analyze}
            disabled={analyzing || rows.length === 0}
            title="Ask AI to flag suspicious requests"
            className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${analyzing ? "text-muted opacity-70" : ""} hover:brightness-125 disabled:hover:brightness-100`}
          >
            {analyzing ? "Analyzing…" : "Analyze suspicious"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg"
            title="AI settings, theme (fonts, colors)"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear captured traffic"
            className="rounded-md border border-line bg-surface p-1 text-muted hover:border-[#2a2a2e] hover:text-fg"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </header>

      <FilterBar
        contentFilters={contentFilters}
        statusFilters={statusFilters}
        onContentFilterToggle={toggleContentFilter}
        onStatusFilterToggle={toggleStatusFilter}
        onClear={clearFilters}
        activeCount={contentFilters.length + statusFilters.length}
      />

      {(hostFilter !== null || clientFilter !== null) && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1 text-xs">
          {hostFilter !== null && (
            <button
              type="button"
              onClick={() => setHostFilter(null)}
              className="rounded-md border border-line bg-surface px-2 py-0.5 text-fg hover:border-[#2a2a2e]"
              title="Clear host filter"
            >
              host: {hostFilter} ✕
            </button>
          )}
          {clientFilter !== null && (
            <button
              type="button"
              onClick={() => setClientFilter(null)}
              className="rounded-md border border-line bg-surface px-2 py-0.5 text-fg hover:border-[#2a2a2e]"
              title="Clear app filter"
            >
              app: {clientFilter} ✕
            </button>
          )}
          <span className="text-muted">{filteredRows.length} shown</span>
        </div>
      )}

      <div className={`grid ${GRID_COLS} gap-x-3 border-b border-line px-3 py-1 text-xs tracking-wide text-muted uppercase`}>
        <span />
        <span>#</span>
        <span>Method</span>
        <span>Status</span>
        <span>ms</span>
        <span>URL</span>
        <span>Time</span>
        <span>SSL</span>
        <span>Client</span>
        <span>Comment</span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
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
              comment={comments[filteredRows[v.index].id.toString()]}
              editing={editingId === filteredRows[v.index].id}
              onStartEdit={startEdit}
              onCommitEdit={commitEdit}
              onCancelEdit={cancelEdit}
              suspiciousReason={suspicious[filteredRows[v.index].id.toString()]}
            />
          ))}
        </div>
      </div>

      {selected && <RowDetail row={selected} />}

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-app px-3 text-[11px] text-muted">
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${status?.listening ? "bg-accent" : "bg-line"}`}
          />
          proxy 127.0.0.1:8080
          {systemOn && (
            <span className="rounded bg-[color-mix(in_srgb,var(--mt-accent)_15%,transparent)] px-1.5 text-accent">
              SYS
            </span>
          )}
          <span className={recording ? "text-success" : "text-muted opacity-70"}>
            {recording ? "REC" : "PAUSED"}
          </span>
        </span>
        <span>
          {filteredRows.length}/{rows.length} req
        </span>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
