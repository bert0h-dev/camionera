import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney } from '../../lib/format'
import type { MaintenanceOrderListItem, Paginated } from '../../lib/types'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { OrderTypeBadge } from '../fleet/MaintenanceBadges'
import { orderFolio, useBusSummary, useMaintenanceSummary } from '../fleet/useFleet'

const linkClass = 'inline-flex items-center gap-1 text-sm font-medium text-link hover:underline'

/** Estado de la flota y del taller para la pestaña Flota de Inicio. */
export function FleetOverview() {
  const buses = useBusSummary()
  const shop = useMaintenanceSummary()
  const inShop = useQuery({
    queryKey: ['fleet', 'maintenance', 'orders', { status: 'in_progress', home: true }],
    queryFn: async () =>
      (
        await api.get<Paginated<MaintenanceOrderListItem>>('/fleet/maintenance/orders', {
          params: { status: 'in_progress', limit: 5 },
        })
      ).data.data,
  })

  const b = buses.data
  const m = shop.data
  if (!b || !m)
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )

  const segments = [
    { label: 'Disponibles', count: b.available, color: 'bg-emerald-500' },
    { label: 'En servicio', count: b.inService, color: 'bg-sky-500' },
    { label: 'En mantenimiento', count: b.maintenance, color: 'bg-amber-500' },
    { label: 'Fuera de servicio', count: b.outOfService, color: 'bg-slate-400' },
  ]

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Estado de la flota"
          actions={
            <Link to="/flota/unidades" className={linkClass}>
              Ver unidades <ArrowRight className="size-4" />
            </Link>
          }
        />
        <CardBody className="space-y-5">
          {b.total === 0 ? (
            <p className="text-sm text-fg-muted">Aún no hay unidades registradas.</p>
          ) : (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                {segments
                  .filter((s) => s.count)
                  .map((s) => (
                    <div
                      key={s.label}
                      className={s.color}
                      style={{ flexGrow: s.count }}
                      title={`${s.label}: ${s.count}`}
                    />
                  ))}
              </div>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {segments.map((s) => (
                  <li key={s.label} className="flex items-center gap-2 text-fg-muted">
                    <span className={cn('size-2.5 rounded-sm', s.color)} />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-data font-semibold text-fg">{s.count}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <div className="text-xs text-fg-muted">No aptas para salir</div>
                  <div className={cn('font-data text-xl font-semibold', b.unfit ? 'text-red-600' : 'text-fg')}>
                    {b.unfit}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-fg-muted">Documentos con alerta</div>
                  <div
                    className={cn(
                      'font-data text-xl font-semibold',
                      b.documentsExpired ? 'text-red-600' : b.documentsExpiring ? 'text-amber-600' : 'text-fg',
                    )}
                  >
                    {b.documentsExpired + b.documentsExpiring}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Taller"
          actions={
            <Link to="/flota/mantenimiento" className={linkClass}>
              Ver mantenimiento <ArrowRight className="size-4" />
            </Link>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-fg-muted">En proceso</div>
              <div className="font-data text-xl font-semibold">{m.inProgress}</div>
            </div>
            <div>
              <div className="text-xs text-fg-muted">Programadas</div>
              <div className="font-data text-xl font-semibold">{m.scheduled}</div>
            </div>
            <div>
              <div className="text-xs text-fg-muted">Gasto del mes</div>
              <div className="font-data text-xl font-semibold">{formatMoney(m.costThisMonth)}</div>
            </div>
          </div>
          {inShop.data && inShop.data.length > 0 ? (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {inShop.data.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/flota/mantenimiento/${o.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <div>
                        <span className="font-data font-semibold">{o.bus.economicNumber}</span>
                        <span className="text-fg-muted"> · {orderFolio(o.folio)}</span>
                      </div>
                      <div className="truncate text-xs text-fg-muted">{o.description}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-fg-muted">
                      {o.startedAt && formatDate(o.startedAt)}
                      <OrderTypeBadge type={o.type} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">No hay unidades en el taller ahora.</p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
