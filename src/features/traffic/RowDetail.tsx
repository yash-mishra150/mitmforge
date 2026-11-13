import { useState, useEffect } from "react";
import { commands, type BodyText } from "../../platform/ipc";
import type { TrafficRow } from "./store";
import { useTraffic } from "./store";
import { parseQueryParams } from "./selectors";

const TABS = ["headers", "query", "raw", "bodies"] as const;
type Tab = (typeof TABS)[number];

/** Tabbed detail pane for the selected row: headers, query params, raw headers, bodies. */
export function RowDetail({ row }: { row: TrafficRow }) {
  const [tab, setTab] = useState<Tab>("headers");
  const [body, setBody] = useState<BodyText | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
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
    <div className="flex h-64 shrink-0 flex-col border-t border-neutral-800 bg-neutral-950 text-xs">
      <div className="flex shrink-0 items-center border-b border-neutral-800 px-1">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 capitalize ${tab === key ? "border-b-2 border-emerald-500 text-emerald-400" : "text-neutral-400 hover:text-neutral-200"}`}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => togglePin(row.id)}
          className={`ml-auto px-2 py-1 ${isPinned ? "text-amber-400" : "text-neutral-500 hover:text-neutral-300"}`}
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
        {fetchError && <div className="text-rose-400">Error loading details: {fetchError}</div>}
        {!body && !fetchError && <div className="text-neutral-500">…</div>}
      </div>
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
          <div className="mb-1 text-neutral-500">{label}</div>
          <pre className={`whitespace-pre-wrap break-all text-neutral-300 ${mono ? "font-mono" : ""}`}>
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
  if (params.length === 0) return <div className="text-neutral-500">No query parameters</div>;
  return (
    <div>
      {params.map((p) => (
        <div key={p.key + p.value} className="flex gap-3">
          <span className="w-64 shrink-0 break-all text-neutral-300">{p.key}</span>
          <span className="break-all text-neutral-400">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
