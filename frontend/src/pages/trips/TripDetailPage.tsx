import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DoorOpen, ScanLine, Trash2, TriangleAlert, UserCog } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { localClock } from '../../lib/timezones'
import { useAuth } from '../../auth/useAuth'
import { dayLabel, formatInstantDate, formatMinutes, formatTime, staffFullName } from '../../lib/format'
import { TRIP_STATUS_LABELS, type TripDetail } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { daysText } from '../routes/useRoutes'
import { IncidentStatusBadge, SeverityBadge } from '../fleet/IncidentBadges'
import { ReportIncidentModal, type ReportPreset } from '../fleet/ReportIncidentModal'
import { incidentFolio } from '../fleet/useFleet'
import { AssignTripModal } from './AssignTripModal'
import { TripStatusBadge } from './TripBadges'
import { TripPassengersCard } from './TripPassengersCard'
import { TripPlatformModal } from './TripPlatformModal'
import { TripStatusActions } from './TripStatusActions'
import { tripTimes, useCanManageTrips } from './useTrips'

const dateTime = (iso: string) => `${formatInstantDate(iso)} · ${formatTime(iso)}`

function TripDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canManage = useCanManageTrips()
  const { user } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [choosingPlatform, setChoosingPlatform] = useState(false)
  const [reporting, setReporting] = useState<ReportPreset | null>(null)

  const {
    data: trip,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['trips', 'detail', id],
    queryFn: async () => (await api.get<TripDetail>(`/trips/${id}`)).data,
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/trips/${id}`),
    onSuccess: () => {
      toast.success('Recorrido extra borrado')
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      navigate(`/recorridos?fecha=${trip?.tripDate.slice(0, 10)}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (error) return <Alert tone="danger">{apiErrorMessage(error, 'No se pudo cargar el recorrido')}</Alert>
  if (!trip) return <LoadingBlock text="Cargando recorrido…" />

  const times = tripTimes(trip)
  const origin = trip.route.originTerminal
  const destination = trip.route.destinationTerminal
  const isExtra = !trip.routeScheduleId
  // Antes de salir todavía se puede cambiar la unidad o el personal
  const canAssign = canManage && ['scheduled', 'boarding', 'delayed'].includes(trip.status)
  // El conductor solo llega a la ficha de sus propios recorridos (lo valida el servidor)
  const canOperate = canManage || user?.role === 'driver'
  // Quien ve la ficha y no es taquilla puede reportar (supervisión, conductor y cobrador incluidos)
  const canReport = !!trip.bus && trip.status !== 'cancelled' && user?.role !== 'vendor'
  const late =
    trip.actualDepartureAt &&
    Math.max(0, Math.round((Date.parse(trip.actualDepartureAt) - Date.parse(trip.departureAt)) / 60000))
  const kmDriven =
    trip.startOdometerKm !== null && trip.endOdometerKm !== null ? trip.endOdometerKm - trip.startOdometerKm : null
  const canDelete =
    canManage && isExtra && trip.status === 'scheduled' && !trip.busId && !trip.driverId && !trip.collectorId

  return (
    <div className="space-y-6">
      <PageHeader
        title={trip.route.name}
        description={
          <span className="font-data">
            {trip.tripNumber} · {dayLabel(trip.tripDate.slice(0, 10))}
          </span>
        }
        refreshing={isFetching}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <TripStatusBadge status={trip.status} />
            {isExtra && <Badge tone="orange">Extra</Badge>}
          </div>
        }
        actions={
          <>
            {canDelete && (
              <Button variant="glass" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Borrar extra
              </Button>
            )}
            {canAssign && (
              <Button variant="glass" icon={UserCog} onClick={() => setAssigning(true)}>
                {trip.busId || trip.driverId ? 'Cambiar asignación' : 'Asignar'}
              </Button>
            )}
            {canAssign && !trip.actualDepartureAt && (
              <Button variant="glass" icon={DoorOpen} onClick={() => setChoosingPlatform(true)}>
                {trip.platform ? 'Cambiar andén' : 'Asignar andén'}
              </Button>
            )}
            {canReport && (
              <Button
                variant="glass"
                icon={TriangleAlert}
                onClick={() =>
                  setReporting({
                    busId: trip.bus!.id,
                    trip: { id: trip.id, tripNumber: trip.tripNumber, busLabel: `Unidad ${trip.bus!.economicNumber}` },
                  })
                }
              >
                Reportar incidencia
              </Button>
            )}
            {trip.occupancy.sold > 0 && trip.status !== 'cancelled' && user?.role !== 'vendor' && (
              <Link to={`/abordaje/${trip.id}`}>
                <Button variant="glass" icon={ScanLine}>
                  Abordaje
                </Button>
              </Link>
            )}
            {canOperate && <TripStatusActions trip={trip} inBand />}
          </>
        }
        statsColumns={5}
        stats={
          <>
            <HeroStat
              label={`Sale de ${origin.city.name}`}
              value={times.departure}
              tone="primary"
              hint={
                trip.actualDepartureAt
                  ? `salió ${localClock(origin.city.timezone, new Date(trip.actualDepartureAt))}${late ? ` · ${late} min tarde` : ' a tiempo'}`
                  : `${origin.code} · hora local`
              }
            />
            <HeroStat
              label={`Llega a ${destination.city.name}`}
              value={times.dayOffset > 0 ? `${times.arrival} (+${times.dayOffset})` : times.arrival}
              hint={
                trip.actualArrivalAt
                  ? `llegó ${localClock(destination.city.timezone, new Date(trip.actualArrivalAt))}${kmDriven !== null ? ` · ${kmDriven.toLocaleString('es-MX')} km` : ''}`
                  : `${destination.code} · ${formatMinutes(trip.durationMinutes)} de viaje`
              }
            />
            <HeroStat
              label="Unidad"
              value={trip.bus?.economicNumber ?? '—'}
              tone={trip.bus ? 'neutral' : 'warning'}
              hint={trip.bus ? 'asignada' : 'sin asignar'}
              to={trip.bus && canManage ? `/flota/unidades/${trip.bus.id}` : undefined}
            />
            <HeroStat
              label="Conductor"
              value={trip.driver ? `${trip.driver.firstName} ${trip.driver.lastName}` : '—'}
              tone={trip.driver ? 'neutral' : 'warning'}
              hint={trip.collector ? `cobrador: ${staffFullName(trip.collector)}` : 'sin cobrador'}
            />
            <HeroStat
              label="Boletos"
              value={trip.bus ? `${trip.occupancy.sold}/${trip.bus._count?.seats ?? '—'}` : '—'}
              hint={
                trip.bus
                  ? `vendidos${trip.occupancy.boarded ? ` · ${trip.occupancy.boarded} abordaron` : ''}${trip.occupancy.held ? ` · ${trip.occupancy.held} apartados` : ''}`
                  : 'se vende al asignar unidad'
              }
              to={
                trip.bus && trip.status !== 'cancelled'
                  ? `/taquilla?viaje=${trip.id}&sube=0&baja=${(trip.route._count?.stops ?? 0) + 1}`
                  : undefined
              }
            />
          </>
        }
      />

      {times.crossesZone && (
        <Alert tone="info">
          La salida está en hora de {origin.city.name} y la llegada en hora de {destination.city.name}.
        </Alert>
      )}
      {trip.overrideReason && (
        <Alert tone="warning" title="Asignación forzada por un administrador">
          {trip.overrideReason}
        </Alert>
      )}
      {trip.platformOverrideReason && (
        <Alert tone="warning" title="Andén forzado por un administrador">
          {trip.platformOverrideReason}
        </Alert>
      )}
      {trip.status === 'cancelled' && (
        <Alert tone="danger" title="Recorrido cancelado">
          {trip.cancelReason}
          {trip.cancelledBy && ` · ${trip.cancelledBy.fullName}`}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Datos del recorrido" />
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-fg-muted">Ruta</dt>
                <dd>
                  {canManage ? (
                    <Link className="text-primary hover:underline" to={`/rutas/${trip.route.id}`}>
                      {trip.route.name}
                    </Link>
                  ) : (
                    trip.route.name
                  )}{' '}
                  <span className="font-data text-xs text-fg-muted">{trip.route.code}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Origen</dt>
                <dd>
                  {origin.name} <span className="font-data text-xs text-fg-muted">{origin.code}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Andén de salida</dt>
                <dd>
                  {trip.platform ? (
                    <span className="font-data font-semibold">
                      {trip.platform.code}
                      {trip.platform.name && (
                        <span className="font-sans font-normal text-fg-muted"> · {trip.platform.name}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-fg-muted">Sin asignar</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Horario</dt>
                <dd>
                  {trip.schedule ? (
                    <>
                      <span className="font-data">{trip.schedule.departureTime}</span> ·{' '}
                      {daysText(trip.schedule.daysOfWeek)}
                      {!trip.schedule.isActive && (
                        <Badge tone="neutral" className="ml-2">
                          inactivo
                        </Badge>
                      )}
                    </>
                  ) : (
                    'Fuera de horario (extra)'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Destino</dt>
                <dd>
                  {destination.name} <span className="font-data text-xs text-fg-muted">{destination.code}</span>
                </dd>
              </div>
              {trip.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-fg-muted">Notas</dt>
                  <dd className="whitespace-pre-line">{trip.notes}</dd>
                </div>
              )}
              {(trip.startOdometerKm !== null || trip.endOdometerKm !== null) && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-fg-muted">Odómetro</dt>
                  <dd className="font-data">
                    {trip.startOdometerKm?.toLocaleString('es-MX') ?? '—'} →{' '}
                    {trip.endOdometerKm?.toLocaleString('es-MX') ?? '—'} km
                    {kmDriven !== null && (
                      <span className="text-fg-muted"> · {kmDriven.toLocaleString('es-MX')} km recorridos</span>
                    )}
                  </dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs text-fg-muted">Alta</dt>
                <dd>
                  {dateTime(trip.createdAt)} · {trip.createdBy ? trip.createdBy.fullName : 'generado por el sistema'}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-6">
          {trip.incidents.length > 0 && (
            <Card>
              <CardHeader title="Incidencias" />
              <CardBody>
                <ul className="space-y-3 text-sm">
                  {trip.incidents.map((i) => (
                    <li key={i.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="font-data text-primary hover:underline" to={`/flota/incidencias/${i.id}`}>
                          {incidentFolio(i.folio)}
                        </Link>
                        <SeverityBadge severity={i.severity} />
                        <IncidentStatusBadge status={i.status} />
                      </div>
                      <div className="text-xs text-fg-muted">
                        {i.category.name} · {dateTime(i.occurredAt)}
                      </div>
                      <div className="line-clamp-2 text-xs">{i.description}</div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {trip.status === 'cancelled' && user?.role !== 'driver' && user?.role !== 'collector' && (
            <TripPassengersCard tripId={trip.id} />
          )}
          <Card>
            <CardHeader title="Historial de estados" />
            <CardBody>
              {trip.statusLog.length === 0 ? (
                <p className="text-sm text-fg-muted">Programado desde su generación; aún sin cambios.</p>
              ) : (
                <ol className="space-y-3 text-sm">
                  {trip.statusLog.map((l) => (
                    <li key={l.id} className="border-l-2 border-border pl-3">
                      <div className="font-medium">
                        {l.fromStatus ? `${TRIP_STATUS_LABELS[l.fromStatus]} → ` : ''}
                        {TRIP_STATUS_LABELS[l.toStatus]}
                      </div>
                      <div className="text-xs text-fg-muted">
                        {dateTime(l.changedAt)} · {l.changedBy?.fullName ?? 'sistema'}
                      </div>
                      {l.reason && <div className="text-xs">{l.reason}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ReportIncidentModal preset={reporting} onClose={() => setReporting(null)} />

      {canAssign && (
        <TripPlatformModal
          key={`p-${choosingPlatform}`}
          trip={trip}
          open={choosingPlatform}
          onClose={() => setChoosingPlatform(false)}
        />
      )}
      {canAssign && (
        <AssignTripModal key={String(assigning)} trip={trip} open={assigning} onClose={() => setAssigning(false)} />
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Borrar recorrido extra"
        message={`Se borrará ${trip.tripNumber}. Solo se puede porque aún no tiene unidad ni personal asignado.`}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export default TripDetailPage
