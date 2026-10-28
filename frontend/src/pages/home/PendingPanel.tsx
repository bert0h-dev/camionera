import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bus, CheckCircle2, ChevronDown, FileText, Wrench, type LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { daysLabel, formatDate } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'

type Area = 'staff' | 'fleet' | 'maintenance'

interface PendingItem {
  id: string
  area: Area
  severity: 'overdue' | 'soon'
  title: string
  detail: string
  date: string | null
  daysLeft: number | null
  link: string
}

const AREA_ICON: Record<Area, LucideIcon> = { staff: FileText, fleet: Bus, maintenance: Wrench }
const AREA_LABEL: Record<Area, string> = { staff: 'Personal', fleet: 'Unidad', maintenance: 'Taller' }

type Filter = 'all' | 'staff' | 'fleet'
const FILTERS: { key: Filter; label: string; match: (a: Area) => boolean }[] = [
  { key: 'all', label: 'Todo', match: () => true },
  { key: 'staff', label: 'Personal', match: (a) => a === 'staff' },
  { key: 'fleet', label: 'Flota', match: (a) => a !== 'staff' },
]

const VISIBLE = 6

/** Todo lo que hay que atender en una sola lista, del más urgente al menos. */
export function PendingPanel() {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'pending'],
    queryFn: async () => (await api.get<PendingItem[]>('/dashboard/pending')).data,
    refetchInterval: 5 * 60_000,
  })

  const all = data ?? []
  const areas = new Set(all.map((i) => i.area))
  // Los filtros solo aparecen si hay pendientes de más de un área
  const showFilters = areas.has('staff') && (areas.has('fleet') || areas.has('maintenance'))
  const items = all.filter((i) => FILTERS.find((f) => f.key === filter)!.match(i.area))
  const shown = expanded ? items : items.slice(0, VISIBLE)
  const overdue = all.filter((i) => i.severity === 'overdue').length

  return (
    <section className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold text-fg">Pendientes</h2>
          {data && (
            <p className="text-sm text-fg-muted">
              {all.length === 0 ? 'Nada por atender' : `${overdue} vencido(s) · ${all.length - overdue} por vencer`}
            </p>
          )}
        </div>
        {showFilters && (
          <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key)
                  setExpanded(false)
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-sm',
                  filter === f.key ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : !items.length ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" /> Todo en orden: no hay nada vencido ni por vencer.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((i) => {
              const Icon = AREA_ICON[i.area]
              return (
                <li key={i.id}>
                  <Link to={i.link} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                    <span
                      title={AREA_LABEL[i.area]}
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        i.severity === 'overdue'
                          ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                          : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-fg">{i.title}</div>
                      <div className="truncate text-xs text-fg-muted">{i.detail}</div>
                    </div>
                    <div className="hidden text-right text-xs text-fg-muted sm:block">
                      {i.date && <div>{formatDate(i.date)}</div>}
                      {i.daysLeft !== null && <div>{daysLabel(i.daysLeft)}</div>}
                    </div>
                    <Badge tone={i.severity === 'overdue' ? 'danger' : 'warning'} dot>
                      {i.severity === 'overdue' ? 'Vencido' : 'Por vencer'}
                    </Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
          {items.length > VISIBLE && (
            <div className="border-t border-border px-5 py-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
                <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Ver menos' : `Ver todos (${items.length})`}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
