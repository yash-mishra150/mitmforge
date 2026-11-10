import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ShieldCheck, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { call, commands, type BodyText, type ProxyStatus } from "../../platform/ipc";
import { useTraffic, type TrafficRow } from "./store";

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

function BodyPane({ row }: { row: TrafficRow }) {
  const [body, setBody] = useState<BodyText | null>(null);
  useEffect(() => {
    setBody(null);
    let alive = true;
    void commands
      .trafficBody(row.id)
      .then((b) => {
        if (alive) setBody(b);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [row.id, row.status]);

  return (
    <div className="grid h-64 shrink-0 grid-cols-2 gap-px overflow-hidden border-t border-neutral-800 bg-neutral-950 text-xs">
      {(
        [
          ["Request", body?.req_headers, body?.req_body],
          ["Response", body?.res_headers, body?.res_body],
        ] as const
      ).map(([title, headers, content]) => (
        <div key={title} className="overflow-auto p-2">
          <div className="mb-1 text-neutral-500">{title}</div>
          <pre className="whitespace-pre-wrap break-all text-neutral-300">
            {headers || ""}
            {headers && content ? "\n\n" : ""}
            {content || (body ? "" : "…")}
          </pre>
        </div>
      ))}
    </div>
  );
}

/** Memoized row: only the row whose object changed re-renders, not the grid. */
const RowView = memo(function RowView({
  row,
  selected,
  index,
  start,
  size,
  onSelect,
}: {
  row: TrafficRow;
  selected: boolean;
  index: number;
  start: number;
  size: number;
  onSelect: (id: number) => void;
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
      className={`grid cursor-pointer grid-cols-[3rem_4.5rem_3.5rem_4rem_1fr_5.5rem_3rem] items-center gap-x-3 border-b border-neutral-800/50 px-3 ${selected ? "bg-neutral-800" : "hover:bg-neutral-800/50"}`}
      data-index={index}
    >
      <span className="text-neutral-600">{row.id}</span>
      <span className={METHOD_COLORS[row.method] ?? "text-neutral-300"}>{row.method}</span>
      <span className={statusColor(row.status)}>{row.status ?? "…"}</span>
      <span className="text-neutral-500">{row.durationMs ?? ""}</span>
      <span className="truncate">
        <span className="text-neutral-500">{host}</span>
        <span className="text-neutral-300">{path}</span>
      </span>
      <span className="text-neutral-600">{time(row.started_at_ms)}</span>
      <span className="text-neutral-600">{row.scheme === "https" ? "SSL" : "–"}</span>
    </div>
  );
});

export function TrafficGrid() {
  const rows = useTraffic((s) => s.rows);
  const selectedId = useTraffic((s) => s.selectedId);
  const select = useTraffic((s) => s.select);
  const clear = useTraffic((s) => s.clear);
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [message, setMessage] = useState("");
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

  const virtualizer = useVirtualizer({
    count: rows.length,
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
    <div className="flex h-full flex-col bg-neutral-900 text-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span
            className={`inline-block h-2 w-2 rounded-full ${status?.listening ? "bg-emerald-500" : "bg-neutral-600"}`}
          />
          MitmForge — proxy 127.0.0.1:8080
        </span>
        <span className="flex items-center gap-2 text-xs">
          {message && <span className="max-w-96 truncate text-neutral-400">{message}</span>}
          <button
            type="button"
            onClick={toggleSystem}
            className={`flex items-center gap-1 rounded px-2 py-1 ${systemOn ? "bg-emerald-900/50 text-emerald-300" : "bg-neutral-800 text-neutral-400"} hover:brightness-125`}
          >
            {systemOn ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            System proxy {systemOn ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={trustCa}
            disabled={status?.ca_trusted === true}
            title={status?.ca_trusted ? "Certificate already trusted" : undefined}
            className={`flex items-center gap-1 rounded px-2 py-1 ${status?.ca_trusted ? "bg-emerald-900/50 text-emerald-300" : "bg-neutral-800 text-neutral-400"} hover:brightness-125 disabled:hover:brightness-100`}
          >
            <ShieldCheck size={14} />
            {status?.ca_trusted ? "CA trusted" : "Trust CA"}
          </button>
          <span className="text-neutral-500">{rows.length} req</span>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear captured traffic"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </header>

      <div className="grid grid-cols-[3rem_4.5rem_3.5rem_4rem_1fr_5.5rem_3rem] gap-x-3 border-b border-neutral-800 px-3 py-1 text-xs tracking-wide text-neutral-500 uppercase">
        <span>#</span>
        <span>Method</span>
        <span>Status</span>
        <span>ms</span>
        <span>URL</span>
        <span>Time</span>
        <span>SSL</span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => (
            <RowView
              key={rows[v.index].id}
              row={rows[v.index]}
              selected={rows[v.index].id === selectedId}
              index={v.index}
              start={v.start}
              size={v.size}
              onSelect={onRowClick}
            />
          ))}
        </div>
      </div>

      {selected && <BodyPane row={selected} />}
    </div>
  );
}
