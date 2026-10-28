import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Eye, Pencil, Wrench, XCircle } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDate, formatInstantDate, formatTime, todayKey } from '../../lib/format'
import { BUS_STATUS_LABELS, ROLE_LABELS, type Incident, type MaintenanceOrder } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { IncidentStatusBadge, SeverityBadge } from './IncidentBadges'
import { OrderStatusBadge } from './MaintenanceBadges'
import { ReportIncidentModal } from './ReportIncidentModal'
import { incidentFolio, orderFolio, useIncidentRole } from './useFleet'

type Dialog = 'order' | 'resolve' | 'dismiss' | 'edit' | null

const dateTime = (iso: string) => `${formatInstantDate(iso)} · ${formatTime(iso)}`
const yesNo = (v: boolean | null) => (v === null ? '—' : v ? 'Sí' : 'No')

function IncidentDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { canManage, canReview } = useIncidentRole()
  const [dialog, setDialog] = useState<Dialog>(null)

  const {
    data: incident,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['fleet', 'incidents', 'detail', id],
    queryFn: async () => (await api.get<Incident>(`/fleet/incidents/${id}`)).data,
  })

  const review = useMutation({
    mutationFn: () => api.post(`/fleet/incidents/${id}/review`),
    onSuccess: () => {
      toast.success('Incidencia en revisión')
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (error) return <Alert tone="danger">{apiErrorMessage(error, 'No se pudo cargar la incidencia')}</Alert>
  if (!incident) return <LoadingBlock text="Cargando incidencia…" />

  const open = incident.status === 'reported' || incident.status === 'in_review'
  const openOrder = incident.orders.find((o) => o.status === 'scheduled' || o.status === 'in_progress')
  const canEdit = open && (canReview || (incident.reportedBy === user?.id && incident.status === 'reported'))

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Incidencia ${incidentFolio(incident.folio)}`}
        description={incident.description}
        refreshing={isFetching}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <IncidentStatusBadge status={incident.status} />
            <SeverityBadge severity={incident.severity} />
            <span className="text-sm text-white/80">{incident.category.name}</span>
          </div>
        }
        actions={
          <>
            {canEdit && (
              <Button variant="glass" icon={Pencil} onClick={() => setDialog('edit')}>
                Editar
              </Button>
            )}
            {canReview && open && !openOrder && (
              <Button variant="glass" icon={XCircle} onClick={() => setDialog('dismiss')}>
                Descartar
              </Button>
            )}
            {canReview && incident.status === 'reported' && (
              <Button variant="glass" icon={Eye} loading={review.isPending} onClick={() => review.mutate()}>
                Tomar
              </Button>
            )}
            {canManage && open && !openOrder && (
              <Button variant="accent" icon={Wrench} onClick={() => setDialog('order')}>
                Crear orden correctiva
              </Button>
            )}
            {canReview && open && !openOrder && (
              <Button variant="accent" icon={CheckCircle2} onClick={() => setDialog('resolve')}>
                Resolver
              </Button>
            )}
          </>
        }
        stats={
          <>
            <HeroStat
              label="Unidad"
              value={incident.bus.economicNumber}
              tone={incident.bus.status === 'out_of_service' ? 'danger' : 'primary'}
              hint={`${incident.bus.plates} · ${BUS_STATUS_LABELS[incident.bus.status]}`}
              to={canReview ? `/flota/unidades/${incident.bus.id}` : undefined}
            />
            <HeroStat label="Suceso" value={formatInstantDate(incident.occurredAt)} hint={formatTime(incident.occurredAt)} />
            <HeroStat label="Reportó" value={incident.reporter.fullName} hint={ROLE_LABELS[incident.reporter.role]} />
            <HeroStat
              label="Orden"
              value={incident.orders[0] ? orderFolio(incident.orders[0].folio) : '—'}
              tone={openOrder ? 'warning' : 'neutral'}
              hint={openOrder ? 'abierta; al terminarla se resuelve' : incident.orders.length ? 'cerrada' : 'sin orden'}
              to={incident.orders[0] && canReview ? `/flota/mantenimiento/${incident.orders[0].id}` : undefined}
            />
          </>
        }
      />

      {incident.tookBusOut && open && (
        <Alert tone="danger" title="Unidad fuera de servicio">
          La unidad {incident.bus.economicNumber} no puede salir mientras esta incidencia siga abierta.
        </Alert>
      )}
      {incident.status === 'dismissed' && (
        <Alert tone="neutral" title="Incidencia descartada">
          {incident.resolution}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Reporte" />
            <CardBody>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs text-fg-muted">Qué pasó</dt>
                  <dd className="whitespace-pre-line">{incident.description}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Lugar</dt>
                  <dd>{incident.location ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Odómetro</dt>
                  <dd className="font-data">
                    {incident.odometerKm !== null ? `${incident.odometerKm.toLocaleString('es-MX')} km` : '—'}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {incident.category.isAccident && (
            <Card>
              <CardHeader title="Datos del siniestro" />
              <CardBody>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-fg-muted">N.º de siniestro</dt>
                    <dd className="font-data">{incident.claimNumber ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Aseguradora o ajustador</dt>
                    <dd>{incident.insurer ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Terceros involucrados</dt>
                    <dd>{yesNo(incident.thirdParties)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Lesionados</dt>
                    <dd className={cn(incident.injuries && 'font-medium text-red-600 dark:text-red-300')}>
                      {yesNo(incident.injuries)}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          )}

          {incident.orders.length > 0 && (
            <Card>
              <CardHeader title="Órdenes de trabajo" />
              <CardBody>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {incident.orders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      {canReview ? (
                        <Link to={`/flota/mantenimiento/${o.id}`} className="font-data text-primary hover:underline">
                          {orderFolio(o.folio)}
                        </Link>
                      ) : (
                        <span className="font-data">{orderFolio(o.folio)}</span>
                      )}
                      <span className="text-xs text-fg-muted">
                        {o.completedAt
                          ? `Terminada ${formatInstantDate(o.completedAt)}`
                          : `Programada ${formatDate(o.scheduledDate)}`}
                      </span>
                      <OrderStatusBadge status={o.status} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title="Seguimiento" />
          <CardBody>
            <ol className="relative space-y-5 border-l border-border pl-5 text-sm">
              <TimelineItem
                title="Reportada"
                when={dateTime(incident.createdAt)}
                detail={`Por ${incident.reporter.fullName}`}
                done
              />
              <TimelineItem
                title="En revisión"
                when={incident.reviewedAt ? dateTime(incident.reviewedAt) : undefined}
                detail={incident.reviewer ? `Por ${incident.reviewer.fullName}` : 'Pendiente'}
                done={!!incident.reviewedAt}
              />
              {incident.orders.map((o) => (
                <TimelineItem
                  key={o.id}
                  title={`Orden ${orderFolio(o.folio)}`}
                  when={`Programada ${formatDate(o.scheduledDate)}`}
                  detail={o.completedAt ? `Terminada ${formatInstantDate(o.completedAt)}` : undefined}
                  done={o.status === 'completed'}
                />
              ))}
              <TimelineItem
                title={incident.status === 'dismissed' ? 'Descartada' : 'Resuelta'}
                when={incident.closedAt ? dateTime(incident.closedAt) : undefined}
                detail={
                  incident.status === 'resolved' ? (incident.resolution ?? undefined) : open ? 'Pendiente' : undefined
                }
                done={!open}
              />
            </ol>
          </CardBody>
        </Card>
      </div>

      <ReportIncidentModal preset={dialog === 'edit' ? { incident } : null} onClose={() => setDialog(null)} />
      <IncidentDialogs key={incident.status} incident={incident} dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  )
}

function TimelineItem({ title, when, detail, done }: { title: string; when?: string; detail?: string; done: boolean }) {
  return (
    <li>
      <span
        className={cn(
          'absolute -left-[5px] mt-1.5 size-2.5 rounded-full ring-4 ring-surface',
          done ? 'bg-indigo-500' : 'bg-border',
        )}
      />
      <div className={cn('font-medium', done ? 'text-fg' : 'text-fg-muted')}>{title}</div>
      {when && <div className="text-xs text-fg-muted">{when}</div>}
      {detail && <div className="mt-0.5 text-xs whitespace-pre-line text-fg-muted">{detail}</div>}
    </li>
  )
}

function IncidentDialogs({ incident, dialog, onClose }: { incident: Incident; dialog: Dialog; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [resolution, setResolution] = useState('')
  const [scheduledDate, setScheduledDate] = useState(todayKey())
  const [priority, setPriority] = useState(
    incident.severity === 'critical' || incident.severity === 'high' ? 'urgent' : 'normal',
  )
  const [mechanicId, setMechanicId] = useState('')

  const mechanics = useQuery({
    queryKey: ['fleet', 'maintenance', 'mechanics'],
    enabled: dialog === 'order',
    queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/fleet/maintenance/mechanics')).data,
  })

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['fleet'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    onClose()
  }
  const close = useMutation({
    mutationFn: () => api.post(`/fleet/incidents/${incident.id}/${dialog}`, { resolution }),
    onSuccess: () => {
      toast.success(dialog === 'resolve' ? 'Incidencia resuelta' : 'Incidencia descartada')
      done()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const order = useMutation({
    mutationFn: async () =>
      (
        await api.post<MaintenanceOrder>(`/fleet/incidents/${incident.id}/order`, {
          scheduledDate,
          priority,
          mechanicId: mechanicId || null,
        })
      ).data,
    onSuccess: (o) => {
      toast.success(`Orden ${orderFolio(o.folio)} creada`)
      done()
      navigate(`/flota/mantenimiento/${o.id}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const footer = (label: string, pending: boolean, disabled: boolean, variant: 'primary' | 'danger' = 'primary') => (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" variant={variant} loading={pending} disabled={disabled}>
        {label}
      </Button>
    </div>
  )
  const releases = incident.tookBusOut && (
    <p className="text-sm text-fg-muted">
      La unidad {incident.bus.economicNumber} vuelve a disponible si no tiene otra incidencia crítica abierta.
    </p>
  )

  return (
    <>
      <Modal open={dialog === 'order'} title="Orden correctiva" size="sm" onClose={onClose}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            order.mutate()
          }}
        >
          <p className="text-sm text-fg-muted">
            Se crea para la unidad {incident.bus.economicNumber} con la descripción de la incidencia. Al terminarla, la
            incidencia se resuelve sola.
          </p>
          <Input
            label="Fecha programada"
            type="date"
            required
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
          <Select label="Prioridad" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgente</option>
          </Select>
          <Select label="Mecánico" value={mechanicId} onChange={(e) => setMechanicId(e.target.value)} hint="Opcional">
            <option value="">Sin asignar</option>
            {mechanics.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </Select>
          {footer('Crear orden', order.isPending, !scheduledDate)}
        </form>
      </Modal>

      <Modal
        open={dialog === 'resolve' || dialog === 'dismiss'}
        title={dialog === 'resolve' ? 'Resolver incidencia' : 'Descartar incidencia'}
        size="sm"
        onClose={onClose}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            close.mutate()
          }}
        >
          {releases}
          <Textarea
            label={dialog === 'resolve' ? 'Cómo se resolvió' : 'Por qué se descarta'}
            required
            rows={3}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          {footer(
            dialog === 'resolve' ? 'Resolver' : 'Descartar',
            close.isPending,
            resolution.trim().length < 3,
            dialog === 'dismiss' ? 'danger' : 'primary',
          )}
        </form>
      </Modal>
    </>
  )
}

export default IncidentDetailPage
