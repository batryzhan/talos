import { useCallback, useMemo } from 'react';
import { Loader2, Play, Sigma } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Hint } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { useBenchStore } from './benchStore';
import { M0Chart, chartSeries } from './M0Chart';
import { PairedSummary, ResultsTable } from './ResultsTable';
import { Distribution } from './Distribution';
import { EmptyState } from './EmptyState';
import { SERIES_COLORS, pct } from './format';

const NS = [2, 4, 8] as const;

/** Math symbol inside an uppercase caption: keeps its case (ε must not become Ε). */
function Sym({ children }: { children: string }): JSX.Element {
  return <i className="font-serif normal-case tracking-normal">{children}</i>;
}

/** M0 consensus lab: parameters + run controls, log D(k) chart, results table, K distribution. */
export function M0Lab(): JSX.Element {
  const t = useT();
  const { n, p, eps, running, progress, series, custom, selectedKey } = useBenchStore();
  const { setN, setP, setEps, select } = useBenchStore.getState();

  const lines = useMemo(() => chartSeries(series?.rows ?? [], custom, n, t('bench.custom')), [series, custom, n, t]);
  const colorOf = useCallback((key: string) => lines.find(l => l.row.key === key)?.color, [lines]);
  const rows = useMemo(() => [...custom, ...(series?.rows ?? [])], [series, custom]);
  const selected = rows.find(r => r.key === selectedKey) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader><CardTitle><Sigma aria-hidden />{t('bench.params')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <span id="bench-n" className="caption block">{t('bench.n')} <Sym>N</Sym></span>
            <ToggleGroup type="single" className="w-full" value={String(n)} onValueChange={v => v && setN(Number(v) as 2 | 4 | 8)} aria-labelledby="bench-n">
              {NS.map(v => <ToggleGroupItem key={v} value={String(v)} className="num">{v}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between"><span className="caption">{t('bench.p')} <Sym>p</Sym></span><span className="num text-xs">{pct(p)}</span></div>
            <Slider min={0} max={30} step={5} value={[Math.round(p * 100)]} onValueChange={([v]) => setP(v / 100)} thumbLabel={t('bench.p')} />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between"><span className="caption">{t('bench.eps')} <Sym>ε</Sym></span><span className="num text-xs">{eps.toFixed(2)}</span></div>
            <Slider min={0.05} max={0.4} step={0.05} value={[eps]} onValueChange={([v]) => setEps(Math.round(v * 100) / 100)} thumbLabel={t('bench.eps')} />
          </div>

          <div className="space-y-2 pt-1">
            <Hint label={t('bench.runSeries.hint')}>
              <Button className="w-full" disabled={running !== null} onClick={() => void useBenchStore.getState().runSeries()}>
                {running === 'series' ? <Loader2 className="animate-spin" /> : <Play />}
                {t('bench.runSeries')}
              </Button>
            </Hint>
            <Hint label={t('bench.runOne.hint')}>
              <Button variant="outline" className="w-full" disabled={running !== null} onClick={() => void useBenchStore.getState().runCustom()}>
                {running === 'custom' ? <Loader2 className="animate-spin" /> : <Play />}
                {t('bench.runOne')}
              </Button>
            </Hint>
            {progress && (
              <div className="space-y-1.5 pt-1" aria-live="polite">
                <Progress value={(progress.done / progress.total) * 100} aria-label={t('bench.progress', { done: progress.done, total: progress.total })} />
                <p className="text-2xs text-muted-foreground"><span className="num">{t('bench.progress', { done: progress.done, total: progress.total })}</span></p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={t('bench.empty')} hint={t('bench.emptyHint')} />
      ) : (
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="flex-wrap">
              <CardTitle>{t('bench.chart', { n })}</CardTitle>
              <CardDescription className="w-full text-xs">{t('bench.chart.hint')}</CardDescription>
            </CardHeader>
            <CardContent>
              {lines.length ? <M0Chart series={lines} /> : <EmptyState title={t('bench.empty')} hint={t('bench.emptyHint')} />}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="min-w-0 overflow-hidden">
              <CardHeader><CardTitle>{t('bench.results')}</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <ResultsTable rows={rows} colorOf={colorOf} selectedKey={selectedKey} onSelect={select} />
              </div>
              {series && <div className="px-3.5 py-3"><PairedSummary paired={series.paired} /></div>}
            </Card>
            <Card className="self-start">
              <CardHeader className="flex-wrap">
                <CardTitle>{t('bench.distribution')}</CardTitle>
                {selected && <CardDescription className="w-full text-xs">{t('bench.distribution.for', { n: selected.n, p: pct(selected.p), eps: selected.eps })}</CardDescription>}
              </CardHeader>
              <CardContent>
                {selected
                  ? <Distribution row={selected} color={colorOf(selected.key) ?? SERIES_COLORS[0]} />
                  : <p className="py-8 text-center text-xs text-muted-foreground">{t('bench.distribution.hint')}</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
