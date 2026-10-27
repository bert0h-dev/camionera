import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../../lib/api'
import { addDaysKey, dayLabel, formatMinutes, formatTime, staffFullName, todayKey } from '../../lib/format'
import { ClipboardCheck, Lock } from 'lucide-react'
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
import { BandStepper } from '../../components/ui/BandStepper'
import { Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { HeroStat } from '../../components/ui/HeroStat'
import { LiveClock } from '../../components/ui/LiveClock'
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
  // Instante de referencia para atrasos; se renueva al cambiar de día o al recargar
  const [nowMs] = useState(() => Date.now())

  const {
    data = [],
    isLoading,
    isFetching,
  } = useQuery({
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
          <span className="font-data">
            {formatTime(r.schedule.startAt)}–{formatTime(r.schedule.endAt)}
          </span>
        ),
    },
    {
      header: 'Entrada',
      cell: (r) => <span className="font-data">{formatTime(r.attendance?.checkInAt) || '—'}</span>,
    },
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
        if (!a) {
          if (!isMissing(r)) return null
          const delay = Math.max(0, Math.round((nowMs - new Date(r.schedule!.startAt!).getTime()) / 60_000))
          return (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {isPast ? 'Sin registro' : `${formatMinutes(delay)} de atraso`}
            </span>
          )
        }
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
            variant={r.attendance ? 'ghost' : isMissing(r) ? 'primary' : 'secondary'}
            size="sm"
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
  const scheduled = data.filter((r) => r.schedule && !r.schedule.isRestDay)
  /** Debió entrar y no hay registro (hoy: su turno ya empezó; días pasados: cualquiera sin registro). */
  const isMissing = (r: AttendanceDayRow) =>
    !!r.schedule &&
    !r.schedule.isRestDay &&
    !r.attendance &&
    (isPast || new Date(r.schedule.startAt!).getTime() < nowMs)
  const missing = data.filter(isMissing).length
  const overtime = data.reduce((t, r) => t + (r.attendance?.overtimeMinutes ?? 0), 0)
  // Primero quien debió entrar y no ha registrado
  const rows = [...data].sort((a, b) => Number(isMissing(b)) - Number(isMissing(a)))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistencias"
        description="Entradas y salidas del día contra el turno programado"
        meta={
          <BandStepper
            label={date === todayKey() ? `${dayLabel(date)} · hoy` : dayLabel(date)}
            onPrev={() => setDate(addDaysKey(date, -1))}
            onNext={() => setDate(addDaysKey(date, 1))}
            nextDisabled={date >= todayKey()}
            prevLabel="Día anterior"
            nextLabel="Día siguiente"
            todayLabel="Hoy"
            onToday={() => setDate(todayKey())}
            isToday={date === todayKey()}
          />
        }
        aside={!isPast && <LiveClock />}
        actions={
          canClose &&
          isPast && (
            <Button variant="glass" icon={Lock} loading={closeDay.isPending} onClick={() => closeDay.mutate()}>
              Cerrar día ({pending} sin registro)
            </Button>
          )
        }
        statsColumns={5}
        stats={
          <>
            <HeroStat label="Con turno" value={scheduled.length} loading={isLoading} hint="sin contar descansos" />
            <HeroStat
              label="Asistieron"
              value={count('present')}
              tone="success"
              loading={isLoading}
              hint={`${count('half_day')} medio(s) día`}
            />
            <HeroStat
              label="Retardos"
              value={count('late')}
              tone={count('late') ? 'warning' : 'neutral'}
              loading={isLoading}
              hint={`${count('excused')} justificada(s)`}
            />
            <HeroStat
              label={isPast ? 'Sin registro' : 'Sin entrada'}
              value={missing + count('absent')}
              tone={missing + count('absent') ? 'danger' : 'neutral'}
              loading={isLoading}
              hint={`${count('absent')} falta(s) registrada(s)`}
            />
            <HeroStat
              label="Horas extra"
              value={formatMinutes(overtime)}
              tone="primary"
              loading={isLoading}
              hint="acumuladas en el día"
            />
          </>
        }
      />

      <FilterBar className="justify-end">
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

      <Table
        columns={columns}
        rows={rows}
        rowClassName={(r) => isMissing(r) && 'bg-red-50/70 dark:bg-red-500/10'}
        rowKey={(r) => r.staff.id}
        loading={isLoading}
        refreshing={isFetching && !isLoading}
        emptyIcon={ClipboardCheck}
        emptyMessage="Nadie tiene turno programado este día"
        emptyDescription="Programa turnos en la sección Turnos para controlar la asistencia."
      />

      <AttendanceModal target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

export default AttendancePage
