import { PAYROLL_STATUS_LABELS, type PayrollStatus } from '../lib/types'
import { Badge, type BadgeTone } from './ui/Badge'

const TONES: Record<PayrollStatus, BadgeTone> = {
  draft: 'warning',
  closed: 'primary',
  paid: 'success',
}

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {PAYROLL_STATUS_LABELS[status]}
    </Badge>
  )
}
