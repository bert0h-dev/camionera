import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Ban, FileDown, HandCoins } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { businessFormat, formatMoney } from '../../lib/format'
import type { FullOrder, FullTicket, TicketEventType, TicketStatus } from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { CancelModal } from './CancelModal'
import { METHOD_LABELS, openOrderPdf } from './useTickets'

const WHEN = businessFormat({ dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : '—')

const STATUS: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  held: { label: 'Apartado', tone: 'warning' },
  confirmed: { label: 'Vigente', tone: 'success' },
  checked_in: { label: 'Abordó', tone: 'info' },
  no_show: { label: 'No se presentó', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
  changed: { label: 'Cambiado', tone: 'neutral' },
}

const EVENT_LABELS: Record<TicketEventType, string> = {
  held: 'Apartado',
  released: 'Liberado',
  confirmed: 'Vendido',
  changed: 'Cambiado',
  checked_in: 'Abordó',
  no_show: 'No se presentó',
  cancelled: 'Cancelado',
  refunded: 'Reembolso',
}

/** Fecha local de abordaje 'AAAA-MM-DD' en la zona de la terminal (para buscar salidas al cambiar). */
const localDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  )

const hasDue = (t: FullTicket) => t.status === 'cancelled' && Number(t.refundDue ?? 0) > 0

/** Ficha de una compra: boletos en cualquier estado, pagos, reembolsos e historial; cancelar, cambiar o reembolsar. */
export function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [cancel, setCancel] = useState<{ ids: string[]; refundOnly: boolean } | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const { data: o, isLoading } = useQuery({
    queryKey: ['tickets', 'full', orderId],
    queryFn: async () => (await api.get<FullOrder>(`/tickets/orders/${orderId}/full`)).data,
  })
  const pdf = useMutation({
    mutationFn: () => openOrderPdf(orderId),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const change = (t: FullTicket) =>
    navigate(
      `/taquilla?cambio=${t.id}&origen=${t.boardTerminal.cityId}&destino=${t.alightTerminal.cityId}&fecha=${localDate(t.boardAt, t.boardTerminal.city.timezone)}`,
    )
  const cancellable = o?.tickets.filter((t) => t.status === 'confirmed') ?? []
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <>
      <Modal open={!cancel} title={o ? `Compra ${o.orderNumber}` : 'Compra'} size="xl" onClose={onClose}>
        {isLoading || !o ? (
          <LoadingBlock text="Cargando compra…" />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-fg-muted">
              <span>
                Vendida <span className="font-data text-fg">{when(o.paidAt)}</span>
                {o.seller && ` por ${o.seller.fullName}`}
              </span>
              {o.contactEmail && <span>{o.contactEmail}</span>}
              {o.contactPhone && <span>{o.contactPhone}</span>}
              <span className="ml-auto font-data text-lg font-bold text-fg">{formatMoney(o.total)}</span>
            </div>
            {o.notes && <p className="text-sm text-fg-muted">{o.notes}</p>}

            <ul className="space-y-3">
              {o.tickets.map((t) => (
                <li key={t.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {t.status === 'confirmed' && cancellable.length > 1 && (
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar el boleto ${t.ticketNumber}`}
                        className="size-4 accent-indigo-600"
                        checked={selected.includes(t.id)}
                        onChange={() => toggle(t.id)}
                      />
                    )}
                    <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft font-data text-lg font-bold text-primary-soft-fg">
                      {t.seatNumber}
                    </span>
                    <div className="min-w-48 flex-1">
                      <div className="font-medium">{t.passengerName || 'Sin capturar'}</div>
                      <div className="text-xs text-fg-muted">
                        <span className="font-data">{t.ticketNumber}</span> · {t.passengerType.name}
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="font-data">
                        {t.boardTerminal.code} → {t.alightTerminal.code}
                      </div>
                      <Link to={`/recorridos/${t.trip.id}`} className="font-data text-xs text-link hover:underline">
                        {t.trip.tripNumber}
                      </Link>
                    </div>
                    <Badge tone={STATUS[t.status].tone} dot>
                      {STATUS[t.status].label}
                    </Badge>
                    <span className="w-24 text-right font-data font-semibold">{formatMoney(t.total)}</span>
                  </div>

                  {hasDue(t) && (
                    <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      La empresa canceló el recorrido: saldo por devolver {formatMoney(t.refundDue)}.
                    </p>
                  )}
                  {t.cancelReason && !hasDue(t) && <p className="mt-2 text-xs text-fg-muted">{t.cancelReason}</p>}
                  {t.replacedBy && (
                    <p className="mt-2 text-xs text-fg-muted">Se cambió por el boleto {t.replacedBy.ticketNumber}</p>
                  )}
                  {t.replaces && (
                    <p className="mt-2 text-xs text-fg-muted">Cambio del boleto {t.replaces.ticketNumber}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(t.status === 'confirmed' || hasDue(t)) && (
                      <Button variant="secondary" size="sm" icon={ArrowLeftRight} onClick={() => change(t)}>
                        {hasDue(t) ? 'Reubicar sin cargo' : 'Cambiar'}
                      </Button>
                    )}
                    {t.status === 'confirmed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Ban}
                        onClick={() => setCancel({ ids: [t.id], refundOnly: false })}
                      >
                        Cancelar
                      </Button>
                    )}
                    {hasDue(t) && (
                      <Button size="sm" icon={HandCoins} onClick={() => setCancel({ ids: [t.id], refundOnly: true })}>
                        Reembolsar saldo
                      </Button>
                    )}
                    <details className="ml-auto text-xs text-fg-muted">
                      <summary className="cursor-pointer">Historial</summary>
                      <ul className="mt-1 space-y-0.5">
                        {t.events.map((e) => (
                          <li key={e.id}>
                            <span className="font-data">{when(e.createdAt)}</span> · {EVENT_LABELS[e.type]}
                            {e.user && ` · ${e.user.fullName}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </li>
              ))}
            </ul>

            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <h3 className="mb-1 font-semibold">Pagos</h3>
                {o.payments.length ? (
                  o.payments.map((p) => (
                    <div key={p.id} className="flex justify-between">
                      <span className="text-fg-muted">
                        {METHOD_LABELS[p.method]}
                        {p.reference && ` · ${p.reference}`}
                      </span>
                      <span className="font-data">{formatMoney(p.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-fg-muted">Sin pagos (cambio sin diferencia)</p>
                )}
              </div>
              <div>
                <h3 className="mb-1 font-semibold">Reembolsos</h3>
                {o.refunds.length ? (
                  o.refunds.map((r) => (
                    <div key={r.id} className="flex justify-between gap-3">
                      <span className="truncate text-fg-muted" title={r.reason}>
                        {METHOD_LABELS[r.method]} · {r.reason}
                      </span>
                      <span className="font-data whitespace-nowrap">−{formatMoney(r.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-fg-muted">Sin reembolsos</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {selected.length > 1 && (
                <Button variant="danger" icon={Ban} onClick={() => setCancel({ ids: selected, refundOnly: false })}>
                  Cancelar {selected.length} boletos
                </Button>
              )}
              {o.tickets.some((t) => t.status === 'confirmed' || t.status === 'checked_in') && (
                <Button variant="secondary" icon={FileDown} loading={pdf.isPending} onClick={() => pdf.mutate()}>
                  PDF de boletos
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
      {cancel && (
        <CancelModal
          ticketIds={cancel.ids}
          refundOnly={cancel.refundOnly}
          onClose={() => {
            setCancel(null)
            setSelected([])
          }}
        />
      )}
    </>
  )
}
