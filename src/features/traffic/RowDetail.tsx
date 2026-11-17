import { useState, useEffect } from "react";
import { commands, type BodyText } from "../../platform/ipc";
import type { TrafficRow } from "./store";
import { useTraffic } from "./store";
import { parseQueryParams, parseHost } from "./selectors";
import { explainRow } from "../ai/analyze";
import { loadAiSettings } from "../ai/settings";
import { Terminal, ShieldCheck } from "lucide-react";

const TABS = ["bodies", "headers", "query", "raw"] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  bodies: "Payload Body",
  headers: "Headers",
  query: "Query",
  raw: "Raw",
};
type Tab = (typeof TABS)[number];

/** Inspector deck for the selected row: summary strip, tabbed headers/bodies/query. */
export function RowDetail({ row }: { row: TrafficRow }) {
  const [tab, setTab] = useState<Tab>("bodies");
  const [body, setBody] = useState<BodyText | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pinned = useTraffic((s) => s.pinned);
  const togglePin = useTraffic((s) => s.togglePin);
  const isPinned = pinned.includes(row.id);

  // Lazy body fetch; refetch when the response lands so bodies/headers fill in.
  useEffect(() => {
    let alive = true;
    setBody(null);
    setFetchError(null);
    void commands
      .trafficBody(row.id)
      .then((b) => {
        if (alive) setBody(b);
      })
      .catch((e) => {
        if (alive) setFetchError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [row.id, row.status]);

  const copyCurl = () => {
    const curl = `curl -X ${row.method} '${row.url}'`;
    void navigator.clipboard?.writeText(curl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  const statusPill = () => {
    if (row.status === null) {
      return <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning font-mono text-[11px] font-semibold">…</span>;
    }
    const cls =
      row.status < 300
        ? "bg-success/10 text-success"
        : row.status < 400
          ? "bg-accent/10 text-accent"
          : row.status < 500
            ? "bg-warning/10 text-warning"
            : "bg-danger/10 text-danger";
    return <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${cls}`}>{row.status}</span>;
  };

  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded bg-accent px-2 py-0.5 font-mono text-[11px] font-bold text-app">
            {row.method === "CONNECT" ? "TUNNEL" : row.method}
          </span>
          <span className="text-[14px] font-semibold text-fg truncate">{parseHost(row.url)}</span>
          <span className="font-mono text-[12px] text-muted truncate">{row.url}</span>
          <span className="h-4 w-px bg-line" />
          <span className="flex items-center gap-2 font-mono text-[11px]">
            {statusPill()}
            <span className="text-fg">{row.durationMs !== null ? `${row.durationMs}ms` : "…"}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              row.status !== null && row.status < 400
                ? "bg-success/10 text-success"
                : "bg-warning/10 text-warning"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {row.status !== null && row.status < 400 ? "Passed through" : row.status === null ? "In flight" : "Error response"}
          </span>
          <button
            type="button"
            onClick={copyCurl}
            className="flex items-center gap-1 rounded-lg bg-app px-2.5 py-1 text-[12px] font-medium text-fg transition-all hover:bg-[color-mix(in_srgb,var(--mt-text)_8%,transparent)]"
            title="Copy request as cURL"
          >
            <Terminal className="h-3.5 w-3.5 text-success" />
            {copied ? "Copied!" : "Copy cURL"}
          </button>
          <button
            type="button"
            onClick={() => togglePin(row.id)}
            className={`rounded-lg bg-app px-2.5 py-1 text-[12px] font-medium transition-all ${isPinned ? "text-warning" : "text-muted hover:text-fg"}`}
            title={isPinned ? "Unpin" : "Pin"}
          >
            {isPinned ? "★ Pinned" : "☆ Pin"}
          </button>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center justify-between border-b border-line px-3 pt-1.5">
        <div className="flex items-center gap-1 text-[12px]">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-all ${
                tab === key
                  ? "rounded-t-lg border-b-2 border-accent bg-app font-semibold text-fg"
                  : "font-medium text-muted hover:text-fg"
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setAiBusy(true);
            setAiAnswer(null);
            setAiError(null);
            void explainRow(
              row,
              {
                req_headers: body?.req_headers ?? null,
                res_headers: body?.res_headers ?? null,
                req_body: body?.req_body ?? null,
                res_body: body?.res_body ?? null,
              },
              loadAiSettings()
            )
              .then(setAiAnswer)
              .catch((e) => setAiError(String(e)))
              .finally(() => setAiBusy(false));
          }}
          disabled={aiBusy}
          className={`px-2 py-1 text-[12px] font-medium ${aiBusy ? "text-muted cursor-not-allowed" : "text-success hover:text-fg"}`}
          title="Ask AI to explain this exchange"
        >
          {aiBusy ? "Thinking…" : "AI Insights"}
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === "bodies" && <TwoPane left="Request body" right="Response body" leftText={body?.req_body ?? null} rightText={body?.res_body ?? null} />}
        {tab === "headers" && <TwoPane left="Request headers" right="Response headers" leftText={body?.req_headers ?? null} rightText={body?.res_headers ?? null} />}
        {tab === "raw" && <TwoPane mono left="Request" right="Response" leftText={body?.req_headers ?? null} rightText={body?.res_headers ?? null} />}
        {tab === "query" && <QueryParams url={row.url} />}
        {fetchError && <div className="text-danger">Error loading details: {fetchError}</div>}
        {!body && !fetchError && <div className="text-muted">…</div>}
      </div>

      {(aiAnswer || aiError) && (
        <div className="border-t border-line p-2">
          <div className="rounded-lg border border-line bg-app p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">AI Insights</div>
            {aiBusy ? (
              <div className="text-muted">Thinking…</div>
            ) : aiAnswer ? (
              <div className="whitespace-pre-wrap text-fg">{aiAnswer}</div>
            ) : aiError ? (
              <div className="whitespace-pre-wrap text-danger">{aiError}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Two side-by-side labeled code blocks (request | response). */
function TwoPane({
  left,
  right,
  leftText,
  rightText,
  mono,
}: {
  left: string;
  right: string;
  leftText: string | null;
  rightText: string | null;
  mono?: boolean;
}) {
  return (
    <div className="grid h-full grid-cols-2 gap-3">
      {(
        [
          [left, leftText],
          [right, rightText],
        ] as const
      ).map(([label, text]) => (
        <div key={label} className="overflow-hidden rounded-lg border border-line bg-app">
          <div className="border-b border-line px-2 py-1 text-[10px] uppercase tracking-wider text-muted">{label}</div>
          <div className="max-h-56 overflow-auto p-2">
            <pre className={`whitespace-pre-wrap break-all text-[12px] leading-relaxed text-fg ${mono ? "font-mono" : ""}`}>
              {text || "—"}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Decoded query-string parameters as a key/value list. */
function QueryParams({ url }: { url: string }) {
  const params = parseQueryParams(url);
  if (params.length === 0) return <div className="text-muted">No query parameters</div>;
  return (
    <div className="rounded-lg border border-line bg-app p-2">
      {params.map((p) => (
        <div key={p.key + p.value} className="flex gap-3 py-0.5">
          <span className="w-64 shrink-0 break-all text-fg">{p.key}</span>
          <span className="break-all text-muted">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
