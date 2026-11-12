import { FlaskConical } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useT } from '@/i18n';
import { M0Lab } from '@/features/benchmark/M0Lab';
import { PhysicalTab } from '@/features/benchmark/PhysicalTab';
import { useBenchStore } from '@/features/benchmark/benchStore';

/** Benchmark M0 — the research lab (no 3D scene). */
export default function BenchmarkPage(): JSX.Element {
  const t = useT();
  const error = useBenchStore(s => s.error);
  return (
    <ScrollArea className="size-full">
      <main id="main" className="mx-auto max-w-[1440px] space-y-4 p-4 lg:p-6">
        <Tabs defaultValue="m0" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
                {t('bench.title')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('bench.subtitle')}</p>
            </div>
            <TabsList>
              <TabsTrigger value="m0">{t('bench.tab.m0')}</TabsTrigger>
              <TabsTrigger value="physical">{t('bench.tab.physical')}</TabsTrigger>
            </TabsList>
          </div>
          {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <TabsContent value="m0"><M0Lab /></TabsContent>
          <TabsContent value="physical"><PhysicalTab /></TabsContent>
        </Tabs>
      </main>
    </ScrollArea>
  );
}
