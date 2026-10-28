import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Play, Plus, XCircle } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatDate, formatMoney } from '../../lib/format'
import type { MaintenanceOrderDetail } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Textarea } from '../../components/ui/Field'
import { HeroStat } from '../../components/ui/HeroStat'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { cn } from '../../lib/cn'
import { SeverityBadge } from './IncidentBadges'
import { OrderStatusBadge, OrderTypeBadge } from './MaintenanceBadges'
import { incidentFolio, orderFolio, useMaintenanceRole } from './useFleet'

const formatKm = (km: number) => `${km.toLocaleString('es-MX')} km`

type Dialog = 'start' | 'complete' | 'cancel' | null

function MaintenanceOrderPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { canManage, canWork } = useMaintenanceRole()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [newTask, setNewTask] = useState('')

  const {
    data: order,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['fleet', 'maintenance', 'order', id],
    queryFn: async () => (await api.get<MaintenanceOrderDetail>(`/fleet/maintenance/orders/${id}`)).data,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fleet'] })
  }
  const toggleTask = useMutation({
    mutationFn: ({ taskId, isDone }: { taskId: string; isDone: boolean }) =>
      api.patch(`/fleet/maintenance/orders/${id}/tasks/${taskId}`, { isDone }),
    onSuccess: refresh,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const addTask = useMutation({
    mutationFn: () => api.post(`/fleet/maintenance/orders/${id}/tasks`, { description: newTask }),
    onSuccess: () => {
      setNewTask('')
      refresh()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (error) return <Alert tone="danger">{apiErrorMessage(error, 'No se pudo cargar la orden')}</Alert>
  if (!order) return <LoadingBlock text="Cargando orden…" />

  const open = order.status === 'scheduled' || order.status === 'in_progress'
  const done = order.tasks.filter((t) => t.isDone).length

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Orden ${orderFolio(order.folio)}`}
        description={order.description}
        refreshing={isFetching}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <OrderTypeBadge type={order.type} />
            {order.priority === 'urgent' && <Badge tone="danger">Urgente</Badge>}
          </div>
        }
        actions={
          <>
            {canManage && open && (
              <Button variant="glass" icon={XCircle} onClick={() => setDialog('cancel')}>
                Cancelar orden
              </Button>
            )}
            {canWork && order.status === 'scheduled' && (
              <Button variant="accent" icon={Play} onClick={() => setDialog('start')}>
                Iniciar trabajo
              </Button>
            )}
            {canWork && order.status === 'in_progress' && (
              <Button variant="accent" icon={CheckCircle2} onClick={() => setDialog('complete')}>
                Terminar
              </Button>
            )}
          </>
        }
        stats={
          <>
            <HeroStat
              label="Unidad"
              value={order.bus.economicNumber}
              tone="primary"
              hint={`${order.bus.plates} · ${formatKm(order.bus.odometerKm)}`}
              to={`/flota/unidades/${order.bus.id}`}
            />
            <HeroStat
              label="Programada"
              value={formatDate(order.scheduledDate)}
              hint={order.startedAt ? `Iniciada ${formatDate(order.startedAt)}` : 'aún no inicia'}
            />
            <HeroStat
              label="Tareas"
              value={order.tasks.length ? `${done}/${order.tasks.length}` : '—'}
              tone={order.tasks.length && done === order.tasks.length ? 'success' : 'neutral'}
              hint="hechas"
            />
            <HeroStat
              label="Costo"
              value={order.status === 'completed' ? formatMoney(order.total) : '—'}
              hint={
                order.status === 'completed'
                  ? `MO ${formatMoney(order.laborCost)} · Ref. ${formatMoney(order.partsCost)}`
                  : 'se captura al terminar'
              }
            />
          </>
        }
      />

      {order.status === 'cancelled' && (
        <Alert tone="neutral" title="Orden cancelada">
          {order.cancelReason}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Tareas"
            description={order.status === 'in_progress' && canWork ? 'Marca cada tarea al terminarla' : undefined}
          />
          <CardBody className="space-y-3">
            {order.tasks.length === 0 && <p className="text-sm text-fg-muted">Sin tareas registradas.</p>}
            <ul className="divide-y divide-border rounded-md border border-border">
              {order.tasks.map((t) => (
                <li key={t.id}>
                  <label
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 text-sm',
                      order.status === 'in_progress' && canWork && 'cursor-pointer hover:bg-surface-muted',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={t.isDone}
                      disabled={order.status !== 'in_progress' || !canWork || toggleTask.isPending}
                      onChange={(e) => toggleTask.mutate({ taskId: t.id, isDone: e.target.checked })}
                    />
                    <span className={cn('flex-1', t.isDone && 'text-fg-muted line-through')}>{t.description}</span>
                    {t.doneAt && <span className="text-xs text-fg-subtle">{formatDate(t.doneAt)}</span>}
                  </label>
                </li>
              ))}
            </ul>
            {open && canWork && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addTask.mutate()
                }}
              >
                <div className="flex-1">
                  <Input placeholder="Agregar tarea…" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  icon={Plus}
                  loading={addTask.isPending}
                  disabled={newTask.trim().length < 2}
                >
                  Agregar
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Detalle" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-fg-muted">Unidad</dt>
                <dd>
                  <Link className="text-primary hover:underline" to={`/flota/unidades/${order.bus.id}`}>
                    {order.bus.economicNumber} · {order.bus.plates}
                  </Link>
                </dd>
              </div>
              {order.incident && (
                <div>
                  <dt className="text-xs text-fg-muted">Incidencia de origen</dt>
                  <dd className="flex items-center gap-2">
                    <Link
                      className="font-data text-primary hover:underline"
                      to={`/flota/incidencias/${order.incident.id}`}
                    >
                      {incidentFolio(order.incident.folio)}
                    </Link>
                    <SeverityBadge severity={order.incident.severity} />
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-fg-muted">Taller</dt>
                <dd>{order.externalShop ?? 'Interno'}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Mecánico</dt>
                <dd>{order.mechanic?.fullName ?? 'Sin asignar'}</dd>
              </div>
              {order.startKm !== null && (
                <div>
                  <dt className="text-xs text-fg-muted">Odómetro entrada / salida</dt>
                  <dd className="font-data">
                    {formatKm(order.startKm)}
                    {order.endKm !== null && ` → ${formatKm(order.endKm)}`}
                  </dd>
                </div>
              )}
              {order.completedAt && (
                <div>
                  <dt className="text-xs text-fg-muted">Terminada</dt>
                  <dd>{formatDate(order.completedAt)}</dd>
                </div>
              )}
              {order.workPerformed && (
                <div>
                  <dt className="text-xs text-fg-muted">Trabajo realizado</dt>
                  <dd className="whitespace-pre-line">{order.workPerformed}</dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>
      </div>

      <OrderDialogs
        key={`${order.status}-${order.bus.odometerKm}`}
        order={order}
        dialog={dialog}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}

function OrderDialogs({
  order,
  dialog,
  onClose,
}: {
  order: MaintenanceOrderDetail
  dialog: Dialog
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [km, setKm] = useState(String(order.bus.odometerKm))
  const [workPerformed, setWorkPerformed] = useState('')
  const [laborCost, setLaborCost] = useState('')
  const [partsCost, setPartsCost] = useState('')
  const [reason, setReason] = useState('')

  const action = useMutation({
    mutationFn: async () => {
      const url = `/fleet/maintenance/orders/${order.id}/${dialog}`
      if (dialog === 'start') return api.post(url, { km: Number(km) })
      if (dialog === 'complete')
        return api.post(url, {
          km: Number(km),
          workPerformed,
          laborCost: laborCost ? Number(laborCost) : 0,
          partsCost: partsCost ? Number(partsCost) : 0,
        })
      return api.post(url, { reason })
    },
    onSuccess: () => {
      toast.success(
        dialog === 'start'
          ? 'Trabajo iniciado: la unidad pasó a mantenimiento'
          : dialog === 'complete'
            ? 'Orden terminada'
            : 'Orden cancelada',
      )
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const minKm = dialog === 'complete' ? (order.startKm ?? order.bus.odometerKm) : order.bus.odometerKm
  const kmError = Number(km) < minKm ? `No puede ser menor a ${formatKm(minKm)}` : undefined
  const pending = order.tasks.length - order.tasks.filter((t) => t.isDone).length

  const footer = (label: string, disabled: boolean, variant: 'primary' | 'danger' = 'primary') => (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" variant={variant} loading={action.isPending} disabled={disabled}>
        {label}
      </Button>
    </div>
  )
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    action.mutate()
  }

  return (
    <>
      <Modal open={dialog === 'start'} title="Iniciar trabajo" size="sm" onClose={onClose}>
        <form className="space-y-4" onSubmit={submit}>
          <p className="text-sm text-fg-muted">
            La unidad {order.bus.economicNumber} pasará a <strong>en mantenimiento</strong> y no podrá salir hasta
            terminar.
          </p>
          <Input
            label="Odómetro de entrada (km)"
            type="number"
            className="font-data"
            value={km}
            error={kmError}
            onChange={(e) => setKm(e.target.value)}
          />
          {footer('Iniciar', !!kmError || !km)}
        </form>
      </Modal>

      <Modal open={dialog === 'complete'} title="Terminar orden" onClose={onClose}>
        <form className="space-y-4" onSubmit={submit}>
          {pending > 0 && <Alert tone="warning">Quedan {pending} tarea(s) sin marcar.</Alert>}
          <Input
            label="Odómetro de salida (km)"
            type="number"
            className="font-data"
            value={km}
            error={kmError}
            onChange={(e) => setKm(e.target.value)}
          />
          <Textarea
            label="Trabajo realizado"
            required
            rows={3}
            value={workPerformed}
            onChange={(e) => setWorkPerformed(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Mano de obra ($)"
              type="number"
              min={0}
              step="0.01"
              className="font-data"
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value)}
            />
            <Input
              label="Refacciones ($)"
              type="number"
              min={0}
              step="0.01"
              className="font-data"
              value={partsCost}
              onChange={(e) => setPartsCost(e.target.value)}
            />
          </div>
          {order.type === 'preventive' && (
            <p className="text-xs text-fg-muted">Al terminar se reinicia el conteo del próximo preventivo.</p>
          )}
          {order.incident && (
            <p className="text-xs text-fg-muted">
              La incidencia {incidentFolio(order.incident.folio)} se resolverá con el trabajo realizado.
            </p>
          )}
          {footer('Terminar', !!kmError || workPerformed.trim().length < 3)}
        </form>
      </Modal>

      <Modal open={dialog === 'cancel'} title="Cancelar orden" size="sm" onClose={onClose}>
        <form className="space-y-4" onSubmit={submit}>
          {order.status === 'in_progress' && <p className="text-sm text-fg-muted">La unidad volverá a disponible.</p>}
          <Textarea label="Motivo" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          {footer('Cancelar orden', reason.trim().length < 3, 'danger')}
        </form>
      </Modal>
    </>
  )
}

export default MaintenanceOrderPage
