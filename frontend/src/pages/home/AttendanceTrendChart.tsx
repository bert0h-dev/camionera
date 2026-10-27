import { useState } from 'react'
import { cn } from '../../lib/cn'
import { dayLabel } from '../../lib/format'
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
  type DashboardSummary,
} from '../../lib/types'

type TrendRow = NonNullable<DashboardSummary['team']>['trend'][number]

// Colores de estado, los mismos de los badges de asistencia (verde → rojo)
const COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-500',
  late: 'bg-amber-400',
  half_day: 'bg-orange-500',
  absent: 'bg-red-500',
  excused: 'bg-sky-500',
}

const total = (r: TrendRow) => ATTENDANCE_STATUSES.reduce((t, s) => t + r[s], 0)

/** Barras apiladas por día con tooltip al pasar el cursor; leyenda siempre visible. */
export function AttendanceTrendChart({ rows }: { rows: TrendRow[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...rows.map(total))
  const empty = rows.every((r) => total(r) === 0)

  return (
    <div>
      <div
        className="relative flex h-48 items-end gap-3 border-b border-border pb-px sm:gap-5"
        role="img"
        aria-label="Asistencias de los últimos 7 días por estado"
      >
        {/* Guías */}
        {[0.5, 1].map((f) => (
          <div
            key={f}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border"
            style={{ bottom: `${f * 100}%` }}
          />
        ))}
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
            Aún no hay registros de asistencia en estos días
          </p>
        )}
        {rows.map((r, i) => {
          const t = total(r)
          return (
            <div
              key={r.date}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={cn(
                  'flex w-full max-w-10 flex-col-reverse gap-[2px] transition-opacity',
                  hover !== null && hover !== i && 'opacity-50',
                )}
                style={{ height: `${(t / max) * 100}%` }}
              >
                {ATTENDANCE_STATUSES.filter((s) => r[s] > 0).map((s, si, arr) => (
                  <div
                    key={s}
                    className={cn(COLORS[s], si === arr.length - 1 && 'rounded-t-[4px]')}
                    style={{ flexGrow: r[s] }}
                  />
                ))}
              </div>
              {hover === i && (
                <div className="absolute bottom-full z-10 mb-2 w-40 rounded-xl border border-border bg-surface p-3 text-xs shadow-pop">
                  <div className="mb-1.5 font-semibold text-fg">{dayLabel(r.date)}</div>
                  {ATTENDANCE_STATUSES.map((s) => (
                    <div key={s} className="flex items-center justify-between gap-2 py-0.5">
                      <span className="flex items-center gap-1.5 text-fg-muted">
                        <span className={cn('size-2 rounded-sm', COLORS[s])} />
                        {ATTENDANCE_STATUS_LABELS[s]}
                      </span>
                      <span className="tabular font-medium text-fg">{r[s]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-3 sm:gap-5">
        {rows.map((r) => (
          <div key={r.date} className="flex-1 text-center text-xs text-fg-muted">
            {dayLabel(r.date).split(' ')[0]}
            <div className="tabular text-[11px] text-fg-subtle">{r.date.slice(8)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {ATTENDANCE_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-fg-muted">
            <span className={cn('size-2.5 rounded-sm', COLORS[s])} />
            {ATTENDANCE_STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  )
}
