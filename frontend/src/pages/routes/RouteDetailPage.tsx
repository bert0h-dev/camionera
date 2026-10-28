import { lazy, Suspense, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Info, MapPinned, Pencil, Power } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatInstantDate, formatMinutes, formatMoney, todayKey } from '../../lib/format'
import { arrivalLabel, localClock, utcOffsetLabel } from '../../lib/timezones'
import type { RouteTerminal } from '../../lib/types'
import type { MapPoint } from '../../components/map/TerminalMap'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toast-context'
import { RouteModal } from './RouteModal'
import { formatKm, routeEnds, useCanEditRoutes, useRoute } from './useRoutes'

// El mapa (Leaflet) se descarga solo al abrir el detalle
const PointsMap = lazy(() => import('../../components/map/TerminalMap').then((m) => ({ default: m.PointsMap })))

type TabKey = 'general' | 'stops' | 'schedules'

const toPoint = (t: RouteTerminal, role: string): MapPoint[] =>
  t.latitude != null && t.longitude != null
    ? [
        {
          id: `${role}-${t.id}`,
          lat: Number(t.latitude),
          lng: Number(t.longitude),
          title: `${role} · ${t.code}`,
          subtitle: `${t.name} — ${t.city.name}, ${t.city.state}`,
        },
      ]
    : []

/** Terminal con su ciudad, hora local y desfase. */
function TerminalFact({ label, terminal }: { label: string; terminal: RouteTerminal }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5">
        <div className="font-medium text-fg">
          <span className="font-data">{terminal.code}</span> · {terminal.name}
        </div>
        <div className="text-sm text-fg-muted">
          {terminal.city.name}, {terminal.city.state} · {localClock(terminal.city.timezone)} hora local (
          {utcOffsetLabel(terminal.city.timezone)})
        </div>
        {!terminal.isActive && (
          <Badge tone="danger" className="mt-1">
            Terminal desactivada
          </Badge>
        )}
      </dd>
    </div>
  )
}

function RouteDetailPage() {
  const { id = '' } = useParams()
  const canEdit = useCanEditRoutes()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabKey>('general')
  const [editOpen, setEditOpen] = useState(false)
  const { data: route, error, isFetching } = useRoute(id)

  const toggle = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/routes/${id}`, { isActive }),
    onSuccess: (_, isActive) => {
      toast.success(isActive ? 'Ruta activada' : 'Ruta desactivada')
      queryClient.invalidateQueries({ queryKey: ['routes'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const points = useMemo<MapPoint[]>(
    () =>
      route
        ? [
            ...toPoint(route.originTerminal, 'Origen'),
            ...route.stops.flatMap((s) => toPoint(s.terminal, `Parada ${s.stopOrder}`)),
            ...toPoint(route.destinationTerminal, 'Destino'),
          ]
        : [],
    [route],
  )

  if (error) return <Alert tone="danger">{apiErrorMessage(error, 'No se pudo cargar la ruta')}</Alert>
  if (!route) return <LoadingBlock text="Cargando ruta…" />

  const originTz = route.originTerminal.city.timezone
  const destinationTz = route.destinationTerminal.city.timezone
  const crossesZone = originTz !== destinationTz
  const today = todayKey()
  // Ejemplo de cómo se ven las horas: una salida a las 08:00 de hoy
  const sampleArrival = arrivalLabel('08:00', route.estimatedDurationMinutes, originTz, destinationTz, today)
  const kmh = Math.round(Number(route.distanceKm) / (route.estimatedDurationMinutes / 60))

  const tabs: TabItem<TabKey>[] = [
    { key: 'general', label: 'General', icon: Info },
    { key: 'stops', label: 'Paradas', icon: MapPinned, disabled: true },
    { key: 'schedules', label: 'Horarios', icon: CalendarClock, disabled: true },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={route.name}
        description={
          <span className="font-data">
            {route.code} · {routeEnds(route)}
          </span>
        }
        refreshing={isFetching}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={route.isActive ? 'success' : 'neutral'} dot>
              {route.isActive ? 'Activa' : 'Inactiva'}
            </Badge>
            {crossesZone && <Badge tone="info">Cambia de zona horaria</Badge>}
          </div>
        }
        actions={
          canEdit && (
            <>
              <Button
                variant="glass"
                icon={Power}
                loading={toggle.isPending}
                onClick={() => toggle.mutate(!route.isActive)}
              >
                {route.isActive ? 'Desactivar' : 'Activar'}
              </Button>
              <Button variant="accent" icon={Pencil} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            </>
          )
        }
        stats={
          <>
            <HeroStat label="Precio base" value={formatMoney(route.basePrice)} tone="primary" hint="boleto completo" />
            <HeroStat label="Distancia" value={formatKm(route.distanceKm)} hint={`≈ ${kmh} km/h promedio`} />
            <HeroStat label="Duración" value={formatMinutes(route.estimatedDurationMinutes)} hint="estimada" />
            <HeroStat
              label="Paradas · horarios"
              value={`${route.stops.length} · ${route.schedules.length}`}
              tone={route.isActive && !route.schedules.length ? 'warning' : 'neutral'}
              hint={route.schedules.length ? 'configurados' : 'sin horarios aún'}
            />
          </>
        }
        bottom={<Tabs variant="band" items={tabs} value={tab} onChange={setTab} />}
      />

      {tab === 'general' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardHeader title="Datos de la ruta" />
            <CardBody className="space-y-4">
              <dl className="space-y-4 text-sm">
                <TerminalFact label="Origen" terminal={route.originTerminal} />
                <TerminalFact label="Destino" terminal={route.destinationTerminal} />
              </dl>
              <div className="rounded-md bg-surface-sunken p-3 text-sm">
                <div className="text-xs text-fg-muted">Ejemplo de horario</div>
                <div className="mt-0.5">
                  Si sale a las <span className="font-data font-semibold">08:00</span> hora de{' '}
                  {route.originTerminal.city.name}, llega a las{' '}
                  <span className="font-data font-semibold">{sampleArrival}</span> hora de{' '}
                  {route.destinationTerminal.city.name}.
                </div>
                {crossesZone && (
                  <div className="mt-1 text-xs text-fg-muted">
                    Ya considera la diferencia de zona horaria y el horario de verano vigente.
                  </div>
                )}
              </div>
              {route.description && <p className="text-sm">{route.description}</p>}
              <div className="text-xs text-fg-muted">Última modificación: {formatInstantDate(route.updatedAt)}</div>
            </CardBody>
          </Card>
          <Card className="overflow-hidden">
            <Suspense fallback={<LoadingBlock text="Cargando mapa…" />}>
              <PointsMap points={points} path className="h-[26rem]" />
            </Suspense>
          </Card>
        </div>
      )}

      {canEdit && <RouteModal route={editOpen ? route : undefined} onClose={() => setEditOpen(false)} />}
    </div>
  )
}

export default RouteDetailPage
