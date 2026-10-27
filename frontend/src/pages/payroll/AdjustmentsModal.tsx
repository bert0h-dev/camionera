import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatMoney, staffFullName } from '../../lib/format'
import type { AdjustmentType, PayrollEntry } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

interface Props {
  entry: PayrollEntry | null
  editable: boolean
  onClose: () => void
}

/** Desglose de una línea de la prenómina con sus ajustes manuales. */
export function AdjustmentsModal({ entry, editable, onClose }: Props) {
  return (
    <Modal
      open={!!entry}
      size="lg"
      title={entry ? staffFullName(entry.staff) : ''}
      description={entry ? `${entry.staff.employeeNumber} · desglose de la línea` : undefined}
      onClose={onClose}
    >
      {entry && <Breakdown key={entry.id} entry={entry} editable={editable} />}
    </Modal>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={cn('flex justify-between gap-4 py-1.5 text-sm', strong && 'font-semibold')}>
      <span className="text-fg-muted">{label}</span>
      <span className={cn('font-data text-fg', tone)}>{value}</span>
    </div>
  )
}

function Breakdown({ entry, editable }: { entry: PayrollEntry; editable: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [type, setType] = useState<AdjustmentType>('perception')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payroll'] })

  const add = useMutation({
    mutationFn: () => api.post(`/payroll/entries/${entry.id}/adjustments`, { type, concept, amount: Number(amount) }),
    onSuccess: () => {
      toast.success('Ajuste agregado')
      setConcept('')
      setAmount('')
      invalidate()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/payroll/adjustments/${id}`),
    onSuccess: invalidate,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const hours = (h: string) => `${Number(h)} h`

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">Cálculo desde asistencias</h3>
        <div className="divide-y divide-border rounded-xl border border-border px-4 py-2">
          <Row label="Salario diario" value={formatMoney(entry.dailySalary)} />
          <Row label="Días pagables" value={`${Number(entry.payableDays)} de ${entry.periodDays}`} />
          <Row
            label="Faltas"
            value={String(entry.absences)}
            tone={entry.absences ? 'text-red-600 dark:text-red-400' : ''}
          />
          <Row label="Medios días" value={String(entry.halfDays)} />
          <Row
            label="Retardos"
            value={entry.lateAbsences ? `${entry.lates} (−${entry.lateAbsences} día)` : String(entry.lates)}
            tone={entry.lates ? 'text-amber-600 dark:text-amber-400' : ''}
          />
          <Row
            label="Extras dobles / triples"
            value={`${hours(entry.overtimeDouble)} / ${hours(entry.overtimeTriple)}`}
          />
          <Row label="Domingos trabajados" value={String(entry.sundaysWorked)} />
        </div>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border px-4 py-2">
          <Row label="Sueldo" value={formatMoney(entry.salaryAmount)} />
          <Row label="Horas extra" value={formatMoney(entry.overtimeAmount)} />
          <Row label="Prima dominical" value={formatMoney(entry.sundayPremium)} />
          <Row label="Total percepciones" value={formatMoney(entry.totalPerceptions)} strong />
          <Row label="Deducciones" value={`− ${formatMoney(entry.totalDeductions)}`} />
          <Row label="Neto a pagar" value={formatMoney(entry.netPay)} strong tone="text-primary-soft-fg text-base" />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">Ajustes manuales</h3>
        {entry.adjustments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-fg-muted">
            Sin ajustes. Agrega bonos, préstamos o descuentos.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {entry.adjustments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full',
                    a.type === 'perception'
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
                  )}
                >
                  {a.type === 'perception' ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
                </span>
                <span className="flex-1 text-fg">{a.concept}</span>
                <span className="font-data text-fg">{formatMoney(a.amount)}</span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={Trash2}
                    aria-label={`Quitar ${a.concept}`}
                    loading={remove.isPending && remove.variables === a.id}
                    onClick={() => remove.mutate(a.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form
            className="mt-4 space-y-3 rounded-xl bg-surface-sunken p-4"
            onSubmit={(e) => {
              e.preventDefault()
              add.mutate()
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as AdjustmentType)}>
                <option value="perception">Percepción (+)</option>
                <option value="deduction">Deducción (−)</option>
              </Select>
              <Input
                label="Importe"
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Input
              label="Concepto"
              placeholder="Bono de puntualidad, préstamo, uniforme…"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                icon={Plus}
                loading={add.isPending}
                disabled={concept.trim().length < 3 || !(Number(amount) > 0)}
              >
                Agregar ajuste
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
