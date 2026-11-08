import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2 } from "lucide-react";
import { useTraffic } from "./store";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400",
  POST: "text-sky-400",
  PUT: "text-amber-400",
  PATCH: "text-amber-400",
  DELETE: "text-rose-400",
};

function statusColor(status: number | null): string {
  if (status === null) return "text-neutral-600";
  if (status < 300) return "text-emerald-400";
  if (status < 400) return "text-sky-400";
  if (status < 500) return "text-amber-400";
  return "text-rose-400";
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

export function TrafficGrid() {
  const rows = useTraffic((s) => s.rows);
  const clear = useTraffic((s) => s.clear);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  return (
    <div className="flex h-full flex-col bg-neutral-900 text-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          MitmForge — proxy 127.0.0.1:8080
        </span>
        <span className="flex items-center gap-3 text-neutral-500">
          <span>{rows.length} requests</span>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear captured traffic"
            className="rounded p-1 hover:bg-neutral-800"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </header>

      <div className="grid grid-cols-[3rem_4.5rem_3.5rem_1fr_5.5rem] gap-x-3 border-b border-neutral-800 px-3 py-1 text-xs tracking-wide text-neutral-500 uppercase">
        <span>#</span>
        <span>Method</span>
        <span>Status</span>
        <span>URL</span>
        <span>Time</span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const r = rows[v.index];
            const { host, path } = splitUrl(r.url);
            return (
              <div
                key={r.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: v.size,
                  transform: `translateY(${v.start}px)`,
                }}
                className="grid grid-cols-[3rem_4.5rem_3.5rem_1fr_5.5rem] items-center gap-x-3 border-b border-neutral-800/50 px-3"
              >
                <span className="text-neutral-600">{r.id}</span>
                <span className={METHOD_COLORS[r.method] ?? "text-neutral-300"}>{r.method}</span>
                <span className={statusColor(r.status)}>{r.status ?? "…"}</span>
                <span className="truncate">
                  <span className="text-neutral-500">{host}</span>
                  <span className="text-neutral-300">{path}</span>
                </span>
                <span className="text-neutral-600">{time(r.started_at_ms)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
