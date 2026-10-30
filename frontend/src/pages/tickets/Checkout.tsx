import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Banknote, CreditCard, Landmark, Plus, Trash2, Users, Wallet } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'
import type { Order, PaymentMethod, TripSeatMap } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Field'
import { useToast } from '../../components/ui/toast-context'
import { METHOD_LABELS } from './useTickets'

type PassengerType = TripSeatMap['passengerTypes'][number]

interface PassengerDraft {
  ticketId: string
  seat: string
  name: string
  typeId: string
  document: string
}

interface PaymentDraft {
  method: Exclude<PaymentMethod, 'mercadopago'>
  amount: string
  received: string
  reference: string
}

const METHOD_ICONS = { cash: Banknote, card: CreditCard, transfer: Landmark } as const
const cents = (v: string | number) => Math.round(Number(v || 0) * 100)

/** Paso 3 de la taquilla: datos de cada pasajero, contacto y cobro (uno o varios pagos). */
export function Checkout({
  order,
  passengerTypes,
  onPaid,
}: {
  order: Order
  passengerTypes: PassengerType[]
  onPaid: (order: Order) => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const defaultType = passengerTypes.find((t) => t.isDefault) ?? passengerTypes[0]
  const [passengers, setPassengers] = useState<PassengerDraft[]>(() =>
    order.tickets.map((t) => ({
      ticketId: t.id,
      seat: t.seatNumber,
      name: t.passengerName,
      typeId: t.passengerType.id ?? defaultType?.id,
      document: t.passengerDocument ?? '',
    })),
  )
  const [contact, setContact] = useState({
    name: '',
    email: order.contactEmail ?? '',
    phone: order.contactPhone ?? '',
  })
  // Los pasajeros se confirman antes de cobrar: el total depende de sus tipos
  const [confirmed, setConfirmed] = useState(order.tickets.every((t) => t.passengerName))
  const [payments, setPayments] = useState<PaymentDraft[]>([
    { method: 'cash', amount: order.total, received: '', reference: '' },
  ])

  const setPassenger = (i: number, patch: Partial<PassengerDraft>) => {
    setPassengers((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)))
    setConfirmed(false)
  }
  const setPayment = (i: number, patch: Partial<PaymentDraft>) =>
    setPayments((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const savePassengers = useMutation({
    mutationFn: async () =>
      (
        await api.put<Order>(`/tickets/orders/${order.id}/passengers`, {
          passengers: passengers.map((p) => ({
            ticketId: p.ticketId,
            name: p.name,
            passengerTypeId: p.typeId,
            document: p.document || null,
          })),
          contactName: contact.name || null,
          contactEmail: contact.email || null,
          contactPhone: contact.phone || null,
        })
      ).data,
    onSuccess: (o) => {
      queryClient.setQueryData(['tickets', 'order', o.id], o)
      setConfirmed(true)
      // Con un solo pago, se ajusta al total nuevo
      setPayments((list) => (list.length === 1 ? [{ ...list[0], amount: o.total }] : list))
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const pay = useMutation({
    mutationFn: async () =>
      (
        await api.post<Order>(`/tickets/orders/${order.id}/pay`, {
          payments: payments.map((p) => ({
            method: p.method,
            amount: Number(p.amount),
            received: p.method === 'cash' && p.received ? Number(p.received) : null,
            reference: p.method === 'cash' ? null : p.reference || null,
          })),
        })
      ).data,
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      onPaid(o)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const total = cents(order.total)
  const paid = payments.reduce((a, p) => a + cents(p.amount), 0)
  const change = payments.reduce(
    (a, p) => a + (p.method === 'cash' && p.received ? Math.max(0, cents(p.received) - cents(p.amount)) : 0),
    0,
  )
  const diff = total - paid
  const typeOf = (id: string) => passengerTypes.find((t) => t.id === id)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Users className="size-4 text-fg-subtle" />
              Pasajeros
            </span>
          }
          description="Un pasajero por asiento. El descuento depende de su tipo."
        />
        <CardBody>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              savePassengers.mutate()
            }}
          >
            {passengers.map((p, i) => {
              const type = typeOf(p.typeId)
              return (
                <div key={p.ticketId} className="grid gap-3 sm:grid-cols-[3rem_minmax(0,1fr)_14rem_11rem] sm:items-end">
                  <span className="flex size-11 items-center justify-center rounded-md bg-primary-soft font-data text-lg font-bold text-primary-soft-fg">
                    {p.seat}
                  </span>
                  <Input
                    label="Nombre completo"
                    required
                    minLength={3}
                    value={p.name}
                    onChange={(e) => setPassenger(i, { name: e.target.value })}
                  />
                  <Select label="Tipo" value={p.typeId} onChange={(e) => setPassenger(i, { typeId: e.target.value })}>
                    {passengerTypes.map((t) => (
                      <option key={t.id} value={t.id} disabled={t.left === 0 && t.id !== p.typeId}>
                        {t.name}
                        {t.discountPercent ? ` (−${t.discountPercent} %)` : ''}
                        {t.left != null ? ` · quedan ${t.left}` : ''}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label={type?.requiresId ? 'Credencial *' : 'Identificación'}
                    required={type?.requiresId}
                    placeholder={type?.requiresId ? 'Folio de la credencial' : 'Opcional'}
                    value={p.document}
                    onChange={(e) => setPassenger(i, { document: e.target.value })}
                  />
                </div>
              )
            })}
            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <Input
                label="Quien compra"
                placeholder="Opcional"
                value={contact.name}
                onChange={(e) => {
                  setContact({ ...contact, name: e.target.value })
                  setConfirmed(false)
                }}
              />
              <Input
                label="Correo"
                type="email"
                placeholder="Para mandarle los boletos"
                value={contact.email}
                onChange={(e) => {
                  setContact({ ...contact, email: e.target.value })
                  setConfirmed(false)
                }}
              />
              <Input
                label="Teléfono"
                placeholder="Opcional"
                value={contact.phone}
                onChange={(e) => {
                  setContact({ ...contact, phone: e.target.value })
                  setConfirmed(false)
                }}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant={confirmed ? 'secondary' : 'primary'} loading={savePassengers.isPending}>
                {confirmed ? 'Pasajeros confirmados · actualizar' : 'Confirmar pasajeros'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card className={cn(!confirmed && 'opacity-60')}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Wallet className="size-4 text-fg-subtle" />
              Cobro
            </span>
          }
          description={
            confirmed ? `Total a cobrar ${formatMoney(order.total)}` : 'Confirma a los pasajeros para cobrar'
          }
        />
        <CardBody>
          <fieldset disabled={!confirmed} className="space-y-3">
            {payments.map((p, i) => {
              const Icon = METHOD_ICONS[p.method]
              return (
                <div key={i} className="grid gap-3 sm:grid-cols-[11rem_9rem_minmax(0,1fr)_auto] sm:items-end">
                  <Select
                    label="Método"
                    value={p.method}
                    onChange={(e) => setPayment(i, { method: e.target.value as PaymentDraft['method'] })}
                  >
                    {(['cash', 'card', 'transfer'] as const).map((m) => (
                      <option key={m} value={m}>
                        {METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Importe"
                    type="number"
                    min={0.01}
                    step="0.01"
                    icon={Icon}
                    value={p.amount}
                    onChange={(e) => setPayment(i, { amount: e.target.value })}
                  />
                  {p.method === 'cash' ? (
                    <Input
                      label="Recibido"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Para calcular el cambio"
                      value={p.received}
                      onChange={(e) => setPayment(i, { received: e.target.value })}
                    />
                  ) : (
                    <Input
                      label={p.method === 'card' ? 'Autorización de la terminal' : 'Referencia de la transferencia'}
                      required
                      value={p.reference}
                      onChange={(e) => setPayment(i, { reference: e.target.value })}
                    />
                  )}
                  {payments.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      icon={Trash2}
                      aria-label="Quitar pago"
                      onClick={() => setPayments((list) => list.filter((_, j) => j !== i))}
                    />
                  )}
                </div>
              )
            })}
            {payments.length < 5 && (
              <Button
                variant="ghost"
                size="sm"
                icon={Plus}
                onClick={() =>
                  setPayments((list) => [
                    ...list,
                    { method: 'card', amount: diff > 0 ? (diff / 100).toFixed(2) : '', received: '', reference: '' },
                  ])
                }
              >
                Agregar otro pago (pago mixto)
              </Button>
            )}

            <div className="grid gap-3 rounded-xl bg-band p-4 text-white sm:grid-cols-3">
              <div>
                <div className="text-xs text-indigo-200">Total</div>
                <div className="font-data text-2xl font-bold">{formatMoney(order.total)}</div>
              </div>
              <div>
                <div className="text-xs text-indigo-200">{diff > 0 ? 'Falta' : diff < 0 ? 'Sobra' : 'Pagos'}</div>
                <div className={cn('font-data text-2xl font-bold', diff !== 0 && 'text-red-300')}>
                  {diff === 0 ? 'Cuadran' : formatMoney(Math.abs(diff) / 100)}
                </div>
              </div>
              <div>
                <div className="text-xs text-indigo-200">Cambio</div>
                <div className="font-data text-3xl font-bold text-amber-400">{formatMoney(change / 100)}</div>
              </div>
            </div>
            {diff < 0 && (
              <Alert tone="warning">
                Los pagos pasan el total. Si el cliente da más efectivo, escríbelo en “Recibido”.
              </Alert>
            )}
            <Button
              className="w-full"

              disabled={!confirmed || diff !== 0}
              loading={pay.isPending}
              onClick={() => pay.mutate()}
            >
              Cobrar {formatMoney(order.total)}
            </Button>
          </fieldset>
        </CardBody>
      </Card>
    </div>
  )
}
