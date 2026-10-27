import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { addDaysKey, mondayOf, todayKey } from '../../lib/format'
import { PAYMENT_FREQUENCY_LABELS, type PaymentFrequency, type PayrollPeriod } from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toast-context'

/** Periodo sugerido: la semana pasada (lunes a domingo) o la quincena anterior. */
function suggested(frequency: PaymentFrequency) {
  const today = todayKey()
  if (frequency === 'weekly') {
    const start = addDaysKey(mondayOf(today), -7)
    return { start, end: addDaysKey(start, 6) }
  }
  const [y, m, d] = today.split('-').map(Number)
  if (d > 15) return { start: `${today.slice(0, 7)}-01`, end: `${today.slice(0, 7)}-15` }
  const prev = new Date(Date.UTC(y, m - 2, 1))
  const last = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
  const ym = prev.toISOString().slice(0, 7)
  return { start: `${ym}-16`, end: `${ym}-${last}` }
}

export function NewPeriodModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Nuevo periodo de nómina" onClose={onClose}>
      {open && <NewPeriodForm onClose={onClose} />}
    </Modal>
  )
}

function NewPeriodForm({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [frequency, setFrequency] = useState<PaymentFrequency>('weekly')
  const [range, setRange] = useState(() => suggested('weekly'))
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<PayrollPeriod>('/payroll/periods', {
          frequency,
          periodStart: range.start,
          periodEnd: range.end,
          name: name || undefined,
        })
      ).data,
    onSuccess: (p) => {
      toast.success('Periodo creado')
      queryClient.invalidateQueries({ queryKey: ['payroll'] })
      navigate(`/nomina/${p.id}`)
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <Select
        label="Periodicidad"
        value={frequency}
        onChange={(e) => {
          const f = e.target.value as PaymentFrequency
          setFrequency(f)
          setRange(suggested(f))
        }}
      >
        {(Object.keys(PAYMENT_FREQUENCY_LABELS) as PaymentFrequency[]).map((f) => (
          <option key={f} value={f}>
            {PAYMENT_FREQUENCY_LABELS[f]}
          </option>
        ))}
      </Select>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Inicio"
          type="date"
          value={range.start}
          onChange={(e) => setRange({ ...range, start: e.target.value })}
        />
        <Input
          label="Fin"
          type="date"
          value={range.end}
          onChange={(e) => setRange({ ...range, end: e.target.value })}
        />
      </div>
      <Input
        label="Nombre (opcional)"
        placeholder="Se genera con las fechas si lo dejas vacío"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <p className="text-xs text-fg-muted">
        Entran los empleados con salario {PAYMENT_FREQUENCY_LABELS[frequency].toLowerCase()} vigente al cierre del
        periodo.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          loading={create.isPending}
          disabled={!range.start || !range.end || range.end < range.start}
        >
          Crear periodo
        </Button>
      </div>
    </form>
  )
}
