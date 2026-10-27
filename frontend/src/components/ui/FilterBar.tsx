import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Barra de filtros en una sola fila sobre tablas y vistas. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3 shadow-card',
        className,
      )}
    >
      {children}
    </div>
  )
}
