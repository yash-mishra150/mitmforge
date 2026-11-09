import { create } from "zustand";
import type { TrafficEntry } from "../../bindings";

// Memory guard; BRD targets 50k rows — raise once the grid proves out.
export const MAX_ROWS = 10_000;

export interface TrafficRow extends TrafficEntry {
  status: number | null;
  durationMs: number | null;
}

interface TrafficState {
  rows: TrafficRow[];
  selectedId: number | null;
  addRequest: (entry: TrafficEntry) => void;
  addResponse: (id: number, status: number, durationMs: number | null) => void;
  select: (id: number | null) => void;
  clear: () => void;
}

// Coalesce bursts of backend events into one store update per tick, so the
// grid re-renders at most ~20x/sec no matter how hard background apps churn.
const pendingRequests: TrafficEntry[] = [];
const pendingResponses: Array<[number, number, number | null]> = [];
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
        rows = [{ ...entry, status: null, durationMs: null }, ...rows];
      }
      if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);
      for (const [id, status, durationMs] of responses) {
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) {
          const patched = { ...rows[i], status, durationMs };
          rows = rows.slice();
          rows[i] = patched;
        }
      }
      return { rows };
    });
  }, 50);
}

export const useTraffic = create<TrafficState>((set) => ({
  rows: [],
  selectedId: null,
  addRequest: (entry) => {
    pendingRequests.push(entry);
    schedule(set);
  },
  addResponse: (id, status, durationMs) => {
    pendingResponses.push([id, status, durationMs]);
    schedule(set);
  },
  select: (id) => set({ selectedId: id }),
  clear: () => set({ rows: [], selectedId: null }),
}));
