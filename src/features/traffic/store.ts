import { create } from "zustand";
import type { TrafficEntry, TrafficEntry_Serialize } from "../../bindings";

// Memory guard; BRD targets 50k rows — raise once the grid proves out.
export const MAX_ROWS = 10_000;

export type TrafficRow = TrafficEntry_Serialize & {
  status: number | null;
  durationMs: number | null;
  resContentType: string | null;
  resSize: number | null;
};

interface TrafficState {
  rows: TrafficRow[];
  selectedId: number | null;
  comments: Record<string, string>;
  pinned: number[];
  hostFilter: string | null;
  clientFilter: string | null;
  addRequest: (entry: TrafficEntry) => void;
  addResponse: (
    id: number,
    status: number,
    durationMs: number | null,
    resContentType?: string | null,
    resSize?: number | null,
  ) => void;
  select: (id: number | null) => void;
  togglePin: (id: number) => void;
  clear: () => void;
  setComment: (id: number, text: string) => void;
  setHostFilter: (host: string | null) => void;
  setClientFilter: (client: string | null) => void;
}

// Coalesce bursts of backend events into one store update per tick, so the
// grid re-renders at most ~20x/sec no matter how hard background apps churn.
const pendingRequests: TrafficEntry[] = [];
const pendingResponses: Array<[number, number, number | null, string | null, number | null]> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function schedule(set: (fn: (s: TrafficState) => Partial<TrafficState>) => void) {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const requests = pendingRequests.splice(0);
    const responses = pendingResponses.splice(0);
    if (requests.length === 0 && responses.length === 0) return;
    set((s) => {
      let rows = s.rows;
      for (const entry of requests) {
        rows = [
          {
            ...entry,
            req_content_type: entry.req_content_type ?? null,
            req_size: entry.req_size ?? null,
            client: entry.client ?? null,
            status: null,
            durationMs: null,
            resContentType: null,
            resSize: null,
          },
          ...rows,
        ];
      }
      if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);
      for (const [
        id,
        status,
        durationMs,
        resContentType,
        resSize,
      ] of responses) {
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) {
          const patched = { ...rows[i], status, durationMs, resContentType, resSize };
          rows = rows.slice();
          rows[i] = patched;
        }
      }
      return { rows, comments: s.comments };
    });
  }, 50);
}

export const useTraffic = create<TrafficState>((set) => ({
  rows: [],
  selectedId: null,
  comments: {},
  pinned: [],
  hostFilter: null,
  clientFilter: null,
  addRequest: (entry) => {
    pendingRequests.push(entry);
    schedule(set);
  },
  addResponse: (
    id,
    status,
    durationMs,
    resContentType: string | null = null,
    resSize: number | null = null,
  ) => {
    pendingResponses.push([id, status, durationMs, resContentType, resSize]);
    schedule(set);
  },
  select: (id) => set({ selectedId: id }),
  togglePin: (id) => set((s) => {
    const next = s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [...s.pinned, id];
    return { pinned: next };
  }),
  clear: () => set({ rows: [], selectedId: null, comments: {}, pinned: [], hostFilter: null, clientFilter: null }),
  setComment: (id, text) => set((s) => {
    const key = id.toString();
    const newComments = { ...s.comments };
    if (text) {
      newComments[key] = text;
    } else {
      delete newComments[key];
    }
    return { comments: newComments };
  }),
  setHostFilter: (host) => set({ hostFilter: host }),
  setClientFilter: (client) => set({ clientFilter: client }),
}));