import { MountainSnow, Radio, Route } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSim } from '@/features/sim/simStore';
import { useT } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { cn } from '@/lib/utils';
export const RESCUE_PHASES=[['FORMING','Формирование'],['SEARCH','Поиск'],['RELAY','Реле'],['EVACUATION','Эвакуация'],['COMPLETE','Завершено']] as const;
export default function RescueScenarioCard():JSX.Element {
 const t=useT(),s=useSim(s=>s.rescue),select=useUiStore(s=>s.select);
 return <Card>
  <CardHeader><CardTitle><MountainSnow aria-hidden />{t('scenario.title')}</CardTitle></CardHeader>
  <CardContent className="space-y-3">
   <CardDescription className="leading-5">{t('scenario.rescue')}</CardDescription>
   <div className="rounded-md border border-primary/25 bg-primary/5 p-2.5 text-sm"><strong>Цель: укрытие у пострадавшего</strong><p className="mt-1 text-xs text-muted-foreground">32 кг · брод 8 м · стабильная связь 5 с</p></div>
   <table className="w-full text-xs"><caption className="sr-only">Состав полевого отряда</caption><tbody>
    <tr><td className="py-1"><button className="font-medium hover:underline" onClick={()=>select({kind:'team',id:'Alpha'})}>Alpha</button></td><td>8 роб.</td><td className="text-right">32 кг</td></tr>
    <tr><td className="py-1">Scout-1…4</td><td>4 роб.</td><td className="text-right text-muted-foreground">Поиск / реле</td></tr>
    <tr><td className="py-1">Резерв #13–14</td><td>2 роб.</td><td className="text-right text-muted-foreground">На базе</td></tr>
   </tbody></table>
   <ol className="space-y-1" aria-label="Этапы миссии">{RESCUE_PHASES.map(([key,label],i)=><li key={key} className={cn('flex items-center gap-2 rounded px-1.5 py-0.5 text-xs',s?.phase===key&&'bg-primary/10')} aria-current={s?.phase===key?'step':undefined}><span className="num text-muted-foreground">0{i+1}</span>{s?.phase===key?<Badge tone="primary" dot live>{label}</Badge>:<span className="text-muted-foreground">{label}</span>}</li>)}</ol>
   <div className="space-y-1 border-t pt-2 text-xs" aria-live="polite">
    <p className="flex items-center gap-1.5"><Radio className="size-3.5 text-info" />{s?.relayActive?'Реле активно · 25 м':s?.relayPhase??'Ожидание координат'}</p>
    <p className="text-muted-foreground">{s?.found?`Пострадавший: сектор ${s.sector}`:'Сигнал бедствия: поиск в четырёх секторах'}</p>
    <p className="text-muted-foreground">Радиосвязи: <span className="num">{s?.links??0}</span> · {s?.connected?'связь с базой есть':'связь с пострадавшим прервана'}</p>
    <p className="flex items-center gap-1.5"><Route className="size-3.5 text-primary" />{s?.updates??0} оценок · {s?.replans??0} перепланирований</p>
   </div>
  </CardContent>
 </Card>;
}
