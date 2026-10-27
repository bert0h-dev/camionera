import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, LayoutTemplate, Plus, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { addDaysKey, dayLabel, formatHours, mondayOf, staffFullName, todayKey } from '../../lib/format'
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type Paginated,
  type Schedule,
  type Staff,
  type StaffRole,
} from '../../lib/types'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Field'
import { FilterBar } from '../../components/ui/FilterBar'
import { BandStepper } from '../../components/ui/BandStepper'
import { HeroStat } from '../../components/ui/HeroStat'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { BulkScheduleModal } from './BulkScheduleModal'
import { ScheduleModal, type ScheduleTarget } from './ScheduleModal'
import { ShiftChip } from './ShiftChip'
import { TemplatesModal } from './TemplatesModal'
import { useCanSchedule, useSchedules } from './useScheduleData'

const MAX_WEEKLY_KEY = 'schedules.max_weekly_hours'
const DEFAULT_MAX_WEEKLY = 48

function SchedulesPage() {
  const { user } = useAuth()
  const canSchedule = useCanSchedule()
  const canManageTemplates = user?.role === 'admin' || user?.role === 'hr'

  const [monday, setMonday] = useState(() => mondayOf(todayKey()))
  const [role, setRole] = useState<StaffRole | ''>('driver')
  const [target, setTarget] = useState<ScheduleTarget | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i)), [monday])
  const sunday = days[6]
  const today = todayKey()
  const isCurrentWeek = monday === mondayOf(today)

  const staffQuery = useQuery({
    queryKey: ['staff', 'calendar', role],
    queryFn: async () =>
      (
        await api.get<Paginated<Staff>>('/staff', {
          params: { activeOnly: true, role: role || undefined, limit: 100 },
        })
      ).data.data,
  })
  const schedulesQuery = useSchedules({ from: monday, to: sunday, role: role || undefined })

  // El máximo semanal solo lo puede leer el admin; los demás ven el valor por defecto
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<{ key: string; value: number }[]>('/settings')).data,
    enabled: user?.role === 'admin',
  })
  const maxWeekly = settingsQuery.data?.find((s) => s.key === MAX_WEEKLY_KEY)?.value ?? DEFAULT_MAX_WEEKLY

  const byStaffDay = useMemo(() => {
    const map = new Map<string, Schedule>()
    for (const s of schedulesQuery.data ?? []) map.set(`${s.staffId}|${s.scheduleDate.slice(0, 10)}`, s)
    return map
  }, [schedulesQuery.data])

  const staff = staffQuery.data ?? []
  const loading = staffQuery.isLoading || schedulesQuery.isLoading

  const weekHours = (staffId: string) =>
    days.reduce((sum, d) => sum + (byStaffDay.get(`${staffId}|${d}`)?.workedHours ?? 0), 0)

  // Cifras de la banda, calculadas con lo que ya está en pantalla
  const week = { shifts: 0, hours: 0, overMax: 0, unassigned: 0 }
  for (const s of staff) {
    const own = days.map((d) => byStaffDay.get(`${s.id}|${d}`)).filter((x) => !!x)
    const hours = own.reduce((t, x) => t + x.workedHours, 0)
    week.shifts += own.filter((x) => !x.isRestDay).length
    week.hours += hours
    if (hours > maxWeekly) week.overMax++
    if (own.length === 0) week.unassigned++
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Turnos"
        description="Programación semanal del personal; haz clic en un día para asignar o cambiar el turno"
        meta={
          <BandStepper
            label={`${dayLabel(monday)} – ${dayLabel(sunday)}`}
            onPrev={() => setMonday(addDaysKey(monday, -7))}
            onNext={() => setMonday(addDaysKey(monday, 7))}
            prevLabel="Semana anterior"
            nextLabel="Semana siguiente"
            todayLabel="Esta semana"
            onToday={() => setMonday(mondayOf(today))}
            isToday={isCurrentWeek}
          />
        }
        actions={
          <>
            {canManageTemplates && (
              <Button variant="glass" icon={LayoutTemplate} onClick={() => setTemplatesOpen(true)}>
                Plantillas
              </Button>
            )}
            {canSchedule && (
              <Button variant="accent" icon={CalendarClock} onClick={() => setBulkOpen(true)}>
                Asignar en bloque
              </Button>
            )}
          </>
        }
        stats={
          <>
            <HeroStat label="Turnos programados" value={week.shifts} loading={loading} hint="sin contar descansos" />
            <HeroStat
              label="Horas programadas"
              value={`${Math.round(week.hours).toLocaleString('es-MX')} h`}
              loading={loading}
              hint={`${staff.length} empleado(s) en la vista`}
            />
            <HeroStat
              label="Sobre el máximo semanal"
              value={week.overMax}
              tone={week.overMax ? 'danger' : 'neutral'}
              loading={loading}
              hint={`máximo ${maxWeekly} h por semana`}
            />
            <HeroStat
              label="Sin turno asignado"
              value={week.unassigned}
              tone={week.unassigned ? 'warning' : 'neutral'}
              loading={loading}
              hint="nada programado esta semana"
            />
          </>
        }
      />

      <FilterBar className="justify-between">
        <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-full bg-sky-500" />
            Matutino
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-full bg-amber-500" />
            Vespertino
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-full bg-indigo-500" />
            Nocturno
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-dashed border-border-strong" />
            Descanso
          </span>
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-sm">
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                <th className="sticky left-0 z-10 w-56 bg-surface-muted px-4 py-3 text-left text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  Empleado
                </th>
                {days.map((d) => {
                  const [weekday, date] = dayLabel(d).split(' ')
                  const isToday = d === today
                  return (
                    <th key={d} className="px-2 py-2 text-center">
                      <div
                        className={cn(
                          'text-xs font-semibold uppercase',
                          isToday ? 'text-primary-soft-fg' : 'text-fg-muted',
                        )}
                      >
                        {weekday}
                      </div>
                      <div
                        className={cn(
                          'tabular mx-auto mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                          isToday ? 'bg-primary text-primary-fg' : 'text-fg',
                        )}
                      >
                        {date.slice(0, 2)}
                      </div>
                    </th>
                  )
                })}
                <th className="w-24 px-4 py-3 text-right text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  Horas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading
                ? Array.from({ length: 4 }, (_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <Skeleton className="h-8 w-40" />
                      </td>
                      {days.map((d) => (
                        <td key={d} className="p-1.5">
                          <Skeleton className="h-11 w-full" />
                        </td>
                      ))}
                      <td />
                    </tr>
                  ))
                : staff.map((s) => {
                    const hours = weekHours(s.id)
                    const over = hours > maxWeekly
                    return (
                      <tr key={s.id} className="group">
                        <td className="sticky left-0 z-10 bg-surface px-4 py-2 align-middle group-hover:bg-surface-muted">
                          <Link to={`/personal/${s.id}`} className="flex items-center gap-2.5">
                            <Avatar name={staffFullName(s)} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-fg hover:text-link">
                                {staffFullName(s)}
                              </span>
                              <span className="block text-xs text-fg-muted">{STAFF_ROLE_LABELS[s.role]}</span>
                            </span>
                          </Link>
                        </td>
                        {days.map((d) => {
                          const schedule = byStaffDay.get(`${s.id}|${d}`) ?? null
                          const open = () =>
                            setTarget({ staffId: s.id, staffName: staffFullName(s), date: d, schedule })
                          return (
                            <td key={d} className={cn('p-1.5 align-top', d === today && 'bg-primary-soft/40')}>
                              {canSchedule ? (
                                <button
                                  type="button"
                                  onClick={open}
                                  aria-label={`Turno de ${staffFullName(s)} el ${dayLabel(d)}`}
                                  className="group/cell block min-h-12 w-full rounded-lg text-left transition-shadow hover:ring-2 hover:ring-ring"
                                >
                                  {schedule ? (
                                    <ShiftChip schedule={schedule} />
                                  ) : (
                                    <span className="flex min-h-12 items-center justify-center rounded-lg border border-dashed border-transparent text-fg-subtle transition-colors group-hover/cell:border-border-strong">
                                      <Plus className="size-4 opacity-0 transition-opacity group-hover/cell:opacity-100" />
                                    </span>
                                  )}
                                </button>
                              ) : (
                                schedule && <ShiftChip schedule={schedule} />
                              )}
                            </td>
                          )
                        })}
                        <td className="px-4 py-2 text-right align-middle">
                          <span
                            className={cn('tabular font-semibold', over ? 'text-red-600 dark:text-red-400' : 'text-fg')}
                            title={over ? `Supera el máximo semanal de ${maxWeekly} h` : undefined}
                          >
                            {formatHours(hours)}
                          </span>
                          <div className="mt-1 h-1 rounded-full bg-surface-sunken">
                            <div
                              className={cn('h-1 rounded-full', over ? 'bg-red-500' : 'bg-primary')}
                              style={{ width: `${Math.min(100, (hours / maxWeekly) * 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
        {!loading && staff.length === 0 && (
          <EmptyState
            icon={Users}
            title="No hay empleados activos con ese puesto"
            description="Cambia el filtro de puesto o registra personal en Empleados."
          />
        )}
      </div>

      <ScheduleModal target={target} onClose={() => setTarget(null)} />
      <BulkScheduleModal
        open={bulkOpen}
        staff={staff}
        defaultFrom={monday}
        defaultTo={sunday}
        onClose={() => setBulkOpen(false)}
      />
      <TemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
    </div>
  )
}

export default SchedulesPage
