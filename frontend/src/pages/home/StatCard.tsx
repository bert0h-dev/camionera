import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'

export type StatTone = 'primary' | 'accent' | 'success' | 'danger' | 'info'

const ICON_TONES: Record<StatTone, string> = {
  primary: 'bg-primary-soft text-primary-soft-fg',
  accent: 'bg-accent-soft text-accent-soft-fg',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  danger: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  info: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
}

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  tone?: StatTone
  to?: string
  loading?: boolean
}

/** Indicador del dashboard: número grande, ícono y, opcionalmente, enlace al detalle. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', to, loading }: StatCardProps) {
  const body = (
    <Card className={cn('group relative h-full p-5 transition-shadow', to && 'hover:shadow-pop')}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex size-10 items-center justify-center rounded-xl', ICON_TONES[tone])}>
          <Icon className="size-5" />
        </span>
        {to && <ArrowUpRight className="size-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
      <div className="mt-4 text-sm font-medium text-fg-muted">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <div className="tabular mt-1 text-3xl font-semibold tracking-tight text-fg">{value}</div>
      )}
      {hint && !loading && <div className="mt-1 text-xs text-fg-muted">{hint}</div>}
    </Card>
  )
  return to ? (
    <Link to={to} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  )
}
