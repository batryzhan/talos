import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '@/lib/utils';

export function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>): JSX.Element {
  return <ResizablePrimitive.PanelGroup className={cn('flex size-full data-[panel-group-direction=vertical]:flex-col', className)} {...props} />;
}

export const ResizablePanel = ResizablePrimitive.Panel;

/** 1px divider with an 8px hit area; highlights in the ring colour on hover / drag / keyboard focus. */
export function ResizableHandle({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle>): JSX.Element {
  return (
    <ResizablePrimitive.PanelResizeHandle
      className={cn(
        'relative flex w-px shrink-0 items-center justify-center bg-border transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 hover:bg-ring/60 focus-visible:outline-none focus-visible:bg-ring data-[resize-handle-state=drag]:bg-ring data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-2 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0',
        className,
      )}
      {...props}
    />
  );
}
