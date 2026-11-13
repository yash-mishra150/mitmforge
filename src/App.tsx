import { useEffect, useState } from "react";
import "./App.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type ProxyEvent } from "./bindings";
import { useTraffic } from "./features/traffic/store";
import { TrafficGrid } from "./features/traffic/TrafficGrid";
import { Sidebar } from "./features/traffic/Sidebar";
import { Overview } from "./features/traffic/Overview";

// Single backend → UI event channel; payload is a tagged ProxyEvent.
const PROXY_EVENT = "proxy://event";

export default function App() {
  const [view, setView] = useState<"log" | "overview">("log");
  useEffect(() => {
    const unlisten = getCurrentWebviewWindow().listen<ProxyEvent>(PROXY_EVENT, ({ payload }) => {
      if (payload.type === "request") {
        useTraffic.getState().addRequest(payload.entry);
      } else {
        useTraffic.getState().addResponse(payload.id, payload.status, payload.durationMs ?? null);
      }
    });
    // Start the proxy only after the listener is attached, so no traffic is lost.
    void commands.proxyStart();
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-neutral-800 bg-neutral-900 px-2 py-1 text-xs">
        {(["log", "overview"] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setView(view)}
            className={`rounded px-2 py-1 capitalize ${view === "log" ? "bg-emerald-900/50 text-emerald-300" : "bg-neutral-800 text-neutral-400"} hover:brightness-125`}
          >
            {view}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="min-w-0 flex-1">
          {view === "log" ? <TrafficGrid /> : <Overview />}
        </div>
      </div>
    </div>
  );
}
