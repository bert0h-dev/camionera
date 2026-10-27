import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Wallet } from 'lucide-react'
import { api, apiErrorMessage } from '../../lib/api'
import { formatDate, formatMoney, todayKey } from '../../lib/format'
import {
  PAYMENT_FREQUENCY_LABELS,
  PAYMENT_TYPE_LABELS,
  type Compensation,
  type PaymentFrequency,
  type PaymentType,
} from '../../lib/types'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { LoadingBlock } from '../../components/ui/Spinner'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'

/** Salario vigente e historial del empleado (solo RRHH y admin). */
export function StaffPayrollTab({ staffId, editable }: { staffId: string; editable: boolean }) {
  const [open, setOpen] = useState(false)
  const { data = [], isLoading } = useQuery({
    queryKey: ['staff', staffId, 'compensation'],
    queryFn: async () => (await api.get<Compensation[]>(`/staff/${staffId}/compensation`)).data,
  })
  const today = todayKey()
  const current = data.find((c) => c.effectiveFrom.slice(0, 10) <= today)
  const upcoming = data.filter((c) => c.effectiveFrom.slice(0, 10) > today)
  const daily =
    current && (current.paymentType === 'monthly' ? Number(current.baseSalary) / 30 : Number(current.baseSalary))

  const columns: Column<Compensation>[] = [
    {
      header: 'Desde',
      cell: (c) => <span className="font-data">{formatDate(c.effectiveFrom)}</span>,
    },
    { header: 'Tipo', cell: (c) => PAYMENT_TYPE_LABELS[c.paymentType] },
    {
      header: 'Importe',
      className: 'text-right',
      cell: (c) => <span className="font-data font-semibold">{formatMoney(c.baseSalary)}</span>,
    },
    { header: 'Pago', cell: (c) => PAYMENT_FREQUENCY_LABELS[c.paymentFrequency] },
    { header: 'Notas', cell: (c) => <span className="text-xs text-fg-muted">{c.notes}</span> },
    { header: 'Registró', cell: (c) => <span className="text-xs text-fg-muted">{c.createdBy.fullName}</span> },
  ]

  if (isLoading) return <LoadingBlock />

  return (
    <div className="space-y-6">
      {current ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="text-xs text-fg-muted">{PAYMENT_TYPE_LABELS[current.paymentType]}</div>
            <div className="font-data mt-1 text-2xl font-bold text-fg">{formatMoney(current.baseSalary)}</div>
            <div className="text-xs text-fg-muted">vigente desde {formatDate(current.effectiveFrom)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="text-xs text-fg-muted">Salario diario para la prenómina</div>
            <div className="font-data mt-1 text-2xl font-bold text-fg">{formatMoney(daily)}</div>
            <div className="text-xs text-fg-muted">hora normal: {formatMoney((daily ?? 0) / 8)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="text-xs text-fg-muted">Periodicidad de pago</div>
            <div className="font-data mt-1 text-2xl font-bold text-fg">
              {PAYMENT_FREQUENCY_LABELS[current.paymentFrequency]}
            </div>
            <div className="text-xs text-fg-muted">
              {upcoming.length ? `${upcoming.length} cambio(s) programado(s)` : 'sin cambios programados'}
            </div>
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Wallet}
            title="Sin salario capturado"
            description="Mientras no tenga salario, este empleado no entra a la prenómina."
            action={
              editable && (
                <Button icon={Plus} onClick={() => setOpen(true)}>
                  Registrar salario
                </Button>
              )
            }
          />
        </Card>
      )}

      {data.length > 0 && (
        <Card>
          <CardHeader
            title="Historial de salario"
            description="Para cada periodo se usa el registro vigente a su fecha de cierre"
            actions={
              editable && (
                <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
                  Registrar cambio
                </Button>
              )
            }
          />
          <CardBody className="p-0">
            <Table columns={columns} rows={data} rowKey={(c) => c.id} />
          </CardBody>
        </Card>
      )}

      <Modal open={open} title="Registrar salario" onClose={() => setOpen(false)}>
        {open && <CompensationForm staffId={staffId} last={current} onClose={() => setOpen(false)} />}
      </Modal>
    </div>
  )
}

function CompensationForm({
  staffId,
  last,
  onClose,
}: {
  staffId: string
  last: Compensation | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [paymentType, setPaymentType] = useState<PaymentType>(last?.paymentType ?? 'daily')
  const [baseSalary, setBaseSalary] = useState(last ? String(Number(last.baseSalary)) : '')
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>(last?.paymentFrequency ?? 'weekly')
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey())
  const [notes, setNotes] = useState('')

  const save = useMutation({
    mutationFn: () =>
      api.post(`/staff/${staffId}/compensation`, {
        paymentType,
        baseSalary: Number(baseSalary),
        paymentFrequency,
        effectiveFrom,
        notes,
      }),
    onSuccess: () => {
      toast.success('Salario registrado')
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'compensation'] })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Tipo de salario"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as PaymentType)}
        >
          {(Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map((t) => (
            <option key={t} value={t}>
              {PAYMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Input
          label={paymentType === 'daily' ? 'Salario diario' : 'Sueldo mensual'}
          required
          type="number"
          min={0.01}
          step={0.01}
          value={baseSalary}
          onChange={(e) => setBaseSalary(e.target.value)}
          hint={paymentType === 'monthly' ? 'Se divide entre 30 para el salario diario' : undefined}
        />
        <Select
          label="Periodicidad de pago"
          value={paymentFrequency}
          onChange={(e) => setPaymentFrequency(e.target.value as PaymentFrequency)}
        >
          {(Object.keys(PAYMENT_FREQUENCY_LABELS) as PaymentFrequency[]).map((f) => (
            <option key={f} value={f}>
              {PAYMENT_FREQUENCY_LABELS[f]}
            </option>
          ))}
        </Select>
        <Input
          label="Vigente desde"
          required
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
      </div>
      <Textarea
        label="Notas"
        rows={2}
        placeholder="Aumento anual, cambio de puesto…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!(Number(baseSalary) > 0) || !effectiveFrom}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
