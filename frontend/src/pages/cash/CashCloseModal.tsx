import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'
import type { CashDetail } from '../../lib/types'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5] as const
const cents = (n: number) => Math.round(n * 100)

/** Corte de caja: conteo por billetes y monedas (o total directo), diferencia en vivo y motivo. */
export function CashCloseModal({
  session,
  tolerance,
  onClose,
  onClosed,
}: {
  session: CashDetail
  tolerance: number
  onClose: () => void
  onClosed: (s: CashDetail) => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'breakdown' | 'total'>('breakdown')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [total, setTotal] = useState('')
  const [notes, setNotes] = useState('')
  const expected = session.live.totals.expectedCash
  const counted =
    mode === 'breakdown'
      ? DENOMINATIONS.reduce((a, d) => a + cents(d) * (Number(qty[String(d)]) || 0), 0) / 100
      : Number(total || 0)
  const diff = (cents(counted) - cents(expected)) / 100
  const needsReason = Math.abs(cents(diff)) > cents(tolerance)

  const close = useMutation({
    mutationFn: async () =>
      (
        await api.post<CashDetail>(`/cash/${session.id}/close`, {
          breakdown:
            mode === 'breakdown'
              ? Object.fromEntries(
                  Object.entries(qty)
                    .filter(([, v]) => Number(v) > 0)
                    .map(([k, v]) => [k, Number(v)]),
                )
              : undefined,
          countedCash: mode === 'total' ? Number(total) : undefined,
          notes: notes || null,
        })
      ).data,
    onSuccess: (s) => {
      toast.success('Corte guardado')
      queryClient.invalidateQueries({ queryKey: ['cash'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClosed(s)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Modal open title={`Corte de caja · ${session.user.fullName}`} size="lg" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          close.mutate()
        }}
      >
        <p className="text-sm text-fg-muted">
          Cuenta el efectivo de la caja. Tarjeta y transferencia no se cuentan: ya quedaron registradas con su
          referencia.
        </p>
        <div className="flex gap-2">
          <Button
            variant={mode === 'breakdown' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('breakdown')}
          >
            Por billetes y monedas
          </Button>
          <Button variant={mode === 'total' ? 'primary' : 'secondary'} size="sm" onClick={() => setMode('total')}>
            Solo el total
          </Button>
        </div>

        {mode === 'breakdown' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DENOMINATIONS.map((d) => {
              const n = Number(qty[String(d)]) || 0
              return (
                <div key={d} className="space-y-1">
                  <Input
                    label={d >= 20 ? `Billete $${d}` : `Moneda $${d}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={qty[String(d)] ?? ''}
                    onChange={(e) => setQty({ ...qty, [String(d)]: e.target.value })}
                  />
                  <div className="text-right font-data text-xs text-fg-muted">{n ? formatMoney(n * d) : ''}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <Input
            label="Efectivo contado"
            type="number"
            min={0}
            step="0.01"
            required
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        )}

        <div className="grid gap-3 rounded-xl bg-band p-4 text-white sm:grid-cols-3">
          <div>
            <div className="text-xs text-indigo-200">Esperado</div>
            <div className="font-data text-2xl font-bold">{formatMoney(expected)}</div>
          </div>
          <div>
            <div className="text-xs text-indigo-200">Contado</div>
            <div className="font-data text-2xl font-bold">{formatMoney(counted)}</div>
          </div>
          <div>
            <div className="text-xs text-indigo-200">
              {diff === 0 ? 'Diferencia' : diff < 0 ? 'Faltante' : 'Sobrante'}
            </div>
            <div className={cn('font-data text-3xl font-bold', diff === 0 ? 'text-emerald-300' : 'text-amber-400')}>
              {diff === 0 ? 'Cuadra' : formatMoney(Math.abs(diff))}
            </div>
          </div>
        </div>

        {needsReason && (
          <Alert tone="warning">La diferencia pasa la tolerancia ({formatMoney(tolerance)}); escribe el motivo.</Alert>
        )}
        <Textarea
          label={needsReason ? 'Motivo' : 'Notas'}
          rows={2}
          required={needsReason}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icon={Lock} loading={close.isPending}>
            Hacer corte
          </Button>
        </div>
      </form>
    </Modal>
  )
}
