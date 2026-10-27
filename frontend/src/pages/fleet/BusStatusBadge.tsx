import { BUS_STATUS_LABELS, type BusStatus } from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'

const TONES: Record<BusStatus, BadgeTone> = {
  available: 'success',
  in_service: 'info',
  maintenance: 'warning',
  out_of_service: 'neutral',
}

export function BusStatusBadge({ status }: { status: BusStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {BUS_STATUS_LABELS[status]}
    </Badge>
  )
}

/** Apta o no; los motivos van en el título para verlos al pasar el cursor. */
export function FitBadge({ fit, reasons }: { fit: boolean; reasons: string[] }) {
  return (
    <span title={reasons.join('\n')}>
      <Badge tone={fit ? 'success' : 'danger'}>{fit ? 'Apta' : 'No apta'}</Badge>
    </span>
  )
}
