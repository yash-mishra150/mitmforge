import { useState, useEffect } from "react";
import { commands, type BodyText } from "../../platform/ipc";
import type { TrafficRow } from "./store";
import { useTraffic } from "./store";
import { parseQueryParams } from "./selectors";
import { explainRow } from "../ai/analyze";
import { loadAiSettings } from "../ai/settings";

const TABS = ["headers", "query", "raw", "bodies"] as const;
type Tab = (typeof TABS)[number];

/** Tabbed detail pane for the selected row: headers, query params, raw headers, bodies. */
export function RowDetail({ row }: { row: TrafficRow }) {
  const [tab, setTab] = useState<Tab>("headers");
  const [body, setBody] = useState<BodyText | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
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

  return (
    <div className="bg-surface border-t border-line flex h-64 shrink-0 flex-col text-xs">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1 text-xs capitalize ${tab === key ? "bg-[color-mix(in_srgb,var(--mt-accent)_12%,transparent)] text-accent" : "text-muted hover:text-fg hover:bg-[color-mix(in_srgb,var(--mt-text)_4%,transparent)]"}`}
          >
            {key}
          </button>
        ))}
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
          className={`px-2 py-1 ${aiBusy ? "text-muted cursor-not-allowed" : "text-muted hover:text-accent"}`}
          title="Ask AI to explain this exchange"
        >
          {aiBusy ? "Thinking…" : "Ask AI"}
        </button>
        <button
          type="button"
          onClick={() => togglePin(row.id)}
          className={`ml-auto px-2 py-1 ${isPinned ? "text-warning" : "text-muted hover:text-fg"}`}
          title={isPinned ? "Unpin" : "Pin to Favorites"}
        >
          {isPinned ? "★ Pinned" : "☆ Pin"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {tab === "headers" && <TwoPane left="Request headers" right="Response headers" leftText={body?.req_headers ?? null} rightText={body?.res_headers ?? null} />}
        {tab === "raw" && <TwoPane mono left="Request" right="Response" leftText={body?.req_headers ?? null} rightText={body?.res_headers ?? null} />}
        {tab === "bodies" && <TwoPane left="Request body" right="Response body" leftText={body?.req_body ?? null} rightText={body?.res_body ?? null} />}
        {tab === "query" && <QueryParams url={row.url} />}
        {fetchError && <div className="text-danger">Error loading details: {fetchError}</div>}
        {!body && !fetchError && <div className="text-muted">…</div>}
      </div>

      {(aiAnswer || aiError) && (
        <div className="p-2 border-t border-line">
          <div className="border border-line rounded-md bg-app p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">AI</div>
            {aiBusy ? (
              <div className="text-muted">Thinking…</div>
            ) : aiAnswer ? (
              <div className="text-fg whitespace-pre-wrap">{aiAnswer}</div>
            ) : aiError ? (
              <div className="text-danger whitespace-pre-wrap">{aiError}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Two side-by-side labeled pre blocks (request | response). */
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
    <div className="grid h-full grid-cols-2 gap-2">
      {(
        [
          [left, leftText],
          [right, rightText],
        ] as const
      ).map(([label, text]) => (
        <div key={label} className="overflow-auto">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</div>
          <pre className={`whitespace-pre-wrap break-all text-fg ${mono ? "font-mono" : ""}`}>
            {text || "—"}
          </pre>
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
    <div>
      {params.map((p) => (
        <div key={p.key + p.value} className="flex gap-3">
          <span className="w-64 shrink-0 break-all text-fg">{p.key}</span>
          <span className="break-all text-muted">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
