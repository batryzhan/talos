import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-px text-2xs font-medium leading-4 transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-primary/30 bg-primary/15 text-primary',
        success: 'border-success/30 bg-success/15 text-success',
        warning: 'border-warning/30 bg-warning/15 text-warning',
        destructive: 'border-destructive/30 bg-destructive/15 text-destructive',
        info: 'border-info/30 bg-info/15 text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Leading status dot (pulses when `live`). */
  dot?: boolean;
  live?: boolean;
}

export function Badge({ className, tone, dot, live, children, ...props }: BadgeProps): JSX.Element {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full bg-current', live && 'animate-pulse-soft')} />}
      {children}
    </span>
  );
}
