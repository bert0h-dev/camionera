import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CalendarRange, List, Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import type { RouteDetail, RouteScheduleRow, ScheduleStatus } from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { ScheduleModal } from './ScheduleModal'
import { DAY_NAMES, DAY_SHORT, WEEK_ORDER, daysText, useCanEditRoutes, useRouteSchedules } from './useRoutes'

const STATUS: Record<ScheduleStatus, { label: string; tone: BadgeTone }> = {
  current: { label: 'Vigente', tone: 'success' },
  upcoming: { label: 'Próximo', tone: 'info' },
  expired: { label: 'Vencido', tone: 'neutral' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
}

const arrivalText = (s: RouteScheduleRow) =>
  `${s.arrivalTime}${s.arrivalDayOffset > 0 ? ` (+${s.arrivalDayOffset})` : ''}`

/** Chips L M M J V S D con los días del horario resaltados. */
function DayChips({ days }: { days: number[] }) {
  return (
    <div className="flex gap-0.5" title={daysText(days)}>
      {WEEK_ORDER.map((d) => (
        <span
          key={d}
          className={cn(
            'grid size-5 place-items-center rounded text-[10px] font-semibold',
            days.includes(d) ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-subtle',
          )}
        >
          {DAY_SHORT[d]}
        </span>
      ))}
    </div>
  )
}

/** Salidas vigentes de cada día de la semana, para ver qué días quedan sin servicio. */
function WeekView({ rows }: { rows: RouteScheduleRow[] }) {
  const current = rows.filter((s) => s.status === 'current')
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {WEEK_ORDER.map((d) => {
        const day = current.filter((s) => s.daysOfWeek.includes(d))
        return (
          <div
            key={d}
            className={cn(
              'rounded-lg border p-3',
              day.length
                ? 'border-border bg-surface'
                : 'border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20',
            )}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-fg">{DAY_NAMES[d]}</span>
              <span className="font-data text-xs text-fg-muted">{day.length}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {day.map((s) => (
                <li key={s.id} className="font-data text-sm">
                  {s.departureTime}
                  <span className="text-xs text-fg-muted"> → {arrivalText(s)}</span>
                </li>
              ))}
              {!day.length && <li className="text-xs text-amber-700 dark:text-amber-400">Sin salidas</li>}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function RouteSchedulesTab({ route }: { route: RouteDetail }) {
  const canEdit = useCanEditRoutes()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading } = useRouteSchedules(route.id)
  const [view, setView] = useState<'list' | 'week'>('list')
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState<RouteScheduleRow | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<RouteScheduleRow | null>(null)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['routes'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const toggle = useMutation({
    mutationFn: (s: RouteScheduleRow) => api.patch(`/routes/${route.id}/schedules/${s.id}`, { isActive: !s.isActive }),
    onSuccess: refresh,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const remove = useMutation({
    mutationFn: (s: RouteScheduleRow) => api.delete(`/routes/${route.id}/schedules/${s.id}`),
    onSuccess: () => {
      toast.success('Salida eliminada')
      refresh()
      setDeleting(null)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const all = data ?? []
  const hidden = all.filter((s) => s.status === 'expired' || s.status === 'inactive').length
  const rows = showAll ? all : all.filter((s) => s.status === 'current' || s.status === 'upcoming')
  const weekly = all.filter((s) => s.status === 'current').reduce((n, s) => n + s.daysOfWeek.length, 0)

  const columns: Column<RouteScheduleRow>[] = [
    {
      header: `Salida (${route.originTerminal.code})`,
      cell: (s) => <span className="font-data text-base font-semibold">{s.departureTime}</span>,
    },
    {
      header: `Llegada (${route.destinationTerminal.code})`,
      cell: (s) => <span className="font-data">{arrivalText(s)}</span>,
    },
    {
      header: 'Andén',
      cell: (s) =>
        s.platform ? (
          <span className="font-data font-semibold">{s.platform.code}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      header: 'Días',
      cell: (s) => (
        <div className="space-y-1">
          <DayChips days={s.daysOfWeek} />
          <div className="text-xs text-fg-muted">{daysText(s.daysOfWeek)}</div>
        </div>
      ),
    },
    {
      header: 'Vigencia',
      cell: (s) => (
        <span className="text-sm">
          {formatDate(s.validFrom)} – {s.validUntil ? formatDate(s.validUntil) : 'sin fin'}
        </span>
      ),
    },
    {
      header: 'Situación',
      cell: (s) => (
        <Badge tone={STATUS[s.status].tone} dot>
          {STATUS[s.status].label}
        </Badge>
      ),
    },
    {
      header: '',
      cell: (s) =>
        canEdit && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggle.mutate(s)}>
              {s.isActive ? 'Desactivar' : 'Activar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(s)}>
              Eliminar
            </Button>
          </div>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Horarios de salida"
          description={`${weekly} salida(s) por semana vigentes · salida en hora de ${route.originTerminal.city.name}, llegada en hora de ${route.destinationTerminal.city.name}`}
          actions={
            <>
              <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
                {(
                  [
                    ['list', 'Lista', List],
                    ['week', 'Semana', CalendarRange],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm',
                      view === key ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
              {canEdit && (
                <Button icon={Plus} onClick={() => setEditing(null)}>
                  Agregar salidas
                </Button>
              )}
            </>
          }
        />
        {view === 'week' && (
          <CardBody>
            <WeekView rows={all} />
          </CardBody>
        )}
      </Card>

      {view === 'list' && (
        <>
          <Table
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            loading={isLoading}
            rowClassName={(s) => (s.status === 'expired' || s.status === 'inactive') && 'opacity-60'}
            emptyIcon={CalendarClock}
            emptyMessage="Esta ruta aún no tiene salidas"
            emptyDescription={canEdit ? 'Agrega una o varias horas con sus días y vigencia' : undefined}
          />
          {hidden > 0 && (
            <button type="button" className="text-sm text-link hover:underline" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Ocultar vencidos e inactivos' : `Mostrar ${hidden} vencido(s) o inactivo(s)`}
            </button>
          )}
        </>
      )}

      {canEdit && <ScheduleModal route={route} schedule={editing} onClose={() => setEditing(undefined)} />}
      <ConfirmModal
        open={!!deleting}
        title="Eliminar salida"
        message={
          deleting
            ? `Se eliminará la salida de las ${deleting.departureTime} (${daysText(deleting.daysOfWeek)}). Si solo quieres pausarla, desactívala.`
            : ''
        }
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
