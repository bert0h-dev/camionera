import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface TabItem<K extends string> {
  key: K
  label: string
  icon?: LucideIcon
  disabled?: boolean
  badge?: number
}

/** Pestañas subrayadas con ícono; desplazables en pantallas angostas. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
  variant = 'default',
}: {
  items: readonly TabItem<K>[]
  /** band: pestañas que nacen de la banda índigo del encabezado */
  variant?: 'default' | 'band'
  value: K
  onChange: (key: K) => void
  className?: string
}) {
  const band = variant === 'band'
  return (
    <div role="tablist" className={cn('-mb-px flex gap-1 overflow-x-auto', className)}>
      {items.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={t.disabled}
            title={t.disabled ? 'Próximamente' : undefined}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors',
              band
                ? active
                  ? 'rounded-t-xl border-transparent bg-app px-4 font-semibold text-fg'
                  : 'border-transparent px-4 text-indigo-200 hover:text-white'
                : active
                  ? 'border-primary text-primary-soft-fg'
                  : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
              t.disabled && 'cursor-not-allowed opacity-50 hover:border-transparent hover:text-fg-muted',
            )}
          >
            {t.icon && <t.icon className="size-4" />}
            {t.label}
            {!!t.badge && (
              <span className="rounded-full bg-red-500 px-1.5 text-[11px] leading-4 font-semibold text-white">
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
