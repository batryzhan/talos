import { Download, ScrollText } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hint } from '@/components/ui/tooltip';
import { usePlural, useT } from '@/i18n';
import { downloadText } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { useSim, useSimStore } from '@/features/sim/simStore';
import { exportFilename, toCsv, toJson } from './export';

/** Recent events (newest first) and run-log export as JSON / CSV (download, no navigation). */
export function LogCard({ missionId }: { missionId: string }): JSX.Element {
  const t = useT();
  const plural = usePlural();
  const events = useSim(s => s.events);
  const logCount = useSim(s => s.logCount);
  const seed = useUiStore(s => s.seed);

  const exportAs = (kind: 'csv' | 'json'): void => {
    const logs = useSimStore.getState().engine?.logs ?? [];
    downloadText(
      exportFilename(missionId, seed, kind),
      kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
      kind === 'csv' ? toCsv(logs) : toJson(logs),
    );
  };
  const noData = logCount === 0;

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <CardTitle><ScrollText aria-hidden />{t('log.title')}</CardTitle>
        {logCount > 0 && <span className="ml-auto text-2xs text-muted-foreground">{plural('log.records', logCount)}</span>}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-3">
        {events.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-5 text-center">
            <p className="text-sm">{t('log.empty')}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">{t('log.emptyHint')}</p>
          </div>
        ) : (
          <ScrollArea className="h-48 rounded-md border">
            <ol className="divide-y divide-border" aria-live="polite" aria-relevant="additions">
              <AnimatePresence initial={false}>
                {events.map(e => (
                  <motion.li
                    key={e.seq}
                    layout="position"
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="flex gap-2.5 px-2.5 py-1.5 text-xs"
                  >
                    <span className="num w-11 shrink-0 text-right text-muted-foreground">{e.t.toFixed(1)}</span>
                    <span className="min-w-0 break-words">{e.text}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </ScrollArea>
        )}
        <div className="grid grid-cols-2 gap-2">
          {(['json', 'csv'] as const).map(kind => {
            const button = (
              <Button key={kind} variant="outline" size="sm" disabled={noData} onClick={() => exportAs(kind)}>
                <Download />
                {t(kind === 'json' ? 'log.exportJson' : 'log.exportCsv')}
              </Button>
            );
            return noData ? <Hint key={kind} label={t('log.exportEmpty')}><span tabIndex={0} className="grid">{button}</span></Hint> : button;
          })}
        </div>
      </CardContent>
    </Card>
  );
}
