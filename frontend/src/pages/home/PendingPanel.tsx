import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bus,
  CheckCircle2,
  ChevronDown,
  FileText,
  Fuel,
  Route,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { daysLabel, formatDate } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'

type Area = 'staff' | 'fleet' | 'maintenance' | 'incident' | 'fuel' | 'route'

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

const AREA_ICON: Record<Area, LucideIcon> = {
  staff: FileText,
  fleet: Bus,
  maintenance: Wrench,
  incident: TriangleAlert,
  fuel: Fuel,
  route: Route,
}
const AREA_LABEL: Record<Area, string> = {
  staff: 'Personal',
  fleet: 'Unidad',
  maintenance: 'Taller',
  incident: 'Incidencia',
  fuel: 'Combustible',
  route: 'Ruta',
}

/** Las incidencias y las cargas por confirmar no vencen: se cuenta cuánto llevan esperando. */
function ageLabel(daysOpen: number, verb = 'Abierta') {
  if (daysOpen === 0) return `${verb} hoy`
  return daysOpen === 1 ? `${verb} desde ayer` : `${verb} hace ${daysOpen} días`
}

function badgeLabel(i: PendingItem) {
  if (i.area === 'incident') return i.severity === 'overdue' ? 'Urgente' : 'Abierta'
  if (i.area === 'route') return i.id.startsWith('route-unscheduled') ? 'Sin horarios' : 'Por vencer'
  if (i.area === 'fuel') return i.id.startsWith('fuel-low') ? 'Rendimiento bajo' : 'Por confirmar'
  return i.severity === 'overdue' ? 'Vencido' : 'Por vencer'
}

type Filter = 'all' | 'staff' | 'fleet' | 'route'
const FILTERS: { key: Filter; label: string; match: (a: Area) => boolean }[] = [
  { key: 'all', label: 'Todo', match: () => true },
  { key: 'staff', label: 'Personal', match: (a) => a === 'staff' },
  { key: 'fleet', label: 'Flota', match: (a) => a !== 'staff' && a !== 'route' },
  { key: 'route', label: 'Rutas', match: (a) => a === 'route' },
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
  // Solo los filtros con pendientes; si todo es de un mismo grupo no se muestran
  const filters = FILTERS.filter((f) => f.key === 'all' || all.some((i) => f.match(i.area)))
  const showFilters = filters.length > 2
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
            {filters.map((f) => (
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
                      {i.daysLeft !== null && (
                        <div>
                          {i.area === 'incident'
                            ? ageLabel(-i.daysLeft)
                            : i.area === 'fuel'
                              ? ageLabel(-i.daysLeft, 'Registrada')
                              : daysLabel(i.daysLeft)}
                        </div>
                      )}
                    </div>
                    <Badge tone={i.severity === 'overdue' ? 'danger' : 'warning'} dot>
                      {badgeLabel(i)}
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
