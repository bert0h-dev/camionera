import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
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
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Turnos</h1>
        <div className="flex flex-wrap gap-2">
          {canManageTemplates && (
            <Button variant="secondary" onClick={() => setTemplatesOpen(true)}>
              Plantillas
            </Button>
          )}
          {canSchedule && <Button onClick={() => setBulkOpen(true)}>Asignar en bloque</Button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setMonday(addDaysKey(monday, -7))} aria-label="Semana anterior">
            ←
          </Button>
          <Button variant="secondary" onClick={() => setMonday(mondayOf(todayKey()))}>
            Hoy
          </Button>
          <Button variant="secondary" onClick={() => setMonday(addDaysKey(monday, 7))} aria-label="Semana siguiente">
            →
          </Button>
          <span className="text-sm font-medium text-slate-700">
            {dayLabel(monday)} – {dayLabel(sunday)}
          </span>
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
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[900px] w-full table-fixed text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-52 px-3 py-2 text-left font-semibold text-slate-600">Empleado</th>
              {days.map((d) => (
                <th
                  key={d}
                  className={`px-2 py-2 text-left font-semibold ${d === today ? 'text-blue-700' : 'text-slate-600'}`}
                >
                  {dayLabel(d)}
                </th>
              ))}
              <th className="w-20 px-2 py-2 text-right font-semibold text-slate-600">Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No hay empleados activos con ese puesto
                </td>
              </tr>
            ) : (
              staff.map((s) => {
                const hours = weekHours(s.id)
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-2 align-top">
                      <Link to={`/personal/${s.id}`} className="font-medium text-blue-700 hover:underline">
                        {staffFullName(s)}
                      </Link>
                      <div className="text-xs text-slate-500">{STAFF_ROLE_LABELS[s.role]}</div>
                    </td>
                    {days.map((d) => {
                      const schedule = byStaffDay.get(`${s.id}|${d}`) ?? null
                      const open = () => setTarget({ staffId: s.id, staffName: staffFullName(s), date: d, schedule })
                      return (
                        <td key={d} className={`px-1 py-1 align-top ${d === today ? 'bg-blue-50/50' : ''}`}>
                          {canSchedule ? (
                            <button
                              type="button"
                              onClick={open}
                              className="block min-h-11 w-full rounded text-left hover:ring-2 hover:ring-blue-200"
                            >
                              {schedule ? (
                                <ShiftChip schedule={schedule} />
                              ) : (
                                <span className="block px-2 py-1 text-xs text-slate-300">+</span>
                              )}
                            </button>
                          ) : (
                            schedule && <ShiftChip schedule={schedule} />
                          )}
                        </td>
                      )
                    })}
                    <td
                      className={`px-2 py-2 text-right align-top font-medium ${hours > maxWeekly ? 'text-red-600' : 'text-slate-700'}`}
                    >
                      {formatHours(hours)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
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
