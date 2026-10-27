import type { DocumentStatus } from '../lib/types'
import { Badge, type BadgeTone } from './ui/Badge'

const TONES: Record<DocumentStatus, BadgeTone> = {
  valid: 'success',
  expiring: 'warning',
  expired: 'danger',
}

const LABELS: Record<DocumentStatus, string> = {
  valid: 'Vigente',
  expiring: 'Por vencer',
  expired: 'Vencido',
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {LABELS[status]}
    </Badge>
  )
}
