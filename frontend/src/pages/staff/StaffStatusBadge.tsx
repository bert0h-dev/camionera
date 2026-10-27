import { STAFF_STATUS_LABELS, type StaffStatus } from '../../lib/types'

const STYLES: Record<StaffStatus, string> = {
  active: 'bg-green-100 text-green-700',
  vacation: 'bg-sky-100 text-sky-700',
  sick_leave: 'bg-amber-100 text-amber-800',
  suspended: 'bg-orange-100 text-orange-700',
  inactive: 'bg-slate-200 text-slate-600',
}

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {STAFF_STATUS_LABELS[status]}
    </span>
  )
}
