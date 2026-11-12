import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & { viewportClassName?: string; horizontal?: boolean }
>(({ className, children, viewportClassName, horizontal, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
    {/* Radix wraps children in `display: table`, which lets wide content push past the viewport. */}
    <ScrollAreaPrimitive.Viewport className={cn('size-full rounded-[inherit]', !horizontal && '[&>div]:!block', viewportClassName)}>{children}</ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    {horizontal && <ScrollBar orientation="horizontal" />}
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'z-10 flex touch-none select-none p-px transition-colors',
      orientation === 'vertical' && 'h-full w-2 border-l border-l-transparent',
      orientation === 'horizontal' && 'h-2 flex-col border-t border-t-transparent',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-foreground/15 hover:bg-foreground/25" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
