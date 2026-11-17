import { useEffect, useMemo, useState } from "react";
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
  FileDown,
  Sparkles,
  Loader2,
  Search,
  Zap,
} from "lucide-react";
import { contentCategory } from "./features/traffic/selectors";

const PROXY_EVENT = "proxy://event";
const CONTENT_TABS = ["All", "HTTP", "HTTPS", "WebSocket", "JSON", "Form", "XML", "JS", "CSS", "GraphQL", "Document", "Media", "Other"] as const;

/** contentCategory() result → CONTENT_TABS pill label. */
const TAB_BY_CATEGORY: Record<string, string> = {
  json: "JSON",
  form: "Form",
  xml: "XML",
  js: "JS",
  css: "CSS",
  graphql: "GraphQL",
  document: "Document",
  media: "Media",
  other: "Other",
};

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [splash, setSplash] = useState(true);
  // One-shot "first boot" engine gate — proxyStarting is reused by the
  // record button, which would flash the splash on every resume.
  const [booting, setBooting] = useState(true);
  const sidebarView = useTraffic((s) => s.sidebarView);
  const rows = useTraffic((s) => s.rows);
  const aiSettings = loadAiSettings();

  // Per-pill traffic counts; one pass over rows, keyed by pill label.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of CONTENT_TABS) counts[tab] = 0;
    for (const r of rows) {
      counts.All++;
      if (r.scheme === "http") counts.HTTP++;
      else if (r.scheme === "https") counts.HTTPS++;
      if (r.url.startsWith("ws://") || r.url.startsWith("wss://")) counts.WebSocket++;
      const tab = TAB_BY_CATEGORY[contentCategory(r.resContentType, r.req_content_type)];
      if (tab) counts[tab]++;
    }
    return counts;
  }, [rows]);

  // Ctrl+F / Cmd+F focuses the traffic filter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        document.getElementById("traffic-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mitmforge-traffic.har";
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage(`Exported ${rows.length} entries to HAR`);
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

  return (
    <div className="flex h-full flex-col bg-app text-fg">
      {/* Top bar — left: brand + record controls + status; right: tool toolbar + window controls */}
      <header className="titlebar flex h-10 items-center justify-between border-b border-line bg-app px-3 select-none" data-tauri-drag-region>
        {/* Left: brand mark, record controls, status, REC badge */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-[1px] shadow-sm shadow-indigo-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[5px] bg-app">
                <Zap className="h-3 w-3 text-accent" />
              </div>
            </div>
            <span className="text-[13px] font-semibold tracking-wide text-fg">mitmforge</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
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
          </div>
          <span className="hidden truncate font-mono text-[11px] text-muted lg:block">
            Listening on <span className="text-fg">127.0.0.1:8080</span>
            <span className="mx-1.5 text-line">|</span>HTTP/1.1
          </span>
          {recording && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-0.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              <span className="font-mono text-[10px] font-medium tracking-wider text-success">REC</span>
            </div>
          )}
        </div>

        {/* Right: quick actions toolbar + settings + window controls */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={clearTraffic}
            className={ICON_BTN}
            title="Clear traffic"
            aria-label="Clear traffic"
          >
            <Trash2 size={14} />
          </button>
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
            onClick={exportHar}
            className={ICON_BTN}
            title="Export session (.har)"
            aria-label="Export session"
          >
            <FileDown size={14} />
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
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="titlebar-button flex h-10 w-10 items-center justify-center rounded-none text-muted hover:bg-[color-mix(in_srgb,var(--mt-text)_6%,transparent)] hover:text-fg transition-colors"
            title="Settings (AI keys, theme)"
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
          <div className="mx-1 h-5 w-px bg-line" />
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

      {/* Filter pill bar: presets (left) + search (right) */}
      <nav className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line bg-app px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 scrollbar-hide [&::-webkit-scrollbar]:hidden">
          {CONTENT_TABS.map((tab) => {
            const isActive = contentTabs.includes(tab);
            const count = categoryCounts[tab] ?? 0;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => toggleContentTab(tab)}
                className={`shrink-0 whitespace-nowrap ${
                  isActive
                    ? "rounded border border-accent/30 bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent"
                    : "rounded px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-fg hover:bg-[color-mix(in_srgb,var(--mt-text)_5%,transparent)]"
                }`}
              >
                {tab}
                {(isActive || count > 0) && (
                  <span
                    className={`ml-1 rounded px-1 font-mono text-[9px] ${
                      isActive ? "bg-accent/20 text-accent" : "bg-surface text-muted"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="flex shrink-0 items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-danger"
              title="Clear search filter"
            >
              <X size={11} />
              "{search}"
            </button>
          )}
        </div>
        <div className="relative w-64 shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            id="traffic-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter URLs, headers, payloads..."
            className="w-full rounded border border-line bg-surface py-1 pl-8 pr-12 text-[11px] text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1 py-0.5 font-mono text-[9px] text-muted">Ctrl+F</kbd>
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar view={view} onViewChange={(v: "log" | "overview") => setView(v)} />
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

