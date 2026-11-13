import { useEffect, useState } from "react";
import "./App.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type ProxyEvent } from "./bindings";
import { TrafficGrid } from "./features/traffic/TrafficGrid";
import { Sidebar } from "./features/traffic/Sidebar";
import { Overview } from "./features/traffic/Overview";
import { applyTheme, loadTheme } from "./theme/theme";
import { useTraffic } from "./features/traffic/store";
import {
  Pause,
  StopCircle,
  Trash2,
  User,
  ClipboardList,
  Ruler,
  Square,
  Diamond,
  FileText,
} from "lucide-react";

const PROXY_EVENT = "proxy://event";
const CONTENT_TABS = ["All", "HTTP", "HTTPS", "WebSocket", "JSON", "Form", "XML", "JS", "CSS", "GraphQL", "Document", "Media", "Other"] as const;

export default function App() {
  const [view, setView] = useState<"log" | "overview">("log");
  const [contentTabs, setContentTabs] = useState<string[]>([]);

  useEffect(() => {
    applyTheme(loadTheme());
    const unlisten = getCurrentWebviewWindow().listen<ProxyEvent>(PROXY_EVENT, (event) => {
      const { payload } = event as unknown as { payload: ProxyEvent };
      if (payload.type === "request") {
        useTraffic.getState().addRequest(payload.entry);
      } else {
        useTraffic.getState().addResponse(payload.id, payload.status, payload.durationMs ?? null);
      }
    });
    void commands.proxyStart();
    return () => {
      void unlisten.then((f: () => void) => f());
    };
  }, []);

  const toggleContentTab = (type: string) => {
    setContentTabs((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [type]));
  };

  return (
    <div className="flex h-full flex-col bg-app text-fg">
      {/* Top bar — left controls, center status, right placeholder icons */}
      <header className="titlebar flex h-10 items-center justify-between border-b border-line bg-app px-4 select-none" data-tauri-drag-region>
        {/* Left: control buttons */}
        <div className="flex items-center gap-1">
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Pause">
            <Pause size={14} />
          </button>
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Stop">
            <StopCircle size={14} />
          </button>
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Clear">
            <Trash2 size={14} />
          </button>
        </div>

        {/* Center: app name + listening status */}
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-xs font-medium text-fg">mitmforge | Listening on 127.0.0.1:8080 | HTTP/1.1</span>
        </div>

        {/* Right: placeholder icons */}
        <div className="flex items-center gap-1">
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Placeholder">
            <User size={14} />
          </button>
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Placeholder">
            <ClipboardList size={14} />
          </button>
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Placeholder">
            <Ruler size={14} />
          </button>
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Placeholder">
            <Square size={14} />
          </button>
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Placeholder">
            <Diamond size={14} />
          </button>
          <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]" title="Placeholder">
            <FileText size={14} />
          </button>
        </div>
      </header>

      {/* Filter tabs row */}
      <div className="flex h-8 items-center gap-1 border-b border-line bg-app px-2 overflow-x-auto scrollbar-hide">
        {CONTENT_TABS.map((tab) => {
          const isActive = contentTabs.includes(tab);
          return (
            <button
              key={tab}
              type="button"
              onClick={() => toggleContentTab(tab)}
              className={`whitespace-nowrap rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:text-fg hover:border-[#2a2a2e] ${
                isActive
                  ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent ring-1 ring-[color-mix(in_srgb,var(--mt-accent)_40%,transparent)]"
                  : ""
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar onViewChange={(v: "log" | "overview") => setView(v)} />
        <div className="min-w-0 flex-1">
          {view === "log" ? <TrafficGrid activeTabs={contentTabs} /> : <Overview />}
        </div>
      </div>
    </div>
  );
}
