import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarPlus, Plus, Search, TramFront } from 'lucide-react'
import { api } from '../../lib/api'
import { addDaysKey, dayLabel, formatMinutes, staffFullName, todayKey } from '../../lib/format'
import { TRIP_STATUS_LABELS, type Paginated, type TripListItem, type TripStatus } from '../../lib/types'
import { Badge } from '../../components/ui/Badge'
import { BandStepper } from '../../components/ui/BandStepper'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, Table, type Column } from '../../components/ui/Table'
import { ExtraTripModal } from './ExtraTripModal'
import { GenerateTripsModal } from './GenerateTripsModal'
import { TripStatusBadge } from './TripBadges'
import { tripTimes, useCanManageTrips, useTripRouteOptions, useTripSummary } from './useTrips'

type Dialog = 'generate' | 'extra' | null

function TripsPage() {
  const navigate = useNavigate()
  const canManage = useCanManageTrips()
  const [params, setParams] = useSearchParams()
  // La fecha vive en la URL para volver al mismo día desde la ficha
  const date = params.get('fecha') ?? todayKey()
  const setDate = (d: string) => {
    setPage(1)
    setParams(d === todayKey() ? {} : { fecha: d }, { replace: true })
  }
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [routeId, setRouteId] = useState('')
  const [status, setStatus] = useState<TripStatus | ''>('')
  const [unassigned, setUnassigned] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['trips', 'list', { date, page, search, routeId, status, unassigned }],
    queryFn: async () =>
      (
        await api.get<Paginated<TripListItem>>('/trips', {
          params: {
            date,
            page,
            limit: 50,
            search: search || undefined,
            routeId: routeId || undefined,
            status: status || undefined,
            unassigned: unassigned || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  const summary = useTripSummary(date)
  const routes = useTripRouteOptions()
  const s = summary.data
  const active = s ? s.total - s.byStatus.cancelled : 0
  const onRoad = s ? s.byStatus.boarding + s.byStatus.in_transit + s.byStatus.delayed : 0

  const columns: Column<TripListItem>[] = [
    {
      header: 'Salida',
      cell: (t) => {
        const times = tripTimes(t)
        return (
          <div className="font-data">
            <div className="text-base font-semibold">{times.departure}</div>
            <div className="text-xs text-fg-muted">
              llega {times.arrival}
              {times.dayOffset > 0 && ` (+${times.dayOffset})`}
            </div>
          </div>
        )
      },
    },
    {
      header: 'Ruta',
      cell: (t) => (
        <div>
          <div className="font-medium">
            {t.route.name}
            {!t.routeScheduleId && (
              <Badge tone="orange" className="ml-2">
                Extra
              </Badge>
            )}
          </div>
          <div className="font-data text-xs text-fg-muted">
            {t.route.originTerminal.code} → {t.route.destinationTerminal.code} · {formatMinutes(t.durationMinutes)}
          </div>
        </div>
      ),
    },
    { header: 'Clave', cell: (t) => <span className="font-data text-xs text-fg-muted">{t.tripNumber}</span> },
    {
      header: 'Unidad',
      cell: (t) =>
        t.bus ? (
          <span className="font-data">{t.bus.economicNumber}</span>
        ) : (
          t.status !== 'cancelled' && <Badge tone="warning">sin unidad</Badge>
        ),
    },
    {
      header: 'Conductor',
      cell: (t) =>
        t.driver ? (
          <span className="text-sm">{staffFullName(t.driver)}</span>
        ) : (
          t.status !== 'cancelled' && <Badge tone="warning">sin conductor</Badge>
        ),
    },
    { header: 'Estado', cell: (t) => <TripStatusBadge status={t.status} /> },
  ]

  const filtered = !!(search || routeId || status || unassigned)
  const isToday = date === todayKey()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recorridos"
        description="Salidas del día generadas desde los horarios de ruta, con su unidad, conductor y estado"
        refreshing={isFetching && !isLoading}
        meta={
          <BandStepper
            label={isToday ? `${dayLabel(date)} · hoy` : dayLabel(date)}
            onPrev={() => setDate(addDaysKey(date, -1))}
            onNext={() => setDate(addDaysKey(date, 1))}
            prevLabel="Día anterior"
            nextLabel="Día siguiente"
            todayLabel="Hoy"
            onToday={() => setDate(todayKey())}
            isToday={isToday}
          />
        }
        actions={
          canManage && (
            <>
              <Button variant="glass" icon={CalendarPlus} onClick={() => setDialog('generate')}>
                Generar
              </Button>
              <Button variant="accent" icon={Plus} onClick={() => setDialog('extra')}>
                Recorrido extra
              </Button>
            </>
          )
        }
        stats={
          <>
            <HeroStat
              label="Recorridos del día"
              value={active}
              tone="primary"
              loading={summary.isLoading}
              hint={s?.extras ? `${s.extras} extra` : 'según los horarios'}
            />
            <HeroStat
              label="Sin asignar"
              value={s?.unassigned ?? 0}
              loading={summary.isLoading}
              hint="sin unidad o conductor"
            />
            <HeroStat
              label="En operación"
              value={onRoad}
              loading={summary.isLoading}
              hint={`${s?.byStatus.completed ?? 0} terminados`}
            />
            <HeroStat
              label="Cancelados"
              value={s?.byStatus.cancelled ?? 0}
              loading={summary.isLoading}
              hint={s?.generatedUntil ? `generados hasta ${s.generatedUntil}` : 'aún no hay recorridos'}
            />
          </>
        }
      />

      <FilterBar>
        <div className="min-w-60 flex-1">
          <Input
            icon={Search}
            placeholder="Buscar por clave, ruta o ciudad…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todas las rutas</option>
            {routes.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TripStatus | '')
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {(Object.keys(TRIP_STATUS_LABELS) as TripStatus[]).map((k) => (
              <option key={k} value={k}>
                {TRIP_STATUS_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            className="size-4 rounded border-border-strong accent-primary"
            checked={unassigned}
            onChange={(e) => {
              setUnassigned(e.target.checked)
              setPage(1)
            }}
          />
          Solo sin asignar
        </label>
      </FilterBar>

      <Table
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(t) => t.id}
        onRowClick={(t) => navigate(`/recorridos/${t.id}`)}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        rowClassName={(t) => t.status === 'cancelled' && 'opacity-60'}
        emptyIcon={TramFront}
        emptyMessage={filtered ? 'Ningún recorrido coincide con los filtros' : 'No hay recorridos este día'}
        emptyDescription={
          filtered
            ? undefined
            : canManage
              ? 'Se generan solos cada noche desde los horarios; también puedes generarlos o crear un extra'
              : 'Se generan solos cada noche desde los horarios de ruta'
        }
      />
      {data && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}

      {canManage && (
        <>
          <GenerateTripsModal open={dialog === 'generate'} summary={s} onClose={() => setDialog(null)} />
          {dialog === 'extra' && <ExtraTripModal open date={date} onClose={() => setDialog(null)} />}
        </>
      )}
    </div>
  )
}

export default TripsPage
