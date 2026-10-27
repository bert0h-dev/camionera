import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { addDaysKey, dayLabel, formatMinutes, formatTime, staffFullName, todayKey } from '../../lib/format'
import { ChevronLeft, ChevronRight, ClipboardCheck, Lock } from 'lucide-react'
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type AttendanceDayRow,
  type AttendanceStatus,
  type StaffRole,
} from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { AttendanceStatusBadge } from '../../components/AttendanceStatusBadge'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toast-context'
import { AttendanceModal, type AttendanceTarget } from './AttendanceModal'

function AttendancePage() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const canRecord = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'supervisor'
  const canClose = user?.role === 'admin' || user?.role === 'hr'

  const [date, setDate] = useState(todayKey())
  const [role, setRole] = useState<StaffRole | ''>('')
  const [target, setTarget] = useState<AttendanceTarget | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['attendance', 'day', date, role],
    queryFn: async () =>
      (await api.get<AttendanceDayRow[]>('/attendance/day', { params: { date, role: role || undefined } })).data,
  })

  const closeDay = useMutation({
    mutationFn: async () =>
      (await api.post<{ absent: number; excused: number }>('/attendance/close-day', { date })).data,
    onSuccess: (r) => {
      toast.success(`Día cerrado: ${r.absent} falta(s), ${r.excused} justificada(s)`)
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const isPast = date < todayKey()
  const pending = data.filter((r) => r.schedule && !r.schedule.isRestDay && !r.attendance).length

  const columns: Column<AttendanceDayRow>[] = [
    {
      header: 'Empleado',
      cell: (r) => (
        <Link to={`/personal/${r.staff.id}`} className="flex items-center gap-2.5">
          <Avatar name={staffFullName(r.staff)} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg hover:text-link">{staffFullName(r.staff)}</span>
            <span className="block text-xs text-fg-muted">{STAFF_ROLE_LABELS[r.staff.role]}</span>
          </span>
        </Link>
      ),
    },
    {
      header: 'Turno',
      cell: (r) =>
        !r.schedule ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">Sin turno</span>
        ) : r.schedule.isRestDay ? (
          <span className="text-fg-subtle">Descanso</span>
        ) : (
          `${formatTime(r.schedule.startAt)}–${formatTime(r.schedule.endAt)}`
        ),
    },
    { header: 'Entrada', cell: (r) => formatTime(r.attendance?.checkInAt) || '—' },
    {
      header: 'Salida',
      cell: (r) =>
        r.attendance?.checkInAt && !r.attendance.checkOutAt ? (
          <span className="text-xs text-fg-muted">En turno / sin salida</span>
        ) : (
          formatTime(r.attendance?.checkOutAt) || '—'
        ),
    },
    {
      header: 'Estado',
      cell: (r) =>
        r.attendance ? (
          <AttendanceStatusBadge status={r.attendance.status} />
        ) : r.schedule?.isRestDay ? null : (
          <span className="text-xs text-fg-subtle">Pendiente</span>
        ),
    },
    {
      header: 'Detalle',
      cell: (r) => {
        const a = r.attendance
        if (!a) return null
        return (
          <div className="text-xs text-fg-muted">
            {a.lateMinutes > 0 && <div>Retardo: {formatMinutes(a.lateMinutes)}</div>}
            {a.workedMinutes > 0 && <div>Trabajó: {formatMinutes(a.workedMinutes)}</div>}
            {a.overtimeMinutes > 0 && (
              <div className="font-medium text-indigo-700 dark:text-indigo-300">
                Extra: {formatMinutes(a.overtimeMinutes)}
              </div>
            )}
            {a.source === 'self' && <div className="text-fg-subtle">Autoregistro</div>}
          </div>
        )
      },
    },
    {
      header: '',
      className: 'text-right',
      cell: (r) =>
        canRecord &&
        r.staff.status !== 'inactive' &&
        date <= todayKey() &&
        !r.schedule?.isRestDay && (
          <Button
            variant="ghost"
            onClick={() =>
              setTarget({ staffId: r.staff.id, staffName: staffFullName(r.staff), date, attendance: r.attendance })
            }
          >
            {r.attendance ? 'Corregir' : 'Registrar'}
          </Button>
        ),
    },
  ]

  const count = (s: AttendanceStatus) => data.filter((r) => r.attendance?.status === s).length
  const summary = [
    { label: 'Con turno', value: data.filter((r) => r.schedule && !r.schedule.isRestDay).length, dot: 'bg-indigo-500' },
    { label: 'Asistieron', value: count('present'), dot: 'bg-emerald-500' },
    { label: 'Retardos', value: count('late'), dot: 'bg-amber-400' },
    { label: 'Faltas', value: count('absent'), dot: 'bg-red-500' },
    { label: 'Sin registro', value: pending, dot: 'bg-slate-400' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistencias"
        description="Entradas y salidas del día contra el turno programado"
        actions={
          canClose &&
          isPast && (
            <Button variant="glass" icon={Lock} loading={closeDay.isPending} onClick={() => closeDay.mutate()}>
              Cerrar día ({pending} sin registro)
            </Button>
          )
        }
      />

      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            icon={ChevronLeft}
            onClick={() => setDate(addDaysKey(date, -1))}
            aria-label="Día anterior"
          />
          <Input
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-40"
          />
          <Button
            variant="secondary"
            size="icon"
            icon={ChevronRight}
            disabled={date >= todayKey()}
            onClick={() => setDate(addDaysKey(date, 1))}
            aria-label="Día siguiente"
          />
          <Button variant="secondary" disabled={date === todayKey()} onClick={() => setDate(todayKey())}>
            Hoy
          </Button>
          <span className="ml-2 text-sm font-semibold text-fg">{dayLabel(date)}</span>
        </div>
        <div className="w-full sm:w-52">
          <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole | '')}>
            <option value="">Todos los puestos</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      {!isLoading && data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm shadow-card"
            >
              <span className={`size-2 rounded-full ${s.dot}`} />
              <span className="text-fg-muted">{s.label}</span>
              <span className="tabular font-semibold text-fg">{s.value}</span>
            </span>
          ))}
        </div>
      )}

      <Table
        columns={columns}
        rows={data}
        rowKey={(r) => r.staff.id}
        loading={isLoading}
        emptyIcon={ClipboardCheck}
        emptyMessage="Nadie tiene turno programado este día"
        emptyDescription="Programa turnos en la sección Turnos para controlar la asistencia."
      />

      <AttendanceModal target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

export default AttendancePage
