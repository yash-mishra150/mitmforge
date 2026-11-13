import { useEffect, useState } from "react";
import "./App.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type ProxyEvent } from "./bindings";
import { TrafficGrid } from "./features/traffic/TrafficGrid";
import { Sidebar } from "./features/traffic/Sidebar";
import { Overview } from "./features/traffic/Overview";
import { SettingsModal } from "./features/traffic/SettingsModal";
import { applyTheme, loadTheme } from "./theme/theme";
import { useTraffic } from "./features/traffic/store";
import { loadAiSettings } from "./features/ai/settings";
import { analyzeSuspicious } from "./features/ai/analyze";
import {
  Pause,
  Play,
  StopCircle,
  Trash2,
  Settings,
  Minus,
  Square,
  X,
  Globe,
  ShieldCheck,
  Save,
  Sparkles,
  ScrollText,
  LayoutDashboard,
} from "lucide-react";

const PROXY_EVENT = "proxy://event";
const CONTENT_TABS = ["All", "HTTP", "HTTPS", "WebSocket", "JSON", "Form", "XML", "JS", "CSS", "GraphQL", "Document", "Media", "Other"] as const;

const appWindow = getCurrentWindow();

const minimize = () => void appWindow.minimize();
const maximize = () => void appWindow.toggleMaximize();
const close = () => void appWindow.close();

const ICON_BTN = "rounded border border-line bg-surface p-1.5 text-muted hover:text-fg hover:border-[#2a2a2e]";

export default function App() {
  const [view, setView] = useState<"log" | "overview">("log");
  const [contentTabs, setContentTabs] = useState<string[]>([]);
  const [recording, setRecording] = useState(true);
  const [system, setSystem] = useState(false);
  const [caTrusted, setCaTrusted] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const aiSettings = loadAiSettings();

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

  useEffect(() => {
    void commands
      .proxyStatus()
      .then((s) => {
        setSystem(!!s.system_proxy);
        setCaTrusted(!!s.ca_trusted);
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
        setCaTrusted(true);
        setMessage("Certificate trusted — system capture on");
      })
      .catch((e: Error) => setMessage(String(e)));
  };

  const toggleAutoSave = () => {
    const target = !autoSave;
    setAutoSave(target);
    void commands.trafficAutosave(target).then(() => setMessage(target ? "Auto-save on" : "Auto-save off"));
  };

  const toggleRecording = () => {
    const target = !recording;
    setRecording(target);
    void commands.trafficRecording(target).then(() => setMessage(target ? "Recording on" : "Recording paused"));
  };

  const clearTraffic = () => {
    useTraffic.getState().clear();
    setMessage("Traffic cleared");
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
      {/* Top bar — left: wired controls; center: status; right: settings + window controls */}
      <header className="titlebar flex h-10 items-center justify-between border-b border-line bg-app px-3 select-none" data-tauri-drag-region>
        {/* Left: wired control buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleRecording}
            className={`${ICON_BTN} ${recording ? "text-success" : ""}`}
            title={recording ? "Pause recording" : "Resume recording"}
          >
            {recording ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            type="button"
            onClick={clearTraffic}
            className={ICON_BTN}
            title="Stop capture / clear traffic"
          >
            <StopCircle size={15} />
          </button>
          <button
            type="button"
            onClick={clearTraffic}
            className={ICON_BTN}
            title="Clear traffic"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Center: app name + listening status */}
        <div className="flex items-center gap-2 cursor-default">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-xs font-medium text-fg">mitmforge | Listening on 127.0.0.1:8080 | HTTP/1.1</span>
        </div>

        {/* Right: settings gear + window controls (OpenIDEA size) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_8%,transparent)] hover:text-fg"
            title="Settings (AI keys, theme)"
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            onClick={minimize}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_8%,transparent)] hover:text-fg"
            title="Minimize"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={maximize}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_8%,transparent)] hover:text-fg"
            title="Maximize"
          >
            <Square size={14} />
          </button>
          <button
            type="button"
            onClick={close}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-red-600/20 hover:text-red-400"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Below layer: filter tabs (left) + tool icons (right) */}
      <div className="flex h-9 items-center justify-between border-b border-line bg-app px-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
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

        {/* Right: wired tool icons — system proxy, Trust CA, auto-save, analyze, view switches */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleSystem}
            className={`${ICON_BTN} ${system ? "text-success" : ""}`}
            title={`System proxy ${system ? "on" : "off"}`}
          >
            <Globe size={14} />
          </button>
          <button
            type="button"
            onClick={trustCa}
            className={`${ICON_BTN} ${caTrusted ? "text-success" : ""}`}
            title={caTrusted ? "CA trusted" : "Trust CA (install root certificate)"}
          >
            <ShieldCheck size={14} />
          </button>
          <button
            type="button"
            onClick={toggleAutoSave}
            className={`${ICON_BTN} ${autoSave ? "text-success" : ""}`}
            title={`Auto-save ${autoSave ? "on" : "off"}`}
          >
            <Save size={14} />
          </button>
          <button
            type="button"
            onClick={analyze}
            disabled={analyzing}
            className={`${ICON_BTN} ${analyzing ? "opacity-70" : ""}`}
            title="Analyze suspicious (AI)"
          >
            <Sparkles size={14} />
          </button>
          <button
            type="button"
            onClick={() => setView("log")}
            className={`${ICON_BTN} ${view === "log" ? "text-accent" : ""}`}
            title="Log view"
          >
            <ScrollText size={14} />
          </button>
          <button
            type="button"
            onClick={() => setView("overview")}
            className={`${ICON_BTN} ${view === "overview" ? "text-accent" : ""}`}
            title="Overview dashboard"
          >
            <LayoutDashboard size={14} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar onViewChange={(v: "log" | "overview") => setView(v)} />
        <div className="min-w-0 flex-1">
          {view === "log" ? <TrafficGrid activeTabs={contentTabs} /> : <Overview />}
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
