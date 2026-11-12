import { LineChart } from 'lucide-react';

export function EmptyState({ title, hint }: { title: string; hint: string }): JSX.Element {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <LineChart className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
