import { STAFF_STATUS_LABELS, type StaffStatus } from '../../lib/types'

const STYLES: Record<StaffStatus, string> = {
  active: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300',
  vacation: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
  sick_leave: 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  suspended: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300',
  inactive: 'bg-border text-fg-muted',
}

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {STAFF_STATUS_LABELS[status]}
    </span>
  )
}
