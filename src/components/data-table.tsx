import { useState } from 'react';
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowData, type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'right';
    /** Unit shown after the header label in small muted text. */
    unit?: string;
    /** Explanation shown in a tooltip on the header. */
    hint?: string;
    /** Tailwind width / layout classes for the column. */
    className?: string;
    /** Phantom use of the type parameters (TanStack's declaration requires both). */
    __types?: [TData, TValue];
  }
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  selectedId?: string | null;
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  sortLabel: (column: string) => string;
  initialSorting?: SortingState;
  className?: string;
  empty?: React.ReactNode;
  caption?: string;
  /** Extra classes per row (e.g. warning tint). */
  rowClassName?: (row: T) => string | undefined;
}

/**
 * Dense engineering table: sticky header, sortable columns (aria-sort), right-aligned numeric
 * columns, keyboard-selectable rows (Enter / Space) with a highlighted selection.
 */
export function DataTable<T>({
  data, columns, getRowId, selectedId, onRowClick, rowLabel, sortLabel, initialSorting = [], className, empty, caption, rowClassName,
}: DataTableProps<T>): JSX.Element {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const table = useReactTable({
    data,
    columns,
    getRowId: row => getRowId(row),
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;

  return (
    <table className={cn('w-full border-separate border-spacing-0 text-sm', className)}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        {table.getHeaderGroups().map(group => (
          <tr key={group.id}>
            {group.headers.map(header => {
              const meta = header.column.columnDef.meta;
              const sorted = header.column.getIsSorted();
              const canSort = header.column.getCanSort();
              const label = flexRender(header.column.columnDef.header, header.getContext());
              const title = typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.id;
              const inner = (
                <span className={cn('inline-flex items-center gap-1', meta?.align === 'right' && 'flex-row-reverse')}>
                  <span className="whitespace-nowrap">
                    {label}
                    {meta?.unit && <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/70">{meta.unit}</span>}
                  </span>
                  {canSort && (sorted === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3" aria-hidden /> : <ChevronsUpDown className="size-3 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />)}
                </span>
              );
              const control = canSort ? (
                <button
                  type="button"
                  className="group -mx-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={header.column.getToggleSortingHandler()}
                  aria-label={sortLabel(title)}
                >
                  {inner}
                </button>
              ) : inner;
              return (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  className={cn(
                    'sticky top-0 z-10 h-8 border-b bg-panel/95 px-2.5 text-2xs font-medium text-muted-foreground backdrop-blur first:pl-3.5 last:pr-3.5',
                    meta?.align === 'right' ? 'text-right' : 'text-left',
                    meta?.className,
                  )}
                >
                  {meta?.hint ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{control}</TooltipTrigger>
                      <TooltipContent side="top">{meta.hint}</TooltipContent>
                    </Tooltip>
                  ) : control}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {rows.length === 0 && empty && (
          <tr>
            <td colSpan={columns.length} className="px-3.5 py-6 text-center text-sm text-muted-foreground">{empty}</td>
          </tr>
        )}
        {rows.map(row => {
          const selected = selectedId != null && row.id === selectedId;
          return (
            <tr
              key={row.id}
              aria-selected={onRowClick ? selected : undefined}
              aria-label={rowLabel?.(row.original)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              onKeyDown={onRowClick ? e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row.original); }
              } : undefined}
              className={cn(
                'transition-colors',
                onRowClick && 'cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:outline-none',
                selected && 'bg-primary/10 hover:bg-primary/15',
                rowClassName?.(row.original),
              )}
            >
              {row.getVisibleCells().map(cell => {
                const meta = cell.column.columnDef.meta;
                return (
                  <td
                    key={cell.id}
                    className={cn(
                      'h-8 border-b border-border px-2.5 first:pl-3.5 last:pr-3.5',
                      meta?.align === 'right' ? 'text-right' : 'text-left',
                      selected && 'first:shadow-[inset_2px_0_0_0_oklch(var(--primary))]',
                      meta?.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Number cell: monospace tabular digits, optional unit in small muted sans text. */
export function Num({ value, unit, className }: { value: string; unit?: string; className?: string }): JSX.Element {
  return (
    <span className={cn('num whitespace-nowrap', className)}>
      {value}
      {unit && <span className="ml-0.5 font-sans text-2xs text-muted-foreground">{unit}</span>}
    </span>
  );
}
