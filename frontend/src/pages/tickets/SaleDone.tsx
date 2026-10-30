import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CircleCheck, FileDown, Mail, Plus } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import type { Order } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { useToast } from '../../components/ui/toast-context'
import { openOrderPdf } from './useTickets'

/** Venta terminada: cambio, folios y acciones para imprimir o mandar los boletos. */
export function SaleDone({ order, onNew }: { order: Order; onNew: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState(order.contactEmail ?? '')
  const send = useMutation({
    mutationFn: async () =>
      (await api.post<{ to: string; sent: boolean }>(`/tickets/orders/${order.id}/send`, { email: email || null }))
        .data,
    onSuccess: (r) =>
      r.sent
        ? toast.success(`Boletos enviados a ${r.to}`)
        : toast.success('El envío de correo no está configurado; quedó en el registro del servidor'),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  const pdf = useMutation({
    mutationFn: () => openOrderPdf(order.id),
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Card>
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <CircleCheck className="size-12 text-emerald-600 dark:text-emerald-400" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Venta lista</h2>
            <p className="text-sm text-fg-muted">
              Compra <span className="font-data font-semibold text-fg">{order.orderNumber}</span> ·{' '}
              {order.tickets.length} boleto(s) · {formatMoney(order.total)}
            </p>
          </div>
          {order.change != null && order.change > 0 && (
            <div className="rounded-xl bg-band px-5 py-3 text-right text-white">
              <div className="text-xs text-indigo-200">Cambio a entregar</div>
              <div className="font-data text-3xl font-bold text-amber-400">{formatMoney(order.change)}</div>
            </div>
          )}
        </div>

        <ul className="divide-y divide-border rounded-xl border border-border">
          {order.tickets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft font-data font-bold text-primary-soft-fg">
                {t.seatNumber}
              </span>
              <span className="min-w-40 flex-1">
                <span className="font-medium">{t.passengerName}</span>
                <span className="block text-xs text-fg-muted">{t.passengerType.name}</span>
              </span>
              <span className="font-data text-xs text-fg-muted">{t.ticketNumber}</span>
              <span className="font-data">
                {t.boardTerminal.code} → {t.alightTerminal.code}
              </span>
              <span className="w-24 text-right font-data font-semibold">{formatMoney(t.total)}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-end gap-3">
          <Button icon={FileDown} loading={pdf.isPending} onClick={() => pdf.mutate()}>
            Imprimir boletos (PDF)
          </Button>
          <form
            className="flex flex-1 flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              send.mutate()
            }}
          >
            <div className="min-w-56 flex-1">
              <Input
                label="Mandar por correo"
                type="email"
                required
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" icon={Mail} loading={send.isPending}>
              Enviar
            </Button>
          </form>
          <Button variant="accent" icon={Plus} onClick={onNew}>
            Nueva venta
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
