import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '../lib/types'

const STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-700',
  late: 'bg-amber-100 text-amber-800',
  half_day: 'bg-orange-100 text-orange-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-sky-100 text-sky-700',
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  )
}
