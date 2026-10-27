import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { addDaysKey, dayLabel, formatMinutes, formatTime, staffFullName, todayKey } from '../../lib/format'
import { STAFF_ROLE_LABELS, STAFF_ROLES, type AttendanceDayRow, type StaffRole } from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { AttendanceStatusBadge } from '../../components/AttendanceStatusBadge'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
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
        <div>
          <Link to={`/personal/${r.staff.id}`} className="font-medium text-blue-700 hover:underline">
            {staffFullName(r.staff)}
          </Link>
          <div className="text-xs text-slate-500">{STAFF_ROLE_LABELS[r.staff.role]}</div>
        </div>
      ),
    },
    {
      header: 'Turno',
      cell: (r) =>
        !r.schedule ? (
          <span className="text-xs text-amber-700">Sin turno</span>
        ) : r.schedule.isRestDay ? (
          <span className="text-slate-400">Descanso</span>
        ) : (
          `${formatTime(r.schedule.startAt)}–${formatTime(r.schedule.endAt)}`
        ),
    },
    { header: 'Entrada', cell: (r) => formatTime(r.attendance?.checkInAt) || '—' },
    {
      header: 'Salida',
      cell: (r) =>
        r.attendance?.checkInAt && !r.attendance.checkOutAt ? (
          <span className="text-xs text-slate-500">En turno / sin salida</span>
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
          <span className="text-xs text-slate-400">Pendiente</span>
        ),
    },
    {
      header: 'Detalle',
      cell: (r) => {
        const a = r.attendance
        if (!a) return null
        return (
          <div className="text-xs text-slate-600">
            {a.lateMinutes > 0 && <div>Retardo: {formatMinutes(a.lateMinutes)}</div>}
            {a.workedMinutes > 0 && <div>Trabajó: {formatMinutes(a.workedMinutes)}</div>}
            {a.overtimeMinutes > 0 && (
              <div className="font-medium text-indigo-700">Extra: {formatMinutes(a.overtimeMinutes)}</div>
            )}
            {a.source === 'self' && <div className="text-slate-400">Autoregistro</div>}
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Asistencias</h1>
        {canClose && isPast && (
          <Button variant="secondary" loading={closeDay.isPending} onClick={() => closeDay.mutate()}>
            Cerrar día ({pending} sin registro)
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2">
          <Button variant="secondary" onClick={() => setDate(addDaysKey(date, -1))} aria-label="Día anterior">
            ←
          </Button>
          <Input
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={date >= todayKey()}
            onClick={() => setDate(addDaysKey(date, 1))}
            aria-label="Día siguiente"
          >
            →
          </Button>
          <Button variant="secondary" onClick={() => setDate(todayKey())}>
            Hoy
          </Button>
        </div>
        <div className="w-56">
          <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole | '')}>
            <option value="">Todos los puestos</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-sm text-slate-600">{dayLabel(date)}</span>
      </div>

      <Table
        columns={columns}
        rows={data}
        rowKey={(r) => r.staff.id}
        loading={isLoading}
        emptyMessage="Nadie tiene turno programado este día"
      />

      <AttendanceModal target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

export default AttendancePage
