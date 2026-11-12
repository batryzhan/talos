import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';

/** Segmented control (single choice), visually aligned with TabsList. */
export const ToggleGroup = React.forwardRef<React.ElementRef<typeof ToggleGroupPrimitive.Root>, React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <ToggleGroupPrimitive.Root ref={ref} className={cn('inline-flex h-8 items-center gap-0.5 rounded-md bg-muted p-0.5', className)} {...props} />
  ),
);
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

export const ToggleGroupItem = React.forwardRef<React.ElementRef<typeof ToggleGroupPrimitive.Item>, React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        'inline-flex h-7 min-w-8 flex-1 items-center justify-center gap-1 rounded-[5px] px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  ),
);
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;
