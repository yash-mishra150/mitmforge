import { useEffect, useState } from "react";
import "./App.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type ProxyEvent } from "./bindings";
import { useTraffic } from "./features/traffic/store";
import { TrafficGrid } from "./features/traffic/TrafficGrid";
import { Sidebar } from "./features/traffic/Sidebar";
import { Overview } from "./features/traffic/Overview";
import { applyTheme, loadTheme } from "./theme/theme";
import { FilterBar } from "./features/traffic/FilterBar";
import { SettingsModal } from "./features/traffic/SettingsModal";
import { loadAiSettings } from "./features/ai/settings";
import { analyzeSuspicious } from "./features/ai/analyze";
import { Activity } from "lucide-react";

const PROXY_EVENT = "proxy://event";
const CONTENT_TABS = ["All", "JSON", "Form", "XML", "JS", "CSS", "GraphQL", "Document", "Media", "Other"] as const;

export default function App() {
  const [view, setView] = useState<"log" | "overview">("log");
  const [contentTabs, setContentTabs] = useState<string[]>([]);
  const [system, setSystem] = useState(false);
  const [recording, setRecording] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const aiSettings = loadAiSettings();

  useEffect(() => {
    applyTheme(loadTheme());
    const unlisten = getCurrentWebviewWindow().listen<ProxyEvent>(PROXY_EVENT, ({ payload }) => {
      if (payload.type === "request") {
        useTraffic.getState().addRequest(payload.entry);
      } else {
        useTraffic.getState().addResponse(payload.id, payload.status, payload.durationMs ?? null);
      }
    });
    void commands.proxyStart();
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    void commands
      .proxyStatus()
      .then((s) => {
        setSystem(!!s.system_proxy);
      })
      .catch(() => {});
  }, []);

  const toggleSystem = () => {
    const target = !system;
    void commands
      .proxySetSystem(target)
      .then(() => {
        setSystem(target);
        setMessage(target ? "System proxy on" : "System proxy off");
      })
      .catch((e: Error) => setMessage(String(e)));
  };

  const trustCa = () => {
    void commands
      .proxyInstallCa()
      .then(() => commands.proxySetSystem(true))
      .then(() => {
        setSystem(true);
        setMessage("Certificate trusted — system capture on");
      })
      .catch((e: Error) => setMessage(String(e)));
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

  const analyze = () => {
    setAnalyzing(true);
    analyzeSuspicious(useTraffic.getState().rows, aiSettings)
      .then((found: Record<string, string>) => {
        useTraffic.getState().setSuspicious(found);
        const n = Object.keys(found).length;
        setMessage(n > 0 ? `${n} suspicious request(s) flagged` : "Nothing suspicious found");
      })
      .catch((e: Error) => setMessage(String(e)))
      .finally(() => setAnalyzing(false));
  };

  const toggleContentTab = (type: string) => {
    setContentTabs((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [type]));
  };

  return (
    <div className="flex h-full flex-col bg-app text-fg">
      {/* Minimal top strip: logo + app name + options */}
      <header className="flex h-10 items-center justify-between border-b border-line bg-app px-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <span className="text-xs font-medium text-fg tracking-tight">mitmforge</span>
        </div>
        <nav className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOptionsOpen(!optionsOpen)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]"
            title="Options"
          >
            ⋮
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg hover:border-[#2a2a2e]"
            title="Settings"
          >
            Settings
          </button>
        </nav>
      </header>

      {/* Options dropdown */}
      {optionsOpen && (
        <div className="fixed top-10 right-4 z-50 rounded-md border border-line bg-surface p-2 shadow-[0_4px_12px_rgb(0_0_0_/_0.4)]">
          <button type="button" onClick={() => setSettingsOpen(true)} className="w-full text-left rounded-md px-3 py-1.5 text-xs text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] hover:text-fg">
            Settings
          </button>
          <button type="button" className="w-full text-left rounded-md px-3 py-1.5 text-xs text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] hover:text-fg">
            Dark / Light theme
          </button>
          <button type="button" className="w-full text-left rounded-md px-3 py-1.5 text-xs text-danger hover:bg-[color-mix(in_srgb,var(--mt-danger)_15%,transparent)] hover:text-danger">
            Exit MitmForge
          </button>
        </div>
      )}

      {/* Pill action row */}
      <div className="flex h-8 items-center gap-1 border-b border-line bg-app px-2 overflow-x-auto scrollbar-hide">
        <button
          type="button"
          onClick={toggleSystem}
          title="Toggle system proxy"
          className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${system ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent" : ""}`}
        >
          System proxy {system ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={trustCa}
          title="Install / trust the root CA"
          className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg"
        >
          Trust CA
        </button>
        <button
          type="button"
          onClick={toggleRecording}
          title="Pause / resume recording"
          className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${recording ? "bg-[color-mix(in_srgb,var(--mt-success)_15%,transparent)] text-success" : ""}`}
        >
          Recording {recording ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={toggleAutoSave}
          title="Toggle auto-save"
          className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${autoSave ? "bg-[color-mix(in_srgb,var(--mt-success)_15%,transparent)] text-success" : ""}`}
        >
          Auto-save {autoSave ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={analyze}
          disabled={analyzing}
          title="Ask AI to flag suspicious requests"
          className={`flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg ${analyzing ? "text-muted opacity-70 cursor-not-allowed" : ""}`}
        >
          {analyzing ? "Analyzing…" : "Analyze suspicious"}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings (AI keys, theme)"
          className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted hover:border-[#2a2a2e] hover:text-fg"
        >
          Settings
        </button>
      </div>

      {/* Filter tab row */}
      <FilterBar activeTabs={contentTabs} allTabs={CONTENT_TABS} onContentTabToggle={toggleContentTab} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar onViewChange={(v: "log" | "overview") => setView(v)} />
        <div className="min-w-0 flex-1">
          {view === "log" ? <TrafficGrid activeTabs={contentTabs} systemOn={system} recording={recording} /> : <Overview />}
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {message && (
        <div className="h-6 flex items-center px-3 text-[11px] text-muted border-t border-line bg-surface">
          {message}
        </div>
      )}
    </div>
  );
}
