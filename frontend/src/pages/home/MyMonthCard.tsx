import { CalendarCheck } from 'lucide-react'
import { formatMinutes } from '../../lib/format'
import type { DashboardSummary } from '../../lib/types'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Resumen de asistencia del mes en curso del propio empleado. */
export function MyMonthCard({ me }: { me: NonNullable<DashboardSummary['me']> }) {
  const a = me.attendance
  const items = [
    { label: 'Asistencias', value: a.present + a.late, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Retardos', value: a.late, tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'Faltas', value: a.absent, tone: 'text-red-600 dark:text-red-400' },
    { label: 'Justificadas', value: a.excused, tone: 'text-sky-600 dark:text-sky-400' },
  ]
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-fg-subtle" />
            Mi asistencia de {MONTHS[Number(me.month.slice(5)) - 1]}
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((i) => (
            <div key={i.label}>
              <div className="text-xs text-fg-muted">{i.label}</div>
              <div className={`tabular text-2xl font-semibold ${i.tone}`}>{i.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-4 text-sm text-fg-muted">
          <span>
            Tiempo de retardo: <span className="font-medium text-fg">{formatMinutes(me.lateMinutes)}</span>
          </span>
          <span>
            Horas extra: <span className="font-medium text-fg">{formatMinutes(me.overtimeMinutes)}</span>
          </span>
        </div>
      </CardBody>
    </Card>
  )
}
