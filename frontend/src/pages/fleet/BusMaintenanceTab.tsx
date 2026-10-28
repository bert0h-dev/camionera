import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Plus, Wrench } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDate, formatMoney } from '../../lib/format'
import type { MaintenanceOrderListItem, Paginated, ServicePlanRow } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import { OrderStatusBadge, OrderTypeBadge, ServiceStatusBadge } from './MaintenanceBadges'
import { NewOrderModal, type NewOrderPreset } from './NewOrderModal'
import { orderFolio, useMaintenanceRole } from './useFleet'

const formatKm = (km: number) => `${km.toLocaleString('es-MX')} km`

/** Próximo preventivo y órdenes de una unidad. */
export function BusMaintenanceTab({ busId }: { busId: string }) {
  const navigate = useNavigate()
  const { canManage } = useMaintenanceRole()
  const [preset, setPreset] = useState<NewOrderPreset | null>(null)

  const plan = useQuery({
    queryKey: ['fleet', 'maintenance', 'plan', busId],
    queryFn: async () => (await api.get<ServicePlanRow | null>(`/fleet/maintenance/plan/${busId}`)).data,
  })
  const orders = useQuery({
    queryKey: ['fleet', 'maintenance', 'orders', { busId }],
    queryFn: async () =>
      (
        await api.get<Paginated<MaintenanceOrderListItem>>('/fleet/maintenance/orders', {
          params: { busId, limit: 50 },
        })
      ).data.data,
  })
  const p = plan.data

  const columns: Column<MaintenanceOrderListItem>[] = [
    { header: 'Orden', cell: (o) => <span className="font-data font-semibold">{orderFolio(o.folio)}</span> },
    { header: 'Tipo', cell: (o) => <OrderTypeBadge type={o.type} /> },
    { header: 'Trabajo', cell: (o) => <span className="line-clamp-1 max-w-72">{o.description}</span> },
    { header: 'Fecha', cell: (o) => formatDate(o.completedAt ?? o.scheduledDate) },
    {
      header: 'Costo',
      cell: (o) => (o.status === 'completed' ? <span className="font-data">{formatMoney(o.total)}</span> : '—'),
    },
    { header: 'Estado', cell: (o) => <OrderStatusBadge status={o.status} /> },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Próximo preventivo"
          actions={
            canManage &&
            p &&
            !p.openOrder &&
            p.status !== 'no_plan' && (
              <Button
                size="sm"
                icon={CalendarClock}
                onClick={() =>
                  setPreset({
                    busId,
                    type: 'preventive',
                    description: p.plan.km ? `Servicio preventivo de ${formatKm(p.plan.km)}` : 'Servicio preventivo',
                  })
                }
              >
                Programar preventivo
              </Button>
            )
          }
        />
        <CardBody>
          {plan.isLoading ? (
            <LoadingBlock />
          ) : !p || p.status === 'no_plan' ? (
            <p className="text-sm text-fg-muted">
              Ni la unidad ni su modelo tienen plan preventivo (km o días). Defínelo en el modelo o al editar la unidad.
            </p>
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-fg-muted">Estado</dt>
                <dd className="mt-1">
                  <ServiceStatusBadge status={p.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Toca por km</dt>
                <dd className="font-data">{p.dueKm !== null ? formatKm(p.dueKm) : '—'}</dd>
                {p.kmLeft !== null && (
                  <dd className="text-xs text-fg-muted">
                    {p.kmLeft < 0 ? `${formatKm(-p.kmLeft)} pasado` : `faltan ${formatKm(p.kmLeft)}`}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Toca por fecha</dt>
                <dd>{p.dueDate ? formatDate(p.dueDate) : '—'}</dd>
                {p.daysLeft !== null && (
                  <dd className="text-xs text-fg-muted">
                    {p.daysLeft < 0
                      ? `${-p.daysLeft} días pasado`
                      : p.daysLeft === 0
                        ? 'vence hoy'
                        : `faltan ${p.daysLeft} días`}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Último preventivo</dt>
                <dd>{p.lastServiceAt ? formatDate(p.lastServiceAt) : 'Desde el alta'}</dd>
                {p.openOrder && (
                  <dd className="text-xs">
                    Abierto:{' '}
                    <button
                      type="button"
                      className="font-data text-primary hover:underline"
                      onClick={() => navigate(`/flota/mantenimiento/${p.openOrder!.id}`)}
                    >
                      {orderFolio(p.openOrder.folio)}
                    </button>
                  </dd>
                )}
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      <div className="space-y-3">
        {canManage && (
          <div className="flex justify-end">
            <Button variant="secondary" icon={Plus} onClick={() => setPreset({ busId, type: 'corrective' })}>
              Orden correctiva
            </Button>
          </div>
        )}
        <Table
          columns={columns}
          rows={orders.data ?? []}
          rowKey={(o) => o.id}
          loading={orders.isLoading}
          onRowClick={(o) => navigate(`/flota/mantenimiento/${o.id}`)}
          emptyIcon={Wrench}
          emptyMessage="Esta unidad no tiene órdenes de mantenimiento"
        />
      </div>

      <NewOrderModal preset={preset} onClose={() => setPreset(null)} />
    </div>
  )
}
