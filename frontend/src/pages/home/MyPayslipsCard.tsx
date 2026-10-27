import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Receipt } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatDate, formatMoney } from '../../lib/format'
import type { MyPayslip } from '../../lib/types'
import { PayrollStatusBadge } from '../../components/PayrollStatusBadge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'

/** Recibos de prenómina del propio empleado (periodos cerrados o pagados). */
export function MyPayslipsCard() {
  const [open, setOpen] = useState<MyPayslip | null>(null)
  const { data, error } = useQuery({
    queryKey: ['payroll', 'me'],
    queryFn: async () => (await api.get<MyPayslip[]>('/payroll/me')).data,
    retry: false,
  })
  if ((error as AxiosError | null)?.response?.status === 404) return null
  if (!data || data.length === 0) return null
  const last = data[0]

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Receipt className="size-4 text-fg-subtle" />
            Mis recibos
          </span>
        }
      />
      <CardBody className="space-y-4">
        <div className="rounded-xl bg-band p-4 text-white">
          <div className="text-xs text-indigo-200">{last.period.name}</div>
          <div className="font-data mt-1 text-3xl font-bold text-amber-400">{formatMoney(last.netPay)}</div>
          <div className="mt-1 text-xs text-indigo-200">neto del último periodo</div>
        </div>
        <ul className="divide-y divide-border text-sm">
          {data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-data text-xs text-fg-muted">
                {formatDate(p.period.periodStart)} – {formatDate(p.period.periodEnd)}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-data font-semibold text-fg">{formatMoney(p.netPay)}</span>
                <PayrollStatusBadge status={p.period.status} />
                <Button variant="ghost" size="sm" onClick={() => setOpen(p)}>
                  Ver
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
      <Modal open={!!open} title="Recibo de prenómina" description={open?.period.name} onClose={() => setOpen(null)}>
        {open && <Payslip slip={open} />}
      </Modal>
    </Card>
  )
}

function Line({ label, value, strong, minus }: { label: string; value: string; strong?: boolean; minus?: boolean }) {
  return (
    <div className={cn('flex justify-between py-1.5 text-sm', strong && 'font-semibold')}>
      <span className="text-fg-muted">{label}</span>
      <span className={cn('font-data', minus ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
        {minus && '− '}
        {value}
      </span>
    </div>
  )
}

function Payslip({ slip: s }: { slip: MyPayslip }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-surface-sunken p-3">
          <div className="text-xs text-fg-muted">Días pagados</div>
          <div className="font-data text-lg font-bold text-fg">
            {Number(s.payableDays)}/{s.periodDays}
          </div>
        </div>
        <div className="rounded-xl bg-surface-sunken p-3">
          <div className="text-xs text-fg-muted">Faltas</div>
          <div className="font-data text-lg font-bold text-fg">{s.absences + s.lateAbsences}</div>
        </div>
        <div className="rounded-xl bg-surface-sunken p-3">
          <div className="text-xs text-fg-muted">Retardos</div>
          <div className="font-data text-lg font-bold text-fg">{s.lates}</div>
        </div>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border px-4 py-2">
        <Line label="Sueldo" value={formatMoney(s.salaryAmount)} />
        {Number(s.overtimeAmount) > 0 && <Line label="Horas extra" value={formatMoney(s.overtimeAmount)} />}
        {Number(s.sundayPremium) > 0 && <Line label="Prima dominical" value={formatMoney(s.sundayPremium)} />}
        {s.adjustments
          .filter((a) => a.type === 'perception')
          .map((a, i) => (
            <Line key={`p${i}`} label={a.concept} value={formatMoney(a.amount)} />
          ))}
        {s.adjustments
          .filter((a) => a.type === 'deduction')
          .map((a, i) => (
            <Line key={`d${i}`} label={a.concept} value={formatMoney(a.amount)} minus />
          ))}
        <Line label="Neto" value={formatMoney(s.netPay)} strong />
      </div>
      <p className="text-xs text-fg-muted">
        Prenómina informativa. El recibo fiscal (CFDI) lo emite el área de nómina.
      </p>
    </div>
  )
}
