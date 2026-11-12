import { create } from 'zustand';
import { RUNS, configKey, runConfig, runSeries, type M0Row, type SeriesResult } from './m0Series';
import { physicalBenchmark, type PhysicalResult } from './physical';

export type BenchJob = 'series' | 'custom' | 'physical';

interface BenchState {
  /** N shown on the chart and used for a custom run. */
  n: 2 | 4 | 8;
  p: number;
  eps: number;
  running: BenchJob | null;
  progress: { done: number; total: number } | null;
  series: SeriesResult | null;
  custom: M0Row[];
  selectedKey: string | null;
  physicalSeed: number;
  physical: PhysicalResult[] | null;
  error: string | null;

  setN: (n: 2 | 4 | 8) => void;
  setP: (p: number) => void;
  setEps: (eps: number) => void;
  select: (key: string | null) => void;
  setPhysicalSeed: (seed: number) => void;
  runSeries: () => Promise<void>;
  runCustom: () => Promise<void>;
  runPhysical: () => Promise<void>;
}

/** Benchmark lab state; results survive navigating away and back. */
export const useBenchStore = create<BenchState>()((set, get) => ({
  n: 8,
  p: 0.3,
  eps: 0.2,
  running: null,
  progress: null,
  series: null,
  custom: [],
  selectedKey: null,
  physicalSeed: 0,
  physical: null,
  error: null,

  setN: n => set({ n }),
  setP: p => set({ p }),
  setEps: eps => set({ eps }),
  select: selectedKey => set({ selectedKey }),
  setPhysicalSeed: physicalSeed => set({ physicalSeed }),

  runSeries: async () => {
    if (get().running) return;
    set({ running: 'series', error: null, progress: { done: 0, total: 1 } });
    try {
      const series = await runSeries((done, total) => set({ progress: { done, total } }));
      const sel = get().selectedKey;
      set({ series, selectedKey: sel ?? series.rows.find(r => r.series === '900' && r.n === get().n && r.p === 0.3)?.key ?? null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ running: null, progress: null });
    }
  },

  runCustom: async () => {
    if (get().running) return;
    const { n, p, eps } = get();
    let done = 0;
    set({ running: 'custom', error: null, progress: { done: 0, total: RUNS } });
    try {
      const row = await runConfig({ series: 'custom', n, p, eps }, k => { done += k; set({ progress: { done, total: RUNS } }); });
      set(s => ({ custom: [row, ...s.custom.filter(r => r.key !== row.key)].slice(0, 6), selectedKey: configKey(row) }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ running: null, progress: null });
    }
  },

  runPhysical: async () => {
    if (get().running) return;
    set({ running: 'physical', error: null });
    try {
      set({ physical: await physicalBenchmark(get().physicalSeed) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ running: null });
    }
  },
}));
