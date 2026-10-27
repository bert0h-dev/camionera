import { STAFF_STATUS_LABELS, type StaffStatus } from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'

const TONES: Record<StaffStatus, BadgeTone> = {
  active: 'success',
  vacation: 'info',
  sick_leave: 'warning',
  suspended: 'orange',
  inactive: 'neutral',
}

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {STAFF_STATUS_LABELS[status]}
    </Badge>
  )
}
