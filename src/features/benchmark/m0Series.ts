import { runM0 } from '@/swarm/consensus';
import { Rng } from '@/swarm/rng';

export type SeriesId = '900' | '400' | 'custom';
export interface M0Config { series: SeriesId; n: number; p: number; eps: number }

export interface M0Row extends M0Config {
  key: string;
  /** Mean / sample SD of K over converged runs (censored runs reported in `failed`). */
  mean: number;
  sd: number;
  /** Half-width of the 95 % t-interval of the mean (only when every run converged). */
  ci: number;
  failed: number;
  runs: number;
  /** Mean D(k) over runs, k = 0 … STEPS. */
  curve: number[];
  /** K per run (NaN = did not converge), aligned by seed for paired comparisons. */
  ks: number[];
}

export interface PairedDelta { n: number; count: number; mean: number; lo: number; hi: number }
export interface SeriesResult { rows: M0Row[]; paired: PairedDelta[] }

export const RUNS = 100;
export const STEPS = 100;
export const THRESHOLD = 0.01;
const T_99 = 1.9842; // t(0.975, df = 99)
const CHUNK = 25;

/** 900 runs (N ∈ {2,4,8} × p ∈ {0,0.1,0.3}, ε = 0.2) + 400 runs (ε sweep at N = 8, p = 0.3). */
export const SERIES_CONFIGS: readonly M0Config[] = [
  ...[2, 4, 8].flatMap(n => [0, 0.1, 0.3].map(p => ({ series: '900' as const, n, p, eps: 0.2 }))),
  ...[0.05, 0.1, 0.2, 0.4].map(eps => ({ series: '400' as const, n: 8, p: 0.3, eps })),
];
export const SERIES_TOTAL = SERIES_CONFIGS.length * RUNS;

export const configKey = (c: M0Config): string => `${c.series}:${c.n}:${c.p}:${c.eps}`;

function summarise(c: M0Config, runs: ReturnType<typeof runM0>[]): M0Row {
  const ks = runs.map(r => r.kConverged ?? NaN);
  const valid = ks.filter(Number.isFinite);
  const mean = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
  const sd = Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, valid.length - 1));
  return {
    ...c,
    key: configKey(c),
    mean, sd,
    ci: valid.length === runs.length ? (T_99 * sd) / Math.sqrt(runs.length) : NaN,
    failed: runs.length - valid.length,
    runs: runs.length,
    ks,
    curve: Array.from({ length: STEPS + 1 }, (_, k) => runs.reduce((a, r) => a + r.samples[k].D, 0) / runs.length),
  };
}

const yieldToUi = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/** One configuration over seeds 0 … RUNS−1, yielding to the UI every CHUNK runs. */
export async function runConfig(c: M0Config, onRuns?: (n: number) => void, signal?: AbortSignal): Promise<M0Row> {
  const runs: ReturnType<typeof runM0>[] = [];
  for (let seed = 0; seed < RUNS; seed++) {
    runs.push(runM0({ n: c.n, p: c.p, eps: c.eps, steps: STEPS, seed, threshold: THRESHOLD }));
    if ((seed + 1) % CHUNK === 0) {
      onRuns?.(CHUNK);
      await yieldToUi();
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
  }
  return summarise(c, runs);
}

/** Paired ΔK = K(p = 0.3) − K(p = 0) by seed, with a 2000-sample bootstrap 95 % interval. */
export function pairedDeltas(rows: readonly M0Row[]): PairedDelta[] {
  return [2, 4, 8].flatMap(n => {
    const a = rows.find(r => r.series === '900' && r.n === n && r.p === 0);
    const b = rows.find(r => r.series === '900' && r.n === n && r.p === 0.3);
    if (!a || !b) return [];
    const d = a.ks.map((k, i) => b.ks[i] - k).filter(Number.isFinite);
    if (!d.length) return [];
    const rng = new Rng(n);
    const samples = Array.from({ length: 2000 }, () => d.reduce(sum => sum + d[Math.floor(rng.random() * d.length)], 0) / d.length).sort((x, y) => x - y);
    return [{ n, count: d.length, mean: d.reduce((x, y) => x + y, 0) / d.length, lo: samples[50], hi: samples[1950] }];
  });
}

/** The full 1300-run series with progress (done, total). */
export async function runSeries(onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<SeriesResult> {
  const rows: M0Row[] = [];
  let done = 0;
  onProgress(0, SERIES_TOTAL);
  for (const c of SERIES_CONFIGS) {
    rows.push(await runConfig(c, n => { done += n; onProgress(done, SERIES_TOTAL); }, signal));
  }
  return { rows, paired: pairedDeltas(rows) };
}

export interface HistogramBin { label: string; from: number; to: number; count: number }

/** Integer-aligned histogram of converged K values (≤ maxBins bins). */
export function histogram(ks: readonly number[], maxBins = 12): HistogramBin[] {
  const valid = ks.filter(Number.isFinite);
  if (!valid.length) return [];
  const lo = Math.min(...valid), hi = Math.max(...valid);
  const width = Math.max(1, Math.ceil((hi - lo + 1) / maxBins));
  const bins: HistogramBin[] = [];
  for (let from = lo; from <= hi; from += width) {
    const to = from + width - 1;
    bins.push({ label: width === 1 ? String(from) : `${from}–${to}`, from, to, count: 0 });
  }
  for (const k of valid) bins[Math.min(bins.length - 1, Math.floor((k - lo) / width))].count++;
  return bins;
}
