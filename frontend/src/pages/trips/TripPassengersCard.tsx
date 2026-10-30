import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import { Badge } from '../../components/ui/Badge'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { LoadingBlock } from '../../components/ui/Spinner'

interface Passenger {
  id: string
  ticketNumber: string
  seatNumber: string
  passengerName: string
  status: string
  refundDue: string | null
  orderId: string
  order: { orderNumber: string; contactEmail: string | null; contactPhone: string | null }
  boardTerminal: { code: string }
  alightTerminal: { code: string }
}

/** Recorrido cancelado: pasajeros con saldo por devolver, para reembolsar o reubicar desde Ventas. */
export function TripPassengersCard({ tripId }: { tripId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', 'trip-passengers', tripId],
    queryFn: async () => (await api.get<Passenger[]>(`/tickets/trips/${tripId}/passengers`)).data,
  })
  const due = (data ?? []).filter((p) => Number(p.refundDue ?? 0) > 0)
  return (
    <Card>
      <CardHeader
        title="Pasajeros por reembolsar o reubicar"
        description="Se canceló el recorrido: cada boleto tiene derecho al 100 % o a cambiar sin cargo a otra salida."
      />
      <CardBody>
        {isLoading ? (
          <LoadingBlock text="Cargando pasajeros…" />
        ) : !due.length ? (
          <p className="text-sm text-fg-muted">No quedan boletos con saldo por devolver.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {due.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-8 text-right font-data font-semibold">{p.seatNumber}</span>
                <span className="min-w-40 flex-1">
                  {p.passengerName}
                  <span className="block text-xs text-fg-muted">
                    {[p.order.contactPhone, p.order.contactEmail].filter(Boolean).join(' · ') || 'Sin contacto'}
                  </span>
                </span>
                <span className="font-data text-xs">
                  {p.boardTerminal.code} → {p.alightTerminal.code}
                </span>
                <Badge tone="warning">{formatMoney(p.refundDue)}</Badge>
                <Link to={`/ventas?compra=${p.orderId}`} className="font-medium text-link hover:underline">
                  Atender {p.order.orderNumber}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
