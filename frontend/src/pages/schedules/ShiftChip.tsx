import { AlertTriangle, Coffee, Moon, Sun, Sunset, Shuffle, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import { SHIFT_TYPE_LABELS, type Schedule, type ShiftType } from '../../lib/types'

// Un color e ícono por tipo de turno; la barra izquierda refuerza el color
const STYLES: Record<ShiftType, { box: string; bar: string; icon: LucideIcon }> = {
  morning: {
    box: 'bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-200',
    bar: 'bg-sky-500',
    icon: Sun,
  },
  afternoon: {
    box: 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200',
    bar: 'bg-amber-500',
    icon: Sunset,
  },
  night: {
    box: 'bg-indigo-50 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-200',
    bar: 'bg-indigo-500',
    icon: Moon,
  },
  split: {
    box: 'bg-teal-50 text-teal-900 dark:bg-teal-500/10 dark:text-teal-200',
    bar: 'bg-teal-500',
    icon: Shuffle,
  },
}

export function ShiftChip({ schedule }: { schedule: Schedule }) {
  if (schedule.isRestDay) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2 py-1.5 text-xs text-fg-muted">
        <Coffee className="size-3.5" />
        Descanso
      </div>
    )
  }
  const style = STYLES[schedule.shiftType ?? 'morning']
  const Icon = style.icon
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg py-1.5 pr-2 pl-3 text-xs', style.box)}
      title={[
        schedule.shiftType && SHIFT_TYPE_LABELS[schedule.shiftType],
        schedule.notes,
        schedule.overrideReason && `Forzado: ${schedule.overrideReason}`,
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', style.bar)} />
      <div className="font-data flex items-center gap-1 font-semibold">
        {formatTime(schedule.startAt)}–{formatTime(schedule.endAt)}
        {schedule.overrideReason && <AlertTriangle className="size-3 text-red-500" aria-label="Forzado" />}
      </div>
      <div className="mt-0.5 flex items-center gap-1 truncate opacity-75">
        <Icon className="size-3 shrink-0" />
        <span className="truncate">
          {schedule.template?.name ?? (schedule.shiftType && SHIFT_TYPE_LABELS[schedule.shiftType])}
        </span>
      </div>
    </div>
  )
}
