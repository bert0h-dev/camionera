import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { MaintenanceOrderListItem, Paginated } from '../../lib/types'
import { LoadingBlock } from '../../components/ui/Spinner'
import { OrderStatusBadge } from '../fleet/MaintenanceBadges'
import { orderFolio } from '../fleet/useFleet'

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold text-fg">{title}</h2>
          {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
        </div>
        <Link to="/flota/mantenimiento" className="text-sm font-medium text-primary hover:underline">
          Ver todo
        </Link>
      </div>
      {children}
    </section>
  )
}

/** Órdenes abiertas del mecánico (asignadas o sin asignar). */
export function MyOrdersPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['fleet', 'maintenance', 'orders', 'mine'],
    queryFn: async () => {
      const get = (status: string) =>
        api
          .get<Paginated<MaintenanceOrderListItem>>('/fleet/maintenance/orders', { params: { status, limit: 20 } })
          .then((r) => r.data.data)
      const [inProgress, scheduled] = await Promise.all([get('in_progress'), get('scheduled')])
      return [...inProgress, ...scheduled]
    },
  })

  return (
    <Panel title="Mis órdenes de trabajo" subtitle={data && `${data.length} abierta(s)`}>
      {isLoading ? (
        <LoadingBlock className="py-6" />
      ) : !data?.length ? (
        <p className="px-5 py-6 text-sm text-fg-muted">No tienes órdenes pendientes.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((o) => (
            <li key={o.id}>
              <Link
                to={`/flota/mantenimiento/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="font-medium text-fg">
                    <span className="font-data">{orderFolio(o.folio)}</span> · Unidad{' '}
                    <span className="font-data">{o.bus.economicNumber}</span>
                  </div>
                  <div className="truncate text-xs text-fg-muted">{o.description}</div>
                </div>
                <div className="flex items-center gap-3 text-xs text-fg-muted">
                  <span>{formatDate(o.scheduledDate)}</span>
                  <OrderStatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
