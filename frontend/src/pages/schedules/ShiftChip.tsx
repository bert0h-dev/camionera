import { formatTime } from '../../lib/format'
import { SHIFT_TYPE_LABELS, type Schedule, type ShiftType } from '../../lib/types'

const COLORS: Record<ShiftType, string> = {
  morning: 'bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
  afternoon:
    'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  night:
    'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
  split: 'bg-teal-100 text-teal-800 border-teal-200',
}

export function ShiftChip({ schedule }: { schedule: Schedule }) {
  if (schedule.isRestDay) {
    return (
      <div className="rounded border border-border bg-surface-sunken px-2 py-1 text-xs text-fg-muted">Descanso</div>
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
      <div className="opacity-75">
        {schedule.template?.name ?? (schedule.shiftType && SHIFT_TYPE_LABELS[schedule.shiftType])}
      </div>
    </div>
  )
}
