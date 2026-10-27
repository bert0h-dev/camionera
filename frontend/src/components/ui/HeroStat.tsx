import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Skeleton } from './Skeleton'
import { Sparkline } from './Sparkline'

export type HeroStatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

// Borde superior: solo los tonos que piden atención lo llevan
const BORDER: Record<HeroStatTone, string> = {
  neutral: '',
  primary: '',
  success: 'border-t-4 border-t-emerald-500',
  warning: 'border-t-4 border-t-amber-500',
  danger: 'border-t-4 border-t-red-500',
  info: '',
}

const VALUE: Record<HeroStatTone, string> = {
  neutral: 'text-fg',
  primary: 'text-primary-soft-fg',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-sky-600 dark:text-sky-400',
}

const LINE: Record<HeroStatTone, string> = {
  neutral: 'text-indigo-500',
  primary: 'text-indigo-500',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  danger: 'text-red-500',
  info: 'text-sky-500',
}

interface HeroStatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: HeroStatTone
  /** Serie para la mini-gráfica (de la más antigua a la más reciente) */
  trend?: number[]
  /** Etiqueta a la derecha del título, p. ej. "● en vivo" */
  badge?: ReactNode
  to?: string
  loading?: boolean
}

/** Cifra clave que flota sobre la banda del encabezado. */
export function HeroStat({ label, value, hint, tone = 'neutral', trend, badge, to, loading }: HeroStatProps) {
  const body = (
    <div
      className={cn(
        'h-full rounded-2xl bg-surface p-5 shadow-[0_12px_28px_-14px_rgb(30_27_75/0.45)] ring-1 ring-border transition-shadow dark:shadow-black/40',
        BORDER[tone],
        to && 'hover:shadow-[0_16px_36px_-14px_rgb(30_27_75/0.55)] hover:ring-border-strong',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-fg-muted">
        <span>{label}</span>
        {badge}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <span className={cn('font-data text-3xl leading-none font-bold', VALUE[tone])}>{value}</span>
        )}
        {trend && trend.length > 1 && !loading && <Sparkline values={trend} className={cn('h-9 w-24', LINE[tone])} />}
      </div>
      {hint && !loading && <div className="mt-2 text-xs text-fg-muted">{hint}</div>}
    </div>
  )
  return to ? (
    <Link to={to} className="block h-full rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  )
}
