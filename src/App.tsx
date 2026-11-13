import { useEffect, useState } from "react";
import "./App.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type ProxyEvent } from "./bindings";
import { useTraffic } from "./features/traffic/store";
import { TrafficGrid } from "./features/traffic/TrafficGrid";
import { Sidebar } from "./features/traffic/Sidebar";
import { Overview } from "./features/traffic/Overview";
import { applyTheme, loadTheme } from "./theme/theme";

// Single backend → UI event channel; payload is a tagged ProxyEvent.
const PROXY_EVENT = "proxy://event";

export default function App() {
  const [view, setView] = useState<"log" | "overview">("log");
  useEffect(() => {
    applyTheme(loadTheme());
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
      <div className="flex h-10 items-center gap-1 border-b border-line bg-app px-2">
        {(["log", "overview"] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setView(view)}
            className={`rounded-md px-2 py-1 text-xs capitalize ${view === "log" ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent" : "text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] hover:text-fg"}`}
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
