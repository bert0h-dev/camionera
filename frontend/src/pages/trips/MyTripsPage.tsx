import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, TramFront } from 'lucide-react'
import { api } from '../../lib/api'
import { addDaysKey, dayLabel, formatMinutes, staffFullName, todayKey } from '../../lib/format'
import type { TripListItem } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { BandStepper } from '../../components/ui/BandStepper'
import { Card, CardBody } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { TripStatusBadge } from './TripBadges'
import { TripStatusActions } from './TripStatusActions'
import { tripTimes } from './useTrips'

type MyTrip = TripListItem & { actualDepartureAt: string | null }

/** Los recorridos del día del conductor (o cobrador), con los botones para operarlos. */
function MyTripsPage() {
  const { user } = useAuth()
  const isDriver = user?.role === 'driver'
  const [date, setDate] = useState(todayKey())
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['trips', 'mine', date],
    queryFn: async () => (await api.get<MyTrip[]>('/trips/mine', { params: { date } })).data,
    // El conductor la deja abierta en ruta: se mantiene al día sola
    refetchInterval: 60_000,
  })
  const trips = data ?? []
  const active = trips.filter((t) => t.status !== 'cancelled')
  const next = active.find((t) => t.status === 'scheduled' || t.status === 'boarding')
  const isToday = date === todayKey()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis recorridos"
        description={
          isDriver ? 'Abre el abordaje, registra la salida y la llegada de tus viajes' : 'Tus viajes asignados'
        }
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
        stats={
          <>
            <HeroStat label="Recorridos" value={active.length} tone="primary" loading={isLoading} hint="este día" />
            <HeroStat
              label="Siguiente salida"
              value={next ? tripTimes(next).departure : '—'}
              loading={isLoading}
              hint={next ? next.route.name : 'sin salidas pendientes'}
            />
            <HeroStat
              label="Terminados"
              value={trips.filter((t) => t.status === 'completed').length}
              loading={isLoading}
              hint={`de ${active.length}`}
            />
          </>
        }
      />

      {error ? (
        <Alert tone="danger">No se pudieron cargar tus recorridos.</Alert>
      ) : isLoading ? (
        <LoadingBlock text="Cargando tus recorridos…" />
      ) : trips.length === 0 ? (
        <EmptyState icon={TramFront} title="Sin recorridos este día" description="Coordinación te los asigna" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {trips.map((t) => {
            const times = tripTimes(t)
            return (
              <Card key={t.id} className={t.status === 'cancelled' ? 'opacity-60' : undefined}>
                <CardBody className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{t.route.name}</div>
                      <div className="font-data text-xs text-fg-muted">{t.tripNumber}</div>
                    </div>
                    <TripStatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center gap-4 font-data">
                    <div>
                      <div className="text-2xl font-bold">{times.departure}</div>
                      <div className="text-xs text-fg-muted">{t.route.originTerminal.code}</div>
                    </div>
                    <ArrowRight className="size-4 text-fg-subtle" />
                    <div>
                      <div className="text-2xl font-bold">
                        {times.arrival}
                        {times.dayOffset > 0 && <span className="text-sm"> (+{times.dayOffset})</span>}
                      </div>
                      <div className="text-xs text-fg-muted">{t.route.destinationTerminal.code}</div>
                    </div>
                    <div className="ml-auto text-right text-xs text-fg-muted">
                      {formatMinutes(t.durationMinutes)}
                      <div>
                        Unidad <span className="text-fg">{t.bus?.economicNumber ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                  {t.collector && t.collector.id !== t.driverId && isDriver && (
                    <div className="text-xs text-fg-muted">Cobrador: {staffFullName(t.collector)}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {isDriver && <TripStatusActions trip={t} />}
                    <Link to={`/recorridos/${t.id}`} className="ml-auto text-sm text-primary hover:underline">
                      Ver ficha
                    </Link>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MyTripsPage
