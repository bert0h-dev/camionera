import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { dayLabel, formatMinutes, formatTime, todayKey } from '../../lib/format'
import type { Attendance } from '../../lib/types'
import { AttendanceStatusBadge } from '../../components/AttendanceStatusBadge'
import { Button } from '../../components/ui/Button'
import { Table, type Column } from '../../components/ui/Table'

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** Primer y último día de un mes 'AAAA-MM'. */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

function Stat({ label, value, tone = 'text-fg' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

export function StaffAttendanceTab({ staffId }: { staffId: string }) {
  const [month, setMonth] = useState(todayKey().slice(0, 7))
  const { from, to } = monthRange(month)

  const { data = [], isLoading } = useQuery({
    queryKey: ['attendance', 'staff', staffId, month],
    queryFn: async () => (await api.get<Attendance[]>('/attendance', { params: { from, to, staffId } })).data,
  })

  const count = (s: Attendance['status']) => data.filter((a) => a.status === s).length
  const sum = (k: 'lateMinutes' | 'workedMinutes' | 'overtimeMinutes') => data.reduce((t, a) => t + a[k], 0)
  const [y, m] = month.split('-').map(Number)

  const columns: Column<Attendance>[] = [
    { header: 'Día', cell: (a) => dayLabel(a.attendanceDate.slice(0, 10)) },
    { header: 'Entrada', cell: (a) => formatTime(a.checkInAt) || '—' },
    { header: 'Salida', cell: (a) => formatTime(a.checkOutAt) || '—' },
    { header: 'Estado', cell: (a) => <AttendanceStatusBadge status={a.status} /> },
    { header: 'Retardo', cell: (a) => (a.lateMinutes ? formatMinutes(a.lateMinutes) : '—') },
    { header: 'Trabajado', cell: (a) => (a.workedMinutes ? formatMinutes(a.workedMinutes) : '—') },
    { header: 'Extra', cell: (a) => (a.overtimeMinutes ? formatMinutes(a.overtimeMinutes) : '—') },
    { header: 'Notas', cell: (a) => <span className="text-xs whitespace-pre-line text-fg-muted">{a.notes}</span> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">
          ←
        </Button>
        <span className="w-40 text-center text-sm font-medium text-fg">
          {MONTHS[m - 1]} {y}
        </span>
        <Button
          variant="secondary"
          disabled={month >= todayKey().slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Mes siguiente"
        >
          →
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Asistencias" value={count('present') + count('late')} />
        <Stat label="Retardos" value={count('late')} tone="text-amber-700 dark:text-amber-300" />
        <Stat label="Medios días" value={count('half_day')} tone="text-orange-700 dark:text-orange-300" />
        <Stat label="Faltas" value={count('absent')} tone="text-red-700 dark:text-red-300" />
        <Stat label="Justificadas" value={count('excused')} tone="text-sky-700 dark:text-sky-300" />
        <Stat
          label="Horas extra"
          value={formatMinutes(sum('overtimeMinutes'))}
          tone="text-indigo-700 dark:text-indigo-300"
        />
      </div>

      <Table
        columns={columns}
        rows={data}
        rowKey={(a) => a.id}
        loading={isLoading}
        emptyMessage="Sin registros este mes"
      />
    </div>
  )
}
