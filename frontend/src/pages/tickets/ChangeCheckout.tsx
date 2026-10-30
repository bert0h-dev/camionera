import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { businessFormat, formatMoney } from '../../lib/format'
import type { CashCurrent, ChangeOrder, Order } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { RefundFields, type RefundDraft } from './RefundFields'
import { METHOD_LABELS } from './useTickets'

const WHEN = businessFormat({ dateStyle: 'medium', timeStyle: 'short' })

/** Paso 3 de un cambio: muestra la diferencia y cobra lo que falta o devuelve lo que sobra. */
export function ChangeCheckout({ orderId, onDone }: { orderId: string; onDone: (o: Order) => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [payment, setPayment] = useState({
    method: 'cash' as 'cash' | 'card' | 'transfer',
    received: '',
    reference: '',
  })
  const [refund, setRefund] = useState<RefundDraft>({ method: 'cash', reference: '' })
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'change', orderId],
    queryFn: async () => (await api.get<ChangeOrder>(`/tickets/changes/${orderId}`)).data,
  })
  const cash = useQuery({
    queryKey: ['cash', 'current'],
    queryFn: async () => (await api.get<CashCurrent>('/cash/current')).data,
  })
  const noCash = cash.isSuccess && !cash.data.session

  const complete = useMutation({
    mutationFn: async () => {
      const q = data!.change.quote
      return (
        await api.post<ChangeOrder>(`/tickets/changes/${orderId}/complete`, {
          payments:
            q.due > 0
              ? [
                  {
                    method: payment.method,
                    amount: q.due,
                    received: payment.method === 'cash' && payment.received ? Number(payment.received) : null,
                    reference: payment.method === 'cash' ? null : payment.reference || null,
                  },
                ]
              : undefined,
          refund: q.refund > 0 ? { method: refund.method, reference: refund.reference || null } : undefined,
        })
      ).data
    },
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['cash'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      const received = payment.method === 'cash' ? Number(payment.received || 0) : 0
      onDone({ ...o, change: Math.max(0, received - o.change.quote.due) } as unknown as Order)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  if (isLoading) return <LoadingBlock text="Calculando la diferencia…" />
  if (!data) return <Alert tone="danger">{apiErrorMessage(error)}</Alert>
  const { old, quote, relocation, sameTrip } = data.change
  const t = data.tickets[0]

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-fg-subtle" />
            {relocation ? 'Reubicación sin cargo' : 'Cambio de boleto'}
          </span>
        }
        description={`${t.passengerName} · ${old.ticketNumber} (asiento ${old.seatNumber}, ${old.tripNumber}, ${WHEN.format(new Date(old.departureAt))})`}
      />
      <CardBody className="space-y-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">
              Boleto nuevo · asiento {t.seatNumber} · {t.boardTerminal.code} → {t.alightTerminal.code}
            </dt>
            <dd className="font-data">{formatMoney(t.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">{relocation ? 'Saldo del recorrido cancelado' : 'Boleto anterior'}</dt>
            <dd className="font-data">−{formatMoney(relocation ? old.refundDue : old.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">
              Cargo por cambio
              {relocation ? ' (no aplica en reubicación)' : sameTrip ? ' (no aplica en el mismo recorrido)' : ''}
            </dt>
            <dd className="font-data">{formatMoney(quote.fee)}</dd>
          </div>
        </dl>
        <div className="rounded-xl bg-band p-4 text-white">
          <div className="text-xs text-indigo-200">
            {quote.due > 0 ? 'Cobrar al cliente' : quote.refund > 0 ? 'Devolver al cliente' : 'Sin diferencia'}
          </div>
          <div className="font-data text-3xl font-bold text-amber-400">{formatMoney(quote.due || quote.refund)}</div>
        </div>

        {quote.due > 0 && (
          <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <Select
              label="Método"
              value={payment.method}
              onChange={(e) => setPayment({ ...payment, method: e.target.value as typeof payment.method })}
            >
              {(['cash', 'card', 'transfer'] as const).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
            {payment.method === 'cash' ? (
              <Input
                label="Recibido"
                type="number"
                min={quote.due}
                step="0.01"
                placeholder="Para calcular el cambio"
                value={payment.received}
                onChange={(e) => setPayment({ ...payment, received: e.target.value })}
              />
            ) : (
              <Input
                label={payment.method === 'card' ? 'Autorización de la terminal' : 'Referencia de la transferencia'}
                required
                value={payment.reference}
                onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
              />
            )}
          </div>
        )}
        {quote.refund > 0 && <RefundFields value={refund} onChange={setRefund} />}
        {noCash && (
          <Alert
            tone="warning"
            action={
              <Link to="/caja" target="_blank" className="font-medium text-link hover:underline">
                Abrir caja
              </Link>
            }
          >
            Abre tu caja para registrar el cambio.
          </Alert>
        )}
        <Button className="w-full" disabled={noCash} loading={complete.isPending} onClick={() => complete.mutate()}>
          {quote.due > 0
            ? `Cobrar ${formatMoney(quote.due)} y confirmar`
            : quote.refund > 0
              ? `Devolver ${formatMoney(quote.refund)} y confirmar`
              : 'Confirmar cambio'}
        </Button>
      </CardBody>
    </Card>
  )
}
