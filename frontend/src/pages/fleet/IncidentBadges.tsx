import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  type IncidentSeverity,
  type IncidentStatus,
} from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'

const STATUS_TONES: Record<IncidentStatus, BadgeTone> = {
  reported: 'warning',
  in_review: 'info',
  resolved: 'success',
  dismissed: 'neutral',
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {INCIDENT_STATUS_LABELS[status]}
    </Badge>
  )
}

const SEVERITY_TONES: Record<IncidentSeverity, BadgeTone> = {
  critical: 'danger',
  high: 'orange',
  medium: 'warning',
  low: 'neutral',
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return <Badge tone={SEVERITY_TONES[severity]}>{INCIDENT_SEVERITY_LABELS[severity]}</Badge>
}
