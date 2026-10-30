import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { businessFormat, formatMoney } from '../../lib/format'
import type { CancelQuote } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { RefundFields, type RefundDraft } from './RefundFields'

/** Motivos de cancelación del pasajero (el reporte de la 7.3 los agrupa). */
const CANCEL_REASONS = [
  'El pasajero ya no viaja',
  'Cambio de planes',
  'Enfermedad',
  'Compró otro horario',
  'Error en la compra',
]
const OTHER = '__otro__'

const WHEN = businessFormat({ dateStyle: 'medium', timeStyle: 'short' })

/**
 * Cancelar boletos con la cotización de la política, o reembolsar el saldo de un recorrido que
 * canceló la empresa (`refundOnly`). Fuera de plazo solo un admin decide cuánto se devuelve.
 */
export function CancelModal({
  ticketIds,
  refundOnly,
  onClose,
}: {
  ticketIds: string[]
  refundOnly?: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState(refundOnly ? 'Reembolso por recorrido cancelado' : '')
  // Motivos fijos para que el reporte de cancelaciones agrupe bien; "Otro" pide texto libre
  const [motive, setMotive] = useState('')
  const finalReason = refundOnly || motive === OTHER ? reason : motive
  const [refund, setRefund] = useState<RefundDraft>({ method: 'cash', reference: '' })
  const [override, setOverride] = useState('')
  const quote = useQuery({
    queryKey: ['tickets', 'cancel-quote', ticketIds],
    queryFn: async () => (await api.post<CancelQuote>('/tickets/cancel/quote', { ticketIds })).data,
  })
  const q = quote.data
  const late = q && !q.allInWindow
  const amount = late ? Number(override || 0) : (q?.refund ?? 0)

  const cancel = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ refund: number }>('/tickets/cancel', {
          ticketIds,
          reason: finalReason,
          refund: amount > 0 ? { method: refund.method, reference: refund.reference || null } : undefined,
          overrideAmount: late ? Number(override || 0) : undefined,
        })
      ).data,
    onSuccess: (r) => {
      toast.success(r.refund ? `Listo; se devuelven ${formatMoney(r.refund)}` : 'Boletos cancelados')
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['cash'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open title={refundOnly ? 'Reembolsar saldo' : 'Cancelar boletos'} size="lg" onClose={onClose}>
      {quote.isLoading ? (
        <LoadingBlock text="Calculando…" />
      ) : quote.isError || !q ? (
        <Alert tone="danger">{apiErrorMessage(quote.error)}</Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            cancel.mutate()
          }}
        >
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {q.quotes.map((t) => (
              <li key={t.ticketId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="flex size-8 items-center justify-center rounded-md bg-primary-soft font-data font-bold text-primary-soft-fg">
                  {t.seatNumber}
                </span>
                <span className="min-w-40 flex-1">
                  {t.passengerName}
                  <span className="block font-data text-xs text-fg-muted">{t.ticketNumber}</span>
                </span>
                <span className="text-xs text-fg-muted">
                  {t.refundDue
                    ? 'Saldo de recorrido cancelado (100 %)'
                    : t.inWindow
                      ? `En plazo hasta ${WHEN.format(new Date(t.deadline))}`
                      : 'Fuera de plazo'}
                </span>
                <span className="w-24 text-right font-data">
                  {formatMoney(t.refund)}
                  <span className="block text-xs text-fg-muted">de {formatMoney(t.total)}</span>
                </span>
              </li>
            ))}
          </ul>

          {late &&
            (q.canOverride ? (
              <Alert tone="warning" title="Fuera de plazo">
                Pasó el límite de {q.policy.cancellationHours} h antes de la salida. Como administrador decides cuánto
                se devuelve (puede ser $0).
              </Alert>
            ) : (
              <Alert tone="danger" title="Fuera de plazo">
                Pasó el límite de {q.policy.cancellationHours} h antes de la salida. Solo un administrador puede
                cancelar estos boletos.
              </Alert>
            ))}
          {late && q.canOverride && (
            <Input
              label="Monto a devolver"
              type="number"
              min={0}
              step="0.01"
              required
              value={override}
              onChange={(e) => setOverride(e.target.value)}
            />
          )}

          <div className="rounded-xl bg-band p-4 text-white">
            <div className="text-xs text-indigo-200">Se devuelve</div>
            <div className="font-data text-3xl font-bold text-amber-400">{formatMoney(amount)}</div>
            {!refundOnly && !late && (
              <div className="text-xs text-indigo-200">
                {q.policy.refundPercent} % del importe (el cargo por servicio no se devuelve)
              </div>
            )}
          </div>
          {amount > 0 && <RefundFields value={refund} onChange={setRefund} />}
          {!refundOnly && (
            <Select label="Motivo" required value={motive} onChange={(e) => setMotive(e.target.value)}>
              <option value="">Selecciona…</option>
              {CANCEL_REASONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER}>Otro…</option>
            </Select>
          )}
          {(refundOnly || motive === OTHER) && (
            <Textarea
              label={refundOnly ? 'Motivo' : 'Describe el motivo'}
              required
              minLength={3}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Volver
            </Button>
            <Button
              type="submit"
              variant="danger"
              icon={Ban}
              disabled={late && !q.canOverride}
              loading={cancel.isPending}
            >
              {refundOnly ? 'Reembolsar' : 'Cancelar boletos'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
