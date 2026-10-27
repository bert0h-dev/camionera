import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '../lib/types'
import { Badge, type BadgeTone } from './ui/Badge'

const TONES: Record<AttendanceStatus, BadgeTone> = {
  present: 'success',
  late: 'warning',
  half_day: 'orange',
  absent: 'danger',
  excused: 'info',
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {ATTENDANCE_STATUS_LABELS[status]}
    </Badge>
  )
}
