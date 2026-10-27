import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  emptyIcon?: LucideIcon
  emptyAction?: ReactNode
  onRowClick?: (row: T) => void
  /** Clases extra por fila (p. ej. resaltar las que piden atención) */
  rowClassName?: (row: T) => string | false | undefined
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyMessage = 'Sin resultados',
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  rowClassName,
}: TableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-muted">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.header}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-fg-muted uppercase',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.header} className="px-4 py-3.5">
                        <Skeleton className="h-4 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick && (() => onRowClick(row))}
                    className={cn(
                      'transition-colors hover:bg-surface-muted',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((c) => (
                      <td key={c.header} className={cn('px-4 py-3 text-fg', c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && (
        <EmptyState icon={emptyIcon} title={emptyMessage} description={emptyDescription} action={emptyAction} />
      )}
    </div>
  )
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, totalPages, total, onChange }: PaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
      <span className="tabular">
        <span className="font-medium text-fg">{total}</span> registro(s)
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Página anterior"
        />
        <span className="tabular px-1">
          Página <span className="font-medium text-fg">{page}</span> de {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          size="icon"
          icon={ChevronRight}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Página siguiente"
        />
      </div>
    </div>
  )
}
