import { useEffect, useRef, useState } from "react";
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
    <div className="min-h-0 shrink-0 overflow-auto border-t border-neutral-800 bg-neutral-950 p-3 text-xs">
      <div className="mb-2 flex gap-4 text-neutral-400">
        <span>
          <span className="text-neutral-600">req</span> {body?.req_body ?? "…"}
        </span>
        <span>
          <span className="text-neutral-600">res</span> {body?.res_body ?? "…"}
        </span>
      </div>
    </div>
  );
}

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
            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-1 text-neutral-400 hover:brightness-125"
          >
            <ShieldCheck size={14} />
            Trust CA
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

      <div className="grid grid-cols-[3rem_4.5rem_3.5rem_4rem_1fr_5.5rem] gap-x-3 border-b border-neutral-800 px-3 py-1 text-xs tracking-wide text-neutral-500 uppercase">
        <span>#</span>
        <span>Method</span>
        <span>Status</span>
        <span>ms</span>
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
                onClick={() => select(r.id === selectedId ? null : r.id)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: v.size,
                  transform: `translateY(${v.start}px)`,
                }}
                className={`grid cursor-pointer grid-cols-[3rem_4.5rem_3.5rem_4rem_1fr_5.5rem] items-center gap-x-3 border-b border-neutral-800/50 px-3 ${r.id === selectedId ? "bg-neutral-800" : "hover:bg-neutral-800/50"}`}
              >
                <span className="text-neutral-600">{r.id}</span>
                <span className={METHOD_COLORS[r.method] ?? "text-neutral-300"}>{r.method}</span>
                <span className={statusColor(r.status)}>{r.status ?? "…"}</span>
                <span className="text-neutral-500">{r.durationMs ?? ""}</span>
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

      {selected && <BodyPane row={selected} />}
    </div>
  );
}
