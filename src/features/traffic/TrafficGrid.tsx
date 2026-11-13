import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTraffic, type TrafficRow } from "./store";
import { RowDetail } from "./RowDetail";
import { contentCategory } from "./selectors";

const GRID_COLS = "grid-cols-[2rem_1fr_5rem_4rem_3rem_4rem_4rem_2rem_2rem_2rem]";

function time(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

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
      <span className="text-muted">{row.id}</span>
      <span className="truncate text-fg">{row.url}</span>
      <span className="truncate text-muted">{row.client ?? "—"}</span>
      <span className="inline-flex h-[18px] items-center rounded px-1.5 text-[11px] font-medium text-fg">{row.method}</span>
      <span className={`inline-flex h-[18px] items-center rounded px-1.5 text-[11px] font-medium ${row.status === null ? "text-muted" : row.status < 300 ? "text-success" : row.status < 400 ? "text-accent" : row.status < 500 ? "text-warning" : "text-danger"}`}>
        {row.status ?? "…"}
      </span>
      <span className="text-muted">{time(row.started_at_ms)}</span>
      <span className="text-muted">{row.durationMs ?? ""}</span>
      <span className="text-muted">{row.scheme === "https" ? "SSL" : "–"}</span>
      <span className={`text-center text-[11px] ${row.status === null ? "text-warning" : "text-success"}`}>
        {row.status === null ? "●" : "✓"}
        {suspiciousReason && <span className="ml-1 text-danger" title={suspiciousReason}>⚠</span>}
      </span>
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
          {comment || "—"}
        </span>
      )}
    </div>
  );
});

interface TrafficGridProps {
  activeTabs: string[];
}

export function TrafficGrid({ activeTabs }: TrafficGridProps) {
  const rows = useTraffic((s) => s.rows);
  const selectedId = useTraffic((s) => s.selectedId);
  const select = useTraffic((s) => s.select);
  const comments = useTraffic((s) => s.comments);
  const setComment = useTraffic((s) => s.setComment);
  const hostFilter = useTraffic((s) => s.hostFilter);
  const clientFilter = useTraffic((s) => s.clientFilter);
  const suspicious = useTraffic((s) => s.suspicious);
  const [editingId, setEditingId] = useState<number | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const mergedContentFilters = useMemo(() => {
    const tabs = activeTabs.filter((t) => t !== "All");
    return tabs.length > 0 ? tabs : [];
  }, [activeTabs]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (
          mergedContentFilters.length > 0 &&
          !mergedContentFilters.includes(contentCategory(row.resContentType, row.req_content_type))
        )
          return false;
        if (hostFilter !== null && !row.url.includes(hostFilter)) return false;
        if (clientFilter !== null && row.client !== clientFilter) return false;
        return true;
      }),
    [rows, mergedContentFilters, hostFilter, clientFilter],
  );

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
  const onRowClick = useCallback(
    (id: number) => select(useTraffic.getState().selectedId === id ? null : id),
    [select],
  );

  return (
    <div className="flex h-full flex-col bg-app text-fg">
      <div className={`grid ${GRID_COLS} gap-x-3 border-b border-line px-3 py-1 text-xs tracking-wide text-muted uppercase`}>
        <span>#</span>
        <span>URL</span>
        <span>Client</span>
        <span>Method</span>
        <span>Status</span>
        <span>Time</span>
        <span>Duration</span>
        <span>SSL</span>
        <span>Request</span>
        <span>Edited</span>
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
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-line" />
          proxy 127.0.0.1:8080
        </span>
        <span>{filteredRows.length}/{rows.length} req</span>
      </div>
    </div>
  );
}
