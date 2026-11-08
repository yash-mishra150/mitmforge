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

export const useTraffic = create<TrafficState>((set) => ({
  rows: [],
  selectedId: null,
  addRequest: (entry) =>
    set((s) => ({
      rows: [{ ...entry, status: null, durationMs: null }, ...s.rows].slice(0, MAX_ROWS),
    })),
  addResponse: (id, status, durationMs) =>
    set((s) => {
      const i = s.rows.findIndex((r) => r.id === id);
      if (i < 0) return s;
      const rows = s.rows.slice();
      rows[i] = { ...rows[i], status, durationMs };
      return { rows };
    }),
  select: (id) => set({ selectedId: id }),
  clear: () => set({ rows: [], selectedId: null }),
}));
