import { useEffect, useState } from "react";
import "./App.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type ProxyEvent } from "./bindings";
import { TrafficGrid } from "./features/traffic/TrafficGrid";
import { Sidebar } from "./features/traffic/Sidebar";
import { Overview } from "./features/traffic/Overview";
import { SettingsModal } from "./features/traffic/SettingsModal";
import { Splash } from "./features/traffic/Splash";
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
  Loader2,
  Search,
  FileDown,
} from "lucide-react";

const PROXY_EVENT = "proxy://event";
const CONTENT_TABS = ["All", "HTTP", "HTTPS", "WebSocket", "JSON", "Form", "XML", "JS", "CSS", "GraphQL", "Document", "Media", "Other"] as const;

const appWindow = getCurrentWindow();

const minimize = () => void appWindow.minimize();
const maximize = () => void appWindow.toggleMaximize();
const close = () => void appWindow.close();

const ICON_BTN = "flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-muted hover:text-fg hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)] hover:border-[#2a2a2e] transition-colors duration-150";

export default function App() {
  const [view, setView] = useState<"log" | "overview">("log");
  const [contentTabs, setContentTabs] = useState<string[]>([]);
  const [recording, setRecording] = useState(true);
  const [proxyStarting, setProxyStarting] = useState(false);
  const [system, setSystem] = useState(false);
  const [caTrusted, setCaTrusted] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [splash, setSplash] = useState(true);
  // One-shot "first boot" engine gate — proxyStarting is reused by the
  // record button, which would flash the splash on every resume.
  const [booting, setBooting] = useState(true);
  const sidebarView = useTraffic((s) => s.sidebarView);
  const aiSettings = loadAiSettings();

  useEffect(() => {
    applyTheme(loadTheme());
    // Right-click menu (incl. Inspect) off everywhere in the app.
    const noContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", noContextMenu);
    const unlisten = getCurrentWebviewWindow().listen<ProxyEvent>(PROXY_EVENT, (event) => {
      const { payload } = event as unknown as { payload: ProxyEvent };
      if (payload.type === "request") {
        useTraffic.getState().addRequest(payload.entry);
      } else {
        useTraffic.getState().addResponse(payload.id, payload.status, payload.durationMs ?? null);
      }
    });
    // Proxy auto-starts: recording defaults on, and starting after the listener
    // attaches means early traffic is not lost. AlreadyRunning is harmless.
    setProxyStarting(true);
    void unlisten
      .then(() => commands.proxyStart())
      .catch((e: Error) => {
        if (!String(e).includes("AlreadyRunning")) setMessage(String(e));
      })
      .finally(() => {
        setProxyStarting(false);
        setBooting(false);
      });
    return () => {
      document.removeEventListener("contextmenu", noContextMenu);
      void unlisten.then((f: () => void) => f());
    };
  }, []);

  // Splash never shows for less than 1.5s (proxyStarting may clear sooner).
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1500);
    return () => clearTimeout(t);
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
    if (target) {
      setProxyStarting(true);
    }
    setRecording(target);
    if (target) {
      void commands
        .proxyStart()
        .then(() => {
          setProxyStarting(false);
        })
        .catch((e: Error) => {
          if (!String(e).includes("AlreadyRunning")) {
            setMessage(String(e));
          }
          setProxyStarting(false);
        });
    }
    void commands.trafficRecording(target).then(() => setMessage(target ? "Recording on" : "Recording paused"));
  };

  const clearTraffic = () => {
    useTraffic.getState().clear();
    setMessage("Traffic cleared");
  };

  const stopCapture = () => {
    setRecording(false);
    void commands.trafficRecording(false).then(() => setMessage("Capture stopped"));
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

  const exportHar = () => {
    const rows = useTraffic.getState().rows;
    const har = {
      log: {
        version: "1.2",
        creator: { name: "MitmForge", version: "0.1.0" },
        entries: rows.map((r) => ({
          startedDateTime: new Date(r.started_at_ms).toISOString(),
          time: r.durationMs ?? 0,
          request: { method: r.method, url: r.url, headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: r.req_size ?? 0 },
          response: { status: r.status ?? 0, headers: [], content: { size: r.resSize ?? 0, mimeType: r.resContentType ?? "" }, cookies: [], headersSize: -1, bodySize: r.resSize ?? 0 },
          cache: {},
          _client: r.client ?? undefined,
          _scheme: r.scheme,
        })),
      },
    };
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitmforge-traffic.har";
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${rows.length} entries to HAR`);
  };

  return (
    <div className="flex h-full flex-col bg-app text-fg">
      {/* Top bar — left: wired controls; center: status; right: settings + window controls */}
      <header className="titlebar flex h-10 items-center border-b border-line bg-app px-3 select-none" data-tauri-drag-region>
        {/* Left: wired control buttons + app name + status */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={proxyStarting}
              className={`${ICON_BTN} ${recording ? "text-success" : ""} ${proxyStarting ? "opacity-70 cursor-wait" : ""}`}
              title={recording ? "Pause recording" : proxyStarting ? "Starting proxy…" : "Resume recording"}
              aria-label={recording ? "Pause recording" : proxyStarting ? "Starting proxy…" : "Resume recording"}
            >
              {proxyStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recording ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
            </button>
            <button
              type="button"
              onClick={stopCapture}
              className={ICON_BTN}
              title="Stop capture"
              aria-label="Stop capture"
            >
              <StopCircle size={14} />
            </button>
            <button
              type="button"
              onClick={clearTraffic}
              className={ICON_BTN}
              title="Clear traffic"
              aria-label="Clear traffic"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2 cursor-default">
            <span className="relative flex h-8 w-8 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-accent/20" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            <span className="text-xs font-medium text-fg tracking-tight truncate">mitmforge | Listening on 127.0.0.1:8080 | HTTP/1.1</span>
          </div>
        </div>

        {/* Right: settings gear + window controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg transition-colors"
            title="Settings (AI keys, theme)"
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
          <div className="w-px h-5 bg-line mx-1" />
          <button
            type="button"
            onClick={minimize}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg transition-colors"
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={maximize}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg transition-colors"
            title="Maximize"
            aria-label="Maximize"
          >
            <Square size={14} />
          </button>
          <button
            type="button"
            onClick={close}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-red-600/15 hover:text-red-400 transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Action surface: search + filter presets (left) + tool toggles (right) */}
      <div className="flex h-11 items-center gap-2 border-b border-line bg-app px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 max-w-xl flex-1 items-center rounded-lg border border-line bg-app px-2.5 py-1.5 transition-all focus-within:border-success">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter (e.g. status:200, host:api, /chat)..."
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg placeholder:text-muted focus:outline-none"
            />
            <kbd className="ml-2 hidden shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted md:block">ESC</kbd>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={toggleSystem}
            className={`${ICON_BTN} ${system ? "text-success border-success/30 bg-success/5" : ""}`}
            title={`System proxy ${system ? "on" : "off"}`}
            aria-label={`System proxy ${system ? "on" : "off"}`}
          >
            <Globe size={14} />
          </button>
          <button
            type="button"
            onClick={trustCa}
            className={`${ICON_BTN} ${caTrusted ? "text-success border-success/30 bg-success/5" : ""}`}
            title={caTrusted ? "CA trusted" : "Trust CA (install root certificate)"}
            aria-label={caTrusted ? "CA trusted" : "Trust CA"}
          >
            <ShieldCheck size={14} />
          </button>
          <button
            type="button"
            onClick={toggleAutoSave}
            className={`${ICON_BTN} ${autoSave ? "text-success border-success/30 bg-success/5" : ""}`}
            title={`Auto-save ${autoSave ? "on" : "off"}`}
            aria-label={`Auto-save ${autoSave ? "on" : "off"}`}
          >
            <Save size={14} />
          </button>
          <button
            type="button"
            onClick={analyze}
            disabled={analyzing}
            className={`${ICON_BTN} ${analyzing ? "opacity-50 cursor-not-allowed" : ""}`}
            title="Analyze suspicious (AI)"
            aria-label="Analyze suspicious"
          >
            <Sparkles size={14} />
          </button>
          <div className="h-4 w-px bg-line mx-1" />
          <button
            type="button"
            onClick={exportHar}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-accent/50 hover:text-fg"
            title="Export traffic as HAR"
          >
            <FileDown size={14} />
            <span className="hidden lg:inline">Export HAR</span>
          </button>
        </div>
      </div>

      {/* Filter preset pills */}
      <div className="flex h-9 items-center gap-1.5 overflow-x-auto border-b border-line bg-app px-3 py-1.5 scrollbar-hide">
        <span className="hidden shrink-0 text-[11px] font-medium text-muted sm:inline">Presets:</span>
        {CONTENT_TABS.map((tab) => {
          const isActive = contentTabs.includes(tab);
          return (
            <button
              key={tab}
              type="button"
              onClick={() => toggleContentTab(tab)}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-150 ${
                isActive
                  ? "bg-accent text-app shadow-sm"
                  : "border border-line bg-surface text-muted hover:border-accent/50 hover:text-fg"
              }`}
            >
              {tab}
            </button>
          );
        })}
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] text-muted transition-colors hover:text-danger"
            title="Clear search filter"
          >
            <X size={11} />
            "{search}"
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar onViewChange={(v: "log" | "overview") => setView(v)} />
        <div className="min-w-0 flex-1">
          {view === "log" ? <TrafficGrid activeTabs={contentTabs} sidebarView={sidebarView} search={search} /> : <Overview />}
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {message && (
        <div className="flex h-6 items-center px-3 text-[11px] text-muted border-t border-line bg-surface animate-slide-down">
          <span className="flex items-center gap-2">
            <Sparkles size={12} className="text-accent" />
            {message}
          </span>
        </div>
      )}
      <Splash show={splash || booting} />
    </div>
  );
}
