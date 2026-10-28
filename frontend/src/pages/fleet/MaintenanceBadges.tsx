import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
  type MaintenanceStatus,
  type MaintenanceType,
  type ServiceStatus,
} from '../../lib/types'
import { Badge, type BadgeTone } from '../../components/ui/Badge'

const STATUS_TONES: Record<MaintenanceStatus, BadgeTone> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}

export function OrderStatusBadge({ status }: { status: MaintenanceStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {MAINTENANCE_STATUS_LABELS[status]}
    </Badge>
  )
}

export function OrderTypeBadge({ type }: { type: MaintenanceType }) {
  return <Badge tone={type === 'preventive' ? 'primary' : 'orange'}>{MAINTENANCE_TYPE_LABELS[type]}</Badge>
}

const SERVICE: Record<ServiceStatus, { tone: BadgeTone; label: string }> = {
  ok: { tone: 'success', label: 'Al día' },
  due_soon: { tone: 'warning', label: 'Próximo' },
  overdue: { tone: 'danger', label: 'Vencido' },
  no_plan: { tone: 'neutral', label: 'Sin plan' },
}

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <Badge tone={SERVICE[status].tone} dot>
      {SERVICE[status].label}
    </Badge>
  )
}
