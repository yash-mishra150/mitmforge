import { create } from "zustand";
import type { TrafficEntry } from "../../bindings";

// Memory guard; BRD targets 50k rows — raise once the grid proves out.
export const MAX_ROWS = 10_000;

export interface TrafficRow extends TrafficEntry {
  /** `null` while the exchange is still in flight. */
  status: number | null;
}

interface TrafficState {
  rows: TrafficRow[];
  addRequest: (entry: TrafficEntry) => void;
  addResponse: (id: number, status: number) => void;
  clear: () => void;
}

export const useTraffic = create<TrafficState>((set) => ({
  rows: [],
  addRequest: (entry) =>
    set((s) => ({ rows: [{ ...entry, status: null }, ...s.rows].slice(0, MAX_ROWS) })),
  addResponse: (id, status) =>
    set((s) => {
      const i = s.rows.findIndex((r) => r.id === id);
      if (i < 0) return s;
      const rows = s.rows.slice();
      rows[i] = { ...rows[i], status };
      return { rows };
    }),
  clear: () => set({ rows: [] }),
}));
