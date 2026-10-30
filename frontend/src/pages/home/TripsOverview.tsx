import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from '../../lib/api'
import { todayKey } from '../../lib/format'
import { TRIP_STATUS_LABELS, type Paginated, type TripListItem, type TripStatus } from '../../lib/types'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { TripStatusBadge } from '../trips/TripBadges'
import { tripTimes, useTripSummary } from '../trips/useTrips'

const linkClass = 'inline-flex items-center gap-1 text-sm font-medium text-link hover:underline'

const SEGMENTS: { status: TripStatus; color: string }[] = [
  { status: 'scheduled', color: 'bg-slate-400' },
  { status: 'boarding', color: 'bg-sky-500' },
  { status: 'in_transit', color: 'bg-indigo-500' },
  { status: 'delayed', color: 'bg-amber-500' },
  { status: 'completed', color: 'bg-emerald-500' },
  { status: 'cancelled', color: 'bg-red-400' },
]

const ON_ROAD: TripStatus[] = ['boarding', 'in_transit', 'delayed']
const NEXT_COUNT = 5

/** Recorridos del día para la pestaña Recorridos de Inicio: avance por estado y lo que está en operación. */
export function TripsOverview() {
  const date = todayKey()
  const summary = useTripSummary(date)
  const trips = useQuery({
    queryKey: ['trips', 'list', { date, home: true }],
    queryFn: async () => (await api.get<Paginated<TripListItem>>('/trips', { params: { date, limit: 100 } })).data.data,
    refetchInterval: 60_000,
  })

  const s = summary.data
  if (!s || !trips.data)
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )

  // Momento de la última carga (se refresca cada minuto)
  const now = trips.dataUpdatedAt
  const onRoad = trips.data.filter((t) => ON_ROAD.includes(t.status))
  const next = trips.data
    .filter((t) => t.status === 'scheduled' && Date.parse(t.departureAt) >= now - 15 * 60_000)
    .slice(0, NEXT_COUNT)

  const row = (t: TripListItem) => {
    const times = tripTimes(t)
    const missing = t.status !== 'cancelled' && (!t.busId || !t.driverId)
    return (
      <li key={t.id}>
        <Link
          to={`/recorridos/${t.id}`}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken"
        >
          <span className="w-12 font-data font-semibold">{times.departure}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{t.route.name}</span>
            <span className="block truncate text-xs text-fg-muted">
              {t.bus ? `Unidad ${t.bus.economicNumber}` : 'sin unidad'}
              {missing && ' · falta asignar'}
              {t.occupancy.sold > 0 &&
                (t.status === 'scheduled'
                  ? ' · ' + t.occupancy.sold + ' boletos'
                  : ' · abordaron ' + t.occupancy.boarded + '/' + t.occupancy.sold)}
            </span>
          </span>
          <TripStatusBadge status={t.status} />
        </Link>
      </li>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Recorridos de hoy"
          actions={
            <Link to="/recorridos" className={linkClass}>
              Ver recorridos <ArrowRight className="size-4" />
            </Link>
          }
        />
        <CardBody className="space-y-5">
          {s.total === 0 ? (
            <p className="text-sm text-fg-muted">No hay recorridos hoy.</p>
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-sunken">
                {SEGMENTS.map(
                  (g) =>
                    s.byStatus[g.status] > 0 && (
                      <div
                        key={g.status}
                        className={g.color}
                        style={{ width: `${(s.byStatus[g.status] / s.total) * 100}%` }}
                        title={`${TRIP_STATUS_LABELS[g.status]}: ${s.byStatus[g.status]}`}
                      />
                    ),
                )}
              </div>
              <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {SEGMENTS.map((g) => (
                  <li key={g.status} className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${g.color}`} />
                    <span className="text-fg-muted">{TRIP_STATUS_LABELS[g.status]}</span>
                    <span className="ml-auto font-data font-semibold">{s.byStatus[g.status]}</span>
                  </li>
                ))}
              </ul>
              {s.unassigned > 0 && (
                <Link to="/recorridos" className="block text-sm text-amber-700 hover:underline dark:text-amber-300">
                  {s.unassigned} sin unidad o conductor
                </Link>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="En operación y próximas salidas" />
        <CardBody className="space-y-4">
          {onRoad.length === 0 && next.length === 0 ? (
            <p className="text-sm text-fg-muted">Nada en operación ni por salir hoy.</p>
          ) : (
            <>
              {onRoad.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium tracking-wide text-fg-muted uppercase">En operación</div>
                  <ul>{onRoad.map(row)}</ul>
                </div>
              )}
              {next.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium tracking-wide text-fg-muted uppercase">Próximas salidas</div>
                  <ul>{next.map(row)}</ul>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
