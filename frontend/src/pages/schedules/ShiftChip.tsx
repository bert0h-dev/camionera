import { formatTime } from '../../lib/format'
import { SHIFT_TYPE_LABELS, type Schedule, type ShiftType } from '../../lib/types'

const COLORS: Record<ShiftType, string> = {
  morning: 'bg-sky-100 text-sky-800 border-sky-200',
  afternoon: 'bg-amber-100 text-amber-800 border-amber-200',
  night: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  split: 'bg-teal-100 text-teal-800 border-teal-200',
}

export function ShiftChip({ schedule }: { schedule: Schedule }) {
  if (schedule.isRestDay) {
    return (
      <div className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-500">Descanso</div>
    )
  }
  const color = schedule.shiftType ? COLORS[schedule.shiftType] : COLORS.morning
  return (
    <div
      className={`rounded border px-2 py-1 text-xs ${color}`}
      title={[
        schedule.shiftType && SHIFT_TYPE_LABELS[schedule.shiftType],
        schedule.notes,
        schedule.overrideReason && `Forzado: ${schedule.overrideReason}`,
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <div className="font-semibold">
        {formatTime(schedule.startAt)}–{formatTime(schedule.endAt)}
        {schedule.overrideReason && <span title="Forzado"> ⚠</span>}
      </div>
      <div className="opacity-75">{schedule.template?.name ?? (schedule.shiftType && SHIFT_TYPE_LABELS[schedule.shiftType])}</div>
    </div>
  )
}
