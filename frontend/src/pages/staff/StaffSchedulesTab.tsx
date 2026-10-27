import { useMemo, useState } from 'react'
import { addDaysKey, dayLabel, formatHours, mondayOf, todayKey } from '../../lib/format'
import { Button } from '../../components/ui/Button'
import { ScheduleModal, type ScheduleTarget } from '../schedules/ScheduleModal'
import { ShiftChip } from '../schedules/ShiftChip'
import { useCanSchedule, useSchedules } from '../schedules/useScheduleData'

export function StaffSchedulesTab({ staffId, staffName, editable }: { staffId: string; staffName: string; editable: boolean }) {
  const canSchedule = useCanSchedule() && editable
  const [monday, setMonday] = useState(() => mondayOf(todayKey()))
  const [target, setTarget] = useState<ScheduleTarget | null>(null)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i)), [monday])
  const today = todayKey()

  const { data = [], isLoading } = useSchedules({ from: monday, to: days[6], staffId })
  const byDay = new Map(data.map((s) => [s.scheduleDate.slice(0, 10), s]))
  const total = data.reduce((sum, s) => sum + s.workedHours, 0)

  return (
    <div className="space-y-4">
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
            {dayLabel(monday)} – {dayLabel(days[6])}
          </span>
        </div>
        <span className="text-sm text-slate-600">
          Total de la semana: <strong>{formatHours(total)}</strong>
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-7">
          {days.map((d) => {
            const schedule = byDay.get(d) ?? null
            return (
              <div
                key={d}
                className={`rounded-lg border bg-white p-2 ${d === today ? 'border-blue-300' : 'border-slate-200'}`}
              >
                <div className={`mb-1 text-xs font-semibold ${d === today ? 'text-blue-700' : 'text-slate-500'}`}>
                  {dayLabel(d)}
                </div>
                {canSchedule ? (
                  <button
                    type="button"
                    className="block min-h-11 w-full rounded text-left hover:ring-2 hover:ring-blue-200"
                    onClick={() => setTarget({ staffId, staffName, date: d, schedule })}
                  >
                    {schedule ? <ShiftChip schedule={schedule} /> : <span className="text-xs text-slate-300">+ Asignar</span>}
                  </button>
                ) : schedule ? (
                  <ShiftChip schedule={schedule} />
                ) : (
                  <span className="text-xs text-slate-400">Sin turno</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ScheduleModal target={target} onClose={() => setTarget(null)} />
    </div>
  )
}
